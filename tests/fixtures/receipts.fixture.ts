import type { Hash } from "viem";

import type { VerifiedOrder } from "@/lib/dreamdex/types";

import { READ_AT, SEPARATE_ADDRESS } from "./accounts.fixture";
import { BTC_PERP, BTC_POOL } from "./markets.fixture";
import { BTC_LIMIT, BTC_ORDER } from "./quotes.fixture";

/** Simulated reconciled placements. The hash is a made-up value, not a real transaction. */

export const TX_HASH: Hash = "0x5f1d0c3a9b8e7d6c5b4a39281706f5e4d3c2b1a0918273645546372819a0b1c2";

export function verifiedOrderFixture(overrides: Partial<VerifiedOrder> = {}): VerifiedOrder {
  return {
    hash: TX_HASH,
    chainId: 50383,
    receiptStatus: "success",
    from: SEPARATE_ADDRESS,
    to: BTC_POOL,
    block: 300_420n,
    gasUsed: 1_250_000n,
    orderId: 7_001n,
    fills: [],
    filledQuantity: 0n,
    requested: {
      side: BTC_ORDER.side,
      quantity: BTC_ORDER.quantity,
      price: BTC_ORDER.price,
      timeInForce: BTC_ORDER.timeInForce,
    },
    market: BTC_PERP,
    outcome: "RESTING",
    revertReason: null,
    explorerUrl: `https://explorer.testnet.somnia.network/tokyo/tx/${TX_HASH}`,
    checks: [],
    readAt: READ_AT,
    ...overrides,
  };
}

export function fill(quantity: bigint, makerOrderId = 6_900n): VerifiedOrder["fills"][number] {
  return { makerOrderId, takerOrderId: 7_001n, quantity, price: BTC_LIMIT };
}
