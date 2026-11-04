"use client";

import { useSyncExternalStore } from "react";
import { getAddress, isAddress, isHash, type Address, type Hash, type PublicClient } from "viem";

import type { OrderIntent, OrderSide, TimeInForce } from "@/lib/dreamdex/types";

/**
 * The order attempt that may still be in flight, kept in this browser so a reload does not
 * forget a transaction the trader signed. Only public chain data is stored: the account,
 * the order and the hashes. Never a signature or a key.
 */
export const ATTEMPT_STORAGE_KEY = "sidecar.attempt.v1";

/** Older records are shown as a warning instead of re-locking the ticket. */
export const ATTEMPT_RESTORE_MAX_AGE_MS = 24 * 60 * 60 * 1_000;

/** A missing hash must stay missing for this long and this many blocks before it counts as dropped. */
export const DROP_WINDOW_MS = 30_000;
export const DROP_WINDOW_BLOCKS = 30n;

export interface StoredAttempt {
  account: Address;
  intent: OrderIntent;
  trackedHashes: Hash[];
  /** The account's pending nonce read just before the wallet was asked to sign. */
  nonce: number | null;
  savedAtMs: number;
}

const SIDES: readonly OrderSide[] = ["long", "short"];
const TIMES_IN_FORCE: readonly TimeInForce[] = ["GTC", "IOC", "FOK", "POST_ONLY"];

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch (error) {
    console.warn("Sidecar cannot use this browser's storage for order attempts.", error);
    return null;
  }
}

export function serializeAttempt(attempt: StoredAttempt): string {
  return JSON.stringify({
    ...attempt,
    intent: { ...attempt.intent, quantity: attempt.intent.quantity.toString(), price: attempt.intent.price.toString() },
  });
}

function asBigint(value: unknown): bigint | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  return BigInt(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Parses a stored record, or `null` when any field is missing or malformed. */
export function parseAttempt(raw: string | null): StoredAttempt | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !isRecord(parsed.intent)) return null;
  const { account, trackedHashes, nonce, savedAtMs, intent } = parsed;
  const quantity = asBigint(intent.quantity);
  const price = asBigint(intent.price);
  if (typeof account !== "string" || !isAddress(account)) return null;
  if (typeof intent.pool !== "string" || !isAddress(intent.pool)) return null;
  if (!SIDES.includes(intent.side as OrderSide) || !TIMES_IN_FORCE.includes(intent.timeInForce as TimeInForce)) return null;
  if (quantity === null || price === null) return null;
  if (!Array.isArray(trackedHashes) || !trackedHashes.every((hash): hash is Hash => typeof hash === "string" && isHash(hash))) return null;
  if (nonce !== null && (typeof nonce !== "number" || !Number.isSafeInteger(nonce) || nonce < 0)) return null;
  if (typeof savedAtMs !== "number" || !Number.isFinite(savedAtMs)) return null;
  return {
    account: getAddress(account),
    intent: {
      pool: getAddress(intent.pool),
      side: intent.side as OrderSide,
      quantity,
      price,
      timeInForce: intent.timeInForce as TimeInForce,
    },
    trackedHashes,
    nonce,
    savedAtMs,
  };
}

const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedParsed: StoredAttempt | null = null;

function readRaw(): string | null {
  try {
    return storage()?.getItem(ATTEMPT_STORAGE_KEY) ?? null;
  } catch (error) {
    console.warn("Sidecar could not read the saved order attempt.", error);
    return null;
  }
}

// useSyncExternalStore needs a stable object while storage is unchanged, so parse once per raw value.
function getSnapshot(): StoredAttempt | null {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedParsed = parseAttempt(raw);
  }
  return cachedParsed;
}

function getServerSnapshot(): StoredAttempt | null {
  return null;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (event: StorageEvent): void => {
    if (event.key === null || event.key === ATTEMPT_STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}

/** The saved attempt, shared with other tabs. `null` on the server and when nothing is saved. */
export function useStoredAttempt(): StoredAttempt | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function saveAttempt(attempt: StoredAttempt): void {
  try {
    storage()?.setItem(ATTEMPT_STORAGE_KEY, serializeAttempt(attempt));
  } catch (error) {
    console.warn("Sidecar could not save the order attempt in this browser, so a reload will forget it.", error);
  }
  notify();
}

export function clearAttempt(): void {
  try {
    storage()?.removeItem(ATTEMPT_STORAGE_KEY);
  } catch (error) {
    console.warn("Sidecar could not clear the saved order attempt.", error);
  }
  notify();
}

export interface MissingSince {
  hash: Hash;
  block: bigint;
  atMs: number;
}

export type DropCheck =
  | { status: "dropped" }
  | { status: "pending"; missingSince: MissingSince | null; note: string | null };

function isNotFound(error: unknown): boolean {
  return error instanceof Error && error.name === "TransactionNotFoundError";
}

/**
 * Whether the tracked transaction can be proven unable to mine. It counts as dropped only
 * when the node does not know the hash across a window of time and blocks AND the account's
 * nonce has not moved past the one the order was sent with. A nonce that moved means some
 * transaction took that slot, possibly a wallet speed-up of this same order, so the attempt
 * stays unresolved rather than risking a duplicate order.
 */
export async function checkDropped(input: {
  client: PublicClient;
  hash: Hash;
  account: Address;
  nonce: number | null;
  missingSince: MissingSince | null;
  nowMs: number;
}): Promise<DropCheck> {
  const { client, hash, account, nonce, nowMs } = input;
  const previous = input.missingSince !== null && input.missingSince.hash.toLowerCase() === hash.toLowerCase() ? input.missingSince : null;
  try {
    await client.getTransaction({ hash });
    return { status: "pending", missingSince: null, note: null };
  } catch (error) {
    if (!isNotFound(error)) return { status: "pending", missingSince: previous, note: null };
  }
  if (nonce === null) {
    return {
      status: "pending",
      missingSince: previous,
      note: "The network does not know this transaction, and Sidecar has no nonce to prove it was dropped. Check your wallet's activity before placing another order.",
    };
  }
  const [head, confirmedNonce] = await Promise.all([
    client.getBlockNumber(),
    client.getTransactionCount({ address: account, blockTag: "latest" }),
  ]);
  if (confirmedNonce > nonce) {
    return {
      status: "pending",
      missingSince: previous,
      note: "Another transaction from this account used this order's nonce. It may be your wallet's replacement of this order, so the ticket stays locked. Check your wallet's activity.",
    };
  }
  const since = previous ?? { hash, block: head, atMs: nowMs };
  if (head - since.block >= DROP_WINDOW_BLOCKS && nowMs - since.atMs >= DROP_WINDOW_MS) return { status: "dropped" };
  return { status: "pending", missingSince: since, note: null };
}
