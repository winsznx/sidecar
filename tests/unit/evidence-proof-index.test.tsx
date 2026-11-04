import type { Hash } from "viem";
import { describe, expect, it } from "vitest";

import { deriveJourneys, deriveProofRuns } from "@/components/evidence/journeys";
import {
  entryFromRecord,
  parseProofIndex,
  PROOF_INDEX_SCHEMA,
  serializeProofIndex,
  upsertProofIndex,
  type ProofIndexEntry,
} from "@/components/evidence/proof-index";
import type { ProofEvidenceRecord, TruthCheck } from "@/lib/dreamdex/types";

import { PRIMARY_ADDRESS, SEPARATE_ADDRESS } from "../fixtures/accounts.fixture";
import { BTC_POOL, MARGIN_BANK } from "../fixtures/markets.fixture";

const HASH_A: Hash = `0x${"a".repeat(64)}`;
const HASH_B: Hash = `0x${"b".repeat(64)}`;
const NOW = new Date("2026-11-01T12:00:00.000Z");

function record(overrides: { hash?: Hash; block?: string; outcome?: ProofEvidenceRecord["outcome"]; matches?: boolean; checks?: TruthCheck[] } = {}): ProofEvidenceRecord {
  const hash = overrides.hash ?? HASH_A;
  return {
    schema: "sidecar.proof.v1",
    kind: "recorded-execution",
    recordedAt: "2026-11-01T11:00:00.000Z",
    network: {
      chainId: 50383,
      rpcUrl: "https://api.hideki2.infra.testnet.somnia.network",
      explorerUrl: "https://explorer.testnet.somnia.network/tokyo",
      sdkVersion: "0.32.1",
      canonicalBlock: { number: overrides.block ?? "100", hash: HASH_B, defaultRpcHash: HASH_B, matches: overrides.matches ?? true },
    },
    tx: {
      hash,
      explorerUrl: `https://explorer.testnet.somnia.network/tokyo/tx/${hash}`,
      from: SEPARATE_ADDRESS,
      to: BTC_POOL,
      block: overrides.block ?? "100",
      blockTimestamp: 1_793_516_552,
      receiptStatus: overrides.outcome === "REVERTED" ? "reverted" : "success",
      gasUsed: "750000",
      feePaidWei: "45000000000000",
    },
    market: { pool: BTC_POOL, displaySymbol: "BTC-PERP", marginBank: MARGIN_BANK, baseDecimals: 8, quoteDecimals: 18 },
    requested: { side: "long", quantity: "13000", price: "78427200000000000000000", timeInForce: "IOC" },
    outcome: overrides.outcome ?? "FILLED",
    orderId: "7001",
    filledQuantity: "13000",
    fills: [],
    revertReason: null,
    checks: overrides.checks ?? [
      { id: "chain-id", label: "Chain", status: "pass", detail: "" },
      { id: "sender", label: "Sender", status: "pass", detail: "" },
      { id: "counterpart-isolation", label: "Other account", status: "pass", detail: "" },
    ],
    marginEvents: [],
    accounts: [],
  };
}

function entry(overrides: Parameters<typeof record>[0] = {}, selectedGiven = true): ProofIndexEntry {
  return entryFromRecord(record(overrides), { selectedGiven, account: SEPARATE_ADDRESS, accountA: PRIMARY_ADDRESS, accountB: SEPARATE_ADDRESS });
}

describe("proof index maintenance", () => {
  it("builds an index row from a written record", () => {
    // #given
    const written = record();
    // #when
    const row = entryFromRecord(written, { selectedGiven: true, account: SEPARATE_ADDRESS });
    // #then
    expect(row).toMatchObject({
      hash: HASH_A,
      account: SEPARATE_ADDRESS,
      sender: SEPARATE_ADDRESS,
      market: "BTC-PERP",
      outcome: "FILLED",
      block: "100",
      capturedAt: "2026-11-01T11:00:00.000Z",
      file: `${HASH_A}.json`,
      canonical: true,
    });
  });

  it("replaces a re-captured transaction instead of listing it twice", () => {
    // #given
    const first = upsertProofIndex(null, entry({ outcome: "RESTING" }), NOW);
    // #when
    const second = upsertProofIndex(first, entry({ outcome: "FILLED" }), NOW);
    // #then
    expect(second.records.map((row) => row.outcome)).toEqual(["FILLED"]);
  });

  it("lists the newest block first", () => {
    // #given
    const older = entry({ hash: HASH_A, block: "100" });
    const newer = entry({ hash: HASH_B, block: "250" });
    // #when
    const index = upsertProofIndex(upsertProofIndex(null, older, NOW), newer, NOW);
    // #then
    expect(index.records.map((row) => row.hash)).toEqual([HASH_B, HASH_A]);
  });

  it("round-trips through its own JSON", () => {
    // #given
    const index = upsertProofIndex(null, entry(), NOW);
    // #when
    const parsed = parseProofIndex(JSON.parse(serializeProofIndex(index)));
    // #then
    expect(parsed).toEqual({ ok: true, index, rejected: [] });
  });

  it("leaves out a row whose block the default RPC did not confirm", () => {
    // #given a fork-style row that bypassed the capture guard
    const index = upsertProofIndex(null, entry({ matches: false }), NOW);
    // #when
    const parsed = parseProofIndex(JSON.parse(serializeProofIndex(index)));
    // #then
    expect(parsed.ok && { records: parsed.index.records.length, rejected: parsed.rejected }).toEqual({
      records: 0,
      rejected: [{ position: 0, reason: "its block was not confirmed by the default Hideki RPC" }],
    });
  });

  it("leaves out a row from another chain or with a mismatched file", () => {
    // #given
    const good = entry();
    const raw = {
      schema: PROOF_INDEX_SCHEMA,
      updatedAt: NOW.toISOString(),
      records: [
        { ...good, chainId: 1 },
        { ...good, file: "../../secret.json" },
      ],
    };
    // #when
    const parsed = parseProofIndex(raw);
    // #then
    expect(parsed.ok && parsed.rejected.map((row) => row.reason)).toEqual(["not on Hideki (50383)", "a record file that does not match its hash"]);
  });

  it("reads a row written before account roles existed as having no role", () => {
    // #given an older row without selectedRole or counterpart
    const legacy: Record<string, unknown> = { ...entry() };
    delete legacy.selectedRole;
    delete legacy.counterpart;
    // #when
    const parsed = parseProofIndex({ schema: PROOF_INDEX_SCHEMA, updatedAt: NOW.toISOString(), records: [legacy] });
    // #then
    expect(parsed.ok && parsed.index.records.map((row) => [row.selectedRole, row.counterpart])).toEqual([[null, null]]);
  });

  it("refuses a file that is not a proof index", () => {
    // #given
    const raw = { schema: "something-else", records: [] };
    // #when
    const parsed = parseProofIndex(raw);
    // #then
    expect(parsed.ok).toBe(false);
  });
});

describe("deriveJourneys", () => {
  it("reads every journey as not yet recorded when there is no evidence", () => {
    // #given
    const entries: ProofIndexEntry[] = [];
    // #when
    const journeys = deriveJourneys(entries);
    // #then
    expect(journeys.map((journey) => `${journey.id}:${journey.status}`)).toEqual(["J1:not-recorded", "J2:not-recorded", "J3:not-recorded"]);
  });

  it("records J1 only for a placed order whose sender and other-account checks passed", () => {
    // #given
    const proven = entry({ hash: HASH_A });
    const unproven = entry({
      hash: HASH_B,
      checks: [
        { id: "chain-id", label: "Chain", status: "pass", detail: "" },
        { id: "sender", label: "Sender", status: "pass", detail: "" },
        { id: "counterpart-isolation", label: "Other account", status: "unknown", detail: "" },
      ],
    });
    // #when
    const j1 = deriveJourneys([proven, unproven])[0];
    // #then
    expect(j1?.evidence.map((row) => row.hash)).toEqual([HASH_A]);
  });

  it("does not credit J1 to a capture that named no selected account", () => {
    // #given
    const anonymous = entry({}, false);
    // #when
    const j1 = deriveJourneys([anonymous])[0];
    // #then
    expect(j1?.status).toBe("not-recorded");
  });

  it("records J3 for a reverted order from the selected account", () => {
    // #given
    const reverted = entry({
      outcome: "REVERTED",
      checks: [
        { id: "chain-id", label: "Chain", status: "pass", detail: "" },
        { id: "sender", label: "Sender", status: "pass", detail: "" },
        { id: "receipt-success", label: "Receipt", status: "fail", detail: "" },
      ],
    });
    // #when
    const journeys = deriveJourneys([reverted]);
    // #then
    expect(journeys.map((journey) => journey.status)).toEqual(["not-recorded", "not-recorded", "recorded"]);
  });

  it("never credits J1 to an order sent from account A, even when every check passed", () => {
    // #given a primary-account order captured with --selected A
    const fromA = entryFromRecord({ ...record(), tx: { ...record().tx, from: PRIMARY_ADDRESS } }, {
      selectedGiven: true,
      account: PRIMARY_ADDRESS,
      accountA: PRIMARY_ADDRESS,
      accountB: SEPARATE_ADDRESS,
    });
    // #when
    const j1 = deriveJourneys([fromA])[0];
    // #then
    expect({ role: fromA.selectedRole, counterpart: fromA.counterpart, status: j1?.status }).toEqual({
      role: "A",
      counterpart: SEPARATE_ADDRESS,
      status: "not-recorded",
    });
  });

  it("does not credit J1 when the capture named no compared accounts", () => {
    // #given --selected B but no --account-a/--account-b
    const unnamed = entryFromRecord(record(), { selectedGiven: true, account: SEPARATE_ADDRESS });
    // #when
    const j1 = deriveJourneys([unnamed])[0];
    // #then
    expect({ role: unnamed.selectedRole, status: j1?.status }).toEqual({ role: null, status: "not-recorded" });
  });

  it("never marks J2 recorded from a transaction", () => {
    // #given
    const entries = [entry({ hash: HASH_A }), entry({ hash: HASH_B, outcome: "REVERTED" })];
    // #when
    const j2 = deriveJourneys(entries)[1];
    // #then
    expect(j2?.status).toBe("not-recorded");
  });
});

function fromAccount(role: "A" | "B", overrides: Parameters<typeof record>[0] & { market?: string } = {}): ProofIndexEntry {
  const sender = role === "A" ? PRIMARY_ADDRESS : SEPARATE_ADDRESS;
  const written = record(overrides);
  const withMarket = overrides.market === undefined || written.market === null ? written : { ...written, market: { ...written.market, displaySymbol: overrides.market } };
  return entryFromRecord({ ...withMarket, tx: { ...withMarket.tx, from: sender } }, {
    selectedGiven: true,
    account: sender,
    accountA: PRIMARY_ADDRESS,
    accountB: SEPARATE_ADDRESS,
  });
}

const RUN_CHECKS = ["chain-id", "sender", "pool-listed", "collateral-attribution", "position-attribution", "counterpart-isolation"];

function runChecks(status: (id: string) => TruthCheck["status"] | null = () => "pass"): TruthCheck[] {
  return RUN_CHECKS.flatMap((id) => {
    const value = status(id);
    return value === null ? [] : [{ id, label: id, status: value, detail: "" }];
  });
}

describe("deriveProofRuns", () => {
  it("reads every run as not yet recorded when there is no evidence", () => {
    // #given / #when
    const runs = deriveProofRuns([]);
    // #then
    expect(runs.map((run) => `${run.id}:${run.status}`)).toEqual(["shared-a:not-recorded", "separate-b:not-recorded", "a-unchanged:not-recorded"]);
  });

  it("credits the shared run only to an ETH-PERP order sent from account A", () => {
    // #given
    const ethFromA = fromAccount("A", { hash: HASH_A, market: "ETH-PERP", checks: runChecks() });
    const btcFromA = fromAccount("A", { hash: HASH_B, checks: runChecks() });
    // #when
    const shared = deriveProofRuns([ethFromA, btcFromA])[0];
    // #then
    expect(shared?.evidence.map((row) => row.hash)).toEqual([HASH_A]);
  });

  it("credits the separate run and A unchanged to a BTC-PERP order from B that passed every listed check", () => {
    // #given
    const btcFromB = fromAccount("B", { checks: runChecks() });
    // #when
    const runs = deriveProofRuns([btcFromB]);
    // #then
    expect(runs.map((run) => run.status)).toEqual(["not-recorded", "recorded", "recorded"]);
  });

  it("does not credit A unchanged when the isolation check was not decided", () => {
    // #given
    const undecided = fromAccount("B", { checks: runChecks((id) => (id === "counterpart-isolation" ? "unknown" : "pass")) });
    // #when
    const runs = deriveProofRuns([undecided]);
    // #then
    expect(runs.map((run) => run.status)).toEqual(["not-recorded", "recorded", "not-recorded"]);
  });

  it("does not credit the shared run when collateral attribution is unknown", () => {
    // #given
    const unknown = fromAccount("A", { market: "ETH-PERP", checks: runChecks((id) => (id === "collateral-attribution" ? "unknown" : "pass")) });
    // #when
    const runs = deriveProofRuns([unknown]);
    // #then
    expect(runs.map((run) => run.status)).toEqual(["not-recorded", "not-recorded", "not-recorded"]);
  });

  it("does not credit any B run when collateral attribution is missing from the record", () => {
    // #given
    const missing = fromAccount("B", { checks: runChecks((id) => (id === "collateral-attribution" ? null : "pass")) });
    // #when
    const runs = deriveProofRuns([missing]);
    // #then
    expect(runs.map((run) => run.status)).toEqual(["not-recorded", "not-recorded", "not-recorded"]);
  });

  it("does not credit A unchanged when B's position attribution is not in the record", () => {
    // #given
    const noPosition = fromAccount("B", { checks: runChecks((id) => (id === "position-attribution" ? null : "pass")) });
    // #when
    const runs = deriveProofRuns([noPosition]);
    // #then
    expect(runs.map((run) => run.status)).toEqual(["not-recorded", "recorded", "not-recorded"]);
  });

  it("never credits A unchanged to a B order on ETH-PERP, even when every check passed", () => {
    // #given
    const ethFromB = fromAccount("B", { market: "ETH-PERP", checks: runChecks() });
    // #when
    const runs = deriveProofRuns([ethFromB]);
    // #then
    expect(runs.map((run) => run.status)).toEqual(["not-recorded", "not-recorded", "not-recorded"]);
  });

  it("never credits a run to a reverted order", () => {
    // #given
    const reverted = fromAccount("B", { outcome: "REVERTED", checks: runChecks() });
    // #when
    const runs = deriveProofRuns([reverted]);
    // #then
    expect(runs.every((run) => run.status === "not-recorded")).toBe(true);
  });
});
