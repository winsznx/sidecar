import { perpLiquidationPrice } from "@somnia-chain/markets-sdk";
import type { Address } from "viem";

import type { OrderIntent, RouteQuote } from "@/lib/dreamdex/types";

import { NOW_MS, PRIMARY_ADDRESS, PRIMARY_MARGIN, READ_BLOCK, SEPARATE_ADDRESS } from "./accounts.fixture";
import { BTC_POOL, usdso } from "./markets.fixture";

/**
 * Simulated route quotes for a minimum-size BTC long, in the shape the adapter builds
 * from getMaxPerpOrderSize, previewPerpOrderMargin and previewPerpLiquidationPrice.
 * The numbers are internally consistent: notional, margin lock, maintenance and the
 * liquidation solve all follow from the same mark, size and rates.
 */

export const QUOTE_READ_AT = new Date(NOW_MS - 1_000).toISOString();
export const QUOTE_BLOCK = READ_BLOCK + 150n;

/** 77,412.35 USDso. */
export const BTC_MARK = 77_412_350_000_000_000_000_000n;
/** 77,412.3 USDso, on the 0.1 tick and just under the mark, so the lock has no adverse gap. */
export const BTC_LIMIT = 77_412_300_000_000_000_000_000n;
export const BTC_ONE_BASE = 100_000_000n;
export const BTC_MAINTENANCE_BPS = 250n;
export const BTC_EFFECTIVE_IMF_BPS = 500n;

export const BTC_ORDER: OrderIntent = {
  pool: BTC_POOL,
  side: "long",
  quantity: 13_000n,
  price: BTC_LIMIT,
  timeInForce: "GTC",
};

const ORDER_NOTIONAL = (BTC_ORDER.quantity * BTC_LIMIT) / BTC_ONE_BASE;
const MARK_NOTIONAL = (BTC_ORDER.quantity * BTC_MARK) / BTC_ONE_BASE;
const ceilDiv = (a: bigint, b: bigint): bigint => (a + b - 1n) / b;

export const BTC_LOCK = ceilDiv(ORDER_NOTIONAL * BTC_EFFECTIVE_IMF_BPS, 10_000n);
/** Taker fee at 4.5 bps on the order notional. */
export const BTC_FEE = ceilDiv(ORDER_NOTIONAL * 45n, 100_000n);
export const BTC_ORDER_MM = ceilDiv(MARK_NOTIONAL * BTC_MAINTENANCE_BPS, 10_000n);
const ENTRY_PNL = ((BTC_MARK - BTC_LIMIT) * BTC_ORDER.quantity) / BTC_ONE_BASE;

type QuotePatch = Partial<Omit<RouteQuote, "margin" | "maxSize" | "projection">> & {
  margin?: Partial<NonNullable<RouteQuote["margin"]>> | null;
  maxSize?: Partial<NonNullable<RouteQuote["maxSize"]>> | null;
  projection?: Partial<NonNullable<RouteQuote["projection"]>> | null;
};

/** A quote for `account` with the order filled into an account at `equity` / `mmReq`. */
export function routeQuoteFixture(input: {
  account: Address;
  equity: bigint;
  mmReq: bigint;
  unlocked: bigint;
  existingIm: bigint;
  maxQuantity: bigint;
}): RouteQuote {
  const projectedEquity = input.equity - BTC_FEE + ENTRY_PNL;
  const projectedMmReq = input.mmReq + BTC_ORDER_MM;
  return {
    account: input.account,
    intent: BTC_ORDER,
    block: QUOTE_BLOCK,
    readAt: QUOTE_READ_AT,
    priceable: true,
    markPrice: BTC_MARK,
    effectiveImfBps: BTC_EFFECTIVE_IMF_BPS,
    maxSize: {
      maxQuantity: input.maxQuantity,
      placeable: true,
      limitedBy: "collateral",
      maxPositionSize: 50_000_000n,
      positionSize: 0n,
      lotSize: 1_000n,
      minQuantity: 13_000n,
    },
    margin: {
      lockAmount: BTC_LOCK,
      imRequirement: input.existingIm,
      initialMarginPortion: BTC_LOCK,
      adverseGapPortion: 0n,
      feeHeadroom: BTC_FEE,
      topUpRequired: 0n,
      ownWalletPull: 0n,
      mainWalletPull: 0n,
      fundingPayer: null,
      unlockedCollateral: input.unlocked,
      equity: input.equity,
      sufficient: true,
      hasCollateralForLock: true,
      meetsInitialMargin: true,
      voucherBlocked: false,
      restrictedBlocked: false,
      isolationBlocked: false,
      mainFundingBlocked: false,
    },
    projection: {
      currentSize: 0n,
      projectedSize: BTC_ORDER.quantity,
      projectedEntryPrice: BTC_LIMIT,
      projectedEquity,
      projectedMmReq,
      currentLiquidationPrice: null,
      projectedLiquidationPrice: perpLiquidationPrice({
        equity: projectedEquity,
        mmReq: projectedMmReq,
        size: BTC_ORDER.quantity,
        markPrice: BTC_MARK,
        maintenanceMarginBps: BTC_MAINTENANCE_BPS,
        oneBase: BTC_ONE_BASE,
      }),
    },
    errors: [],
    blocks: { maxSize: QUOTE_BLOCK, margin: QUOTE_BLOCK, projection: QUOTE_BLOCK },
    autoPull: true,
  };
}

export function patchQuote(base: RouteQuote, patch: QuotePatch): RouteQuote {
  const { margin, maxSize, projection, ...rest } = patch;
  return {
    ...base,
    ...rest,
    margin: margin === null ? null : base.margin === null ? null : { ...base.margin, ...margin },
    maxSize: maxSize === null ? null : base.maxSize === null ? null : { ...base.maxSize, ...maxSize },
    projection: projection === null ? null : base.projection === null ? null : { ...base.projection, ...projection },
  };
}

/** Account A taking the BTC order next to its ETH long. */
export const PRIMARY_QUOTE = routeQuoteFixture({
  account: PRIMARY_ADDRESS,
  equity: PRIMARY_MARGIN.equity,
  mmReq: PRIMARY_MARGIN.mmReq,
  unlocked: PRIMARY_MARGIN.unlockedCollateral,
  existingIm: PRIMARY_MARGIN.imReq,
  maxQuantity: 25_110_000n,
});

/** Account B taking the BTC order on its own 5 USDso. */
export const SEPARATE_QUOTE = routeQuoteFixture({
  account: SEPARATE_ADDRESS,
  equity: usdso(5n),
  mmReq: 0n,
  unlocked: usdso(5n),
  existingIm: 0n,
  maxQuantity: 129_000n,
});
