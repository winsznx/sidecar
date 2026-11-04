import { ORDER_TYPE } from "@somnia-chain/markets-sdk";
import { describe, expect, it } from "vitest";

import type { OrderIntent } from "@/lib/dreamdex/types";
import { intentHash, isBidFor, orderTypeFor, sameIntent } from "@/lib/orders/intent";
import { PRIMARY_ADDRESS, SEPARATE_ADDRESS } from "@/tests/fixtures/accounts.fixture";
import { ETH_POOL } from "@/tests/fixtures/markets.fixture";
import { BTC_ORDER } from "@/tests/fixtures/quotes.fixture";

const CHAIN_ID = 50383;
const LOWERCASE_BTC_POOL = "0x4181dd08e73bbcdd1ba3e615a18f6abd941b94c0";
const LOWERCASE_SEPARATE = "0x0de15c470291d26b6604d9d30ef6d53f169bb1e0";

describe("intentHash", () => {
  it("is pinned to its canonical encoding", () => {
    // #given the minimum BTC long from the second wallet on Hideki
    // #when it is hashed
    const hash = intentHash(BTC_ORDER, SEPARATE_ADDRESS, CHAIN_ID);
    // #then the value matches the recorded encoding, so evidence hashes stay comparable
    expect(hash).toBe("0x316e8d2d1679c985e4607fc8e9ca8f27fafb79b19b05b7252951bddee50bf8b1");
  });

  it("does not depend on address letter case", () => {
    // #given the same intent with lowercased addresses
    const lowered: OrderIntent = { ...BTC_ORDER, pool: LOWERCASE_BTC_POOL };
    // #when both are hashed
    const pair = [
      intentHash(BTC_ORDER, SEPARATE_ADDRESS, CHAIN_ID),
      intentHash(lowered, LOWERCASE_SEPARATE, CHAIN_ID),
    ];
    // #then they are equal
    expect(pair[0]).toBe(pair[1]);
  });

  it("changes when any field of the order, the account or the chain changes", () => {
    // #given variants that each differ in one field
    const base = intentHash(BTC_ORDER, SEPARATE_ADDRESS, CHAIN_ID);
    const variants = [
      intentHash(BTC_ORDER, PRIMARY_ADDRESS, CHAIN_ID),
      intentHash(BTC_ORDER, SEPARATE_ADDRESS, 50312),
      intentHash({ ...BTC_ORDER, pool: ETH_POOL }, SEPARATE_ADDRESS, CHAIN_ID),
      intentHash({ ...BTC_ORDER, side: "short" }, SEPARATE_ADDRESS, CHAIN_ID),
      intentHash({ ...BTC_ORDER, quantity: 14_000n }, SEPARATE_ADDRESS, CHAIN_ID),
      intentHash({ ...BTC_ORDER, price: BTC_ORDER.price + 1n }, SEPARATE_ADDRESS, CHAIN_ID),
      intentHash({ ...BTC_ORDER, timeInForce: "IOC" }, SEPARATE_ADDRESS, CHAIN_ID),
    ];
    // #when compared with the base hash
    // #then every one differs, from the base and from each other
    expect(new Set([base, ...variants]).size).toBe(variants.length + 1);
  });

  it("refuses a chain id that is not a positive integer", () => {
    // #given an invalid chain id
    // #when hashing
    const attempt = (): string => intentHash(BTC_ORDER, SEPARATE_ADDRESS, 0);
    // #then it throws rather than encoding nonsense
    expect(attempt).toThrow(RangeError);
  });
});

describe("order encoding helpers", () => {
  it("maps every time in force onto the SDK's ORDER_TYPE", () => {
    // #given the four time-in-force choices
    // #when mapped
    const mapped = (["GTC", "FOK", "IOC", "POST_ONLY"] as const).map(orderTypeFor);
    // #then they match the SDK constants
    expect(mapped).toEqual([ORDER_TYPE.LIMIT, ORDER_TYPE.FILL_OR_KILL, ORDER_TYPE.MARKET, ORDER_TYPE.POST_ONLY]);
  });

  it("treats a long as a bid", () => {
    // #given both sides
    // #when mapped to the SDK's isBid flag
    const flags = [isBidFor("long"), isBidFor("short")];
    // #then only a long bids
    expect(flags).toEqual([true, false]);
  });

  it("compares intents field by field, ignoring address case", () => {
    // #given an equal intent with a lowercased pool and one with a different size
    const lowered: OrderIntent = { ...BTC_ORDER, pool: LOWERCASE_BTC_POOL };
    // #when compared
    const results = [sameIntent(BTC_ORDER, lowered), sameIntent(BTC_ORDER, { ...BTC_ORDER, quantity: 14_000n })];
    // #then only the real difference counts
    expect(results).toEqual([true, false]);
  });
});
