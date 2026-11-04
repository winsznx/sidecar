import { describe, expect, it } from "vitest";

import type { Reading } from "@/lib/dreamdex/types";
import {
  accountBuffer,
  accountEmptiness,
  DEFAULT_SNAPSHOT_MAX_BLOCK_LAG,
  marginSource,
  NO_MAINTENANCE_REASON,
  preferReading,
  resolvePositions,
  riskUsability,
  snapshotFreshness,
} from "@/lib/risk/snapshot";
import {
  ETH_LONG,
  marginFixture,
  NOW_MS,
  PRIMARY_MARGIN,
  PRIMARY_SNAPSHOT,
  READ_AT,
  READ_BLOCK,
  SEPARATE_ADDRESS,
  snapshotFixture,
} from "@/tests/fixtures/accounts.fixture";
import { BTC_POOL, ETH_POOL, usdso } from "@/tests/fixtures/markets.fixture";

const indexedRead = { readAt: READ_AT, via: "listPerpPositions" };

describe("T08 chain reads over indexed data", () => {
  it("uses the chain read for risk even when the indexer disagrees", () => {
    // #given an indexer that still shows a smaller ETH position and a stale BTC row
    const indexed = {
      ...indexedRead,
      positions: [
        { pool: ETH_POOL, size: 400_000_000_000_000_000n, entryPrice: usdso(3_000n), updatedAtBlock: READ_BLOCK - 900n },
        { pool: BTC_POOL, size: 13_000n, entryPrice: null, updatedAtBlock: READ_BLOCK - 900n },
      ],
    };
    // #when positions are resolved
    const resolution = resolvePositions({ snapshot: PRIMARY_SNAPSHOT, indexed });
    // #then the chain wins and every disagreement is noted
    expect({
      authority: resolution.authority,
      sizes: resolution.positions.map((position) => position.size),
      usableForRisk: resolution.usableForRisk,
      discrepancies: resolution.discrepancies.length,
    }).toEqual({ authority: "chain", sizes: [ETH_LONG.size], usableForRisk: true, discrepancies: 2 });
  });

  it("shows indexed positions without letting them drive risk when the chain read is missing", () => {
    // #given a failed chain position read and an indexed row
    const snapshot = snapshotFixture({ positionsBlock: null, positions: [] });
    const indexed = {
      ...indexedRead,
      positions: [{ pool: ETH_POOL, size: ETH_LONG.size, entryPrice: ETH_LONG.entryPrice, updatedAtBlock: READ_BLOCK }],
    };
    // #when positions are resolved
    const resolution = resolvePositions({ snapshot, indexed });
    // #then the rows are display-only and labelled as indexed
    expect([resolution.authority, resolution.usableForRisk, resolution.positions[0]?.source.kind]).toEqual([
      "indexer",
      false,
      "indexer",
    ]);
  });

  it("reports nothing rather than an empty account when neither read exists", () => {
    // #given no chain read and no indexer read
    // #when positions are resolved
    const resolution = resolvePositions({ snapshot: null, indexed: null });
    // #then it says positions are unknown
    expect([resolution.authority, resolution.usableForRisk, resolution.reason]).toEqual([
      "none",
      false,
      "Positions could not be read.",
    ]);
  });

  it("prefers a chain reading over a newer indexed one", () => {
    // #given the same figure from the chain and from a newer indexer row
    const chain: Reading<bigint> = { ok: true, value: 5n, source: { kind: "chain", block: 100n, readAt: READ_AT, via: "getMarginAccount" } };
    const indexed: Reading<bigint> = { ok: true, value: 7n, source: { kind: "indexer", readAt: READ_AT, via: "x", updatedAtBlock: 200n } };
    // #when the preferred reading is chosen
    const preferred = preferReading(indexed, chain);
    // #then the chain wins
    expect(preferred).toBe(chain);
  });

  it("never prefers an unavailable reading and breaks ties on the newer block", () => {
    // #given two chain readings at different blocks and an unavailable one
    const older: Reading<bigint> = { ok: true, value: 1n, source: { kind: "chain", block: 100n, readAt: READ_AT, via: "a" } };
    const newer: Reading<bigint> = { ok: true, value: 2n, source: { kind: "chain", block: 101n, readAt: READ_AT, via: "a" } };
    const missing: Reading<bigint> = { ok: false, reason: "timeout" };
    // #when choices are made
    const picks = [preferReading(missing, older, newer), preferReading(missing)];
    // #then the newer read wins and nothing becomes a value from a failure
    expect(picks).toEqual([newer, missing]);
  });
});

describe("account helpers", () => {
  it("computes the buffer as equity minus maintenance, labelled as an estimate", () => {
    // #given account A
    // #when its buffer is computed
    const buffer = accountBuffer(PRIMARY_SNAPSHOT);
    // #then it is exact and carries the read's block
    expect(buffer).toEqual({
      ok: true,
      value: PRIMARY_MARGIN.equity - PRIMARY_MARGIN.mmReq,
      source: expect.objectContaining({ kind: "estimate", block: READ_BLOCK }),
    });
  });

  it("does not report a buffer for an account with nothing to maintain", () => {
    // #given a funded, flat account
    const snapshot = snapshotFixture({ margin: marginFixture({ unlockedCollateral: usdso(5n), equity: usdso(5n) }) });
    // #when its buffer is computed
    const buffer = accountBuffer(snapshot);
    // #then it is not applicable rather than zero or the full equity
    expect(buffer.ok ? buffer.value : buffer.reason).toBe(NO_MAINTENANCE_REASON);
  });

  it("classifies how empty an account is without guessing", () => {
    // #given accounts with nothing, collateral, a resting order, a position, and a failed read
    const accounts = [
      snapshotFixture(),
      snapshotFixture({ margin: marginFixture({ unlockedCollateral: usdso(5n), equity: usdso(5n) }) }),
      snapshotFixture({ margin: marginFixture({ lockedCollateral: usdso(1n) }) }),
      PRIMARY_SNAPSHOT,
      snapshotFixture({ margin: null, readStatus: "error" }),
    ];
    // #when each is classified
    const classes = accounts.map(accountEmptiness);
    // #then each gets the honest class
    expect(classes).toEqual(["empty", "collateral-only", "orders-only", "positions", "unknown"]);
  });

  it("refuses risk use of an account holding an unpriceable position", () => {
    // #given an ETH position on a dead feed
    const snapshot = snapshotFixture({ positions: [{ ...ETH_LONG, priceable: false, markPrice: null }], readStatus: "unpriceable" });
    // #when usability is checked
    const usability = riskUsability(snapshot);
    // #then it names the market
    expect(usability).toEqual({
      ok: false,
      code: "UNPRICEABLE",
      reason: "The protocol cannot currently price ETH, which this account holds.",
    });
  });

  it("accepts a partial read whose margin and positions arrived, keeping its notes", () => {
    // #given a partial read missing only the voucher state
    const snapshot = snapshotFixture({ readStatus: "partial", issues: ["Voucher state unavailable: timeout"] });
    // #when usability is checked
    const usability = riskUsability(snapshot);
    // #then it is usable with the note attached
    expect(usability).toEqual({ ok: true, warnings: ["Voucher state unavailable: timeout"] });
  });

  it("uses the adapter's own provenance when it reported one", () => {
    // #given a snapshot whose margin read reported a pinned source
    const source = { kind: "chain" as const, block: READ_BLOCK - 1n, readAt: READ_AT, via: "getMarginAccount", pinned: true };
    const snapshot = snapshotFixture({
      account: SEPARATE_ADDRESS,
      sources: { margin: source, positions: null, voucher: null, gasBalance: null, walletCollateral: null },
    });
    // #when the margin source is read
    // #then it is the adapter's, not a reconstruction
    expect(marginSource(snapshot)).toBe(source);
  });
});

describe("freshness", () => {
  it("is fresh within the age limit", () => {
    // #given a read two seconds old
    // #when freshness is checked against the defaults
    const freshness = snapshotFreshness(PRIMARY_SNAPSHOT, { nowMs: NOW_MS });
    // #then it is fresh
    expect(freshness).toEqual({ fresh: true, ageMs: 2_000, blockLag: null, reason: null });
  });

  it("is stale by age", () => {
    // #given the same read 45 seconds later
    // #when freshness is checked
    const freshness = snapshotFreshness(PRIMARY_SNAPSHOT, { nowMs: NOW_MS + 43_000 });
    // #then it is stale with the age in words
    expect([freshness.fresh, freshness.reason]).toEqual([false, "Account data is 45s old."]);
  });

  it("is not fresh when the read is timestamped in the future beyond clock skew", () => {
    // #given a read two seconds old by its own clock
    // #when checked by a clock that puts it one second, then five seconds, in the future
    const results = [NOW_MS - 3_000, NOW_MS - 7_000].map((nowMs) => {
      const freshness = snapshotFreshness(PRIMARY_SNAPSHOT, { nowMs });
      return [freshness.fresh, freshness.reason];
    });
    // #then small skew is tolerated and a future timestamp never reads as brand new
    expect(results).toEqual([
      [true, null],
      [false, "Account data is timestamped in the future."],
    ]);
  });

  it("is stale by block lag at Hideki's block rate", () => {
    // #given a head far past the read's block
    // #when freshness is checked
    const freshness = snapshotFreshness(PRIMARY_SNAPSHOT, { nowMs: NOW_MS, headBlock: READ_BLOCK + 3_001n });
    // #then the default window of 3,000 blocks (30 seconds at 10 ms) is exceeded
    expect([DEFAULT_SNAPSHOT_MAX_BLOCK_LAG, freshness.fresh, freshness.reason]).toEqual([
      3_000n,
      false,
      "Account data is 3,001 blocks behind the chain.",
    ]);
  });
});
