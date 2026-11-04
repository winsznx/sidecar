import type { Address, Hash } from "viem";

import {
  HIDEKI_CHAIN_ID,
  type ExecutionPhase,
  type OrderIntent,
  type PlacementOutcome,
  type ReceiptWait,
  type RouteQuote,
} from "@/lib/dreamdex/types";
import { formatAge, formatBlockNumber, shortAddress } from "@/lib/format/units";
import { sameIntent } from "@/lib/orders/intent";

/**
 * The order ticket's execution state machine, as a pure reducer.
 *
 * Safety properties it enforces, independent of what the UI remembers to check:
 * - one signature request at a time (no second SIGN_REQUESTED while one is in flight);
 * - nothing ever moves back to signing on its own: every retry is an explicit event;
 * - the prepared intent survives rejection, reverts and unknown outcomes;
 * - a mined transaction is not a fill. Only decoded fills covering the order reach FILLED;
 * - an unknown outcome is left only by evidence about the tracked transaction: its
 *   receipt (or a replacement's), or a chain check proving it can no longer mine.
 *
 * Caller contract: after RECEIPT_SUCCESS the caller always sends PLACEMENT_DECODED, or
 * DECODE_FAILED when the receipt cannot be decoded, because MINED_SUCCESS is locked.
 */

/** Older previews are refused at signing time. Hideki makes ~100 blocks a second. */
export const DEFAULT_QUOTE_MAX_AGE_MS = 15_000;

/**
 * How far a reading's timestamp may sit ahead of the local clock before it is treated
 * as corrupt. Without a bound, a future timestamp would read as brand new until the
 * clock caught up.
 */
export const MAX_CLOCK_SKEW_MS = 2_000;

export interface ExecutionState {
  phase: ExecutionPhase;
  /** The prepared order. Kept through rejection, revert and unknown outcomes. */
  intent: OrderIntent | null;
  /** The account the order is prepared for, which must also be the signer. */
  account: Address | null;
  quote: RouteQuote | null;
  /** The transaction being followed: the latest of `trackedHashes`. */
  txHash: Hash | null;
  /**
   * Every hash this attempt may have mined under: the original plus wallet replacements.
   * They share one nonce, so at most one of them can mine.
   */
  trackedHashes: readonly Hash[];
  revertReason: string | null;
  outcome: PlacementOutcome | null;
  orderId: bigint | null;
  filledQuantity: bigint | null;
  /** Why the ticket is where it is, in plain language. */
  notice: string | null;
  /** Signature requests accepted for this prepared order. */
  submitAttempts: number;
  /** The phase that reconciliation followed, so the final copy can still say what happened. */
  settledPhase: ExecutionPhase | null;
  reconciledBlock: bigint | null;
}

export const INITIAL_EXECUTION_STATE: ExecutionState = Object.freeze({
  phase: "EDITING",
  intent: null,
  account: null,
  quote: null,
  txHash: null,
  trackedHashes: Object.freeze([]),
  revertReason: null,
  outcome: null,
  orderId: null,
  filledQuantity: null,
  notice: null,
  submitAttempts: 0,
  settledPhase: null,
  reconciledBlock: null,
});

export type ExecutionEvent =
  | { type: "EDIT"; intent?: OrderIntent | null }
  | { type: "QUOTE_REQUESTED"; intent: OrderIntent; account: Address }
  | { type: "QUOTE_READY"; quote: RouteQuote }
  | { type: "QUOTE_FAILED"; reason: string }
  | { type: "QUOTE_INVALIDATED"; reason: string }
  | {
      type: "SIGN_REQUESTED";
      /** The ticket's current intent and route account, re-checked against the preview. */
      intent: OrderIntent;
      account: Address;
      /** The wallet that would sign, as connected right now. */
      signer: { address: Address | null; chainId: number | null };
      nowMs: number;
      maxQuoteAgeMs?: number;
    }
  | { type: "WALLET_REJECTED" }
  | { type: "TX_SUBMITTED"; hash: Hash }
  | { type: "RECEIPT_SUCCESS"; hash: Hash }
  | { type: "RECEIPT_REVERTED"; hash: Hash; reason: string | null }
  | { type: "OUTCOME_UNKNOWN"; hash: Hash | null; note?: string }
  /** The wallet replaced a tracked transaction (speed-up or cancel). Follow `to`. */
  | { type: "TX_REPLACED"; from: Hash; to: Hash; note?: string }
  /**
   * A chain check proved a tracked transaction can no longer mine. The only way out of
   * UNKNOWN_OUTCOME without a receipt. `nonce-consumed-by-other-tx`: the account's nonce
   * advanced through a transaction that is not tracked and that the caller checked is not
   * a placement of this order (a placement found that way is a TX_REPLACED instead).
   * `not-found-after-N-blocks`: the hash is unknown to the node after the caller's block
   * window, accepted only while no replacement is tracked.
   */
  | { type: "TX_DROPPED"; hash: Hash; evidence: TxDropEvidence }
  | {
      type: "PLACEMENT_DECODED";
      outcome: PlacementOutcome;
      orderId: bigint | null;
      filledQuantity: bigint;
      revertReason?: string | null;
    }
  /** The mined receipt could not be decoded. The order is confirmed, its fill unverified. */
  | { type: "DECODE_FAILED"; reason: string }
  | { type: "RECONCILED"; block: bigint }
  | { type: "RESET" };

export type TxDropEvidence = "nonce-consumed-by-other-tx" | "not-found-after-N-blocks";

export interface TransitionResult {
  state: ExecutionState;
  accepted: boolean;
  /** Why an event was refused. `null` when accepted. */
  reason: string | null;
}

export type QuoteInvalidReason =
  | "missing"
  | "account"
  | "market"
  | "side"
  | "size"
  | "price"
  | "time-in-force"
  | "age"
  | "timestamp";

export type QuoteValidity =
  | { valid: true; ageMs: number }
  | { valid: false; reason: QuoteInvalidReason; message: string };

export type PhaseTone = "neutral" | "progress" | "success" | "warning" | "danger";

export interface PhaseCopy {
  headline: string;
  detail: string | null;
  /** Semantic only. The headline carries the meaning without colour. */
  tone: PhaseTone;
}

/** Phases where a new ticket may start: nothing is in flight. */
const IDLE_PHASES: ReadonlySet<ExecutionPhase> = new Set<ExecutionPhase>([
  "EDITING",
  "QUOTING",
  "READY",
  "WALLET_REJECTED",
  "MINED_REVERTED",
  "ORDER_ACCEPTED",
  "ORDER_REJECTED",
  "RESTING",
  "PARTIALLY_FILLED",
  "FILLED",
  "CANCELLED",
  "ACCOUNT_RECONCILED",
]);

/** A transaction may be in flight or its result is still being read: the ticket is frozen. */
const LOCKED_PHASES: ReadonlySet<ExecutionPhase> = new Set<ExecutionPhase>([
  "AWAITING_WALLET_CONFIRMATION",
  "SUBMITTED",
  "UNKNOWN_OUTCOME",
  "MINED_SUCCESS",
]);

const SETTLED_PHASES: ReadonlySet<ExecutionPhase> = new Set<ExecutionPhase>([
  "MINED_REVERTED",
  "ORDER_ACCEPTED",
  "ORDER_REJECTED",
  "RESTING",
  "PARTIALLY_FILLED",
  "FILLED",
  "CANCELLED",
]);

export function transition(state: ExecutionState, event: ExecutionEvent): TransitionResult {
  switch (event.type) {
    case "EDIT":
      if (!IDLE_PHASES.has(state.phase)) return refuse(state, lockedReason(state));
      return accept({ ...INITIAL_EXECUTION_STATE, intent: event.intent ?? null });

    case "QUOTE_REQUESTED": {
      if (!IDLE_PHASES.has(state.phase)) return refuse(state, lockedReason(state));
      const sameOrder =
        state.intent !== null && sameIntent(state.intent, event.intent) && addressesEqual(state.account, event.account);
      return accept({
        ...INITIAL_EXECUTION_STATE,
        phase: "QUOTING",
        intent: event.intent,
        account: event.account,
        submitAttempts: sameOrder ? state.submitAttempts : 0,
      });
    }

    case "QUOTE_READY": {
      if (state.phase !== "QUOTING") return refuse(state, "No preview was requested.");
      if (
        state.intent === null ||
        !sameIntent(state.intent, event.quote.intent) ||
        !addressesEqual(state.account, event.quote.account)
      ) {
        return refuse(state, "This preview is for a different order or account.");
      }
      const blocker = quoteBlocker(event.quote);
      if (blocker !== null) return accept({ ...state, phase: "EDITING", quote: null, notice: blocker });
      return accept({ ...state, phase: "READY", quote: event.quote, notice: null });
    }

    case "QUOTE_FAILED":
      if (state.phase !== "QUOTING") return refuse(state, "No preview was requested.");
      return accept({ ...state, phase: "EDITING", quote: null, notice: `Preview failed: ${event.reason}` });

    case "QUOTE_INVALIDATED":
      if (state.phase !== "QUOTING" && state.phase !== "READY" && state.phase !== "WALLET_REJECTED") {
        return refuse(state, "There is no preview to invalidate.");
      }
      return accept({ ...state, phase: "EDITING", quote: null, notice: event.reason });

    case "SIGN_REQUESTED":
      return requestSignature(state, event);

    case "WALLET_REJECTED":
      if (state.phase !== "AWAITING_WALLET_CONFIRMATION") return refuse(state, "No signature was pending.");
      return accept({
        ...state,
        phase: "WALLET_REJECTED",
        notice: "You declined the signature in your wallet. Nothing was sent.",
      });

    case "TX_SUBMITTED": {
      if (state.phase === "SUBMITTED" && isTracked(state, event.hash)) return accept(state);
      // The wallet prompt outlived the send's deadline, then handed back the hash: from
      // here the attempt is an ordinary transaction waiting for the chain.
      const lateHash = state.phase === "UNKNOWN_OUTCOME" && state.trackedHashes.length === 0;
      if (state.phase !== "AWAITING_WALLET_CONFIRMATION" && !lateHash) {
        return refuse(state, "No signature was pending.");
      }
      return accept({ ...track(state, event.hash), phase: "SUBMITTED", notice: null });
    }

    case "RECEIPT_SUCCESS":
    case "RECEIPT_REVERTED": {
      const refusal = receiptRefusal(state, event.hash);
      if (refusal !== null) return refuse(state, refusal);
      if (event.type === "RECEIPT_SUCCESS") {
        return accept({ ...track(state, event.hash), phase: "MINED_SUCCESS", notice: null });
      }
      return accept({
        ...track(state, event.hash),
        phase: "MINED_REVERTED",
        revertReason: event.reason,
        outcome: "REVERTED",
        notice: null,
      });
    }

    case "OUTCOME_UNKNOWN": {
      const inFlight =
        state.phase === "AWAITING_WALLET_CONFIRMATION" ||
        state.phase === "SUBMITTED" ||
        state.phase === "UNKNOWN_OUTCOME";
      if (!inFlight) return refuse(state, "No transaction was in flight.");
      // Once a hash is tracked, an unknown outcome for some other hash is not about this
      // attempt. A replacement must say what it replaced (TX_REPLACED).
      if (event.hash !== null && state.trackedHashes.length > 0 && !isTracked(state, event.hash)) {
        return refuse(state, "This update is for a different transaction.");
      }
      const next = event.hash === null ? state : track(state, event.hash);
      return accept({ ...next, phase: "UNKNOWN_OUTCOME", notice: event.note ?? state.notice });
    }

    case "TX_REPLACED":
      if (state.phase !== "SUBMITTED" && state.phase !== "UNKNOWN_OUTCOME") {
        return refuse(state, "No transaction was in flight.");
      }
      if (!isTracked(state, event.from)) return refuse(state, "The replaced transaction is not this order's.");
      return accept({
        ...track(state, event.to),
        phase: "UNKNOWN_OUTCOME",
        notice: event.note ?? "Your wallet replaced the transaction. Sidecar is following the replacement.",
      });

    case "TX_DROPPED":
      return dropTransaction(state, event);

    case "PLACEMENT_DECODED":
      return decodePlacement(state, event);

    case "DECODE_FAILED":
      if (state.phase !== "MINED_SUCCESS") return refuse(state, "Decode a placement only after it is confirmed.");
      return accept({
        ...state,
        phase: "ORDER_ACCEPTED",
        outcome: "UNKNOWN",
        notice: `The receipt could not be decoded: ${event.reason}`,
      });

    case "RECONCILED":
      if (!SETTLED_PHASES.has(state.phase)) {
        return refuse(state, "Reconcile after the transaction outcome is known.");
      }
      return accept({ ...state, phase: "ACCOUNT_RECONCILED", settledPhase: state.phase, reconciledBlock: event.block });

    case "RESET":
      if (!IDLE_PHASES.has(state.phase)) return refuse(state, lockedReason(state));
      return accept(INITIAL_EXECUTION_STATE);
  }
}

/**
 * The lifecycle event for what waiting on a sent transaction established. Only a
 * receipt is an outcome: a timeout, a failed lookup or a wallet replacement all leave
 * the attempt in UNKNOWN_OUTCOME, so nothing is ever resent on the strength of a missing
 * answer. A replacement is tracked alongside the original so its receipt is accepted.
 */
export function eventForReceiptWait(wait: ReceiptWait): ExecutionEvent {
  switch (wait.status) {
    case "success":
      return { type: "RECEIPT_SUCCESS", hash: wait.hash };
    case "reverted":
      return { type: "RECEIPT_REVERTED", hash: wait.hash, reason: null };
    case "timeout":
      return {
        type: "OUTCOME_UNKNOWN",
        hash: wait.hash,
        note: "No receipt arrived in time. The transaction may still confirm, so Sidecar keeps checking.",
      };
    case "replaced":
      return {
        type: "TX_REPLACED",
        from: wait.hash,
        to: wait.replacement,
        note: `Your wallet replaced the transaction (${wait.reason}). Sidecar is following the replacement.`,
      };
    case "error":
      return {
        type: "OUTCOME_UNKNOWN",
        hash: wait.hash,
        note: "The receipt lookup failed. The transaction may still confirm, so Sidecar keeps checking.",
      };
  }
}

export function executionReducer(state: ExecutionState, event: ExecutionEvent): ExecutionState {
  return transition(state, event).state;
}

/**
 * The ticket has a matching preview and nothing in flight. The caller must still check
 * the route's eligibility and signer before offering the button; SIGN_REQUESTED
 * re-checks the preview, the intent and the signer regardless.
 */
export function canSubmit(state: ExecutionState): boolean {
  return (
    (state.phase === "READY" || state.phase === "WALLET_REJECTED") &&
    state.quote !== null &&
    state.intent !== null &&
    state.account !== null
  );
}

/** Nothing more will happen to this attempt without a new user action. */
export function isTerminal(state: ExecutionState): boolean {
  return state.phase === "WALLET_REJECTED" || state.phase === "ACCOUNT_RECONCILED";
}

/** A transaction may be in flight or its result is still unread: editing and resending are refused. */
export function isLocked(state: ExecutionState): boolean {
  return LOCKED_PHASES.has(state.phase);
}

/**
 * Whether `quote` still describes this exact order from this account. Any change of
 * account, market, side, size, price or time in force invalidates it, and so does age.
 */
export function quoteValidity(
  quote: RouteQuote | null,
  intent: OrderIntent,
  account: Address,
  nowMs: number,
  maxAgeMs: number = DEFAULT_QUOTE_MAX_AGE_MS,
): QuoteValidity {
  if (quote === null) return invalid("missing", "No preview for this order yet.");
  if (!addressesEqual(quote.account, account)) {
    return invalid("account", "The preview was for a different account. Refresh it.");
  }
  if (!addressesEqual(quote.intent.pool, intent.pool)) {
    return invalid("market", "The preview was for a different market. Refresh it.");
  }
  if (quote.intent.side !== intent.side) return invalid("side", "The side changed since the preview. Refresh it.");
  if (quote.intent.quantity !== intent.quantity) {
    return invalid("size", "The size changed since the preview. Refresh it.");
  }
  if (quote.intent.price !== intent.price) return invalid("price", "The price changed since the preview. Refresh it.");
  if (quote.intent.timeInForce !== intent.timeInForce) {
    return invalid("time-in-force", "The order type changed since the preview. Refresh it.");
  }
  const readAtMs = Date.parse(quote.readAt);
  if (!Number.isFinite(readAtMs) || !Number.isFinite(nowMs)) {
    return invalid("timestamp", "The preview has no usable timestamp. Refresh it.");
  }
  if (readAtMs - nowMs > MAX_CLOCK_SKEW_MS) {
    return invalid("timestamp", "The preview is timestamped in the future. Refresh it.");
  }
  const ageMs = Math.max(0, nowMs - readAtMs);
  if (ageMs > maxAgeMs) {
    return invalid("age", `The preview is ${formatAge(ageMs)} old. Refresh it before signing.`);
  }
  return { valid: true, ageMs };
}

export function isQuoteValidFor(
  quote: RouteQuote | null,
  intent: OrderIntent,
  account: Address,
  nowMs: number,
  maxAgeMs: number = DEFAULT_QUOTE_MAX_AGE_MS,
): boolean {
  return quoteValidity(quote, intent, account, nowMs, maxAgeMs).valid;
}

/**
 * Maps a decoded placement onto a phase, trusting the evidence over the label: FILLED
 * needs decoded fills that cover the requested quantity, RESTING needs a resting order
 * id, and anything inconsistent degrades to ORDER_ACCEPTED ("confirmed, fill status not
 * verified") rather than to a better-sounding state.
 */
export function phaseForPlacement(
  outcome: PlacementOutcome,
  filledQuantity: bigint,
  requestedQuantity: bigint | null,
  orderId: bigint | null,
): ExecutionPhase {
  if (outcome === "UNKNOWN" || outcome === "REVERTED") return "ORDER_ACCEPTED";
  if (filledQuantity < 0n) return "ORDER_ACCEPTED";
  if (filledQuantity > 0n) {
    if (requestedQuantity === null) return "ORDER_ACCEPTED";
    if (filledQuantity > requestedQuantity) return "ORDER_ACCEPTED";
    return filledQuantity === requestedQuantity ? "FILLED" : "PARTIALLY_FILLED";
  }
  if (outcome === "RESTING") return orderId !== null ? "RESTING" : "ORDER_ACCEPTED";
  if (outcome === "NO_FILL") return orderId === null ? "CANCELLED" : "ORDER_ACCEPTED";
  return "ORDER_ACCEPTED";
}

export function phaseCopy(state: ExecutionState): PhaseCopy {
  switch (state.phase) {
    case "EDITING":
      return { headline: "Edit the order", detail: state.notice, tone: state.notice ? "warning" : "neutral" };
    case "QUOTING":
      return { headline: "Checking this order against live account state", detail: null, tone: "progress" };
    case "READY":
      return {
        headline: `Ready to sign from ${shortAddress(state.account)}`,
        detail: "Your wallet will ask you to confirm. Nothing is sent before that.",
        tone: "neutral",
      };
    case "AWAITING_WALLET_CONFIRMATION":
      return {
        headline: "Waiting for wallet confirmation",
        detail: "Confirm or reject the request in your wallet.",
        tone: "progress",
      };
    case "WALLET_REJECTED":
      return {
        headline: "Signature declined. Nothing was sent.",
        detail: "Your order is kept. Sign again only if you want to.",
        tone: "warning",
      };
    case "SUBMITTED":
      return {
        headline: "Submitted, waiting for the chain",
        detail: state.txHash ? `Transaction ${shortHash(state.txHash)}` : null,
        tone: "progress",
      };
    case "MINED_SUCCESS":
      return {
        headline: "Confirmed on chain. Checking what the order did.",
        detail: "A confirmed transaction does not mean the order filled.",
        tone: "progress",
      };
    case "UNKNOWN_OUTCOME":
      return {
        headline: "Outcome unknown: checking the chain. Do not resend.",
        detail:
          state.notice ??
          "The network stopped responding after the order was sent. Sidecar is looking up the transaction.",
        tone: "warning",
      };
    case "ACCOUNT_RECONCILED":
      return reconciledCopy(state);
    default:
      return settledCopy(state.phase, state);
  }
}

function requestSignature(
  state: ExecutionState,
  event: Extract<ExecutionEvent, { type: "SIGN_REQUESTED" }>,
): TransitionResult {
  if (state.phase === "AWAITING_WALLET_CONFIRMATION" || state.phase === "SUBMITTED") {
    return refuse(state, "This order is already waiting on your wallet or the chain.");
  }
  if (state.phase === "UNKNOWN_OUTCOME") {
    return refuse(state, "The last attempt's outcome is unknown. Wait for the chain check before sending again.");
  }
  if (!canSubmit(state) || state.intent === null || state.account === null) {
    return refuse(state, "Preview the order before signing.");
  }
  if (!sameIntent(state.intent, event.intent) || !addressesEqual(state.account, event.account)) {
    return accept({
      ...INITIAL_EXECUTION_STATE,
      intent: event.intent,
      notice: "The order changed since the preview. Refresh it before signing.",
    });
  }
  const validity = quoteValidity(state.quote, event.intent, event.account, event.nowMs, event.maxQuoteAgeMs);
  if (!validity.valid) return accept({ ...state, phase: "EDITING", quote: null, notice: validity.message });

  if (!addressesEqual(event.signer.address, state.account)) {
    return refuse(state, `Wallet mismatch: switch to ${shortAddress(state.account)} before signing.`);
  }
  if (event.signer.chainId !== HIDEKI_CHAIN_ID) {
    return refuse(state, `Switch to Hideki (${HIDEKI_CHAIN_ID}) to sign.`);
  }
  return accept({
    ...state,
    phase: "AWAITING_WALLET_CONFIRMATION",
    notice: null,
    submitAttempts: state.submitAttempts + 1,
  });
}

function dropTransaction(
  state: ExecutionState,
  event: Extract<ExecutionEvent, { type: "TX_DROPPED" }>,
): TransitionResult {
  if (state.phase !== "UNKNOWN_OUTCOME") return refuse(state, "Only an unknown outcome can be cleared this way.");
  if (!isTracked(state, event.hash)) return refuse(state, "The dropped transaction is not this order's.");
  if (event.evidence === "not-found-after-N-blocks" && state.trackedHashes.length > 1) {
    return refuse(state, "A replacement of this transaction may still confirm. Check the account's nonce instead.");
  }
  return accept({
    ...state,
    phase: "EDITING",
    quote: null,
    notice:
      event.evidence === "nonce-consumed-by-other-tx"
        ? "The order's transaction can no longer confirm: another transaction used its nonce. Preview again to send a new one."
        : "The order's transaction never reached the chain. Preview again to send a new one.",
  });
}

function decodePlacement(
  state: ExecutionState,
  event: Extract<ExecutionEvent, { type: "PLACEMENT_DECODED" }>,
): TransitionResult {
  if (state.phase === "MINED_REVERTED") {
    if (event.outcome !== "REVERTED") return refuse(state, "A reverted transaction cannot place an order.");
    return accept({
      ...state,
      phase: "ORDER_REJECTED",
      outcome: "REVERTED",
      revertReason: event.revertReason ?? state.revertReason,
      filledQuantity: 0n,
      orderId: null,
    });
  }
  if (state.phase !== "MINED_SUCCESS") return refuse(state, "Decode a placement only after it is confirmed.");
  if (event.outcome === "REVERTED") return refuse(state, "A confirmed transaction did not revert.");
  return accept({
    ...state,
    phase: phaseForPlacement(event.outcome, event.filledQuantity, state.intent?.quantity ?? null, event.orderId),
    outcome: event.outcome,
    orderId: event.orderId,
    filledQuantity: event.filledQuantity,
  });
}

function receiptRefusal(state: ExecutionState, hash: Hash): string | null {
  switch (state.phase) {
    case "AWAITING_WALLET_CONFIRMATION":
      // The SDK's write resolves only after mining, so its receipt may be the first hash seen.
      return state.trackedHashes.length === 0 || isTracked(state, hash)
        ? null
        : "This receipt is for a different transaction.";
    case "SUBMITTED":
    case "UNKNOWN_OUTCOME":
      // With no hash recorded there is nothing to match a receipt against.
      if (state.trackedHashes.length === 0) return "No transaction hash is known for this order yet.";
      return isTracked(state, hash) ? null : "This receipt is for a different transaction.";
    default:
      return "No transaction was waiting for a receipt.";
  }
}

/**
 * A preview that itself says the protocol would refuse the order cannot make the
 * ticket READY. The comparison explains the cause in detail; this is the backstop.
 */
function quoteBlocker(quote: RouteQuote): string | null {
  if (quote.errors.length > 0) return `Some reads failed: ${quote.errors.join("; ")}`;
  if (!quote.priceable || quote.markPrice === null) {
    return "Preview unavailable: the protocol cannot currently price this market.";
  }
  if (quote.margin === null || quote.maxSize === null) return "The margin preview is incomplete. Refresh it.";
  if (!quote.margin.sufficient) return "The protocol would not accept this order from this account.";
  if (!quote.maxSize.placeable || quote.intent.quantity > quote.maxSize.maxQuantity) {
    return "This order is larger than this account can place right now.";
  }
  return null;
}

function settledCopy(phase: ExecutionPhase, state: ExecutionState): PhaseCopy {
  switch (phase) {
    case "MINED_REVERTED":
      return {
        headline: "Transaction reverted. No order was placed.",
        detail: state.revertReason ? `Reason: ${state.revertReason}` : "The revert reason was not decoded.",
        tone: "danger",
      };
    case "ORDER_REJECTED":
      return {
        headline: "Order rejected by the protocol. No order was placed.",
        detail: state.revertReason ? `Reason: ${state.revertReason}` : "The revert reason was not decoded.",
        tone: "danger",
      };
    case "ORDER_ACCEPTED":
      return {
        headline: "Order confirmed. Fill status not verified.",
        detail: state.notice ?? "Sidecar does not treat this order as filled until its fills are decoded.",
        tone: "neutral",
      };
    case "RESTING":
      return {
        headline: "Order confirmed, not filled. It is resting on the book.",
        detail: state.orderId !== null ? `Order id ${state.orderId.toString()}` : null,
        tone: "neutral",
      };
    case "PARTIALLY_FILLED":
      return { headline: "Partially filled", detail: partialFillDetail(state), tone: "neutral" };
    case "FILLED":
      return { headline: "Filled", detail: "Decoded fills cover the full order.", tone: "success" };
    case "CANCELLED":
      return {
        headline: "No fill",
        detail: "The transaction succeeded, but the order neither filled nor rested on the book.",
        tone: "warning",
      };
    default:
      return { headline: "Edit the order", detail: state.notice, tone: "neutral" };
  }
}

function reconciledCopy(state: ExecutionState): PhaseCopy {
  const settled = settledCopy(state.settledPhase ?? "ORDER_ACCEPTED", state);
  const refreshed = `Account re-read at block ${formatBlockNumber(state.reconciledBlock)}.`;
  return { ...settled, detail: settled.detail ? `${settled.detail} ${refreshed}` : refreshed };
}

function partialFillDetail(state: ExecutionState): string {
  if (state.orderId !== null) return "Part of the order filled. The rest is resting on the book.";
  if (state.intent?.timeInForce === "IOC") return "Part of the order filled. The rest was cancelled.";
  return "Part of the order filled. The rest did not rest on the book.";
}

function lockedReason(state: ExecutionState): string {
  return state.phase === "UNKNOWN_OUTCOME"
    ? "The last attempt's outcome is unknown. Wait for the chain check."
    : "A transaction is in progress. Wait for its outcome.";
}

function isTracked(state: ExecutionState, hash: Hash): boolean {
  return state.trackedHashes.some((tracked) => tracked.toLowerCase() === hash.toLowerCase());
}

function track(state: ExecutionState, hash: Hash): ExecutionState {
  const trackedHashes = isTracked(state, hash) ? state.trackedHashes : [...state.trackedHashes, hash];
  return { ...state, txHash: hash, trackedHashes };
}

function shortHash(hash: Hash): string {
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

function addressesEqual(a: string | null, b: string | null): boolean {
  return a !== null && b !== null && a.toLowerCase() === b.toLowerCase();
}

function accept(state: ExecutionState): TransitionResult {
  return { state, accepted: true, reason: null };
}

function refuse(state: ExecutionState, reason: string): TransitionResult {
  return { state, accepted: false, reason };
}

function invalid(reason: QuoteInvalidReason, message: string): QuoteValidity {
  return { valid: false, reason, message };
}
