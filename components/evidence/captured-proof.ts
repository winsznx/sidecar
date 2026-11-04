import { getAddress, isAddress, isHash, type Address, type Hash, type Hex } from "viem";

import { HIDEKI_CHAIN_ID, type ReadStatus } from "@/lib/dreamdex/types";
import type { PreviewStatus, ProofEvent, ReceiptStatusLabel } from "@/lib/evidence/proof-event";

/** localStorage prefix for proof events captured by the trade screen in this browser. */
export const PROOF_STORAGE_PREFIX = "sidecar.proof.v1.";

/** The key a captured proof event is stored under. The hash is lower-cased so one transaction has one key. */
export function proofStorageKey(hash: Hash): string {
  return `${PROOF_STORAGE_PREFIX}${hash.toLowerCase()}`;
}

export type CapturedProofResult =
  | { status: "absent" }
  | { status: "ok"; event: ProofEvent }
  | { status: "invalid"; reason: string };

const PREVIEW_STATUSES: readonly PreviewStatus[] = ["verified", "estimate", "unavailable"];
const ORDER_STATUSES: readonly ReceiptStatusLabel[] = ["filled", "partially filled", "resting", "no fill", "reverted", "outcome unknown"];

function isPreviewStatus(value: unknown): value is PreviewStatus {
  return PREVIEW_STATUSES.some((status) => status === value);
}

function isOrderStatus(value: unknown): value is ReceiptStatusLabel {
  return ORDER_STATUSES.some((status) => status === value);
}

function isHex(value: unknown): value is Hex {
  return typeof value === "string" && /^0x[0-9a-fA-F]+$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addressField(record: Record<string, unknown>, key: string): Address | null {
  const value = record[key];
  return typeof value === "string" && isAddress(value, { strict: false }) ? getAddress(value) : null;
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

const DECIMAL = /^-?\d+$/;

/**
 * Reads a captured proof event back from storage. Anything malformed, from another chain or
 * for a different transaction is rejected with a reason instead of being half-shown.
 */
export function parseCapturedProof(raw: string | null, hash: Hash): CapturedProofResult {
  if (raw === null) return { status: "absent" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "invalid", reason: "The saved record is not valid JSON." };
  }
  if (!isRecord(parsed)) return { status: "invalid", reason: "The saved record is not an object." };
  if (parsed.networkChainId !== HIDEKI_CHAIN_ID) return { status: "invalid", reason: `The saved record is not for Hideki (${HIDEKI_CHAIN_ID}).` };
  const txHash = parsed.txHash;
  if (typeof txHash !== "string" || !isHash(txHash) || txHash.toLowerCase() !== hash.toLowerCase()) {
    return { status: "invalid", reason: "The saved record names a different transaction." };
  }
  const selectedAccount = addressField(parsed, "selectedAccount");
  const counterpartAccount = addressField(parsed, "counterpartAccount");
  const marketPool = addressField(parsed, "marketPool");
  if (selectedAccount === null || counterpartAccount === null || marketPool === null) {
    return { status: "invalid", reason: "The saved record is missing an account or market address." };
  }
  const { runId, observedAtUtc, orderIntentHash, previewStatus } = parsed;
  if (typeof runId !== "string" || typeof observedAtUtc !== "string" || Number.isNaN(Date.parse(observedAtUtc))) {
    return { status: "invalid", reason: "The saved record has no valid run id or capture time." };
  }
  if (!isHex(orderIntentHash)) {
    return { status: "invalid", reason: "The saved record has no valid order intent hash." };
  }
  if (!isPreviewStatus(previewStatus)) {
    return { status: "invalid", reason: "The saved record has no valid preview status." };
  }

  const event: ProofEvent = {
    runId,
    observedAtUtc,
    networkChainId: HIDEKI_CHAIN_ID,
    selectedAccount,
    counterpartAccount,
    marketPool,
    orderIntentHash,
    txHash: hash,
    previewStatus,
  };
  if (isOrderStatus(parsed.orderStatus)) event.orderStatus = parsed.orderStatus;
  const beforeBlock = optionalString(parsed, "beforeBlock");
  if (beforeBlock !== undefined && DECIMAL.test(beforeBlock)) event.beforeBlock = beforeBlock;
  const afterBlock = optionalString(parsed, "afterBlock");
  if (afterBlock !== undefined && DECIMAL.test(afterBlock)) event.afterBlock = afterBlock;
  if (isRecord(parsed.beforeAccountState)) event.beforeAccountState = parsed.beforeAccountState;
  if (isRecord(parsed.afterAccountState)) event.afterAccountState = parsed.afterAccountState;
  const notes = optionalString(parsed, "notes");
  if (notes !== undefined) event.notes = notes;
  return { status: "ok", event };
}

export interface CapturedMargin {
  unlockedCollateral: bigint;
  lockedCollateral: bigint;
  equity: bigint;
  mmReq: bigint;
  status: string;
}

export interface CapturedPosition {
  pool: Address;
  baseSymbol: string | null;
  size: bigint;
  entryPrice: bigint;
}

export interface CapturedAccountState {
  account: Address;
  block: bigint;
  readAt: string | null;
  /** `null` when the margin read failed at capture time. */
  margin: CapturedMargin | null;
  positions: CapturedPosition[];
  /**
   * The snapshot's read status at capture. Only "verified" means the position read was readable
   * and complete; anything else (or a record that predates the field) may hide positions.
   */
  readStatus: ReadStatus | null;
  gasBalance: bigint | null;
  issues: string[];
}

const READ_STATUSES: readonly ReadStatus[] = ["verified", "partial", "unpriceable", "error"];

function isReadStatus(value: unknown): value is ReadStatus {
  return READ_STATUSES.some((status) => status === value);
}

function bigintField(record: Record<string, unknown>, key: string): bigint | null {
  const value = record[key];
  return typeof value === "string" && DECIMAL.test(value) ? BigInt(value) : null;
}

/** Narrows one account summary written by `summarizeAccountState`. `null` when its shape is wrong. */
export function readCapturedAccountState(state: Record<string, unknown> | undefined): CapturedAccountState | null {
  if (state === undefined) return null;
  const account = addressField(state, "account");
  const block = bigintField(state, "block");
  if (account === null || block === null) return null;

  let margin: CapturedMargin | null = null;
  if (isRecord(state.margin)) {
    const unlockedCollateral = bigintField(state.margin, "unlockedCollateral");
    const lockedCollateral = bigintField(state.margin, "lockedCollateral");
    const equity = bigintField(state.margin, "equity");
    const mmReq = bigintField(state.margin, "mmReq");
    const status = optionalString(state.margin, "status");
    if (unlockedCollateral !== null && lockedCollateral !== null && equity !== null && mmReq !== null && status !== undefined) {
      margin = { unlockedCollateral, lockedCollateral, equity, mmReq, status };
    }
  }

  const positions: CapturedPosition[] = [];
  if (Array.isArray(state.positions)) {
    for (const row of state.positions) {
      if (!isRecord(row)) continue;
      const pool = addressField(row, "pool");
      const size = bigintField(row, "size");
      const entryPrice = bigintField(row, "entryPrice");
      if (pool === null || size === null || entryPrice === null) continue;
      positions.push({ pool, baseSymbol: optionalString(row, "baseSymbol") ?? null, size, entryPrice });
    }
  }

  const issues = Array.isArray(state.issues) ? state.issues.filter((issue): issue is string => typeof issue === "string") : [];
  return {
    account,
    block,
    readAt: optionalString(state, "readAt") ?? null,
    margin,
    positions,
    readStatus: isReadStatus(state.readStatus) ? state.readStatus : null,
    gasBalance: bigintField(state, "gasBalance"),
    issues,
  };
}
