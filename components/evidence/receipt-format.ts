import type { Address } from "viem";

import type { MarketMeta, PlacementOutcome, TimeInForce } from "@/lib/dreamdex/types";
import { formatPrice, formatQuantity, formatRaw, formatUsdso } from "@/lib/format/units";
import { sameAddress } from "@/lib/wallets/identity";

import type { CapturedPosition } from "./captured-proof";

/**
 * Display strings for the evidence pages. Every number passes through lib/format so the pages
 * never do their own unit arithmetic.
 */

const TIME_IN_FORCE_WORDS: Record<TimeInForce, string> = {
  GTC: "Good till cancelled (GTC)",
  IOC: "Immediate or cancel (IOC)",
  FOK: "Fill or kill (FOK)",
  POST_ONLY: "Post only",
};

export function timeInForceWords(timeInForce: TimeInForce | null): string {
  return timeInForce === null ? "Not a known order type" : TIME_IN_FORCE_WORDS[timeInForce];
}

const OUTCOME_WORDS: Record<PlacementOutcome, string> = {
  FILLED: "Filled",
  PARTIALLY_FILLED: "Partially filled",
  RESTING: "Resting",
  NO_FILL: "No fill",
  REVERTED: "Reverted",
  UNKNOWN: "Outcome unknown",
};

export function outcomeWords(outcome: PlacementOutcome): string {
  return OUTCOME_WORDS[outcome];
}

/** A base quantity with its symbol, or raw units when the market is not listed. */
export function quantityText(raw: bigint, market: MarketMeta | null): string {
  return market === null ? `${raw.toString()} raw base units` : formatQuantity(raw, market, { withSymbol: true });
}

export function priceText(raw: bigint, market: MarketMeta | null): string {
  return market === null ? `${raw.toString()} raw quote units` : formatPrice(raw, market, { withSymbol: true });
}

/** A collateral amount in the market's quote token. */
export function collateralText(raw: bigint, market: MarketMeta): string {
  return formatUsdso(raw, market.quoteDecimals, { withSymbol: true, symbol: market.quoteSymbol });
}

/** A whole-number count of gas units, grouped. */
export function gasText(raw: bigint): string {
  return formatRaw(raw, 0);
}

/** "ETH long 0.004 ETH at 2,267.28 USDso", from a captured snapshot row. */
export function positionText(position: CapturedPosition, markets: readonly MarketMeta[]): string {
  const market = markets.find((m) => sameAddress(m.pool, position.pool)) ?? null;
  const side = position.size < 0n ? "short" : "long";
  const magnitude = position.size < 0n ? -position.size : position.size;
  const name = market?.displaySymbol ?? position.baseSymbol ?? position.pool;
  return `${name} ${side} ${quantityText(magnitude, market)} at ${priceText(position.entryPrice, market)}`;
}

export function marketFor(pool: Address, markets: readonly MarketMeta[]): MarketMeta | null {
  return markets.find((m) => sameAddress(m.pool, pool)) ?? null;
}
