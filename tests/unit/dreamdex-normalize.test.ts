import { perpPoolWriteAbi, type MarginAccount, type OpenOrder, type PerpMarket, type PerpPoolStatus, type PerpPositionAnalytics } from "@somnia-chain/markets-sdk";
import { encodeFunctionData, getAddress, type Address } from "viem";
import { describe, expect, it } from "vitest";

import {
  decodePlaceOrderCalldata,
  interpretLiquidationPrice,
  normalizeIndexedOrder,
  normalizeMarginAccount,
  normalizeMarket,
  normalizeOnchainOrder,
  normalizePosition,
  normalizeVoucher,
  NormalizeError,
  ORDER_TYPE_BY_TIME_IN_FORCE,
  timeInForceForOrderType,
  toBigIntOrNull,
  toBigIntStrict,
  toJsonSafe,
  toUnixSecondsOrNull,
} from "@/lib/dreamdex/normalize";

const BTC_POOL = "0x4181dd08e73bbcdd1ba3e615a18f6abd941b94c0";
const BANK = "0x478769e1177c0773c43a593dccc4ad15f15f1394";
const USDSO = "0xed7993a74dae1e6656b704a424dcd8711aaf4f72";
const BTC_BASE = "0xa77fa353dac50de5c15676ac910c221a4d2bd6b5";

/** The BTC row as the Hideki indexer served it on 2026-11-01: raw amounts are decimal strings, addresses lowercased. */
function btcRow(overrides: Partial<PerpMarket> = {}): PerpMarket {
  return {
    id: BTC_POOL,
    chainId: 50383,
    marketType: "PERP",
    poolAddress: BTC_POOL,
    lastPrice: "77561000000000000000000",
    lastTradeAt: "1793490340",
    cumulativeBaseVolume: "0",
    cumulativeQuoteVolume: "0",
    tradeCount: "0",
    baseDecimals: 8,
    quoteDecimals: 18,
    createdAtTimestamp: "0",
    createdAtBlock: "0",
    baseToken: BTC_BASE,
    quoteToken: USDSO,
    baseSymbol: "BTC",
    quoteSymbol: "USDso",
    baseIsNative: false,
    tickSize: "100000000000000000",
    lotSize: "1000",
    minQuantity: "13000",
    marginBank: BANK,
    initialMarginBps: 500,
    stopRegistry: "0x52e2ccebaec9332672c247e9a90aa3d61fb615ef",
    markPrice: "77425617080235570000000",
    markPriceUpdatedAt: "1793488303",
    fundingRate: "1420331046654620",
    cumulativeFundingPerUnit: "0",
    indexPrice: "77400000000000000000000",
    fundingUpdatedAt: "1793488303",
    fundingWindowSec: 28800,
    fundingIntervalSec: 3600,
    openInterest: "34266310000",
    openInterestUpdatedAt: "1793488303",
    ...overrides,
  };
}

const GATE: PerpPoolStatus = {
  pool: getAddress(BTC_POOL),
  baseToken: getAddress(BTC_BASE),
  marginBank: getAddress(BANK),
  restricted: false,
  registered: true,
  tradeable: true,
};

describe("toBigIntOrNull", () => {
  it("accepts bigint, decimal strings and safe integers", () => {
    // #given
    const inputs: unknown[] = [13000n, "100000000000000000", " -42 ", 7];
    // #when
    const parsed = inputs.map(toBigIntOrNull);
    // #then
    expect(parsed).toEqual([13000n, 100000000000000000n, -42n, 7n]);
  });

  it("returns null rather than zero for anything that is not an exact integer", () => {
    // #given
    const inputs: unknown[] = [null, undefined, "", "1.5", "1e18", "0x10", "abc", 1.5, Number.NaN, 2 ** 60, {}, true];
    // #when
    const parsed = inputs.map(toBigIntOrNull);
    // #then
    expect(parsed.every((value) => value === null)).toBe(true);
  });

  it("throws a NormalizeError naming the field in the strict variant", () => {
    // #given
    const read = (): bigint => toBigIntStrict("1.0", "tickSize");
    // #when / #then
    expect(read).toThrow(new NormalizeError("tickSize", "1.0"));
  });
});

describe("toUnixSecondsOrNull", () => {
  it("parses indexed second strings and bigints but not zero", () => {
    // #given
    const inputs: unknown[] = ["1793488303", 1792422865n, "0", null];
    // #when
    const parsed = inputs.map(toUnixSecondsOrNull);
    // #then
    expect(parsed).toEqual([1793488303, 1792422865, null, null]);
  });
});

describe("normalizeMarket", () => {
  it("turns an indexed row with string amounts into bigint grid fields", () => {
    // #given
    const row = btcRow();
    // #when
    const market = normalizeMarket(row, GATE);
    // #then
    expect(market).toMatchObject({
      pool: getAddress(BTC_POOL),
      marginBank: getAddress(BANK),
      quoteToken: getAddress(USDSO),
      tickSize: 100000000000000000n,
      lotSize: 1000n,
      minQuantity: 13000n,
      baseDecimals: 8,
      quoteDecimals: 18,
      displaySymbol: "BTC-PERP",
      maxLeverageX: 20,
      indexedMarkPrice: 77425617080235570000000n,
      fundingRate8h: 1420331046654620n,
      tradeable: true,
      restricted: false,
      registered: true,
    });
  });

  it("leaves tradeability unknown when no gate was read", () => {
    // #given
    const row = btcRow();
    // #when
    const market = normalizeMarket(row);
    // #then
    expect([market.tradeable, market.registered, market.restricted]).toEqual([null, null, null]);
  });

  it("treats a zero or missing indexed mark as unavailable, never as a price", () => {
    // #given
    const rows = [btcRow({ markPrice: "0" }), btcRow({ markPrice: null })];
    // #when
    const marks = rows.map((row) => normalizeMarket(row).indexedMarkPrice);
    // #then
    expect(marks).toEqual([null, null]);
  });

  it("keeps the funding rate null when the rate or its window is missing", () => {
    // #given
    const rows = [btcRow({ fundingRate: null }), btcRow({ fundingWindowSec: null })];
    // #when
    const rates = rows.map((row) => normalizeMarket(row).fundingRate8h);
    // #then
    expect(rates).toEqual([null, null]);
  });

  it.each([
    ["a zero tick", { tickSize: "0" }],
    ["a fractional lot", { lotSize: "1.5" }],
    ["a zero initial margin", { initialMarginBps: 0 }],
  ])("refuses a row with %s instead of guessing a grid", (_, overrides) => {
    // #given
    const row = btcRow(overrides);
    // #when / #then
    expect(() => normalizeMarket(row)).toThrow(NormalizeError);
  });

  it("labels a symbol-less base by its token address", () => {
    // #given
    const row = btcRow({ baseSymbol: null });
    // #when
    const market = normalizeMarket(row);
    // #then
    expect(market.displaySymbol).toBe("0xa77f…d6b5-PERP");
  });
});

describe("normalizeMarginAccount", () => {
  it("maps the SDK's chain read field for field", () => {
    // #given
    const raw: MarginAccount = {
      unlockedCollateralBalance: 1045599258994221169178n,
      lockedCollateral: 0n,
      activePerpPools: [getAddress(BTC_POOL)],
      equity: 960963077117695704614n,
      withdrawable: 45599258994221169178n,
      imReq: 35788745874078844038n,
      mmReq: 17894372937039422019n,
      cmReq: 8947186468519711010n,
      marginStatus: "Healthy",
      asOfBlock: 38372376n,
    };
    // #when
    const state = normalizeMarginAccount(raw);
    // #then
    expect(state).toEqual({
      unlockedCollateral: 1045599258994221169178n,
      lockedCollateral: 0n,
      equity: 960963077117695704614n,
      withdrawable: 45599258994221169178n,
      imReq: 35788745874078844038n,
      mmReq: 17894372937039422019n,
      cmReq: 8947186468519711010n,
      status: "Healthy",
      activePools: [getAddress(BTC_POOL)],
    });
  });
});

describe("normalizePosition", () => {
  const symbolFor = (pool: Address): string | null => (pool.toLowerCase() === BTC_POOL ? "BTC" : null);
  const priced: PerpPositionAnalytics = {
    priceable: true,
    asOfBlock: 38372392n,
    pool: getAddress(BTC_POOL),
    avgEntryPrice: 84760100000000000000000n,
    markPrice: 77391081103991490000000n,
    size: 234000n,
    notional: 181095129783340086600n,
    unrealizedPnl: -17243504216659913400n,
    accruedFunding: 12448548959998652108n,
    equityContribution: -29692053176658565508n,
    initialMarginRequirement: 9054756489167004330n,
    maintenanceMarginRequirement: 4527378244583502165n,
    closeOutMarginRequirement: 2263689122291751083n,
    returnOnMarginBps: -32792n,
  };
  const unpriced: PerpPositionAnalytics = { priceable: false, asOfBlock: 5n, pool: getAddress(BTC_POOL), size: -13000n };

  it("maps a priced analytics row", () => {
    // #given / #when
    const position = normalizePosition(priced, symbolFor);
    // #then
    expect(position).toMatchObject({ side: "long", baseSymbol: "BTC", unrealizedPnl: -17243504216659913400n, block: 38372392n, priceable: true });
  });

  it("drops a flat row", () => {
    // #given
    const flat: PerpPositionAnalytics = { priceable: false, asOfBlock: 1n, pool: getAddress(BTC_POOL), size: 0n };
    // #when / #then
    expect(normalizePosition(flat, symbolFor)).toBeNull();
  });

  it("keeps an unpriceable position's size with every mark-dependent figure null", () => {
    // #given
    const storedEntry = 77000000000000000000000n;
    // #when
    const position = normalizePosition(unpriced, symbolFor, storedEntry);
    // #then
    expect(position).toMatchObject({ side: "short", size: -13000n, entryPrice: storedEntry, priceable: false, markPrice: null, notional: null, unrealizedPnl: null });
  });

  it("refuses to invent an entry price for an unpriceable row", () => {
    // #given / #when
    const position = normalizePosition(unpriced, symbolFor);
    // #then
    expect(position).toBeNull();
  });
});

describe("open orders", () => {
  it("normalizes a chain order row", () => {
    // #given
    const row = {
      pool: getAddress(BTC_POOL),
      orderId: 7802972743179149507766n,
      isBid: false,
      owner: getAddress("0x8239544db8718d75111e4aeedc42036742d22e68"),
      userData: 0n,
      price: 77559800000000000000000n,
      fullQuantity: 20000n,
      quantityRemaining: 20000n,
      expireTimestampNs: 0n,
    };
    // #when
    const order = normalizeOnchainOrder(row);
    // #then
    expect(order).toEqual({ pool: getAddress(BTC_POOL), orderId: 7802972743179149507766n, side: "short", price: 77559800000000000000000n, quantity: 20000n, placedAt: null });
  });

  it("drops a malformed indexed row instead of zero-filling it", () => {
    // #given
    const row: OpenOrder = {
      id: `${BTC_POOL}_1`,
      orderId: "1",
      market: BTC_POOL,
      marketInfo: null,
      pool: BTC_POOL,
      side: null,
      isBid: true,
      price: "not-a-number",
      quantityRemaining: "13000",
      userData: "0",
    };
    // #when / #then
    expect(normalizeIndexedOrder(row)).toBeNull();
  });
});

describe("normalizeVoucher", () => {
  it("reports a bank with no voucher programme as a state, not a failed read", () => {
    // #given / #when
    const voucher = normalizeVoucher(null);
    // #then
    expect(voucher).toEqual({ claimed: false, floor: 0n, expiresAt: null, programme: "off" });
  });

  it("maps an active voucher", () => {
    // #given
    const raw = { claimed: true, floor: 1000n * 10n ** 18n, expiresAt: 1792422865n };
    // #when
    const voucher = normalizeVoucher(raw);
    // #then
    expect(voucher).toEqual({ claimed: true, floor: 1000n * 10n ** 18n, expiresAt: 1792422865, programme: "active" });
  });

  it("reads a cleared expiry as no expiry", () => {
    // #given / #when
    const voucher = normalizeVoucher({ claimed: true, floor: 0n, expiresAt: 0n });
    // #then
    expect(voucher.expiresAt).toBeNull();
  });
});

describe("interpretLiquidationPrice", () => {
  it.each([
    ["a long floored at zero", 0n, 234000n, { kind: "unreachable" }],
    ["a short floored at zero", 0n, -13000n, { kind: "breached" }],
    ["a flat account", null, 0n, { kind: "flat" }],
    ["a real solve", 75634358974358974359961n, 13000n, { kind: "price", price: 75634358974358974359961n }],
  ])("interprets %s without rendering 0n as a price", (_, raw, size, expected) => {
    // #given / #when
    const estimate = interpretLiquidationPrice(raw, size);
    // #then
    expect(estimate).toEqual(expected);
  });
});

describe("time in force", () => {
  it("maps onto the SDK's ORDER_TYPE values", () => {
    // #given / #when / #then
    expect(ORDER_TYPE_BY_TIME_IN_FORCE).toEqual({ GTC: 0, IOC: 2, FOK: 1, POST_ONLY: 3 });
  });

  it("round-trips every time in force and rejects unknown order types", () => {
    // #given
    const all = ["GTC", "IOC", "FOK", "POST_ONLY"] as const;
    // #when
    const roundTrip = all.map((tif) => timeInForceForOrderType(ORDER_TYPE_BY_TIME_IN_FORCE[tif]));
    // #then
    expect([...roundTrip, timeInForceForOrderType(9)]).toEqual([...all, null]);
  });
});

describe("decodePlaceOrderCalldata", () => {
  it("decodes what the SDK's PerpPool ABI encodes", () => {
    // #given
    const data = encodeFunctionData({
      abi: perpPoolWriteAbi,
      functionName: "placeOrder",
      args: [true, 0n, 73743500000000000000000n, 13000n, 3370000000000000000n, 2, 0, "0x0000000000000000000000000000000000000000", 0n],
    });
    // #when
    const decoded = decodePlaceOrderCalldata(data);
    // #then
    expect(decoded).toEqual({
      isBid: true,
      userData: 0n,
      price: 73743500000000000000000n,
      quantity: 13000n,
      expireTimestampNs: 3370000000000000000n,
      orderType: 2,
      selfMatchingOption: 0,
      builder: "0x0000000000000000000000000000000000000000",
      builderFeeBpsTimes1k: 0n,
    });
  });

  it("returns null for any other call", () => {
    // #given
    const cancel = encodeFunctionData({ abi: perpPoolWriteAbi, functionName: "cancelOrder", args: [1n] });
    // #when / #then
    expect([decodePlaceOrderCalldata(cancel), decodePlaceOrderCalldata("0x1234")]).toEqual([null, null]);
  });
});

describe("toJsonSafe", () => {
  it("stringifies bigints at any depth", () => {
    // #given
    const value = { a: 1n, b: [2n, { c: -3n }], d: null, e: "x" };
    // #when / #then
    expect(toJsonSafe(value)).toEqual({ a: "1", b: ["2", { c: "-3" }], d: null, e: "x" });
  });
});
