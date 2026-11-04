import { ORDER_TYPE } from "@somnia-chain/markets-sdk";
import { encodeAbiParameters, getAddress, keccak256, parseAbiParameters, type Address, type Hex } from "viem";

import type { OrderIntent, OrderSide, TimeInForce } from "@/lib/dreamdex/types";

/**
 * Versioned domain tag mixed into every intent hash, so a future encoding change
 * cannot collide with hashes already recorded in evidence.
 */
export const INTENT_HASH_DOMAIN = "sidecar.order-intent.v1";

const INTENT_ENCODING = parseAbiParameters(
  "string domain, uint256 chainId, address account, address pool, bool isBid, uint256 quantity, uint256 price, uint8 orderType",
);

/** The SDK's `ORDER_TYPE` value for a time in force. */
export function orderTypeFor(timeInForce: TimeInForce): number {
  switch (timeInForce) {
    case "GTC":
      return ORDER_TYPE.LIMIT;
    case "FOK":
      return ORDER_TYPE.FILL_OR_KILL;
    case "IOC":
      return ORDER_TYPE.MARKET;
    case "POST_ONLY":
      return ORDER_TYPE.POST_ONLY;
  }
}

export function isBidFor(side: OrderSide): boolean {
  return side === "long";
}

/**
 * Canonical keccak256 of an order intent, the account it is placed from and the chain.
 *
 * A LOCAL identifier only: it lets evidence, the lifecycle and the receipt view refer to
 * "this prepared order" before any transaction exists. It never substitutes for a
 * transaction hash and proves nothing about what reached the chain.
 *
 * Addresses are checksummed before encoding, so letter case cannot change the hash.
 *
 * @throws when an address is malformed or a numeric field is negative. Validated intents
 * from `validateOrderInput` never trigger either.
 */
export function intentHash(intent: OrderIntent, account: Address, chainId: number): Hex {
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new RangeError(`Chain id must be a positive integer, got ${chainId}.`);
  }
  return keccak256(
    encodeAbiParameters(INTENT_ENCODING, [
      INTENT_HASH_DOMAIN,
      BigInt(chainId),
      getAddress(account),
      getAddress(intent.pool),
      isBidFor(intent.side),
      intent.quantity,
      intent.price,
      orderTypeFor(intent.timeInForce),
    ]),
  );
}

/** Field-by-field equality, with addresses compared case-insensitively. */
export function sameIntent(a: OrderIntent, b: OrderIntent): boolean {
  return (
    a.pool.toLowerCase() === b.pool.toLowerCase() &&
    a.side === b.side &&
    a.quantity === b.quantity &&
    a.price === b.price &&
    a.timeInForce === b.timeInForce
  );
}
