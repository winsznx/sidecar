import type { Address, Hash, Hex } from "viem";

import {
  HIDEKI_CHAIN_ID,
  type AccountSnapshot,
  type HidekiChainId,
  type MarketMeta,
  type OrderIntent,
  type VerifiedOrder,
} from "@/lib/dreamdex/types";
import { formatQuantity, shortAddress } from "@/lib/format/units";
import { intentHash } from "@/lib/orders/intent";

/**
 * Evidence records for real order runs, and the one headline a receipt may carry.
 *
 * Wallet addresses and transaction hashes are public chain data and are kept.
 * Signatures, keys, auth material and HTTP headers are stripped before anything is
 * serialised.
 */

export type PreviewStatus = "verified" | "estimate" | "unavailable";

export interface ProofEvent {
  runId: string;
  observedAtUtc: string;
  networkChainId: HidekiChainId;
  selectedAccount: Address;
  counterpartAccount: Address;
  marketPool: Address;
  /** Local canonical hash of the prepared order. Never a substitute for `txHash`. */
  orderIntentHash: Hex;
  txHash?: Hash;
  onchainOrderId?: string;
  receiptStatus?: "success" | "reverted";
  orderStatus?: ReceiptStatusLabel;
  fillQuantityRaw?: string;
  beforeBlock?: string;
  afterBlock?: string;
  beforeAccountState?: Record<string, unknown>;
  afterAccountState?: Record<string, unknown>;
  previewStatus: PreviewStatus;
  notes?: string;
}

export type ReceiptStatusLabel =
  | "filled"
  | "partially filled"
  | "resting"
  | "no fill"
  | "reverted"
  | "outcome unknown";

export interface ReceiptHeadline {
  status: ReceiptStatusLabel;
  headline: string;
  detail: string;
  /** Failed truth checks, worded for display next to the headline. */
  warnings: string[];
}

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface SanitizedEvidence {
  value: JsonValue;
  /** Dotted paths of everything removed, so a reviewer can see what was withheld. */
  redacted: string[];
}

export type BuildProofEventResult = { ok: true; event: ProofEvent } | { ok: false; reason: string };

/** Keys whose values are never kept, compared case-insensitively without separators. */
const SECRET_KEYS = new Set([
  "privatekey",
  "pk",
  "secret",
  "secretkey",
  "mnemonic",
  "seed",
  "seedphrase",
  "passphrase",
  "password",
  "signature",
  "sig",
  "signedtransaction",
  "rawtransaction",
  "serializedtransaction",
  "authorization",
  "auth",
  "headers",
  "cookie",
  "setcookie",
  "apikey",
  "xapikey",
  "accesstoken",
  "authtoken",
  "refreshtoken",
  "idtoken",
  "apitoken",
  "sessiontoken",
  "bearertoken",
  "jwt",
]);

/** Transaction signature components, removed when they carry a value. */
const SIGNATURE_PARTS = new Set(["r", "s", "v", "yparity"]);

const SECRET_QUERY_PARAMS = new Set(["key", "apikey", "api_key", "token", "access_token", "secret", "auth", "signature"]);

/** 65-byte ECDSA signatures and anything longer that is hex: signed payloads. */
const SIGNATURE_HEX = /^0x[0-9a-fA-F]{130,}$/;
const MNEMONIC_LIKE = /^(?:[a-z]{3,8} ){11,23}[a-z]{3,8}$/;

/**
 * The receipt's one-line verdict. "filled" requires decoded fills that cover the
 * requested quantity; a successful receipt alone, or an outcome label alone, is never
 * enough. Inconsistent evidence reads as "outcome unknown", not as the hopeful case.
 */
export function receiptHeadline(order: VerifiedOrder): ReceiptHeadline {
  const warnings = order.checks
    .filter((check) => check.status === "fail")
    .map((check) => `Check failed: ${check.label}. ${check.detail}`.trim());

  if (order.chainId !== HIDEKI_CHAIN_ID) {
    return unknown(`This receipt is from chain ${order.chainId}, not Hideki (${HIDEKI_CHAIN_ID}).`, warnings);
  }
  if (order.receiptStatus === "reverted") {
    return {
      status: "reverted",
      headline: "Reverted. No order was placed.",
      detail: order.revertReason ? `Reason: ${order.revertReason}` : "The revert reason was not decoded.",
      warnings,
    };
  }

  const decodedFill = order.fills.reduce((total, fill) => total + fill.quantity, 0n);
  if (order.fills.some((fill) => fill.quantity <= 0n) || decodedFill !== order.filledQuantity) {
    return unknown("The decoded fills do not add up to the reported fill quantity.", warnings);
  }
  const quantity = (raw: bigint): string => formatFillQuantity(raw, order.market);

  if (decodedFill > 0n) {
    if (order.outcome !== "FILLED" && order.outcome !== "PARTIALLY_FILLED") {
      warnings.push("The decoded outcome disagrees with the fills. Sidecar reports what the fills show.");
    }
    if (order.requested === null) {
      return unknown(`Fills of ${quantity(decodedFill)} were decoded, but the requested size is unknown.`, warnings);
    }
    const requested = order.requested.quantity;
    if (decodedFill > requested) {
      return unknown(`Decoded fills of ${quantity(decodedFill)} exceed the ${quantity(requested)} requested.`, warnings);
    }
    if (decodedFill === requested) {
      return {
        status: "filled",
        headline: "Filled",
        detail: `Decoded fills cover the full ${quantity(requested)} requested.`,
        warnings,
      };
    }
    const remainder =
      order.orderId !== null
        ? `The rest is resting on the book as order ${order.orderId.toString()}.`
        : "The rest did not rest on the book.";
    return {
      status: "partially filled",
      headline: "Partially filled",
      detail: `${quantity(decodedFill)} of ${quantity(requested)} filled. ${remainder}`,
      warnings,
    };
  }

  if (order.orderId !== null && order.outcome === "RESTING") {
    return {
      status: "resting",
      headline: "Order confirmed, not filled. It is resting on the book.",
      detail: `Order id ${order.orderId.toString()}.`,
      warnings,
    };
  }
  if (order.orderId === null && order.outcome === "NO_FILL") {
    return {
      status: "no fill",
      headline: "No fill",
      detail: "The transaction succeeded, but the order neither filled nor rested on the book.",
      warnings,
    };
  }
  return unknown("The receipt confirmed, but what the order did could not be decoded.", warnings);
}

/**
 * Assembles a proof record from a run. Refuses a receipt from any chain other than
 * Hideki, because the record's network field could not then be true.
 */
export function buildProofEvent(input: {
  runId: string;
  observedAtMs: number;
  selectedAccount: Address;
  counterpartAccount: Address;
  intent: OrderIntent;
  verified?: VerifiedOrder | null;
  before?: AccountSnapshot | null;
  after?: AccountSnapshot | null;
  previewStatus: PreviewStatus;
  notes?: string;
}): BuildProofEventResult {
  if (!Number.isFinite(input.observedAtMs)) return { ok: false, reason: "The observation time is invalid." };
  const verified = input.verified ?? null;
  if (verified !== null && verified.chainId !== HIDEKI_CHAIN_ID) {
    return { ok: false, reason: `The receipt is from chain ${verified.chainId}, not Hideki (${HIDEKI_CHAIN_ID}).` };
  }

  const notes = input.notes ? [input.notes] : [];
  const event: ProofEvent = {
    runId: input.runId,
    observedAtUtc: new Date(input.observedAtMs).toISOString(),
    networkChainId: HIDEKI_CHAIN_ID,
    selectedAccount: input.selectedAccount,
    counterpartAccount: input.counterpartAccount,
    marketPool: input.intent.pool,
    orderIntentHash: intentHash(input.intent, input.selectedAccount, HIDEKI_CHAIN_ID),
    previewStatus: input.previewStatus,
  };

  if (verified !== null) {
    const headline = receiptHeadline(verified);
    event.txHash = verified.hash;
    event.receiptStatus = verified.receiptStatus;
    event.orderStatus = headline.status;
    event.fillQuantityRaw = verified.filledQuantity.toString();
    if (verified.orderId !== null) event.onchainOrderId = verified.orderId.toString();
    if (verified.from.toLowerCase() !== input.selectedAccount.toLowerCase()) {
      notes.push(
        `Sender mismatch: the transaction came from ${shortAddress(verified.from)}, not the selected ${shortAddress(input.selectedAccount)}.`,
      );
    }
    notes.push(...headline.warnings);
  }
  if (input.before) {
    event.beforeBlock = input.before.block.toString();
    event.beforeAccountState = summarizeAccountState(input.before);
  }
  if (input.after) {
    event.afterBlock = input.after.block.toString();
    event.afterAccountState = summarizeAccountState(input.after);
  }
  if (notes.length > 0) event.notes = notes.join(" ");
  return { ok: true, event };
}

/** The public, JSON-safe parts of an account read: balances, health and positions. */
export function summarizeAccountState(snapshot: AccountSnapshot): Record<string, unknown> {
  return {
    account: snapshot.account,
    marginBank: snapshot.marginBank,
    block: snapshot.block.toString(),
    readAt: snapshot.readAt,
    readStatus: snapshot.readStatus,
    margin:
      snapshot.margin === null
        ? null
        : {
            unlockedCollateral: snapshot.margin.unlockedCollateral.toString(),
            lockedCollateral: snapshot.margin.lockedCollateral.toString(),
            equity: snapshot.margin.equity.toString(),
            mmReq: snapshot.margin.mmReq.toString(),
            imReq: snapshot.margin.imReq.toString(),
            status: snapshot.margin.status,
          },
    positions: snapshot.positions.map((position) => ({
      pool: position.pool,
      baseSymbol: position.baseSymbol,
      size: position.size.toString(),
      entryPrice: position.entryPrice.toString(),
      priceable: position.priceable,
    })),
    gasBalance: snapshot.gasBalance === null ? null : snapshot.gasBalance.toString(),
    issues: [...snapshot.issues],
  };
}

/**
 * Converts anything into plain JSON: bigints become decimal strings, dates ISO strings,
 * binary buffers are dropped (they could be key material), cycles are cut.
 */
export function toJsonSafe(value: unknown): JsonValue {
  return sanitize(value, "", new WeakSet<object>(), [], false);
}

/** {@link toJsonSafe} plus removal of secrets, signatures, auth headers and URL credentials. */
export function sanitizeEvidence(value: unknown): SanitizedEvidence {
  const redacted: string[] = [];
  return { value: sanitize(value, "", new WeakSet<object>(), redacted, true), redacted };
}

/** Sanitised, bigint-safe JSON for a proof event. */
export function serializeProofEvent(event: ProofEvent, space?: number): string {
  return JSON.stringify(sanitizeEvidence(event).value, null, space);
}

function sanitize(
  value: unknown,
  path: string,
  seen: WeakSet<object>,
  redacted: string[],
  strip: boolean,
): JsonValue {
  switch (typeof value) {
    case "bigint":
      return value.toString();
    case "string":
      return strip ? sanitizeString(value, path, redacted) : value;
    case "number":
      return Number.isFinite(value) ? value : null;
    case "boolean":
      return value;
    case "undefined":
    case "function":
    case "symbol":
      return null;
    case "object":
      break;
  }
  if (value === null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    redacted.push(path || "(root)");
    return null;
  }
  if (seen.has(value)) return "[circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item, index) => sanitize(item, `${path}[${index}]`, seen, redacted, strip));
  }
  const entries: Iterable<[unknown, unknown]> = value instanceof Map ? value.entries() : Object.entries(value);
  const result: { [key: string]: JsonValue } = {};
  for (const [rawKey, item] of entries) {
    const key = String(rawKey);
    const childPath = path === "" ? key : `${path}.${key}`;
    if (item === undefined || typeof item === "function" || typeof item === "symbol") continue;
    if (strip && isSecretKey(key, item)) {
      redacted.push(childPath);
      continue;
    }
    result[key] = sanitize(item, childPath, seen, redacted, strip);
  }
  return result;
}

function isSecretKey(key: string, value: unknown): boolean {
  const normalized = key.toLowerCase().replace(/[-_\s]/g, "");
  if (SECRET_KEYS.has(normalized)) return true;
  return SIGNATURE_PARTS.has(normalized) && (typeof value === "string" || typeof value === "bigint" || typeof value === "number");
}

function sanitizeString(value: string, path: string, redacted: string[]): string {
  if (SIGNATURE_HEX.test(value) || MNEMONIC_LIKE.test(value.trim())) {
    redacted.push(path || "(root)");
    return "[redacted]";
  }
  if (!/^(?:https?|wss?):\/\//i.test(value)) return value;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return value;
  }
  let changed = false;
  if (url.username !== "" || url.password !== "") {
    url.username = "";
    url.password = "";
    changed = true;
  }
  for (const name of [...url.searchParams.keys()]) {
    if (SECRET_QUERY_PARAMS.has(name.toLowerCase())) {
      url.searchParams.set(name, "redacted");
      changed = true;
    }
  }
  if (changed) redacted.push(path || "(root)");
  return changed ? url.toString() : value;
}

function unknown(detail: string, warnings: string[]): ReceiptHeadline {
  return { status: "outcome unknown", headline: "Outcome unknown", detail, warnings };
}

function formatFillQuantity(raw: bigint, market: MarketMeta | null): string {
  return market === null ? `${raw.toString()} raw units` : formatQuantity(raw, market, { withSymbol: true });
}
