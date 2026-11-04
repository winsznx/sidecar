import { getAddress, isAddress, type Address, type Hash, type Hex } from "viem";

import { describeRevert } from "@/lib/dreamdex/errors";
import {
  HIDEKI_CHAIN_ID,
  type MarginEventRecord,
  type OrderIntent,
  type Source,
  type TruthCheck,
  type VerifiedOrder,
} from "@/lib/dreamdex/types";
import type { ReceiptHeadline } from "@/lib/evidence/proof-event";
import { formatBlockNumber, formatQuantity, shortAddress } from "@/lib/format/units";
import { intentHash } from "@/lib/orders/intent";
import { sameAddress, type AccountBook } from "@/lib/wallets/identity";

export type HashParseResult = { ok: true; hash: Hash } | { ok: false; reason: string };

const HEX = /^[0-9a-fA-F]*$/;

/** Checks the route segment before anything reaches the network. */
export function parseTxHashParam(raw: string): HashParseResult {
  const value = safeDecode(raw).trim();
  if (value === "") return { ok: false, reason: "The link has no transaction hash." };
  if (!/^0x/i.test(value)) return { ok: false, reason: "A transaction hash starts with 0x." };
  const digits = value.slice(2);
  if (!HEX.test(digits)) return { ok: false, reason: "A transaction hash uses only the digits 0 to 9 and the letters a to f." };
  if (digits.length !== 64) {
    return { ok: false, reason: `A transaction hash has 64 hex characters after 0x. This one has ${digits.length}.` };
  }
  return { ok: true, hash: `0x${digits.toLowerCase()}` };
}

/** An optional `?account=` value. Anything that is not an address is ignored rather than guessed at. */
export function parseAccountParam(raw: string | null | undefined): Address | null {
  if (raw === null || raw === undefined) return null;
  const value = raw.trim();
  return isAddress(value, { strict: false }) ? getAddress(value) : null;
}

function safeDecode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Checks a receipt read can always decide from the chain alone. */
export const CORE_CHECK_IDS: ReadonlySet<string> = new Set([
  "chain-id",
  "pool-listed",
  "margin-bank",
  "receipt-success",
  "placement-decoded",
  "position-attribution",
  "collateral-attribution",
]);

/** Checks that need something only the sending session knows. They are required once that context exists. */
const CONTEXT_NEEDS: Readonly<Record<string, string>> = {
  sender: "Not compared. Needs the account that was selected when the order was sent.",
  "calldata-intent": "Not compared. Needs the order Sidecar prepared before signing, which only the sending browser saved.",
  "counterpart-isolation": "Not compared. Needs the other account in the comparison.",
};

/** What the qualified stamp names as missing, in the order a reader cares about. */
const NOT_COMPARED_WORDS: readonly (readonly [string, string])[] = [
  ["sender", "Sender not compared"],
  ["counterpart-isolation", "Other account not compared"],
  ["calldata-intent", "Prepared order not compared"],
];

export type ExpectedAccountOrigin = "captured" | "link";

export interface VerdictContext {
  expectedAccount: Address | null;
  counterpart: Address | null;
  /** The order hash the sending browser saved, and the account it was hashed for. */
  capturedIntent?: { hash: Hex; account: Address } | null;
}

export type CheckTone = "pass" | "fail" | "not-applicable" | "not-checked" | "unresolved";

export interface CheckRow {
  /** The check as this page judges it. It can differ from the adapter's when the page holds more context. */
  check: TruthCheck;
  required: boolean;
  tone: CheckTone;
  /** Why an unknown check reads the way it does. */
  note: string | null;
}

/**
 * `verified`: every check on the page passed. `receipt-only`: every chain check passed, but at least
 * one check needed context this page does not have, so the full stamp is withheld.
 */
export type ReceiptStamp = "verified" | "receipt-only" | "not-verified";

export interface ReceiptVerdict {
  stamp: ReceiptStamp;
  rows: CheckRow[];
  requiredPassed: number;
  requiredTotal: number;
  /** One sentence on why the stamp reads as it does. */
  summary: string;
  /** Short words for the stamp itself, naming what was not compared. `null` unless the stamp is receipt-only. */
  qualifier: string | null;
}

function isRequired(id: string, context: VerdictContext): boolean {
  if (CORE_CHECK_IDS.has(id)) return true;
  if (id === "sender") return context.expectedAccount !== null;
  if (id === "counterpart-isolation") return context.counterpart !== null;
  if (id === "calldata-intent") return (context.capturedIntent ?? null) !== null;
  // A check this screen does not know about is treated as required, never waved through.
  return true;
}

/** The order the signed calldata asks for, in the shape Sidecar hashes. `null` when any part is unknown. */
export function intentFromOrder(order: VerifiedOrder): OrderIntent | null {
  const requested = order.requested;
  if (order.to === null || requested === null || requested.timeInForce === null) return null;
  return { pool: order.to, side: requested.side, quantity: requested.quantity, price: requested.price, timeInForce: requested.timeInForce };
}

/**
 * With the intent hash the sending browser saved, the calldata can be compared after the fact:
 * rebuild the order from calldata, hash it the same way, compare. A receipt alone cannot do this.
 */
function compareCapturedIntent(check: TruthCheck, order: VerifiedOrder, captured: { hash: Hex; account: Address }): TruthCheck {
  if (order.calldata === null) return check;
  const intent = intentFromOrder(order);
  if (intent === null) {
    return { ...check, status: "unknown", detail: "The calldata could not be rebuilt into an order to compare with the saved one." };
  }
  const matches = intentHash(intent, captured.account, HIDEKI_CHAIN_ID).toLowerCase() === captured.hash.toLowerCase();
  return {
    ...check,
    status: matches ? "pass" : "fail",
    detail: matches
      ? "The signed side, size, price and time in force hash to the order this browser prepared before signing."
      : "The signed order differs from the order this browser prepared before signing.",
  };
}

function lockedAnyCollateral(order: VerifiedOrder): boolean {
  return (order.marginEvents ?? []).some((e) => e.kind === "CollateralLocked" || e.kind === "DepositedFor" || e.kind === "MainFundedChild");
}

/** Adjusts a check where the page knows more, or where the adapter's pass would claim more than the chain showed. */
function judgedCheck(check: TruthCheck, order: VerifiedOrder, context: VerdictContext): TruthCheck {
  const captured = context.capturedIntent ?? null;
  if (check.id === "calldata-intent" && captured !== null) return compareCapturedIntent(check, order, captured);
  if (check.id === "collateral-attribution" && check.status === "pass" && !lockedAnyCollateral(order)) {
    if (order.receiptStatus === "reverted") {
      return { ...check, status: "unknown", detail: "Not applicable: the transaction reverted, so no collateral was locked." };
    }
    return { ...check, label: "No other account's collateral was locked", detail: "No collateral was locked in this transaction." };
  }
  return check;
}

/**
 * The receipt's verdict. VERIFIED only when the receipt succeeded, the headline is a decoded
 * outcome and every check on the page passed. When the chain checks pass but a check needs
 * context this page lacks, the stamp says so instead of reading VERIFIED. An unknown on a
 * reverted order is "not applicable", never a warning.
 */
export function receiptVerdict(order: VerifiedOrder, headline: ReceiptHeadline, context: VerdictContext): ReceiptVerdict {
  const reverted = order.receiptStatus === "reverted";
  const rows: CheckRow[] = order.checks.map((original) => {
    const check = judgedCheck(original, order, context);
    const required = isRequired(check.id, context);
    if (check.status === "pass") return { check, required, tone: "pass", note: null };
    if (check.status === "fail") return { check, required, tone: "fail", note: null };
    if (reverted) {
      const note = check.detail.startsWith("Not applicable") ? null : "Not applicable after a revert.";
      return { check, required, tone: "not-applicable", note };
    }
    if (!required) return { check, required, tone: "not-checked", note: CONTEXT_NEEDS[check.id] ?? "Not compared here." };
    return { check, required, tone: "unresolved", note: "Required, and it could not be decided from the chain." };
  });
  const required = rows.filter((row) => row.required);
  const requiredPassed = required.filter((row) => row.tone === "pass").length;
  const failed = rows.filter((row) => row.tone === "fail");
  const unresolved = rows.filter((row) => row.tone === "unresolved");
  const notChecked = rows.filter((row) => row.tone === "not-checked");
  const base = { rows, requiredPassed, requiredTotal: required.length, qualifier: null };

  if (reverted) return { ...base, stamp: "not-verified", summary: "The transaction reverted, so there is no placed order to verify." };
  if (order.chainId !== HIDEKI_CHAIN_ID) {
    return { ...base, stamp: "not-verified", summary: `The receipt is from chain ${order.chainId}, not Hideki (${HIDEKI_CHAIN_ID}).` };
  }
  if (failed.length > 0) {
    return { ...base, stamp: "not-verified", summary: `${failed.length === 1 ? "One check" : `${failed.length} checks`} failed: ${failed.map((row) => row.check.label).join("; ")}.` };
  }
  if (unresolved.length > 0) {
    return { ...base, stamp: "not-verified", summary: `Could not be decided: ${unresolved.map((row) => row.check.label).join("; ")}.` };
  }
  if (headline.status === "outcome unknown") {
    return { ...base, stamp: "not-verified", summary: headline.detail };
  }
  if (required.length === 0) return { ...base, stamp: "not-verified", summary: "The receipt carried no checks to verify." };
  if (notChecked.length > 0) {
    const missing = new Set(notChecked.map((row) => row.check.id));
    const qualifier = NOT_COMPARED_WORDS.find(([id]) => missing.has(id))?.[1] ?? "Some checks not compared";
    return {
      ...base,
      stamp: "receipt-only",
      qualifier,
      summary: `The chain checks passed against block ${formatBlockNumber(order.block)}, but this page could not compare: ${notChecked
        .map((row) => row.check.label.toLowerCase())
        .join("; ")}. Open the receipt from the browser that sent the order, or from a recorded execution, to compare them.`,
    };
  }
  return { ...base, stamp: "verified", summary: `Every check passed against block ${formatBlockNumber(order.block)}.` };
}

/**
 * Failures worth an alert above the record. A failure the page already explains elsewhere is left
 * out: the revert has the headline, and a non-placement call has its own warning.
 */
export function alertFailures(verdict: ReceiptVerdict, order: VerifiedOrder): CheckRow[] {
  return verdict.rows.filter((row) => {
    if (row.tone !== "fail") return false;
    if (order.receiptStatus === "reverted" && row.check.id === "receipt-success") return false;
    if (order.calldata === null && row.check.id === "calldata-intent") return false;
    return true;
  });
}

const FULL_ADDRESS = /0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g;
const RAW_BLOCK = /\bblock (\d+)\b/g;

/**
 * A check's detail for display: blocks grouped, addresses shortened, raw lot units shown as the
 * market's size. The full values stay in the JSON export.
 */
export function checkDetailText(check: TruthCheck, order: VerifiedOrder): string {
  const placement = order.placement ?? null;
  if (check.id === "placement-decoded" && check.status === "pass" && placement && order.market) {
    return `Order ${placement.orderId.toString()} is owned by the sender. ${formatQuantity(order.filledQuantity, order.market, { withSymbol: true })} of ${formatQuantity(placement.fullQuantity, order.market, { withSymbol: true })} filled.`;
  }
  return check.detail
    .replace(FULL_ADDRESS, (address) => shortAddress(address))
    .replace(RAW_BLOCK, (_match, digits: string) => `block ${formatBlockNumber(BigInt(digits))}`);
}

const SOLIDITY_ERROR_NAME = /^[A-Z][A-Za-z0-9_]*$/;

export interface RevertExplanation {
  /** The decoded contract error name, kept as a secondary hint. */
  name: string;
  title: string;
  message: string;
  nextStep: string;
}

/** Plain-language copy for a decoded revert name. `null` when the reason is not a decoded error name. */
export function explainRevert(order: VerifiedOrder): RevertExplanation | null {
  const reason = order.revertReason;
  if (order.receiptStatus !== "reverted" || reason === null || !SOLIDITY_ERROR_NAME.test(reason)) return null;
  const copy = describeRevert(reason);
  return { name: reason, title: copy.title, message: copy.message, nextStep: copy.nextStep };
}

const HEADLINE_PHRASE: Partial<Record<ReceiptHeadline["status"], string>> = {
  filled: "filled",
  "partially filled": "partially filled",
  resting: "resting on the book",
  "no fill": "found no fill",
  reverted: "reverted. No order was placed.",
};

/** "BTC-PERP short filled", from decoded calldata. Says "order" when the side is unknown, and falls back to the plain headline without a market. */
export function receiptTitle(order: VerifiedOrder, headline: ReceiptHeadline): string {
  const phrase = HEADLINE_PHRASE[headline.status];
  if (phrase === undefined || order.market === null) return headline.headline;
  return `${order.market.displaySymbol} ${order.requested?.side ?? "order"} ${phrase}`;
}

/** The sender's position in the target market after this transaction, from its own PositionUpdated event. */
export function positionFromReceipt(order: VerifiedOrder): { size: bigint; entryPrice: bigint } | null {
  const target = order.to;
  if (target === null) return null;
  const updates = (order.marginEvents ?? []).filter(
    (e): e is Extract<MarginEventRecord, { kind: "PositionUpdated" }> =>
      e.kind === "PositionUpdated" && sameAddress(e.account, order.from) && sameAddress(e.pool, target),
  );
  const last = updates.at(-1);
  return last === undefined ? null : { size: last.newSize, entryPrice: last.avgEntryPrice };
}

export type SavedAccountRole = "A" | "B";

export interface SavedAccountMatch {
  role: SavedAccountRole;
  label: string;
}

/** The label this browser saved for an address, if any. */
export function savedAccountFor(address: Address, book: AccountBook): SavedAccountMatch | null {
  if (book.primary !== null && sameAddress(book.primary.address, address)) return { role: "A", label: book.primary.label };
  if (book.separate !== null && sameAddress(book.separate.address, address)) return { role: "B", label: book.separate.label };
  return null;
}

/** The chain source every receipt-derived row shares. */
export function receiptSource(order: VerifiedOrder): Source {
  return { kind: "chain", block: order.block, readAt: order.readAt, via: "eth_getTransactionReceipt" };
}

/** "2026-11-01 07:14:02 UTC" from unix seconds, or null when the block time is unknown. */
export function formatUnixUtc(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return null;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : `${date.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

/** "2026-11-01 07:14:02 UTC" from an ISO string, or the input unchanged when it does not parse. */
export function formatIsoUtc(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : `${date.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}
