import type { Address } from "viem";

import type { MarketMeta } from "@/lib/dreamdex/types";

/**
 * Simulated market rows shaped like `listPerpMarkets` output. BTC uses the grid read
 * from Hideki (tick 1e17, lot 1000, min 13000 at 8/18 decimals); the other markets use
 * illustrative grids so every decimal scale the app must handle is covered.
 */

export const MARGIN_BANK: Address = "0x478769E1177C0773c43A593DCCc4Ad15F15F1394";
export const USDSO: Address = "0xed7993A74dAe1e6656B704A424DcD8711aAf4F72";
export const BTC_POOL: Address = "0x4181dd08E73BbCdd1Ba3E615A18f6abD941b94C0";
export const ETH_POOL: Address = "0xD6Cb1DD58580B84D76068aC21594219ce03aeddf";

const ONE_USDSO = 10n ** 18n;

export function usdso(whole: bigint, hundredths = 0n): bigint {
  return whole * ONE_USDSO + hundredths * 10n ** 16n;
}

export function marketFixture(overrides: Partial<MarketMeta> = {}): MarketMeta {
  return {
    pool: BTC_POOL,
    marginBank: MARGIN_BANK,
    quoteToken: USDSO,
    stopRegistry: null,
    baseSymbol: "BTC",
    quoteSymbol: "USDso",
    displaySymbol: "BTC-PERP",
    baseDecimals: 8,
    quoteDecimals: 18,
    tickSize: 100_000_000_000_000_000n,
    lotSize: 1_000n,
    minQuantity: 13_000n,
    initialMarginBps: 500,
    maxLeverageX: 20,
    indexedMarkPrice: 77_412_350_000_000_000_000_000n,
    indexedMarkUpdatedAt: 1_793_534_390,
    fundingRate8h: null,
    openInterest: null,
    tradeable: true,
    ...overrides,
  };
}

export const BTC_PERP = marketFixture();

export const ETH_PERP = marketFixture({
  pool: ETH_POOL,
  baseSymbol: "ETH",
  displaySymbol: "ETH-PERP",
  baseDecimals: 18,
  tickSize: 10_000_000_000_000_000n,
  lotSize: 100_000_000_000_000n,
  minQuantity: 1_000_000_000_000_000n,
  indexedMarkPrice: usdso(3_100n),
});

export const SOL_PERP = marketFixture({
  pool: "0x44Af5545018BF468dCC51DE0bda7fE15Fbf17dcf",
  baseSymbol: "SOL",
  displaySymbol: "SOL-PERP",
  baseDecimals: 9,
  tickSize: 1_000_000_000_000_000n,
  lotSize: 1_000_000n,
  minQuantity: 10_000_000n,
});

export const NEAR_PERP = marketFixture({
  pool: "0x77DD656eaa469F2eB4C6C68CDb24b69CefDEEF53",
  baseSymbol: "NEAR",
  displaySymbol: "NEAR-PERP",
  baseDecimals: 24,
  tickSize: 100_000_000_000_000n,
  lotSize: 10n ** 21n,
  minQuantity: 10n ** 23n,
});

/** A six-decimal base and a six-decimal quote, the scale of USDC-style tokens. */
export const SIX_DECIMAL_PERP = marketFixture({
  pool: "0x1111111111111111111111111111111111111111",
  baseSymbol: "SIX",
  quoteSymbol: "USDC",
  displaySymbol: "SIX-PERP",
  baseDecimals: 6,
  quoteDecimals: 6,
  tickSize: 100n,
  lotSize: 10n,
  minQuantity: 1_000n,
});

/** A seven-decimal base, the scale of some bridged assets. */
export const SEVEN_DECIMAL_PERP = marketFixture({
  pool: "0x2222222222222222222222222222222222222222",
  baseSymbol: "SEV",
  displaySymbol: "SEV-PERP",
  baseDecimals: 7,
  lotSize: 100n,
  minQuantity: 10_000n,
});
