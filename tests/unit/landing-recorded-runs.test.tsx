import { cleanup, render, screen, within } from "@testing-library/react";
import type { Hash } from "viem";
import { afterEach, describe, expect, it } from "vitest";

import { parseProofIndex, PROOF_INDEX_SCHEMA, recordFileName } from "@/components/evidence/proof-index";
import { RecordedRuns } from "@/components/landing/recorded-runs";
import { landingRecords, readRecordFacts, recordedTally } from "@/components/landing/recorded-runs-model";

import { PRIMARY_ADDRESS, SEPARATE_ADDRESS } from "../fixtures/accounts.fixture";

const HASH_A: Hash = `0x${"1".repeat(64)}`;
const HASH_B: Hash = `0x${"2".repeat(64)}`;
const CHECK_IDS = [
  "chain-id",
  "sender",
  "pool-listed",
  "margin-bank",
  "receipt-success",
  "placement-decoded",
  "calldata-intent",
  "position-attribution",
  "collateral-attribution",
  "counterpart-isolation",
] as const;

function checks(): { id: string; status: "pass" | "unknown" }[] {
  return CHECK_IDS.map((id) => ({ id, status: id === "calldata-intent" ? "unknown" : "pass" }));
}

function indexRow(input: { hash: Hash; role: "A" | "B"; market: string; block: string }): Record<string, unknown> {
  const account = input.role === "A" ? PRIMARY_ADDRESS : SEPARATE_ADDRESS;
  return {
    hash: input.hash,
    account,
    sender: account,
    selectedGiven: true,
    selectedRole: input.role,
    counterpart: input.role === "A" ? SEPARATE_ADDRESS : PRIMARY_ADDRESS,
    market: input.market,
    outcome: "FILLED",
    block: input.block,
    capturedAt: "2026-11-01T10:00:00.000Z",
    file: recordFileName(input.hash),
    chainId: 50383,
    canonical: true,
    checks: checks(),
  };
}

const INDEX = {
  schema: PROOF_INDEX_SCHEMA,
  updatedAt: "2026-11-01T10:00:00.000Z",
  records: [
    indexRow({ hash: HASH_B, role: "B", market: "BTC-PERP", block: "200" }),
    indexRow({ hash: HASH_A, role: "A", market: "ETH-PERP", block: "100" }),
  ],
};

function fullRecord(hash: Hash): Record<string, unknown> {
  const btc = hash === HASH_B;
  return {
    tx: { hash },
    market: { displaySymbol: btc ? "BTC-PERP" : "ETH-PERP", baseDecimals: btc ? 8 : 18, quoteDecimals: 18 },
    filledQuantity: btc ? "13000" : "4000000000000000",
    accounts: [
      {
        role: "counterpart",
        address: btc ? PRIMARY_ADDRESS : SEPARATE_ADDRESS,
        before: { block: "199", equity: "20002892838215857570" },
        after: { block: "200", equity: "20002892838215857570" },
      },
    ],
  };
}

const RECORDS = landingRecords(parseProofIndex(INDEX), (entry) => fullRecord(entry.hash));

afterEach(cleanup);

describe("landing recorded runs model", () => {
  it("reads the filled size and the other account's equity from the full record", () => {
    // #given
    const parsed = parseProofIndex(INDEX);
    if (!parsed.ok) throw new Error(parsed.reason);
    const btc = parsed.index.records[0];
    if (btc === undefined) throw new Error("No BTC row.");

    // #when
    const facts = readRecordFacts(fullRecord(HASH_B), btc);

    // #then
    expect(facts.filled).toBe("0.00013 BTC");
    expect(facts.counterpart?.before.text).toBe("20.002892838215857570 USDso");
    expect(facts.counterpart?.before.block).toBe(199n);
    expect(facts.counterpart?.after.block).toBe(200n);
  });

  it("takes nothing from a record written for another transaction", () => {
    const parsed = parseProofIndex(INDEX);
    if (!parsed.ok) throw new Error(parsed.reason);
    const btc = parsed.index.records[0];
    if (btc === undefined) throw new Error("No BTC row.");
    expect(readRecordFacts(fullRecord(HASH_A), btc)).toEqual({ filled: null, counterpart: null });
  });

  it("tallies the recorded orders only when they agree", () => {
    expect(recordedTally(RECORDS)).toEqual({ orders: 2, passed: 9, total: 10, unknown: ["calldata-intent"] });
  });

  it("reports an unreadable index instead of an empty one", () => {
    expect(landingRecords(parseProofIndex({ schema: "other" }), () => null)).toEqual({
      state: "unavailable",
      reason: `The index schema is not ${PROOF_INDEX_SCHEMA}.`,
    });
  });
});

describe("RecordedRuns", () => {
  it("shows each run with its filled size, block, receipt and explorer links", () => {
    // #given / #when
    render(<RecordedRuns records={RECORDS} />);

    // #then
    const shared = within(screen.getByRole("article", { name: "Shared margin: ETH order in account A" }));
    expect(shared.getByText("0.004 ETH")).toBeInTheDocument();
    expect(shared.getByText("100")).toBeInTheDocument();
    expect(shared.getByRole("link", { name: /Open receipt/ })).toHaveAttribute("href", expect.stringMatching(new RegExp(`^/receipt/${HASH_A}\\?`)));
    expect(shared.getByRole("link", { name: /Explorer/ })).toHaveAttribute("href", expect.stringContaining(`/tx/${HASH_A}`));

    const separate = within(screen.getByRole("article", { name: "Separate margin: BTC order in account B" }));
    expect(separate.getByText("0.00013 BTC")).toBeInTheDocument();

    const unchanged = within(screen.getByRole("article", { name: "A unchanged by B's trade" }));
    expect(unchanged.getAllByText("20.002892838215857570 USDso")).toHaveLength(2);
    expect(unchanged.getByText("The same to the last digit.")).toBeInTheDocument();
  });

  it("badges every recorded figure as a chain read, never as simulated", () => {
    const { container } = render(<RecordedRuns records={RECORDS} />);
    const badges = Array.from(container.querySelectorAll<HTMLElement>("[data-provenance]"));
    expect(badges.length).toBeGreaterThan(0);
    for (const badge of badges) expect(badge).toHaveAttribute("data-provenance", "chain");
  });

  it("says no runs are recorded yet when the index is empty, and links no receipt", () => {
    // #given
    const empty = landingRecords(parseProofIndex({ ...INDEX, records: [] }), () => null);

    // #when
    render(<RecordedRuns records={empty} />);

    // #then
    expect(screen.getByText(/No runs are recorded yet\./)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Open receipt/ })).not.toBeInTheDocument();
    expect(screen.getAllByText("Not yet recorded")).toHaveLength(3);
  });

  it("shows why the record list is unavailable", () => {
    render(<RecordedRuns records={{ state: "unavailable", reason: "The record list could not be read (ENOENT)." }} />);
    expect(screen.getByText(/The record list could not be read \(ENOENT\)\./)).toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it("keeps the third-party fill as a secondary link that says who sent it", () => {
    render(<RecordedRuns records={RECORDS} />);
    expect(screen.getByRole("link", { name: "a BTC-PERP fill, decoded" })).toHaveAttribute(
      "href",
      "/receipt/0xa71faaf75c1fa13abab1f1047b1049ae86477310761fbbafaf01a6bd0fd17259",
    );
    expect(screen.getByText(/Someone else sent it, not Sidecar\./)).toBeInTheDocument();
  });
});
