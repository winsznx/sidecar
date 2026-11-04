import type { PublicClient } from "viem";
import { describe, expect, it, vi } from "vitest";

import { checkDropped, DROP_WINDOW_BLOCKS, DROP_WINDOW_MS, parseAttempt, serializeAttempt, type StoredAttempt } from "@/hooks/use-trade-attempt";
import { NOW_MS, SEPARATE_ADDRESS } from "@/tests/fixtures/accounts.fixture";
import { BTC_ORDER } from "@/tests/fixtures/quotes.fixture";
import { TX_HASH } from "@/tests/fixtures/receipts.fixture";

function notFound(): Error {
  return Object.assign(new Error("Transaction not found."), { name: "TransactionNotFoundError" });
}

function client(input: { found?: boolean; head: bigint; confirmedNonce: number }): PublicClient {
  return {
    getTransaction: vi.fn(async () => {
      if (input.found === true) return { hash: TX_HASH };
      throw notFound();
    }),
    getBlockNumber: vi.fn(async () => input.head),
    getTransactionCount: vi.fn(async () => input.confirmedNonce),
  } as unknown as PublicClient;
}

describe("stored attempts", () => {
  it("round-trips an attempt with bigint amounts and rejects malformed records", () => {
    const attempt: StoredAttempt = { account: SEPARATE_ADDRESS, intent: BTC_ORDER, trackedHashes: [TX_HASH], nonce: 4, savedAtMs: NOW_MS };
    expect(parseAttempt(serializeAttempt(attempt))).toEqual(attempt);
    expect(parseAttempt("{not json")).toBeNull();
    expect(parseAttempt(JSON.stringify({ ...JSON.parse(serializeAttempt(attempt)), trackedHashes: ["0x12"] }))).toBeNull();
    expect(parseAttempt(null)).toBeNull();
  });
});

describe("checkDropped", () => {
  const base = { hash: TX_HASH, account: SEPARATE_ADDRESS, nonce: 7 };

  it("keeps waiting while the node still knows the transaction", async () => {
    const result = await checkDropped({ ...base, client: client({ found: true, head: 1_000n, confirmedNonce: 7 }), missingSince: null, nowMs: NOW_MS });
    expect(result).toEqual({ status: "pending", missingSince: null, note: null });
  });

  it("counts a hash as dropped only after it stays unknown across the time and block window with the nonce unused", async () => {
    const first = await checkDropped({ ...base, client: client({ head: 1_000n, confirmedNonce: 7 }), missingSince: null, nowMs: NOW_MS });
    expect(first.status).toBe("pending");
    if (first.status !== "pending") return;
    expect(first.missingSince).toEqual({ hash: TX_HASH, block: 1_000n, atMs: NOW_MS });

    const tooSoon = await checkDropped({
      ...base,
      client: client({ head: 1_000n + DROP_WINDOW_BLOCKS, confirmedNonce: 7 }),
      missingSince: first.missingSince,
      nowMs: NOW_MS + DROP_WINDOW_MS - 1,
    });
    expect(tooSoon.status).toBe("pending");

    const dropped = await checkDropped({
      ...base,
      client: client({ head: 1_000n + DROP_WINDOW_BLOCKS, confirmedNonce: 7 }),
      missingSince: first.missingSince,
      nowMs: NOW_MS + DROP_WINDOW_MS,
    });
    expect(dropped).toEqual({ status: "dropped" });
  });

  it("never clears the lock when another transaction used the order's nonce, since it may be a replacement", async () => {
    const result = await checkDropped({
      ...base,
      client: client({ head: 5_000n, confirmedNonce: 8 }),
      missingSince: { hash: TX_HASH, block: 1_000n, atMs: NOW_MS - 120_000 },
      nowMs: NOW_MS,
    });
    expect(result.status).toBe("pending");
    if (result.status === "pending") expect(result.note).toMatch(/used this order's nonce/);
  });

  it("cannot prove a drop without the pre-sign nonce", async () => {
    const result = await checkDropped({
      ...base,
      nonce: null,
      client: client({ head: 5_000n, confirmedNonce: 7 }),
      missingSince: { hash: TX_HASH, block: 1_000n, atMs: NOW_MS - 120_000 },
      nowMs: NOW_MS,
    });
    expect(result.status).toBe("pending");
  });
});
