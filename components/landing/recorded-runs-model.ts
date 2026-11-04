import type { Address, Hash } from "viem";

import { deriveProofRuns, type ProofRun } from "@/components/evidence/journeys";
import type { ParsedProofIndex, ProofIndexEntry } from "@/components/evidence/proof-index";
import { COLLATERAL_SYMBOL, formatRaw } from "@/lib/format/units";

/**
 * What the landing shows of Sidecar's own recorded runs. Everything here comes from the files
 * `npm run evidence:capture` wrote under public/proof; nothing is filled in when a file lacks it.
 */

/** One account's equity as the capture read it at a block. */
export interface RecordedEquity {
  block: bigint;
  /** Full precision with the collateral symbol, so equal readings print identically. */
  text: string;
  raw: bigint;
}

/** The other account, read at the parent block and at the order's own block. */
export interface CounterpartReading {
  address: Address;
  before: RecordedEquity;
  after: RecordedEquity;
}

/** The parts of a full record the landing shows. `null` when the record does not carry them. */
export interface RecordFacts {
  /** e.g. "0.00013 BTC". */
  filled: string | null;
  counterpart: CounterpartReading | null;
}

export interface LandingRun {
  run: ProofRun;
  /** The newest record that proves the run, `null` when none does. */
  entry: ProofIndexEntry | null;
  facts: RecordFacts | null;
}

export type LandingRecords =
  | { state: "read"; runs: LandingRun[]; recordedCount: number }
  | { state: "unavailable"; reason: string };

const DECIMAL = /^\d+$/;
const EMPTY_FACTS: RecordFacts = { filled: null, counterpart: null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decimalField(record: Record<string, unknown>, key: string): bigint | null {
  const value = record[key];
  return typeof value === "string" && DECIMAL.test(value) ? BigInt(value) : null;
}

function decimals(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 36 ? value : null;
}

function equityAt(state: unknown, quoteDecimals: number): RecordedEquity | null {
  if (!isRecord(state)) return null;
  const block = decimalField(state, "block");
  const raw = decimalField(state, "equity");
  if (block === null || raw === null) return null;
  return { block, raw, text: `${formatRaw(raw, quoteDecimals, { minFractionDigits: quoteDecimals })} ${COLLATERAL_SYMBOL}` };
}

function counterpartFrom(record: Record<string, unknown>, entry: ProofIndexEntry, quoteDecimals: number): CounterpartReading | null {
  const counterpart = entry.counterpart;
  if (counterpart === null || !Array.isArray(record.accounts)) return null;
  const row = record.accounts.find(
    (account: unknown) =>
      isRecord(account) &&
      account.role === "counterpart" &&
      typeof account.address === "string" &&
      account.address.toLowerCase() === counterpart.toLowerCase(),
  );
  if (!isRecord(row)) return null;
  const before = equityAt(row.before, quoteDecimals);
  const after = equityAt(row.after, quoteDecimals);
  if (before === null || after === null) return null;
  return { address: counterpart, before, after };
}

/**
 * Reads the filled size and the counterpart's equity from one full record. A record for another
 * transaction yields nothing, and so does any field that is missing or malformed.
 */
export function readRecordFacts(raw: unknown, entry: ProofIndexEntry): RecordFacts {
  if (!isRecord(raw) || !isRecord(raw.tx) || typeof raw.tx.hash !== "string") return EMPTY_FACTS;
  if (raw.tx.hash.toLowerCase() !== entry.hash.toLowerCase()) return EMPTY_FACTS;
  const market = isRecord(raw.market) ? raw.market : null;
  const baseDecimals = decimals(market?.baseDecimals);
  const quoteDecimals = decimals(market?.quoteDecimals);
  const symbol = typeof market?.displaySymbol === "string" ? market.displaySymbol.replace(/-PERP$/, "") : null;
  const filledRaw = decimalField(raw, "filledQuantity");
  const filled = filledRaw !== null && filledRaw > 0n && baseDecimals !== null && symbol !== null ? `${formatRaw(filledRaw, baseDecimals)} ${symbol}` : null;
  return { filled, counterpart: quoteDecimals === null ? null : counterpartFrom(raw, entry, quoteDecimals) };
}

/**
 * Builds the three runs from a parsed index. `readRecord` returns a full record by its index
 * row, or `null` when the file cannot be read; the run then shows without the missing facts.
 */
export function landingRecords(parsed: ParsedProofIndex, readRecord: (entry: ProofIndexEntry) => unknown): LandingRecords {
  if (!parsed.ok) return { state: "unavailable", reason: parsed.reason };
  const runs = deriveProofRuns(parsed.index.records).map((run): LandingRun => {
    const entry = run.evidence[0] ?? null;
    if (entry === null) return { run, entry, facts: null };
    const raw = readRecord(entry);
    return { run, entry, facts: raw === null ? null : readRecordFacts(raw, entry) };
  });
  return { state: "read", runs, recordedCount: parsed.index.records.length };
}

export function shortHash(hash: Hash): string {
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

export interface RecordedTally {
  orders: number;
  passed: number;
  total: number;
  /** Ids of the checks that read unknown, the same on every order. */
  unknown: string[];
}

/** How the recorded orders fared on the checks, when every order has the same result; `null` otherwise. */
export function recordedTally(records: LandingRecords): RecordedTally | null {
  if (records.state !== "read") return null;
  const entries = new Map<string, ProofIndexEntry>();
  for (const run of records.runs) if (run.entry !== null) entries.set(run.entry.hash.toLowerCase(), run.entry);
  const tallies = [...entries.values()].map((entry) => ({
    passed: entry.checks.filter((check) => check.status === "pass").length,
    total: entry.checks.length,
    unknown: entry.checks.filter((check) => check.status === "unknown").map((check) => check.id),
  }));
  const first = tallies[0];
  if (first === undefined) return null;
  const key = (tally: (typeof tallies)[number]): string => `${tally.passed}/${tally.total}/${tally.unknown.join(",")}`;
  if (!tallies.every((tally) => key(tally) === key(first))) return null;
  return { orders: tallies.length, ...first };
}
