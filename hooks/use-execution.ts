"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Address, Hash, WalletClient } from "viem";

import { proofStorageKey } from "@/components/evidence/captured-proof";
import { bindSigner, getBrowserMarkets, getPublicClient } from "@/lib/dreamdex/client";
import { classifyError, type SidecarError, type SidecarErrorCode } from "@/lib/dreamdex/errors";
import type { AccountSnapshot, BuiltOrder, MarketMeta, OrderIntent, RouteQuote, VerifiedOrder } from "@/lib/dreamdex/types";
import { buildProofEvent, serializeProofEvent } from "@/lib/evidence/proof-event";
import { formatBlockNumber } from "@/lib/format/units";
import {
  eventForReceiptWait,
  INITIAL_EXECUTION_STATE,
  isLocked,
  phaseCopy,
  transition,
  type ExecutionEvent,
  type ExecutionState,
  type PhaseCopy,
  type TransitionResult,
} from "@/lib/orders/lifecycle";

import { getBrowserAdapter } from "./use-perps-adapter";
import { sidecarKeys } from "./use-sidecar-queries";
import {
  ATTEMPT_RESTORE_MAX_AGE_MS,
  checkDropped,
  clearAttempt,
  saveAttempt,
  useStoredAttempt,
  type MissingSince,
  type StoredAttempt,
} from "./use-trade-attempt";

/** Pause between background look-ups of a transaction whose outcome is unknown. */
export const UNKNOWN_RECHECK_DELAY_MS = 10_000;

/** A step that stopped before anything reached the wallet or the chain. */
export interface NothingSent {
  title: string;
  message: string;
  nextStep: string;
}

export type ProofRecordStatus =
  | { status: "saved"; key: string }
  | { status: "not-saved"; reason: string };

export interface ExecutionController {
  state: ExecutionState;
  copy: PhaseCopy;
  /** Why the last attempt stopped with nothing sent. Shown instead of the generic rejection copy. */
  nothingSent: NothingSent | null;
  /** A refusal from the state machine, in plain language (for example a stale preview). */
  refusal: string | null;
  /** A fresh preview or a receipt check is running. */
  checking: boolean;
  verified: VerifiedOrder | null;
  /** Labels of truth checks that failed on the receipt. Any failure keeps the order out of every fill state. */
  verificationFailures: string[];
  /** Reading the account again after the order failed, so the after-state is unknown. */
  afterStateIssue: string | null;
  proof: ProofRecordStatus | null;
  /** What the last chain look-up found while the outcome is unknown, beyond the phase copy. */
  recoveryNote: string | null;
  /** An attempt saved before a reload that Sidecar cannot follow (no hash came back): it may still have been sent. */
  orphan: StoredAttempt | null;
  /** The trader checked their wallet's activity and clears the saved attempt. */
  dismissOrphan: () => void;
  locked: boolean;
  /** Fresh protocol preview for this exact order and account, as the review dialog opens. */
  prepare: (input: { intent: OrderIntent; account: Address }) => Promise<RouteQuote | null>;
  /** Build, sign and follow the order. Never resends on its own. */
  confirm: (input: { intent: OrderIntent; account: Address; walletClient: WalletClient }) => Promise<void>;
  /** Poll the SAME tracked hash again. Never sends anything. */
  checkAgain: () => Promise<void>;
  /** Start over. Refused while a transaction may be in flight. */
  reset: () => void;
}

interface Attempt {
  intent: OrderIntent;
  account: Address;
  quote: RouteQuote | null;
  before: AccountSnapshot | null;
  counterpart: Address | null;
  market: MarketMeta;
  markets: readonly MarketMeta[];
  /** The account's pending nonce just before signing; `null` when it could not be read. */
  nonce: number | null;
}

/** Codes for which the wallet or Sidecar refused before signing, so nothing can be on chain. */
export const NOTHING_SENT_CODES: ReadonlySet<SidecarErrorCode> = new Set<SidecarErrorCode>([
  "WRONG_CHAIN",
  "SIGNER_MISSING",
  "SIGNER_MISMATCH",
  "INVALID_ORDER",
  "INSUFFICIENT_GAS",
  "NONCE_CONFLICT",
  "INVALID_INPUT",
  "CANCELLED",
]);

function nothingSentFrom(error: SidecarError): NothingSent {
  return { title: error.title, message: error.message, nextStep: error.nextStep };
}

function runId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `run-${Date.now()}`;
}

function quoteNote(quote: RouteQuote | null): string {
  if (quote === null) return "No preview was attached to this order.";
  const parts = [`Preview at block ${quote.block.toString()}`];
  if (quote.margin !== null) parts.push(`lock ${quote.margin.lockAmount.toString()} raw`, `top-up ${quote.margin.topUpRequired.toString()} raw`);
  if (quote.maxSize !== null) parts.push(`max size ${quote.maxSize.maxQuantity.toString()} raw`);
  return `${parts.join(", ")}.`;
}

function failedCheckLabels(order: VerifiedOrder): string[] {
  return order.checks.filter((check) => check.status === "fail").map((check) => check.label);
}

async function readPendingNonce(account: Address): Promise<number | null> {
  try {
    return await getPublicClient(getBrowserMarkets()).getTransactionCount({ address: account, blockTag: "pending" });
  } catch (error) {
    console.warn("Sidecar could not read the account nonce before signing, so a dropped transaction cannot be proven.", error);
    return null;
  }
}

function withVerification(copy: PhaseCopy, state: ExecutionState, failures: readonly string[]): PhaseCopy {
  if (failures.length === 0) return copy;
  const reread = state.phase === "ACCOUNT_RECONCILED" ? ` Account re-read at block ${formatBlockNumber(state.reconciledBlock)}.` : "";
  return { ...copy, detail: `These truth checks failed: ${failures.join(", ")}. Sidecar does not treat this order as filled.${reread}` };
}

/** Nothing has happened on this ticket since the screen loaded. */
function isPristine(state: ExecutionState): boolean {
  return state.phase === "EDITING" && state.intent === null && state.account === null && state.trackedHashes.length === 0;
}

interface Resumable {
  state: ExecutionState;
  attempt: Attempt;
}

/** A saved attempt with a hash Sidecar can keep following, rebuilt as the reducer state it was saved from. */
function resumableFrom(
  stored: StoredAttempt | null,
  markets: readonly MarketMeta[] | undefined,
  counterpart: (account: Address) => Address | null,
  nowMs: number,
): Resumable | null {
  if (stored === null || markets === undefined) return null;
  const latest = stored.trackedHashes.at(-1) ?? null;
  const market = markets.find((candidate) => candidate.pool.toLowerCase() === stored.intent.pool.toLowerCase()) ?? null;
  if (latest === null || market === null || nowMs - stored.savedAtMs > ATTEMPT_RESTORE_MAX_AGE_MS) return null;
  return {
    state: {
      ...INITIAL_EXECUTION_STATE,
      phase: "UNKNOWN_OUTCOME",
      intent: stored.intent,
      account: stored.account,
      txHash: latest,
      trackedHashes: stored.trackedHashes,
      submitAttempts: 1,
      notice: "Restored after a reload. Sidecar keeps looking up this order's transaction. Do not resend.",
    },
    attempt: {
      intent: stored.intent,
      account: stored.account,
      quote: null,
      before: null,
      counterpart: counterpart(stored.account),
      market,
      markets,
      nonce: stored.nonce,
    },
  };
}

function saveProof(key: string, value: string): ProofRecordStatus {
  try {
    window.localStorage.setItem(key, value);
    return { status: "saved", key };
  } catch (error) {
    console.warn("Sidecar could not save the proof record in this browser.", error);
    return { status: "not-saved", reason: "This browser refused to store the proof record, so the receipt page will re-read the chain only." };
  }
}

/**
 * The execution controller for one order ticket. The pure state machine in
 * lib/orders/lifecycle decides every transition; this hook only performs the side effects
 * it allows, in order: preview, build, sign, follow the receipt, decode, re-read accounts.
 * An attempt that may be in flight is saved in this browser, so a reload keeps following it.
 */
export function useExecution(options: {
  market: MarketMeta | null;
  markets: readonly MarketMeta[] | undefined;
  /** The other account in the comparison, which must not fund this order. */
  counterpart: (account: Address) => Address | null;
}): ExecutionController {
  const { market, markets, counterpart } = options;
  const queryClient = useQueryClient();
  const [state, setState] = useState<ExecutionState>(INITIAL_EXECUTION_STATE);
  const stateRef = useRef<ExecutionState>(INITIAL_EXECUTION_STATE);
  const attemptRef = useRef<Attempt | null>(null);
  const followingRef = useRef(false);
  const missingRef = useRef<MissingSince | null>(null);
  const resumableRef = useRef<Resumable | null>(null);
  const [nothingSent, setNothingSent] = useState<NothingSent | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [verified, setVerified] = useState<VerifiedOrder | null>(null);
  const [verificationFailures, setVerificationFailures] = useState<string[]>([]);
  const [afterStateIssue, setAfterStateIssue] = useState<string | null>(null);
  const [proof, setProof] = useState<ProofRecordStatus | null>(null);
  const [recoveryNote, setRecoveryNote] = useState<string | null>(null);
  const stored = useStoredAttempt();
  const [loadedAtMs] = useState(() => Date.now());

  // An attempt saved before a reload stands in for the untouched ticket until an event moves it on.
  const resumable = useMemo(() => resumableFrom(stored, markets, counterpart, loadedAtMs), [stored, markets, counterpart, loadedAtMs]);
  useEffect(() => {
    resumableRef.current = resumable;
  }, [resumable]);

  const current = useCallback((): ExecutionState => {
    const resumed = resumableRef.current;
    return resumed !== null && isPristine(stateRef.current) ? resumed.state : stateRef.current;
  }, []);

  const send = useCallback((event: ExecutionEvent): TransitionResult => {
    const base = current();
    const resumed = resumableRef.current;
    if (resumed !== null && base === resumed.state && attemptRef.current === null) attemptRef.current = resumed.attempt;
    const wasLocked = isLocked(base);
    const result = transition(base, event);
    stateRef.current = result.state;
    setState(result.state);
    if (!result.accepted) setRefusal(result.reason);
    const next = result.state;
    if (isLocked(next) && next.intent !== null && next.account !== null) {
      saveAttempt({
        account: next.account,
        intent: next.intent,
        trackedHashes: [...next.trackedHashes],
        nonce: attemptRef.current?.nonce ?? null,
        savedAtMs: Date.now(),
      });
    } else if (wasLocked && !isLocked(next)) {
      clearAttempt();
      missingRef.current = null;
      setRecoveryNote(null);
    }
    return result;
  }, [current]);

  const finishAttempt = useCallback(
    async (attempt: Attempt, hash: Hash, order: VerifiedOrder | null): Promise<void> => {
      const { market: attemptMarket, markets: attemptMarkets, account } = attempt;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: sidecarKeys.accounts() }),
        queryClient.invalidateQueries({ queryKey: sidecarKeys.quotes() }),
      ]);
      let after: AccountSnapshot | null = null;
      try {
        const fresh = await queryClient.fetchQuery({
          queryKey: sidecarKeys.account(attemptMarket.marginBank, account),
          queryFn: () => getBrowserAdapter().getAccountSnapshot(account, attemptMarket.marginBank, attemptMarkets),
          staleTime: 0,
        });
        after = fresh;
        send({ type: "RECONCILED", block: fresh.block });
        setAfterStateIssue(null);
      } catch (error) {
        const classified = classifyError(error);
        setAfterStateIssue(`The account could not be read again: ${classified.message} ${classified.nextStep}`);
      }

      if (attempt.counterpart === null) {
        setProof({ status: "not-saved", reason: "No second account was set, so there is no counterpart to record." });
        return;
      }
      const built = buildProofEvent({
        runId: runId(),
        observedAtMs: Date.now(),
        selectedAccount: account,
        counterpartAccount: attempt.counterpart,
        intent: attempt.intent,
        verified: order,
        before: attempt.before,
        after,
        previewStatus: attempt.quote === null ? "unavailable" : "estimate",
        notes: quoteNote(attempt.quote),
      });
      setProof(built.ok ? saveProof(proofStorageKey(hash), serializeProofEvent(built.event)) : { status: "not-saved", reason: built.reason });
    },
    [queryClient, send],
  );

  const settle = useCallback(
    async (attempt: Attempt, hash: Hash, receipt: "success" | "reverted"): Promise<void> => {
      let order: VerifiedOrder | null = null;
      try {
        order = await getBrowserAdapter().reconcileOrder(hash, {
          markets: attempt.markets,
          intent: attempt.intent,
          expectedAccount: attempt.account,
          expectedMarginBank: attempt.market.marginBank,
          counterpartAccount: attempt.counterpart ?? undefined,
        });
        setVerified(order);
      } catch (error) {
        const classified = classifyError(error);
        if (receipt === "success") send({ type: "DECODE_FAILED", reason: classified.message });
        else send({ type: "PLACEMENT_DECODED", outcome: "REVERTED", orderId: null, filledQuantity: 0n, revertReason: null });
        await finishAttempt(attempt, hash, null);
        return;
      }

      if (receipt === "reverted" || order.outcome === "REVERTED") {
        const decoded = send({
          type: "PLACEMENT_DECODED",
          outcome: "REVERTED",
          orderId: null,
          filledQuantity: 0n,
          revertReason: order.revertReason,
        });
        if (!decoded.accepted) {
          send({ type: "DECODE_FAILED", reason: "The receipt succeeded but the decoded placement says it reverted." });
          setRefusal(null);
        }
      } else {
        // A failed check (wrong sender, wrong bank, wrong chain, a placement owned by someone
        // else) contradicts the decoded fills, so the order never reaches a fill state.
        const failures = failedCheckLabels(order);
        setVerificationFailures(failures);
        if (failures.length > 0) {
          send({ type: "DECODE_FAILED", reason: `these truth checks failed: ${failures.join(", ")}` });
        } else {
          send({
            type: "PLACEMENT_DECODED",
            outcome: order.outcome,
            orderId: order.orderId,
            filledQuantity: order.filledQuantity,
            revertReason: order.revertReason,
          });
        }
      }
      await finishAttempt(attempt, hash, order);
    },
    [finishAttempt, send],
  );

  const follow = useCallback(
    async (attempt: Attempt, hash: Hash): Promise<void> => {
      if (followingRef.current) return;
      followingRef.current = true;
      setChecking(true);
      try {
        let current = hash;
        for (;;) {
          const wait = await getBrowserAdapter().waitForReceipt(current);
          send(eventForReceiptWait(wait));
          if (wait.status === "replaced") {
            current = wait.replacement;
            continue;
          }
          if (wait.status === "success" || wait.status === "reverted") await settle(attempt, current, wait.status);
          return;
        }
      } finally {
        followingRef.current = false;
        setChecking(false);
      }
    },
    [send, settle],
  );

  const prepare = useCallback(
    async ({ intent, account }: { intent: OrderIntent; account: Address }): Promise<RouteQuote | null> => {
      if (market === null) return null;
      setRefusal(null);
      setNothingSent(null);
      setVerified(null);
      setVerificationFailures([]);
      setProof(null);
      setAfterStateIssue(null);
      const requested = send({ type: "QUOTE_REQUESTED", intent, account });
      if (!requested.accepted) return null;
      setChecking(true);
      try {
        const quote = await queryClient.fetchQuery({
          queryKey: sidecarKeys.quote(account, intent, true),
          queryFn: () => getBrowserAdapter().quoteRoute(account, intent, market, { autoPull: true }),
          staleTime: 0,
        });
        send({ type: "QUOTE_READY", quote });
        return quote;
      } catch (error) {
        const classified = classifyError(error);
        send({ type: "QUOTE_FAILED", reason: `${classified.message} ${classified.nextStep}` });
        return null;
      } finally {
        setChecking(false);
      }
    },
    [market, queryClient, send],
  );

  const confirm = useCallback(
    async ({ intent, account, walletClient }: { intent: OrderIntent; account: Address; walletClient: WalletClient }): Promise<void> => {
      if (market === null || markets === undefined) return;
      setRefusal(null);
      setNothingSent(null);
      setVerified(null);
      setVerificationFailures([]);
      setProof(null);
      setAfterStateIssue(null);

      const adapter = getBrowserAdapter();
      let built: BuiltOrder;
      try {
        bindSigner(getBrowserMarkets(), walletClient);
        built = await adapter.buildOrder(intent, market, { expectedSigner: account });
      } catch (error) {
        setNothingSent(nothingSentFrom(classifyError(error)));
        return;
      }

      // Read before the wallet prompt: it is the only evidence that can later prove a
      // hash that never mined was dropped rather than replaced.
      const nonce = await readPendingNonce(account);
      const attempt: Attempt = {
        intent,
        account,
        quote: stateRef.current.quote,
        before: queryClient.getQueryData<AccountSnapshot>(sidecarKeys.account(market.marginBank, account)) ?? null,
        counterpart: counterpart(account),
        market,
        markets,
        nonce,
      };
      attemptRef.current = attempt;
      const signing = send({
        type: "SIGN_REQUESTED",
        intent,
        account,
        signer: { address: walletClient.account?.address ?? null, chainId: walletClient.chain?.id ?? null },
        nowMs: Date.now(),
      });
      if (!signing.accepted || signing.state.phase !== "AWAITING_WALLET_CONFIRMATION") return;
      attempt.quote = signing.state.quote;

      let hash: Hash;
      try {
        hash = await adapter.sendOrder({ walletClient, account, built });
      } catch (error) {
        const classified = classifyError(error);
        if (classified.code === "WALLET_REJECTED") {
          send({ type: "WALLET_REJECTED" });
        } else if (NOTHING_SENT_CODES.has(classified.code)) {
          send({ type: "WALLET_REJECTED" });
          setNothingSent(nothingSentFrom(classified));
        } else {
          const knownHash = classified.code === "OUTCOME_UNKNOWN" ? classified.hash : null;
          send({
            type: "OUTCOME_UNKNOWN",
            hash: knownHash,
            note: `${classified.message} Check your wallet's activity for a pending transaction from this account before placing another order.`,
          });
        }
        return;
      }

      send({ type: "TX_SUBMITTED", hash });
      await follow(attempt, hash);
    },
    [counterpart, follow, market, markets, queryClient, send],
  );

  const recheck = useCallback(async (): Promise<void> => {
    const now = current();
    const resumed = resumableRef.current;
    if (attemptRef.current === null && resumed !== null && now === resumed.state) attemptRef.current = resumed.attempt;
    const attempt = attemptRef.current;
    if (attempt === null || now.phase !== "UNKNOWN_OUTCOME" || now.txHash === null) return;
    await follow(attempt, now.txHash);
    const after = stateRef.current;
    if (after.phase !== "UNKNOWN_OUTCOME" || after.txHash === null || after.trackedHashes.length !== 1) return;
    try {
      const drop = await checkDropped({
        client: getPublicClient(getBrowserMarkets()),
        hash: after.txHash,
        account: attempt.account,
        nonce: attempt.nonce,
        missingSince: missingRef.current,
        nowMs: Date.now(),
      });
      if (drop.status === "dropped") {
        send({ type: "TX_DROPPED", hash: after.txHash, evidence: "not-found-after-N-blocks" });
        return;
      }
      missingRef.current = drop.missingSince;
      setRecoveryNote(drop.note);
    } catch (error) {
      console.warn("Sidecar could not check whether the transaction was dropped.", error);
    }
  }, [current, follow, send]);

  const checkAgain = useCallback(async (): Promise<void> => {
    const now = current();
    setRefusal(null);
    if (now.phase !== "UNKNOWN_OUTCOME") return;
    if (now.txHash === null) {
      setRefusal("No transaction hash came back from the wallet, so there is nothing to look up. Check your wallet's activity.");
      return;
    }
    await recheck();
  }, [current, recheck]);

  const effective = resumable !== null && isPristine(state) ? resumable.state : state;

  // The chain is the external system: while the outcome is unknown and a hash is known,
  // keep looking it up. `checking` flips back after each look-up, which schedules the next.
  useEffect(() => {
    if (effective.phase !== "UNKNOWN_OUTCOME" || effective.txHash === null || checking) return;
    const timer = setTimeout(() => void recheck(), UNKNOWN_RECHECK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [effective.phase, effective.txHash, checking, recheck]);

  const orphan = stored !== null && resumable === null && !isLocked(effective) ? stored : null;
  const dismissOrphan = useCallback((): void => {
    if (!isLocked(current())) clearAttempt();
  }, [current]);

  const reset = useCallback((): void => {
    const result = send({ type: "RESET" });
    if (!result.accepted) return;
    attemptRef.current = null;
    setNothingSent(null);
    setRefusal(null);
    setVerified(null);
    setVerificationFailures([]);
    setProof(null);
    setAfterStateIssue(null);
  }, [send]);

  return {
    state: effective,
    copy: withVerification(phaseCopy(effective), effective, verificationFailures),
    nothingSent,
    refusal,
    checking,
    verified,
    verificationFailures,
    afterStateIssue,
    proof,
    recoveryNote,
    orphan,
    dismissOrphan,
    locked: isLocked(effective),
    prepare,
    confirm,
    checkAgain,
    reset,
  };
}
