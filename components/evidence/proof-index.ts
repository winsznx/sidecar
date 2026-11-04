import { getAddress, isAddress, isHash, type Address, type Hash } from "viem";

// Relative imports: this module is also loaded by scripts/evidence-capture.ts under tsx.
import { HIDEKI_CHAIN_ID, type PlacementOutcome, type ProofEvidenceRecord, type TruthCheck } from "../../lib/dreamdex/types";

/**
 * public/proof/index.json: the list of recorded executions the proof page shows. Each entry
 * points at a full record written by `npm run evidence:capture` next to it.
 */
export const PROOF_INDEX_SCHEMA = "sidecar.proof-index.v1";
export const PROOF_INDEX_FILE = "index.json";

export interface ProofIndexCheck {
  id: string;
  status: TruthCheck["status"];
}

export interface ProofIndexEntry {
  hash: Hash;
  /** The account named with --selected, or the sender when none was named. */
  account: Address;
  sender: Address;
  /** Whether --selected was given, so the sender check compared against a real choice. */
  selectedGiven: boolean;
  /**
   * Which compared account the selected one is: "A" for --account-a, "B" for --account-b, `null`
   * when it is neither or the capture named no accounts. Rows written before this field read `null`.
   */
  selectedRole: AccountRole | null;
  /** The other compared account the record checked against, `null` when none was named. */
  counterpart: Address | null;
  /** e.g. "BTC-PERP". `null` when the target is not a listed market. */
  market: string | null;
  outcome: PlacementOutcome;
  /** Decimal block number. */
  block: string;
  /** ISO time the record was captured. */
  capturedAt: string;
  /** The record's file name inside the proof directory. */
  file: string;
  chainId: number;
  /** The default Hideki RPC confirmed the mined block's hash at capture time. */
  canonical: boolean;
  checks: ProofIndexCheck[];
}

export type AccountRole = "A" | "B";

export interface ProofIndex {
  schema: typeof PROOF_INDEX_SCHEMA;
  updatedAt: string;
  records: ProofIndexEntry[];
}

const OUTCOMES: readonly PlacementOutcome[] = ["FILLED", "PARTIALLY_FILLED", "RESTING", "NO_FILL", "REVERTED", "UNKNOWN"];
const CHECK_STATUSES: readonly TruthCheck["status"][] = ["pass", "fail", "unknown"];
const DECIMAL = /^\d+$/;

function isOutcome(value: unknown): value is PlacementOutcome {
  return OUTCOMES.some((outcome) => outcome === value);
}

function isCheckStatus(value: unknown): value is TruthCheck["status"] {
  return CHECK_STATUSES.some((status) => status === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function recordFileName(hash: Hash): string {
  return `${hash.toLowerCase()}.json`;
}

export interface EntryOptions {
  selectedGiven: boolean;
  account: Address;
  accountA?: Address | null;
  accountB?: Address | null;
}

function sameAccount(a: Address | null | undefined, b: Address): boolean {
  return a !== null && a !== undefined && a.toLowerCase() === b.toLowerCase();
}

/** The selected account's role and its counterpart. Only a named --selected account can hold a role. */
function rolesFor(options: EntryOptions): { selectedRole: AccountRole | null; counterpart: Address | null } {
  const { selectedGiven, account, accountA = null, accountB = null } = options;
  if (selectedGiven && sameAccount(accountB, account) && accountA !== null && !sameAccount(accountA, account)) {
    return { selectedRole: "B", counterpart: getAddress(accountA) };
  }
  if (selectedGiven && sameAccount(accountA, account) && accountB !== null && !sameAccount(accountB, account)) {
    return { selectedRole: "A", counterpart: getAddress(accountB) };
  }
  return { selectedRole: null, counterpart: null };
}

/** The index row for a record that has just been written to the proof directory. */
export function entryFromRecord(record: ProofEvidenceRecord, options: EntryOptions): ProofIndexEntry {
  return {
    hash: record.tx.hash,
    account: getAddress(options.account),
    sender: getAddress(record.tx.from),
    selectedGiven: options.selectedGiven,
    ...rolesFor(options),
    market: record.market?.displaySymbol ?? null,
    outcome: record.outcome,
    block: record.tx.block,
    capturedAt: record.recordedAt,
    file: recordFileName(record.tx.hash),
    chainId: record.network.chainId,
    canonical: record.network.canonicalBlock?.matches === true,
    checks: record.checks.map((check) => ({ id: check.id, status: check.status })),
  };
}

/** Replaces any entry for the same transaction, newest block first. */
export function upsertProofIndex(existing: ProofIndex | null, entry: ProofIndexEntry, now: Date): ProofIndex {
  const others = (existing?.records ?? []).filter((row) => row.hash.toLowerCase() !== entry.hash.toLowerCase());
  const records = [...others, entry].sort((a, b) => {
    const byBlock = BigInt(b.block) - BigInt(a.block);
    if (byBlock !== 0n) return byBlock > 0n ? 1 : -1;
    return a.hash.localeCompare(b.hash);
  });
  return { schema: PROOF_INDEX_SCHEMA, updatedAt: now.toISOString(), records };
}

export function serializeProofIndex(index: ProofIndex): string {
  return `${JSON.stringify(index, null, 2)}\n`;
}

/** Why one row was left out, so the page can say so instead of silently dropping it. */
function entryProblem(row: Record<string, unknown>): string | null {
  if (typeof row.hash !== "string" || !isHash(row.hash)) return "no valid transaction hash";
  if (row.chainId !== HIDEKI_CHAIN_ID) return `not on Hideki (${HIDEKI_CHAIN_ID})`;
  if (row.canonical !== true) return "its block was not confirmed by the default Hideki RPC";
  if (typeof row.account !== "string" || !isAddress(row.account, { strict: false })) return "no valid account";
  if (typeof row.sender !== "string" || !isAddress(row.sender, { strict: false })) return "no valid sender";
  if (typeof row.selectedGiven !== "boolean") return "no selected-account flag";
  if (row.selectedRole !== undefined && row.selectedRole !== null && row.selectedRole !== "A" && row.selectedRole !== "B") return "an unknown account role";
  if (row.counterpart !== undefined && row.counterpart !== null && (typeof row.counterpart !== "string" || !isAddress(row.counterpart, { strict: false }))) {
    return "an invalid counterpart";
  }
  if (row.market !== null && typeof row.market !== "string") return "an invalid market";
  if (!isOutcome(row.outcome)) return "an unknown outcome";
  if (typeof row.block !== "string" || !DECIMAL.test(row.block)) return "no valid block";
  if (typeof row.capturedAt !== "string" || Number.isNaN(Date.parse(row.capturedAt))) return "no valid capture time";
  if (typeof row.file !== "string" || row.file !== recordFileName(row.hash)) return "a record file that does not match its hash";
  if (!Array.isArray(row.checks) || !row.checks.every((check) => isRecord(check) && typeof check.id === "string" && isCheckStatus(check.status))) {
    return "malformed checks";
  }
  return null;
}

export type ParsedProofIndex =
  | { ok: true; index: ProofIndex; rejected: { position: number; reason: string }[] }
  | { ok: false; reason: string };

/**
 * Reads index.json. Rows that are malformed, off Hideki, or whose block the default RPC did not
 * confirm are left out and reported, so nothing unconfirmed is shown as evidence.
 */
export function parseProofIndex(raw: unknown): ParsedProofIndex {
  if (!isRecord(raw)) return { ok: false, reason: "The index is not a JSON object." };
  if (raw.schema !== PROOF_INDEX_SCHEMA) return { ok: false, reason: `The index schema is not ${PROOF_INDEX_SCHEMA}.` };
  if (!Array.isArray(raw.records)) return { ok: false, reason: "The index has no records list." };
  const updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt : "";
  const records: ProofIndexEntry[] = [];
  const rejected: { position: number; reason: string }[] = [];
  raw.records.forEach((row: unknown, position: number) => {
    if (!isRecord(row)) {
      rejected.push({ position, reason: "not an object" });
      return;
    }
    const problem = entryProblem(row);
    if (problem !== null) {
      rejected.push({ position, reason: problem });
      return;
    }
    records.push(normalizeEntry(row));
  });
  return { ok: true, index: { schema: PROOF_INDEX_SCHEMA, updatedAt, records }, rejected };
}

/** Rebuilds a row that `entryProblem` accepted, keeping only known fields. */
function normalizeEntry(row: Record<string, unknown>): ProofIndexEntry {
  const text = (key: string): string => {
    const value = row[key];
    if (typeof value !== "string") throw new Error(`Index field ${key} is not a string.`);
    return value;
  };
  const hash = text("hash");
  if (!isHash(hash)) throw new Error("Index hash is not a transaction hash.");
  const outcome = row.outcome;
  if (!isOutcome(outcome)) throw new Error("Index outcome is unknown.");
  const checks: ProofIndexCheck[] = [];
  if (Array.isArray(row.checks)) {
    for (const check of row.checks) {
      if (isRecord(check) && typeof check.id === "string" && isCheckStatus(check.status)) checks.push({ id: check.id, status: check.status });
    }
  }
  return {
    hash,
    account: getAddress(text("account")),
    sender: getAddress(text("sender")),
    selectedGiven: row.selectedGiven === true,
    selectedRole: row.selectedRole === "A" || row.selectedRole === "B" ? row.selectedRole : null,
    counterpart: typeof row.counterpart === "string" && isAddress(row.counterpart, { strict: false }) ? getAddress(row.counterpart) : null,
    market: typeof row.market === "string" ? row.market : null,
    outcome,
    block: text("block"),
    capturedAt: text("capturedAt"),
    file: text("file"),
    chainId: HIDEKI_CHAIN_ID,
    canonical: true,
    checks,
  };
}

export function checkStatus(entry: ProofIndexEntry, id: string): TruthCheck["status"] | null {
  return entry.checks.find((check) => check.id === id)?.status ?? null;
}
