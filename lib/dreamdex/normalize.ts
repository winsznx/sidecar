import {
  decodePlaceOrder,
  fundingRate8h,
  marginBankEventsAbi,
  orderBookEventsAbi,
  ORDER_TYPE,
  perpPoolWriteAbi,
  type MarginAccount,
  type OnchainOrder,
  type OpenOrder,
  type PerpMarket,
  type PerpPoolStatus,
  type PerpPositionAnalytics,
  type PerpVoucher,
} from "@somnia-chain/markets-sdk";
import { decodeEventLog, decodeFunctionData, getAddress, isAddress, type Address, type Hex, type TransactionReceipt } from "viem";

import type {
  DecodedPlaceOrderCall,
  LiquidationPriceEstimate,
  MarginAccountState,
  MarginEventRecord,
  MarketMeta,
  OpenOrderSnapshot,
  OrderFillRecord,
  OrderSide,
  PlacementOutcome,
  PlacementRecord,
  PositionSnapshot,
  TimeInForce,
  VoucherState,
} from "./types";

/** A row field that cannot be turned into the domain type. Thrown, never coerced to a default. */
export class NormalizeError extends Error {
  readonly field: string;
  readonly received: unknown;

  constructor(field: string, received: unknown) {
    super(`Cannot normalize ${field}: received ${describe(received)}`);
    this.name = "NormalizeError";
    this.field = field;
    this.received = received;
  }
}

function describe(value: unknown): string {
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}

const DECIMAL_INTEGER = /^-?\d+$/;

/**
 * Indexed rows carry raw amounts as decimal strings while chain reads return bigint;
 * both arrive here. Anything else (a float, `NaN`, an empty string) is `null`, not zero.
 */
export function toBigIntOrNull(value: unknown): bigint | null {
  if (typeof value === "bigint") return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return DECIMAL_INTEGER.test(trimmed) ? BigInt(trimmed) : null;
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  return null;
}

export function toBigIntStrict(value: unknown, field: string): bigint {
  const parsed = toBigIntOrNull(value);
  if (parsed === null) throw new NormalizeError(field, value);
  return parsed;
}

export function toAddressOrNull(value: unknown): Address | null {
  return typeof value === "string" && isAddress(value, { strict: false }) ? getAddress(value) : null;
}

function toAddressStrict(value: unknown, field: string): Address {
  const parsed = toAddressOrNull(value);
  if (parsed === null) throw new NormalizeError(field, value);
  return parsed;
}

/** Unix seconds from an indexed decimal string or a bigint. */
export function toUnixSecondsOrNull(value: unknown): number | null {
  const parsed = toBigIntOrNull(value);
  if (parsed === null || parsed <= 0n || parsed > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(parsed);
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function requirePositive(value: bigint, field: string): bigint {
  if (value <= 0n) throw new NormalizeError(field, value);
  return value;
}

function requireDecimals(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 77) {
    throw new NormalizeError(field, value);
  }
  return value;
}

/**
 * An indexed PerpMarket row plus, optionally, its factory gate. Grid fields have no safe
 * fallback, so a row missing one throws instead of producing a mis-scaled market.
 */
export function normalizeMarket(row: PerpMarket, gate: PerpPoolStatus | null = null): MarketMeta {
  const pool = toAddressStrict(row.poolAddress, "poolAddress");
  const initialMarginBps = row.initialMarginBps;
  if (!Number.isInteger(initialMarginBps) || initialMarginBps <= 0) {
    throw new NormalizeError("initialMarginBps", initialMarginBps);
  }
  const baseToken = toAddressStrict(row.baseToken, "baseToken");
  const quoteToken = toAddressStrict(row.quoteToken, "quoteToken");
  const baseSymbol = row.baseSymbol ?? shortAddress(baseToken);
  const rawRate = toBigIntOrNull(row.fundingRate);
  const windowSec = typeof row.fundingWindowSec === "number" && row.fundingWindowSec > 0 ? row.fundingWindowSec : null;
  const indexedMark = toBigIntOrNull(row.markPrice);

  return {
    pool,
    marginBank: toAddressStrict(row.marginBank, "marginBank"),
    quoteToken,
    stopRegistry: toAddressOrNull(row.stopRegistry),
    baseSymbol,
    quoteSymbol: row.quoteSymbol ?? shortAddress(quoteToken),
    displaySymbol: `${baseSymbol}-PERP`,
    baseDecimals: requireDecimals(row.baseDecimals, "baseDecimals"),
    quoteDecimals: requireDecimals(row.quoteDecimals, "quoteDecimals"),
    tickSize: requirePositive(toBigIntStrict(row.tickSize, "tickSize"), "tickSize"),
    lotSize: requirePositive(toBigIntStrict(row.lotSize, "lotSize"), "lotSize"),
    minQuantity: requirePositive(toBigIntStrict(row.minQuantity, "minQuantity"), "minQuantity"),
    initialMarginBps,
    maxLeverageX: 10_000 / initialMarginBps,
    // The indexer writes 0 when the contract emitted its stale-mark sentinel; 0 is never a real mark.
    indexedMarkPrice: indexedMark !== null && indexedMark > 0n ? indexedMark : null,
    indexedMarkUpdatedAt: toUnixSecondsOrNull(row.markPriceUpdatedAt),
    fundingRate8h: rawRate !== null && windowSec !== null ? fundingRate8h(rawRate, windowSec) : null,
    openInterest: toBigIntOrNull(row.openInterest),
    tradeable: gate ? gate.tradeable : null,
    restricted: gate ? gate.restricted : null,
    registered: gate ? gate.registered : null,
    baseToken,
    fundingWindowSec: windowSec,
  };
}

export function normalizeMarginAccount(raw: MarginAccount): MarginAccountState {
  return {
    unlockedCollateral: toBigIntStrict(raw.unlockedCollateralBalance, "unlockedCollateralBalance"),
    lockedCollateral: toBigIntStrict(raw.lockedCollateral, "lockedCollateral"),
    equity: toBigIntStrict(raw.equity, "equity"),
    withdrawable: toBigIntStrict(raw.withdrawable, "withdrawable"),
    imReq: toBigIntStrict(raw.imReq, "imReq"),
    mmReq: toBigIntStrict(raw.mmReq, "mmReq"),
    cmReq: toBigIntStrict(raw.cmReq, "cmReq"),
    status: raw.marginStatus,
    activePools: raw.activePerpPools.map((pool, i) => toAddressStrict(pool, `activePerpPools[${i}]`)),
  };
}

function sideOf(size: bigint): OrderSide {
  return size > 0n ? "long" : "short";
}

/**
 * One analytics row. A flat row is `null`. An unpriceable row keeps its size but needs the
 * entry price from `getPerpPosition`, because the SDK row omits it; without one it is `null`
 * and the caller must report the gap rather than invent an entry.
 */
export function normalizePosition(
  row: PerpPositionAnalytics,
  symbolForPool: (pool: Address) => string | null,
  fallbackEntryPrice: bigint | null = null,
): PositionSnapshot | null {
  const pool = toAddressStrict(row.pool, "pool");
  const size = toBigIntStrict(row.size, "size");
  if (size === 0n) return null;
  if (!row.priceable) {
    if (fallbackEntryPrice === null) return null;
    return {
      pool,
      baseSymbol: symbolForPool(pool),
      side: sideOf(size),
      size,
      entryPrice: fallbackEntryPrice,
      priceable: false,
      markPrice: null,
      notional: null,
      unrealizedPnl: null,
      accruedFunding: null,
      equityContribution: null,
      imRequirement: null,
      mmRequirement: null,
      block: row.asOfBlock,
    };
  }
  return {
    pool,
    baseSymbol: symbolForPool(pool),
    side: sideOf(size),
    size,
    entryPrice: toBigIntStrict(row.avgEntryPrice, "avgEntryPrice"),
    priceable: true,
    markPrice: toBigIntStrict(row.markPrice, "markPrice"),
    notional: toBigIntStrict(row.notional, "notional"),
    unrealizedPnl: toBigIntStrict(row.unrealizedPnl, "unrealizedPnl"),
    accruedFunding: toBigIntStrict(row.accruedFunding, "accruedFunding"),
    equityContribution: toBigIntStrict(row.equityContribution, "equityContribution"),
    imRequirement: toBigIntStrict(row.initialMarginRequirement, "initialMarginRequirement"),
    mmRequirement: toBigIntStrict(row.maintenanceMarginRequirement, "maintenanceMarginRequirement"),
    block: row.asOfBlock,
  };
}

export function normalizeOnchainOrder(row: OnchainOrder & { pool: Address }): OpenOrderSnapshot {
  return {
    pool: toAddressStrict(row.pool, "pool"),
    orderId: toBigIntStrict(row.orderId, "orderId"),
    side: row.isBid ? "long" : "short",
    price: toBigIntStrict(row.price, "price"),
    quantity: toBigIntStrict(row.quantityRemaining, "quantityRemaining"),
    placedAt: null,
  };
}

/** An indexed open order, or `null` when the row is malformed. */
export function normalizeIndexedOrder(row: OpenOrder): OpenOrderSnapshot | null {
  const pool = toAddressOrNull(row.pool);
  const orderId = toBigIntOrNull(row.orderId);
  const price = toBigIntOrNull(row.price);
  const quantity = toBigIntOrNull(row.quantityRemaining);
  if (pool === null || orderId === null || price === null || quantity === null) return null;
  return { pool, orderId, side: row.isBid ? "long" : "short", price, quantity, placedAt: null };
}

/** `null` from the SDK means the bank runs no voucher programme, which is a state, not a failed read. */
export function normalizeVoucher(raw: PerpVoucher | null): VoucherState {
  if (raw === null) return { claimed: false, floor: 0n, expiresAt: null, programme: "off" };
  const expiresAt = toBigIntStrict(raw.expiresAt, "expiresAt");
  return {
    claimed: raw.claimed,
    floor: toBigIntStrict(raw.floor, "floor"),
    expiresAt: expiresAt === 0n ? null : toUnixSecondsOrNull(expiresAt),
    programme: "active",
  };
}

/**
 * The SDK floors its solve at `0n`. For a long that means no positive price trips
 * maintenance from this market alone; for a short it means maintenance is already breached
 * at any positive price. `null` means flat (or, for a long, a price-independent inequality).
 */
export function interpretLiquidationPrice(raw: bigint | null, size: bigint): LiquidationPriceEstimate {
  if (size === 0n) return { kind: "flat" };
  if (raw === null) return size > 0n ? { kind: "unreachable" } : { kind: "flat" };
  if (raw === 0n) return size > 0n ? { kind: "unreachable" } : { kind: "breached" };
  return { kind: "price", price: raw };
}

export const ORDER_TYPE_BY_TIME_IN_FORCE: Readonly<Record<TimeInForce, number>> = {
  GTC: ORDER_TYPE.LIMIT,
  IOC: ORDER_TYPE.MARKET,
  FOK: ORDER_TYPE.FILL_OR_KILL,
  POST_ONLY: ORDER_TYPE.POST_ONLY,
};

export function timeInForceForOrderType(orderType: number): TimeInForce | null {
  for (const [tif, value] of Object.entries(ORDER_TYPE_BY_TIME_IN_FORCE)) {
    if (value === orderType && isTimeInForce(tif)) return tif;
  }
  return null;
}

function isTimeInForce(value: string): value is TimeInForce {
  return value === "GTC" || value === "IOC" || value === "FOK" || value === "POST_ONLY";
}

/** A perp `placeOrder` call, or `null` for any other calldata. */
export function decodePlaceOrderCalldata(data: Hex): DecodedPlaceOrderCall | null {
  let decoded;
  try {
    decoded = decodeFunctionData({ abi: perpPoolWriteAbi, data });
  } catch {
    return null;
  }
  if (decoded.functionName !== "placeOrder") return null;
  const [isBid, userData, price, quantity, expireTimestampNs, orderType, selfMatchingOption, builder, builderFeeBpsTimes1k] =
    decoded.args;
  return {
    isBid,
    userData,
    price,
    quantity,
    expireTimestampNs,
    orderType,
    selfMatchingOption,
    builder: getAddress(builder),
    builderFeeBpsTimes1k,
  };
}

export interface ReceiptDecoding {
  /** The last `OrderPlaced` from the pool, with its resting and cancellation events folded in. */
  placement: PlacementRecord | null;
  /** Fills of the placed order, from the SDK's `decodePlaceOrder`. */
  fills: OrderFillRecord[];
  marginEvents: MarginEventRecord[];
}

type OrderBookEvent = ReturnType<typeof decodeEventLog<typeof orderBookEventsAbi>>;
type MarginBankEvent = ReturnType<typeof decodeEventLog<typeof marginBankEventsAbi>>;

function tryDecodeOrderBook(log: TransactionReceipt["logs"][number]): OrderBookEvent | null {
  try {
    return decodeEventLog({ abi: orderBookEventsAbi, data: log.data, topics: log.topics });
  } catch {
    return null;
  }
}

function tryDecodeMarginBank(log: TransactionReceipt["logs"][number]): MarginBankEvent | null {
  try {
    return decodeEventLog({ abi: marginBankEventsAbi, data: log.data, topics: log.topics });
  } catch {
    return null;
  }
}

function toMarginEventRecord(event: MarginBankEvent): MarginEventRecord | null {
  switch (event.eventName) {
    case "CollateralLocked":
    case "CollateralUnlocked":
    case "DepositedFor":
    case "RebatePaid":
      return {
        kind: event.eventName,
        account: getAddress(event.args.account),
        pool: getAddress(event.args.perpPool),
        amount: event.args.amount,
      };
    case "FeeCharged":
      return {
        kind: "FeeCharged",
        account: getAddress(event.args.account),
        pool: getAddress(event.args.perpPool),
        amount: event.args.amount,
      };
    case "PositionUpdated":
      return {
        kind: "PositionUpdated",
        account: getAddress(event.args.account),
        pool: getAddress(event.args.perpPool),
        newSize: event.args.newSize,
        avgEntryPrice: event.args.avgEntryPrice,
        realizedPnl: event.args.realizedPnl,
      };
    case "FundingSettled":
      return {
        kind: "FundingSettled",
        account: getAddress(event.args.account),
        pool: getAddress(event.args.perpPool),
        payment: event.args.payment,
      };
    case "MainFundedChild":
      return {
        kind: "MainFundedChild",
        child: getAddress(event.args.child),
        payer: getAddress(event.args.payer),
        amount: event.args.amount,
      };
    default:
      return null;
  }
}

/**
 * Decode one placement receipt. Fills come from the SDK's `decodePlaceOrder` so they match
 * what `placePerpOrder` would report. Resting is read from `OrderRested`, not from the order
 * id: Hideki perp pools emit `OrderPlaced` for every placement, a fully filled IOC included.
 */
export function decodePlacementReceipt(receipt: TransactionReceipt, pool: Address, marginBank: Address | null): ReceiptDecoding {
  const target = pool.toLowerCase();
  const bank = marginBank?.toLowerCase() ?? null;
  let placed: Extract<OrderBookEvent, { eventName: "OrderPlaced" }>["args"]["placedOrder"] | null = null;
  const rested = new Set<bigint>();
  const cancelled = new Set<bigint>();
  const marginEvents: MarginEventRecord[] = [];

  for (const log of receipt.logs) {
    const emitter = log.address.toLowerCase();
    if (emitter === target) {
      const event = tryDecodeOrderBook(log);
      if (event?.eventName === "OrderPlaced") placed = event.args.placedOrder;
      else if (event?.eventName === "OrderRested") rested.add(event.args.orderId);
      else if (event?.eventName === "OrderCancelled" || event?.eventName === "OrderCancelledSelfMatch") cancelled.add(event.args.orderId);
    } else if (bank === null || emitter === bank) {
      const event = tryDecodeMarginBank(log);
      const record = event ? toMarginEventRecord(event) : null;
      if (record) marginEvents.push(record);
    }
  }

  const placement: PlacementRecord | null = placed
    ? {
        orderId: placed.orderId,
        owner: getAddress(placed.owner),
        side: placed.isBid ? "long" : "short",
        price: placed.price,
        fullQuantity: placed.fullQuantity,
        quantityRemaining: placed.quantityRemaining,
        rested: rested.has(placed.orderId),
        cancelled: cancelled.has(placed.orderId),
      }
    : null;

  const { fills } = decodePlaceOrder(receipt, pool);
  const ours = placement ? fills.filter((fill) => fill.takerOrderId === placement.orderId) : fills;
  return {
    placement,
    fills: ours.map((fill) => ({
      makerOrderId: fill.makerOrderId,
      takerOrderId: fill.takerOrderId,
      quantity: fill.quantityFilled,
      price: fill.fillPrice,
    })),
    marginEvents,
  };
}

export interface OutcomeInput {
  receiptStatus: "success" | "reverted";
  /** From the decoded calldata. `null` when the calldata is not a placement. */
  requestedQuantity: bigint | null;
  placement: PlacementRecord | null;
  fills: readonly OrderFillRecord[];
}

export interface OutcomeResult {
  outcome: PlacementOutcome;
  filledQuantity: bigint;
  /** Why the outcome is UNKNOWN, when it is. */
  note: string | null;
}

/** FILLED is only ever claimed when decoded fills cover the requested quantity and the pool agrees. */
export function classifyPlacementOutcome(input: OutcomeInput): OutcomeResult {
  const filledQuantity = input.fills.reduce((sum, fill) => sum + fill.quantity, 0n);
  if (input.receiptStatus === "reverted") return { outcome: "REVERTED", filledQuantity: 0n, note: null };
  const { placement, requestedQuantity } = input;
  if (placement === null) {
    return { outcome: "UNKNOWN", filledQuantity, note: "The receipt carries no OrderPlaced event from the pool." };
  }
  if (requestedQuantity !== null && requestedQuantity !== placement.fullQuantity) {
    return { outcome: "UNKNOWN", filledQuantity, note: "The pool recorded a different quantity than the calldata requested." };
  }
  if (placement.fullQuantity - placement.quantityRemaining !== filledQuantity) {
    return { outcome: "UNKNOWN", filledQuantity, note: "Decoded fills do not add up to the quantity the pool reports as matched." };
  }
  if (filledQuantity > 0n && placement.quantityRemaining === 0n) return { outcome: "FILLED", filledQuantity, note: null };
  if (filledQuantity > 0n) return { outcome: "PARTIALLY_FILLED", filledQuantity, note: null };
  if (placement.rested) return { outcome: "RESTING", filledQuantity, note: null };
  return { outcome: "NO_FILL", filledQuantity, note: null };
}

/** bigint to decimal string, recursively, for JSON output. */
export function toJsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, toJsonSafe(inner)]));
  }
  return value;
}
