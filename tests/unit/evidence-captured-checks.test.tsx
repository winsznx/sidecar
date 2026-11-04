import { describe, expect, it } from "vitest";

import { parseCapturedProof, proofStorageKey, readCapturedAccountState } from "@/components/evidence/captured-proof";
import { deriveLiveChecks, type LiveCheckInputs } from "@/components/evidence/live-checks";
import type { ChainStatus, MarketHealth, MarketListing } from "@/lib/dreamdex/types";
import { serializeProofEvent, type ProofEvent } from "@/lib/evidence/proof-event";

import { PRIMARY_ADDRESS, READ_AT, SEPARATE_ADDRESS } from "../fixtures/accounts.fixture";
import { BTC_PERP, BTC_POOL, ETH_PERP } from "../fixtures/markets.fixture";
import { TX_HASH } from "../fixtures/receipts.fixture";

function proofEvent(overrides: Partial<ProofEvent> = {}): ProofEvent {
  return {
    runId: "run-1",
    observedAtUtc: READ_AT,
    networkChainId: 50383,
    selectedAccount: SEPARATE_ADDRESS,
    counterpartAccount: PRIMARY_ADDRESS,
    marketPool: BTC_POOL,
    orderIntentHash: "0xabc123",
    txHash: TX_HASH,
    previewStatus: "verified",
    beforeBlock: "299999",
    beforeAccountState: {
      account: SEPARATE_ADDRESS,
      block: "299999",
      readAt: READ_AT,
      margin: { unlockedCollateral: "20000000000000000000", lockedCollateral: "0", equity: "20000000000000000000", mmReq: "0", imReq: "0", status: "Healthy" },
      positions: [{ pool: BTC_POOL, baseSymbol: "BTC", size: "-13000", entryPrice: "78037000000000000000000", priceable: true }],
      gasBalance: "1000000000000000000",
      issues: [],
    },
    ...overrides,
  };
}

describe("captured proof records", () => {
  it("keys a record by the lower-cased hash", () => {
    // #given
    const upper: typeof TX_HASH = `0x${TX_HASH.slice(2).toUpperCase()}`;
    // #when
    const key = proofStorageKey(upper);
    // #then
    expect(key).toBe(`sidecar.proof.v1.${TX_HASH.toLowerCase()}`);
  });

  it("reads back what serializeProofEvent wrote", () => {
    // #given
    const raw = serializeProofEvent(proofEvent());
    // #when
    const result = parseCapturedProof(raw, TX_HASH);
    // #then
    expect(result.status === "ok" && { selected: result.event.selectedAccount, counterpart: result.event.counterpartAccount }).toEqual({
      selected: SEPARATE_ADDRESS,
      counterpart: PRIMARY_ADDRESS,
    });
  });

  it("rejects a record saved for a different transaction", () => {
    // #given
    const raw = serializeProofEvent(proofEvent({ txHash: `0x${"1".repeat(64)}` }));
    // #when
    const result = parseCapturedProof(raw, TX_HASH);
    // #then
    expect(result).toEqual({ status: "invalid", reason: "The saved record names a different transaction." });
  });

  it("rejects a record that is not JSON", () => {
    // #given
    const raw = "{not json";
    // #when
    const result = parseCapturedProof(raw, TX_HASH);
    // #then
    expect(result.status).toBe("invalid");
  });

  it("reports absence as its own state", () => {
    // #given no saved record
    // #when
    const result = parseCapturedProof(null, TX_HASH);
    // #then
    expect(result).toEqual({ status: "absent" });
  });

  it("narrows a captured account summary to bigints", () => {
    // #given
    const state = proofEvent().beforeAccountState;
    // #when
    const read = readCapturedAccountState(state);
    // #then
    expect(read && { block: read.block, equity: read.margin?.equity, size: read.positions[0]?.size }).toEqual({
      block: 299_999n,
      equity: 20_000_000_000_000_000_000n,
      size: -13_000n,
    });
  });

  it("keeps a failed margin read as missing, never as zero", () => {
    // #given
    const state = { ...proofEvent().beforeAccountState, margin: null };
    // #when
    const read = readCapturedAccountState(state);
    // #then
    expect(read?.margin).toBeNull();
  });
});

const CHAIN: ChainStatus = { chainId: 50383, expectedChainId: 50383, matches: true, headBlock: 300_000n, readAt: READ_AT };
const LISTING: MarketListing = {
  markets: [BTC_PERP, ETH_PERP],
  source: { kind: "indexer", readAt: READ_AT, via: "listPerpMarkets" },
  gates: { status: "ok", readAt: READ_AT, via: "listPerpPoolStatuses" },
};

function health(status: MarketHealth["status"]): MarketHealth {
  const source = { kind: "chain" as const, block: 300_001n, readAt: READ_AT, via: "getPerpHealthSnapshot" };
  return {
    pool: BTC_POOL,
    readAt: READ_AT,
    status,
    snapshot:
      status === "priceable"
        ? {
            ok: true,
            value: { oneBase: 100_000_000n, markPrice: 1n, projectedCumulativeFunding: 0n, effectiveImfBps: 500n, maintenanceMarginBps: 250n, closeOutMarginBps: 100n },
            source,
          }
        : { ok: false, reason: "The protocol cannot currently price this market.", source },
    feed: { ok: false, reason: "Not read." },
    risk: { ok: false, reason: "Not read." },
    errors: [],
  };
}

function inputs(overrides: Partial<LiveCheckInputs> = {}): LiveCheckInputs {
  return {
    chain: { state: "ok", value: CHAIN, readAt: READ_AT },
    listing: { state: "ok", value: LISTING, readAt: READ_AT },
    config: {
      state: "ok",
      value: {
        marginBank: BTC_PERP.marginBank,
        collateralToken: BTC_PERP.quoteToken,
        perpPoolFactory: BTC_PERP.quoteToken,
        liquidationEngine: BTC_PERP.quoteToken,
        insuranceFund: BTC_PERP.quoteToken,
        feeRecipient: BTC_PERP.quoteToken,
        maxLeverageLimit: 20,
        fullyWired: true,
      },
      readAt: READ_AT,
    },
    btc: { state: "ok", value: health("priceable"), readAt: READ_AT },
    eth: { state: "ok", value: health("priceable"), readAt: READ_AT },
    ...overrides,
  };
}

function statuses(rows: ReturnType<typeof deriveLiveChecks>): Record<string, string> {
  return Object.fromEntries(rows.map((row) => [row.id, row.status]));
}

describe("deriveLiveChecks", () => {
  it("passes every check when each read succeeded", () => {
    // #given
    const all = inputs();
    // #when
    const rows = deriveLiveChecks(all);
    // #then
    expect(statuses(rows)).toEqual({
      "chain-id": "pass",
      "head-block": "pass",
      "margin-bank": "pass",
      "market-count": "pass",
      "btc-priceable": "pass",
      "eth-priceable": "pass",
    });
  });

  it("fails a market the protocol declined to price, with the reason", () => {
    // #given
    const all = inputs({ btc: { state: "ok", value: health("unpriceable"), readAt: READ_AT } });
    // #when
    const btc = deriveLiveChecks(all).find((row) => row.id === "btc-priceable");
    // #then
    expect({ status: btc?.status, value: btc?.value }).toEqual({ status: "fail", value: "Not priceable" });
  });

  it("shows a failed chain read as unknown with no value", () => {
    // #given
    const all = inputs({ chain: { state: "error", error: new Error("socket closed") } });
    // #when
    const chain = deriveLiveChecks(all).find((row) => row.id === "chain-id");
    // #then
    expect({ status: chain?.status, value: chain?.value }).toEqual({ status: "unknown", value: null });
  });

  it("does not leave market checks loading forever when the market list failed", () => {
    // #given
    const all = inputs({ listing: { state: "error", error: new Error("indexer down") }, btc: { state: "loading" }, eth: { state: "loading" } });
    // #when
    const rows = deriveLiveChecks(all);
    // #then
    expect([statuses(rows)["btc-priceable"], statuses(rows)["eth-priceable"]]).toEqual(["unknown", "unknown"]);
  });
});
