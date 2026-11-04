import { getAddress, isAddress, isHash, type Address, type Hash } from "viem";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPerpsAdapter } from "@/lib/dreamdex/adapter";
import { createMarkets } from "@/lib/dreamdex/client";
import { NETWORK } from "@/lib/dreamdex/config";
import { classifyError } from "@/lib/dreamdex/errors";
import type { MarketListing, VerifiedOrder } from "@/lib/dreamdex/types";

// Live and read-only: reconciliation reads a mined transaction and replays nothing that writes.
const markets = createMarkets(NETWORK);
const adapter = createPerpsAdapter(markets);

/**
 * A third-party BTC-PERP IOC sell on Hideki that filled in full (block 38370667, 2026-11-01).
 * Public chain history, used only to exercise reconciliation against a real receipt.
 */
const PUBLIC_IOC_FILL: Hash = "0xa71faaf75c1fa13abab1f1047b1049ae86477310761fbbafaf01a6bd0fd17259";

const configuredTx = process.env.SIDECAR_TEST_TX?.trim() ?? "";
const configuredAccount = process.env.SIDECAR_TEST_ACCOUNT_A?.trim() ?? "";

let listing: MarketListing;

beforeAll(async () => {
  listing = await adapter.getMarketListing();
});

afterAll(async () => {
  await markets.close();
});

function summary(order: VerifiedOrder): unknown {
  return { outcome: order.outcome, filled: order.filledQuantity, checks: order.checks.map((c) => `${c.id}:${c.status}`) };
}

describe.runIf(isHash(configuredTx))("I10 receipt replay (runs only with SIDECAR_TEST_TX)", () => {
  it("I10 re-reads SIDECAR_TEST_TX from chain and reaches the same verdict twice", async () => {
    // #given
    if (!isHash(configuredTx)) throw new Error("SIDECAR_TEST_TX is not a transaction hash");
    const hash: Hash = configuredTx;
    const expectedAccount: Address | undefined = isAddress(configuredAccount, { strict: false }) ? getAddress(configuredAccount) : undefined;
    // #when
    const first = await adapter.reconcileOrder(hash, { markets: listing.markets, expectedAccount });
    const second = await adapter.reconcileOrder(hash, { markets: listing.markets, expectedAccount });
    // #then
    expect({ chain: first.checks.find((c) => c.id === "chain-id")?.status, known: first.outcome !== "UNKNOWN", stable: summary(second) }).toEqual({
      chain: "pass",
      known: true,
      stable: summary(first),
    });
  });
});

describe("Receipt reconciliation against public history", () => {
  it("reconciles a public IOC fill as FILLED with every chain check passing", async (ctx) => {
    // #given
    let verified: VerifiedOrder;
    try {
      verified = await adapter.reconcileOrder(PUBLIC_IOC_FILL, { markets: listing.markets });
    } catch (error) {
      if (classifyError(error).code === "TX_NOT_FOUND") {
        ctx.skip("The recorded public transaction is no longer served by this RPC.");
        return;
      }
      throw error;
    }
    // #when
    const statuses = Object.fromEntries(verified.checks.map((c) => [c.id, c.status]));
    // #then
    expect({
      outcome: verified.outcome,
      covered: verified.filledQuantity === verified.requested?.quantity,
      timeInForce: verified.requested?.timeInForce,
      explorer: verified.explorerUrl,
      statuses,
    }).toEqual({
      outcome: "FILLED",
      covered: true,
      timeInForce: "IOC",
      explorer: `https://explorer.testnet.somnia.network/tokyo/tx/${PUBLIC_IOC_FILL}`,
      statuses: {
        "chain-id": "pass",
        sender: "unknown",
        "pool-listed": "pass",
        "margin-bank": "pass",
        "receipt-success": "pass",
        "placement-decoded": "pass",
        "calldata-intent": "unknown",
        "position-attribution": "pass",
        "collateral-attribution": "pass",
        "counterpart-isolation": "unknown",
      },
    });
  });

  it("reports a hash the network does not know as TX_NOT_FOUND", async () => {
    // #given
    const unknown: Hash = `0x${"0".repeat(63)}1`;
    // #when
    const reconciling = adapter.reconcileOrder(unknown, { markets: listing.markets });
    // #then
    await expect(reconciling.catch((error: unknown) => classifyError(error).code)).resolves.toBe("TX_NOT_FOUND");
  });
});
