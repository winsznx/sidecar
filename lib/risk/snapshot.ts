import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains";
import type { Address } from "viem";

import type { AccountSnapshot, PositionSnapshot, Reading, Source, SourceKind } from "@/lib/dreamdex/types";
import { formatAge, formatBlockNumber } from "@/lib/format/units";
import { MAX_CLOCK_SKEW_MS } from "@/lib/orders/lifecycle";

/**
 * Helpers over an AccountSnapshot: provenance, emptiness, freshness and the rule that
 * chain reads outrank indexed data for anything risk-related.
 */

export const DEFAULT_SNAPSHOT_MAX_AGE_MS = 30_000;

/**
 * The same window in blocks. Hideki makes a block every `blockTime` ms (10 ms, ~100 a
 * second), so a block-count threshold borrowed from a slower chain would be far too tight.
 */
export const DEFAULT_SNAPSHOT_MAX_BLOCK_LAG = BigInt(
  Math.ceil(DEFAULT_SNAPSHOT_MAX_AGE_MS / hidekiTestnet.blockTime),
);

/** Truth hierarchy, best first. Indexed data can lag the chain, so it never drives risk. */
export const SOURCE_PRECEDENCE: readonly SourceKind[] = [
  "chain",
  "sdk",
  "estimate",
  "scenario",
  "indexer",
  "simulated",
];

export const NO_MAINTENANCE_REASON = "No maintenance requirement to cover: no open positions.";

export type AccountEmptiness = "unknown" | "empty" | "collateral-only" | "orders-only" | "positions";

export interface SnapshotFreshness {
  fresh: boolean;
  ageMs: number | null;
  /** Blocks behind `headBlock`, when a head was supplied. */
  blockLag: bigint | null;
  reason: string | null;
}

export type RiskUsability =
  | { ok: true; warnings: string[] }
  | { ok: false; code: "READ_FAILED" | "UNPRICEABLE"; reason: string };

/** A position as an indexer reports it. Display only: it is not marked and can lag. */
export interface IndexedPositionView {
  pool: Address;
  /** Signed raw base units. */
  size: bigint;
  entryPrice: bigint | null;
  updatedAtBlock: bigint | null;
}

export interface ResolvedPosition {
  pool: Address;
  baseSymbol: string | null;
  size: bigint;
  entryPrice: bigint | null;
  source: Source;
}

export interface PositionResolution {
  authority: "chain" | "indexer" | "none";
  positions: ResolvedPosition[];
  /** Only chain-read, fully priceable positions may feed risk figures. */
  usableForRisk: boolean;
  /** Where indexed data disagrees with the chain read. The chain read wins. */
  discrepancies: string[];
  reason: string | null;
}

/** Provenance of the margin read: the adapter's own source when it reported one. */
export function marginSource(snapshot: AccountSnapshot): Source {
  return (
    snapshot.sources?.margin ?? { kind: "chain", block: snapshot.block, readAt: snapshot.readAt, via: "getMarginAccount" }
  );
}

export function positionsSource(snapshot: AccountSnapshot): Source {
  return (
    snapshot.sources?.positions ?? {
      kind: "sdk",
      block: snapshot.positionsBlock ?? snapshot.block,
      readAt: snapshot.readAt,
      via: "listPerpPositionAnalytics",
    }
  );
}

export function gasSource(snapshot: AccountSnapshot): Source {
  return (
    snapshot.sources?.gasBalance ?? { kind: "chain", block: snapshot.block, readAt: snapshot.readAt, via: "eth_getBalance" }
  );
}

export function findPosition(snapshot: AccountSnapshot | null, pool: Address): PositionSnapshot | null {
  if (snapshot === null) return null;
  return snapshot.positions.find((position) => position.pool.toLowerCase() === pool.toLowerCase()) ?? null;
}

/**
 * Whether the snapshot can back risk figures. A failed margin or position read, or any
 * position the protocol cannot price, disqualifies it: a missing value is never zero.
 * A partial read whose margin and positions both arrived is usable, with warnings.
 */
export function riskUsability(snapshot: AccountSnapshot | null): RiskUsability {
  if (snapshot === null) return { ok: false, code: "READ_FAILED", reason: "This account has not been read." };
  const unpriced = snapshot.positions.filter((position) => !position.priceable || position.markPrice === null);
  if (snapshot.readStatus === "unpriceable" || unpriced.length > 0) {
    const names = unpriced.map((position) => position.baseSymbol ?? "an unlisted market");
    return {
      ok: false,
      code: "UNPRICEABLE",
      reason:
        names.length > 0
          ? `The protocol cannot currently price ${joinList(names)}, which this account holds.`
          : "The protocol cannot currently price a market this account holds.",
    };
  }
  if (snapshot.readStatus === "error" || snapshot.margin === null) {
    return { ok: false, code: "READ_FAILED", reason: withIssues("The margin account could not be read.", snapshot) };
  }
  if (snapshot.positionsBlock === null) {
    return { ok: false, code: "READ_FAILED", reason: withIssues("Open positions could not be read.", snapshot) };
  }
  return { ok: true, warnings: snapshot.readStatus === "partial" ? [...snapshot.issues] : [] };
}

export function snapshotAgeMs(snapshot: AccountSnapshot, nowMs: number): number | null {
  const readAtMs = Date.parse(snapshot.readAt);
  if (!Number.isFinite(readAtMs) || !Number.isFinite(nowMs)) return null;
  return Math.max(0, nowMs - readAtMs);
}

export function snapshotFreshness(
  snapshot: AccountSnapshot,
  options: { nowMs: number; headBlock?: bigint | null; maxAgeMs?: number; maxBlockLag?: bigint },
): SnapshotFreshness {
  const ageMs = snapshotAgeMs(snapshot, options.nowMs);
  const headBlock = options.headBlock ?? null;
  const blockLag = headBlock === null ? null : headBlock > snapshot.block ? headBlock - snapshot.block : 0n;
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_SNAPSHOT_MAX_AGE_MS;
  const maxBlockLag = options.maxBlockLag ?? DEFAULT_SNAPSHOT_MAX_BLOCK_LAG;

  if (ageMs === null) {
    return { fresh: false, ageMs, blockLag, reason: "Account data has no usable timestamp." };
  }
  if (Date.parse(snapshot.readAt) - options.nowMs > MAX_CLOCK_SKEW_MS) {
    return { fresh: false, ageMs, blockLag, reason: "Account data is timestamped in the future." };
  }
  if (ageMs > maxAgeMs) {
    return { fresh: false, ageMs, blockLag, reason: `Account data is ${formatAge(ageMs)} old.` };
  }
  if (blockLag !== null && blockLag > maxBlockLag) {
    return {
      fresh: false,
      ageMs,
      blockLag,
      reason: `Account data is ${formatBlockNumber(blockLag)} blocks behind the chain.`,
    };
  }
  return { fresh: true, ageMs, blockLag, reason: null };
}

export function accountEmptiness(snapshot: AccountSnapshot | null): AccountEmptiness {
  if (snapshot === null || snapshot.margin === null || snapshot.positionsBlock === null) return "unknown";
  if (snapshot.positions.some((position) => position.size !== 0n)) return "positions";
  const restingOrders = snapshot.openOrders.status === "ok" && snapshot.openOrders.orders.length > 0;
  if (restingOrders || snapshot.margin.lockedCollateral > 0n) return "orders-only";
  const { unlockedCollateral, equity } = snapshot.margin;
  return unlockedCollateral === 0n && equity === 0n ? "empty" : "collateral-only";
}

/**
 * Equity minus maintenance requirement from one margin read. With no maintenance
 * requirement there is nothing to buffer against, so the figure is reported as not
 * applicable rather than as the full equity or as zero.
 */
export function accountBuffer(snapshot: AccountSnapshot | null): Reading<bigint> {
  const usability = riskUsability(snapshot);
  if (snapshot === null || !usability.ok || snapshot.margin === null) {
    return { ok: false, reason: usability.ok ? "The margin account could not be read." : usability.reason };
  }
  const source = marginSource(snapshot);
  if (snapshot.margin.mmReq === 0n) return { ok: false, reason: NO_MAINTENANCE_REASON, source };
  return {
    ok: true,
    value: snapshot.margin.equity - snapshot.margin.mmReq,
    source: {
      kind: "estimate",
      basis: "Equity minus maintenance requirement, from one getMarginAccount read",
      block: snapshot.block,
    },
  };
}

export function sourceRank(source: Source): number {
  return SOURCE_PRECEDENCE.indexOf(source.kind);
}

/**
 * Picks the most authoritative available reading: chain over SDK over estimate over
 * indexed data, and the newer block on a tie. Unavailable readings never win.
 */
export function preferReading<T>(...readings: Reading<T>[]): Reading<T> {
  let best: Extract<Reading<T>, { ok: true }> | null = null;
  for (const reading of readings) {
    if (!reading.ok) continue;
    if (best === null) {
      best = reading;
      continue;
    }
    if (outranks(reading.source, best.source)) best = reading;
  }
  if (best !== null) return best;
  const firstFailure = readings.find((reading) => !reading.ok);
  return firstFailure ?? { ok: false, reason: "No reading is available." };
}

/**
 * Chooses which positions back risk figures. The chain read always wins; indexed rows
 * are shown only when the chain read is missing, and then risk figures stay off.
 */
export function resolvePositions(input: {
  snapshot: AccountSnapshot | null;
  indexed: { positions: IndexedPositionView[]; readAt: string; via: string } | null;
}): PositionResolution {
  const { snapshot, indexed } = input;
  if (snapshot !== null && snapshot.positionsBlock !== null) {
    const source = positionsSource(snapshot);
    return {
      authority: "chain",
      positions: snapshot.positions.map((position) => ({
        pool: position.pool,
        baseSymbol: position.baseSymbol,
        size: position.size,
        entryPrice: position.entryPrice,
        source,
      })),
      usableForRisk: riskUsability(snapshot).ok,
      discrepancies: indexed === null ? [] : indexedDiscrepancies(snapshot.positions, indexed.positions),
      reason: null,
    };
  }
  if (indexed !== null) {
    return {
      authority: "indexer",
      positions: indexed.positions.map((position) => ({
        pool: position.pool,
        baseSymbol: null,
        size: position.size,
        entryPrice: position.entryPrice,
        source: {
          kind: "indexer",
          readAt: indexed.readAt,
          via: indexed.via,
          ...(position.updatedAtBlock === null ? {} : { updatedAtBlock: position.updatedAtBlock }),
        },
      })),
      usableForRisk: false,
      discrepancies: [],
      reason: "Positions come from indexed data only, which can lag the chain. Risk figures stay off until the chain read succeeds.",
    };
  }
  return {
    authority: "none",
    positions: [],
    usableForRisk: false,
    discrepancies: [],
    reason: "Positions could not be read.",
  };
}

function indexedDiscrepancies(chain: PositionSnapshot[], indexed: IndexedPositionView[]): string[] {
  const notes: string[] = [];
  const indexedByPool = new Map(indexed.map((position) => [position.pool.toLowerCase(), position]));
  for (const position of chain) {
    const name = position.baseSymbol ?? position.pool;
    const row = indexedByPool.get(position.pool.toLowerCase());
    if (row === undefined) {
      if (position.size !== 0n) notes.push(`Indexed data does not show the ${name} position yet. The chain read is used.`);
    } else if (row.size !== position.size) {
      notes.push(`Indexed size for ${name} differs from the chain read. The chain read is used.`);
    }
    indexedByPool.delete(position.pool.toLowerCase());
  }
  for (const row of indexedByPool.values()) {
    if (row.size !== 0n) {
      notes.push(`Indexed data shows a position in ${row.pool} that the chain read does not. The chain read is used.`);
    }
  }
  return notes;
}

function outranks(candidate: Source, incumbent: Source): boolean {
  const rank = sourceRank(candidate);
  const incumbentRank = sourceRank(incumbent);
  if (rank !== incumbentRank) return rank < incumbentRank;
  return (sourceBlock(candidate) ?? -1n) > (sourceBlock(incumbent) ?? -1n);
}

function sourceBlock(source: Source): bigint | null {
  switch (source.kind) {
    case "chain":
    case "sdk":
      return source.block;
    case "indexer":
      return source.updatedAtBlock ?? null;
    case "estimate":
    case "scenario":
      return source.block ?? null;
    case "simulated":
      return null;
  }
}

function withIssues(message: string, snapshot: AccountSnapshot): string {
  return snapshot.issues.length > 0 ? `${message} ${snapshot.issues.join(" ")}` : message;
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
