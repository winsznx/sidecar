import {
  decodeRevert,
  perpPoolWriteAbi,
  type PerpFeedStatus,
  type PerpHealthSnapshot,
  type PerpLiquidationPreview,
  type PerpMarket,
  type PerpMaxOrderSize,
  type PerpOrderMarginPreview,
  type PerpPoolStatus,
  type PerpRiskParams,
  type PerpSystemConfig,
  type SomniaMarkets,
} from "@somnia-chain/markets-sdk";
import { erc20Abi, getAddress, maxUint256, type Address, type Hash, type Transaction, type TransactionReceipt, type WalletClient } from "viem";

import {
  MARGIN_DEPOSIT_GAS_LIMIT,
  NETWORK,
  PERP_ORDER_FEES,
  PERP_ORDER_GAS_LIMIT,
  RECEIPT_TIMEOUT_MS,
  explorerTxUrl,
  sidecarChain,
  type NetworkConfig,
} from "./config";
import { approvalNeeded, decodeDepositCall, decodeDepositReceipt, encodeExactApproval, isExactApproval, verifyDeposit } from "./deposit";
import { classifyError, SidecarAdapterError } from "./errors";
import {
  classifyPlacementOutcome,
  decodePlaceOrderCalldata,
  decodePlacementReceipt,
  interpretLiquidationPrice,
  normalizeIndexedOrder,
  normalizeMarginAccount,
  normalizeMarket,
  normalizeOnchainOrder,
  normalizePosition,
  normalizeVoucher,
  ORDER_TYPE_BY_TIME_IN_FORCE,
  timeInForceForOrderType,
  type ReceiptDecoding,
} from "./normalize";
import { sharedTimingRecorder, type TimingRecorder } from "./timing";
import {
  HIDEKI_CHAIN_ID,
  type AccountAtBlock,
  type AccountSnapshot,
  type BookTopReading,
  type BuiltCall,
  type BuiltMarginDeposit,
  type BuiltOrder,
  type ChainStatus,
  type DecodedPlaceOrderCall,
  type MarginAccountState,
  type MarginDepositSend,
  type MarginDepositStep,
  type MarginEventRecord,
  type MarketFeedStatus,
  type MarketHealth,
  type MarketHealthSnapshot,
  type MarketListing,
  type MarketMeta,
  type MarketRiskParams,
  type OpenOrderSnapshot,
  type OrderIntent,
  type PlacementRecord,
  type PositionSnapshot,
  type Reading,
  type ReadStatus,
  type ReceiptWait,
  type RouteQuote,
  type Source,
  type TruthCheck,
  type VerifiedDeposit,
  type VerifiedOrder,
  type VoucherState,
} from "./types";

export type SystemConfig = PerpSystemConfig;

export interface ReconcileOptions {
  /** The listed markets, so the target pool can be matched to a market and its MarginBank. */
  markets: readonly MarketMeta[];
  /** The order Sidecar meant to send, compared with the decoded calldata. */
  intent?: OrderIntent;
  /** The account selected on screen. */
  expectedAccount?: Address;
  /** The MarginBank the market should settle on. Defaults to the listed market's. */
  expectedMarginBank?: Address;
  /** The other account in the comparison, which must not have funded this order. */
  counterpartAccount?: Address;
}

export interface QuoteOptions {
  /**
   * Model the pool topping margin up from the sender's own wallet. Sidecar always sends from
   * the order owner, which is exactly when the pool pulls, so this defaults to true.
   */
  autoPull?: boolean;
}

export interface ReadAtBlockOptions {
  /** Pools to read open orders on (at most 50). */
  pools?: readonly Address[];
  /** The MarginBank's collateral token, for the wallet balance and allowance. */
  collateralToken?: Address;
}

export interface MarginDepositInput {
  /** The wallet that pays and whose own MarginBank account is credited. */
  account: Address;
  /** Raw collateral units (USDso has 18 decimals). */
  amount: bigint;
  /** The market whose MarginBank and collateral token the deposit funds. */
  market: MarketMeta;
}

export interface SendMarginDepositInput {
  walletClient: WalletClient;
  account: Address;
  built: BuiltMarginDeposit;
  /** Called with each hash the moment the wallet returns it, before any receipt. */
  onSubmitted?: (step: MarginDepositStep, hash: Hash) => void;
  /** Deadline for the approval receipt. Defaults to the adapter's receipt timeout. */
  approvalTimeoutMs?: number;
}

export interface ReconcileDepositOptions {
  /** The account that should have sent and been credited. */
  account: Address;
  /** The MarginBank the deposit should target. */
  marginBank: Address;
  /** The bank's collateral token. Read from the bank's system config when omitted. */
  collateralToken?: Address;
}

export interface PerpsAdapter {
  readonly network: NetworkConfig;
  readonly timing: TimingRecorder;
  getChainStatus(): Promise<ChainStatus>;
  getSystemConfig(marginBank: Address): Promise<SystemConfig>;
  getMarketListing(): Promise<MarketListing>;
  listMarkets(): Promise<MarketMeta[]>;
  getMarketHealth(pool: Address): Promise<MarketHealth>;
  getBookTop(market: MarketMeta): Promise<BookTopReading>;
  getAccountSnapshot(account: Address, marginBank: Address, markets: readonly MarketMeta[]): Promise<AccountSnapshot>;
  quoteRoute(account: Address, intent: OrderIntent, market: MarketMeta, options?: QuoteOptions): Promise<RouteQuote>;
  buildOrder(intent: OrderIntent, market: MarketMeta, options?: { expectedSigner?: Address }): Promise<BuiltOrder>;
  sendOrder(input: { walletClient: WalletClient; account: Address; built: BuiltOrder }): Promise<Hash>;
  waitForReceipt(hash: Hash, options?: { timeoutMs?: number }): Promise<ReceiptWait>;
  reconcileOrder(hash: Hash, options: ReconcileOptions): Promise<VerifiedOrder>;
  readAccountAtBlock(account: Address, marginBank: Address, block: bigint, options?: ReadAtBlockOptions): Promise<AccountAtBlock>;
  buildMarginDeposit(input: MarginDepositInput): Promise<BuiltMarginDeposit>;
  sendMarginDeposit(input: SendMarginDepositInput): Promise<MarginDepositSend>;
  reconcileDeposit(hash: Hash, options: ReconcileDepositOptions): Promise<VerifiedDeposit>;
}

export interface PerpsAdapterOptions {
  network?: NetworkConfig;
  timing?: TimingRecorder;
  now?: () => Date;
  /** Default receipt deadline for waitForReceipt. Falls back to RECEIPT_TIMEOUT_MS (env NEXT_PUBLIC_SIDECAR_RECEIPT_TIMEOUT_MS). */
  receiptTimeoutMs?: number;
}

type Attempt<T> = { ok: true; value: T } | { ok: false; error: unknown };

async function attempt<T>(run: () => Promise<T>): Promise<Attempt<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    return { ok: false, error };
  }
}

function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

function reason(prefix: string, error: unknown): string {
  return `${prefix}: ${classifyError(error).message}`;
}

function errorName(error: unknown): string | null {
  return typeof error === "object" && error !== null && "name" in error && typeof error.name === "string" ? error.name : null;
}

const UNPRICEABLE = "The protocol cannot currently price this market.";
const MAX_REVERT_DETAIL = 160;
const OPEN_ORDER_POOLS_PER_CALL = 50;
const RECEIPT_POLL_MS = 250;

/** Throws INVALID_ORDER unless the intent sits on the market's grid. The UI validates first; this guards the send path. */
export function assertOrderOnGrid(intent: OrderIntent, market: MarketMeta): void {
  const fail = (message: string): never => {
    throw new SidecarAdapterError("INVALID_ORDER", message);
  };
  if (!sameAddress(intent.pool, market.pool)) fail(`The order targets ${intent.pool}, not ${market.displaySymbol} (${market.pool}).`);
  if (intent.quantity <= 0n) fail("Quantity must be greater than zero.");
  if (intent.price <= 0n) fail("Price must be greater than zero.");
  if (intent.quantity % market.lotSize !== 0n) fail(`Quantity must be a multiple of the lot size (${market.lotSize} raw units).`);
  if (intent.quantity < market.minQuantity) fail(`Quantity is below the market minimum (${market.minQuantity} raw units).`);
  if (intent.price % market.tickSize !== 0n) fail(`Price must be a multiple of the tick size (${market.tickSize} raw units).`);
}

export function calldataMatchesIntent(call: DecodedPlaceOrderCall, intent: OrderIntent): boolean {
  return (
    call.isBid === (intent.side === "long") &&
    call.quantity === intent.quantity &&
    call.price === intent.price &&
    call.orderType === ORDER_TYPE_BY_TIME_IN_FORCE[intent.timeInForce]
  );
}

const REVERT_LIKE = new Set(["ContractFunctionRevertedError", "ExecutionRevertedError", "RawContractError", "CallExecutionError"]);

/** A replay that reverted, as opposed to one the RPC failed to answer. */
function isRevertLike(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 12 && typeof current === "object" && current !== null; depth++) {
    const name = "name" in current ? current.name : undefined;
    if (typeof name === "string" && REVERT_LIKE.has(name)) return true;
    const data = "data" in current ? current.data : undefined;
    if (typeof data === "string" && data.startsWith("0x") && data.length >= 10) return true;
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class MissingInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissingInputError";
  }
}

class DeadlineError extends Error {
  constructor(ms: number) {
    super(`The request did not answer within ${Math.round(ms)} ms.`);
    this.name = "DeadlineError";
  }
}

/** Bounds one request so a stalled socket cannot stretch a receipt wait past its deadline. */
async function withDeadline<T>(request: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DeadlineError(ms)), ms);
  });
  try {
    return await Promise.race([request, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

function mapHealthSnapshot(raw: PerpHealthSnapshot, source: Source): Reading<MarketHealthSnapshot> {
  if (!raw.priceable) return { ok: false, reason: UNPRICEABLE, source };
  return {
    ok: true,
    source,
    value: {
      oneBase: raw.oneBase,
      markPrice: raw.markPrice,
      projectedCumulativeFunding: raw.projectedCumulativeFunding,
      effectiveImfBps: raw.effectiveImfBps,
      maintenanceMarginBps: raw.maintenanceMarginBps,
      closeOutMarginBps: raw.closeOutMarginBps,
    },
  };
}

/** Only the signed calldata says what was requested. A local intent is compared in the calldata-intent check, never substituted. */
export function requestedFromCalldata(calldata: DecodedPlaceOrderCall | null): VerifiedOrder["requested"] {
  if (calldata === null) return null;
  return { side: calldata.isBid ? "long" : "short", quantity: calldata.quantity, price: calldata.price, timeInForce: timeInForceForOrderType(calldata.orderType) };
}

export function mapFeedStatus(raw: PerpFeedStatus, source: Source): Reading<MarketFeedStatus> {
  const live = raw.markPriceOk && raw.markPrice > 0n;
  return {
    ok: true,
    source,
    value: {
      markPriceOk: raw.markPriceOk,
      markPrice: raw.markPrice,
      live,
      liveMarkPrice: live ? raw.markPrice : null,
      openInterest: raw.openInterest,
      indexUpdatedAt: raw.indexUpdatedAt === undefined ? null : Number(raw.indexUpdatedAt),
    },
  };
}

function mapRiskParams(raw: PerpRiskParams, source: Source): Reading<MarketRiskParams> {
  return {
    ok: true,
    source,
    value: {
      initialMarginBps: raw.initialMarginBps,
      maintenanceMarginBps: raw.maintenanceMarginBps,
      closeOutMarginBps: raw.closeOutMarginBps,
      maxOpenInterest: raw.maxOpenInterest,
      maxPositionSize: raw.maxPositionSize,
      takerFeeBpsTimes1k: raw.takerFeeBpsTimes1k,
      makerFeeBpsTimes1k: raw.makerFeeBpsTimes1k,
      insuranceFundShareBps: raw.insuranceFundShareBps,
    },
  };
}

function mapMaxSize(max: Extract<PerpMaxOrderSize, { priceable: true }>): NonNullable<RouteQuote["maxSize"]> {
  return {
    maxQuantity: max.maxQuantity,
    placeable: max.placeable,
    limitedBy: max.limitedBy,
    maxPositionSize: max.maxPositionSize,
    positionSize: max.positionSize,
    lotSize: max.lotSize,
    minQuantity: max.minQuantity,
    increasingQuantity: max.increasingQuantity,
    reducingQuantity: max.reducingQuantity,
    lockAmount: max.lockAmount,
    topUpRequired: max.topUpRequired,
    ownWalletPull: max.ownWalletPull,
    mainWalletPull: max.mainWalletPull,
    fundingPayer: max.fundingPayer,
  };
}

function mapMarginPreview(margin: Extract<PerpOrderMarginPreview, { priceable: true }>): NonNullable<RouteQuote["margin"]> {
  return {
    lockAmount: margin.lockAmount,
    imRequirement: margin.imRequirement,
    initialMarginPortion: margin.initialMarginPortion,
    adverseGapPortion: margin.adverseGapPortion,
    feeHeadroom: margin.feeHeadroom,
    topUpRequired: margin.topUpRequired,
    ownWalletPull: margin.ownWalletPull,
    mainWalletPull: margin.mainWalletPull,
    fundingPayer: margin.fundingPayer,
    unlockedCollateral: margin.unlockedCollateral,
    equity: margin.equity,
    sufficient: margin.sufficient,
    hasCollateralForLock: margin.hasCollateralForLock,
    meetsInitialMargin: margin.meetsInitialMargin,
    voucherBlocked: margin.voucherBlocked,
    restrictedBlocked: margin.restrictedBlocked,
    isolationBlocked: margin.isolationBlocked,
    mainFundingBlocked: margin.mainFundingBlocked,
    increasingQuantity: margin.increasingQuantity,
    reducingQuantity: margin.reducingQuantity,
    leverageSurcharge: margin.leverageSurcharge,
    walletCoversTopUp: margin.walletCoversTopUp,
    wallet: margin.wallet,
    mainWalletCapacity: margin.mainWalletCapacity,
  };
}

function mapProjection(liq: Extract<PerpLiquidationPreview, { priceable: true }>): NonNullable<RouteQuote["projection"]> {
  return {
    currentSize: liq.currentSize,
    projectedSize: liq.projectedSize,
    projectedEntryPrice: liq.projectedEntryPrice,
    projectedEquity: liq.projectedEquity,
    projectedMmReq: liq.projectedMmReq,
    currentLiquidationPrice: liq.currentLiquidationPrice,
    projectedLiquidationPrice: liq.projectedLiquidationPrice,
    currentLiquidation: interpretLiquidationPrice(liq.currentLiquidationPrice, liq.currentSize),
    projectedLiquidation: interpretLiquidationPrice(liq.projectedLiquidationPrice, liq.projectedSize),
    realizedPnl: liq.realizedPnl,
    fee: liq.fee,
    projectedPositionLeverageBps: liq.projectedPositionLeverageBps,
  };
}

export function createPerpsAdapter(markets: SomniaMarkets, options: PerpsAdapterOptions = {}): PerpsAdapter {
  const network = options.network ?? NETWORK;
  const timing = options.timing ?? sharedTimingRecorder;
  const now = options.now ?? (() => new Date());
  const receiptTimeoutMs = options.receiptTimeoutMs ?? RECEIPT_TIMEOUT_MS;
  if (!Number.isSafeInteger(receiptTimeoutMs) || receiptTimeoutMs <= 0) {
    throw new Error(`receiptTimeoutMs must be a positive whole number of milliseconds, got ${receiptTimeoutMs}.`);
  }
  const iso = (): string => now().toISOString();
  const sdk = () => markets.client;
  // Taken fresh per call: a client handed out before a socket reset rejects every request.
  const viem = () => markets.client.getViemClient();
  const timed = <T>(operation: string, run: () => Promise<T>): Promise<T> => timing.time(operation, run);
  const headBlock = (): Promise<bigint> => timed("eth_blockNumber", () => viem().getBlockNumber({ cacheTime: 0 }));
  const pinnedSource = (block: bigint, readAt: string, via: string): Source => ({ kind: "chain", block, readAt, via });
  const headSource = (block: bigint, readAt: string, via: string): Source => ({ kind: "chain", block, readAt, via, pinned: false });

  async function getChainStatus(): Promise<ChainStatus> {
    const [chainId, head] = await Promise.all([timed("eth_chainId", () => viem().getChainId()), headBlock()]);
    return { chainId, expectedChainId: HIDEKI_CHAIN_ID, matches: chainId === HIDEKI_CHAIN_ID, headBlock: head, readAt: iso() };
  }

  async function getSystemConfig(marginBank: Address): Promise<SystemConfig> {
    return timed("getPerpSystemConfig", () => sdk().getPerpSystemConfig(marginBank));
  }

  async function readGates(banks: readonly Address[]): Promise<Map<string, PerpPoolStatus>> {
    const configs = await Promise.all(banks.map((bank) => getSystemConfig(bank)));
    const factories = [...new Set(configs.map((config) => config.perpPoolFactory))];
    const statuses = await Promise.all(
      factories.map((factory) => timed("listPerpPoolStatuses", () => sdk().listPerpPoolStatuses({ factory }))),
    );
    return new Map(statuses.flat().map((status) => [status.pool.toLowerCase(), status]));
  }

  /** Chain-only discovery for an indexer outage. History-derived fields come back as the SDK's placeholders. */
  async function discoverFromChain(): Promise<{ rows: PerpMarket[]; gates: Map<string, PerpPoolStatus> }> {
    const candidateBank = sdk().config.addresses?.marginBank;
    if (!candidateBank) throw new Error("No MarginBank is configured for chain-only market discovery.");
    const config = await getSystemConfig(candidateBank);
    const [statuses, collateral] = await Promise.all([
      timed("listPerpPoolStatuses", () => sdk().listPerpPoolStatuses({ factory: config.perpPoolFactory })),
      timed("getErc20Metadata", () => sdk().getErc20Metadata(config.collateralToken)),
    ]);
    const rows = await Promise.all(
      statuses
        .filter((status) => status.registered !== false)
        .map((status) =>
          timed("readPerpMarketFromChain", () =>
            sdk().readPerpMarketFromChain({
              status,
              collateralToken: config.collateralToken,
              collateralDecimals: collateral.decimals,
              collateralSymbol: collateral.symbol,
              factory: config.perpPoolFactory,
            }),
          ),
        ),
    );
    return { rows, gates: new Map(statuses.map((status) => [status.pool.toLowerCase(), status])) };
  }

  async function getMarketListing(): Promise<MarketListing> {
    const readAt = iso();
    const indexed = await attempt(() => timed("listPerpMarkets", () => sdk().listPerpMarkets()));
    let rows: PerpMarket[];
    let source: Source;
    let gates: Map<string, PerpPoolStatus> | null = null;
    let gateFailure = "Not checked.";

    if (indexed.ok) {
      rows = indexed.value;
      source = { kind: "indexer", readAt, via: "listPerpMarkets" };
      const banks = [...new Set(rows.map((row) => getAddress(row.marginBank)))];
      const read = await attempt(() => readGates(banks));
      if (read.ok) gates = read.value;
      else gateFailure = reason("Tradeable gates unavailable", read.error);
    } else {
      const discovered = await attempt(discoverFromChain);
      if (!discovered.ok) throw new AggregateError([indexed.error, discovered.error], "Neither the indexer nor the chain could list markets.");
      rows = discovered.value.rows;
      gates = discovered.value.gates;
      source = headSource(await headBlock(), readAt, "listPerpPoolStatuses+readPerpMarketFromChain");
    }

    return {
      markets: rows.map((row) => normalizeMarket(row, gates?.get(row.poolAddress.toLowerCase()) ?? null)),
      source,
      gates: gates ? { status: "ok", readAt, via: "listPerpPoolStatuses" } : { status: "unavailable", reason: gateFailure },
    };
  }

  async function getMarketHealth(pool: Address): Promise<MarketHealth> {
    const readAt = iso();
    const [head, snapshot, feed, risk] = await Promise.all([
      attempt(headBlock),
      attempt(() => timed("getPerpHealthSnapshot", () => sdk().getPerpHealthSnapshot(pool))),
      attempt(() => timed("getPerpFeedStatus", () => sdk().getPerpFeedStatus(pool))),
      attempt(() => timed("getPerpRiskParams", () => sdk().getPerpRiskParams(pool))),
    ]);
    const errors: string[] = [];
    if (!head.ok) errors.push(reason("Chain head unavailable", head.error));

    // These SDK reads answer at head without reporting a block, so each is dated by the head read beside it.
    const toReading = <Raw, T>(result: Attempt<Raw>, label: string, via: string, map: (raw: Raw, source: Source) => Reading<T>): Reading<T> => {
      if (!result.ok) {
        const message = reason(`${label} unavailable`, result.error);
        errors.push(message);
        return { ok: false, reason: message };
      }
      if (!head.ok) return { ok: false, reason: `${label} was read, but no chain head could be read to date it.` };
      return map(result.value, headSource(head.value, readAt, via));
    };

    const snapshotReading = toReading(snapshot, "Health snapshot", "getPerpHealthSnapshot", mapHealthSnapshot);
    const status: MarketHealth["status"] = snapshotReading.ok ? "priceable" : snapshot.ok && head.ok ? "unpriceable" : "error";
    return {
      pool: getAddress(pool),
      readAt,
      status,
      snapshot: snapshotReading,
      feed: toReading(feed, "Feed status", "getPerpFeedStatus", mapFeedStatus),
      risk: toReading(risk, "Risk parameters", "getPerpRiskParams", mapRiskParams),
      errors,
    };
  }

  async function getBookTop(market: MarketMeta): Promise<BookTopReading> {
    const id = market.pool.toLowerCase();
    const result = await timed("getBookTopsOnchain", () => sdk().getBookTopsOnchain([{ id, poolAddress: market.pool }]));
    const top = result.tops[id];
    const parse = (value: string | null | undefined): bigint | null => (value ? BigInt(value) : null);
    return { pool: market.pool, bestBid: parse(top?.bestBid), bestAsk: parse(top?.bestAsk), block: result.blockNumber, readAt: iso() };
  }

  async function readOpenOrders(account: Address, pools: readonly Address[], block: bigint | null, readAt: string): Promise<AccountSnapshot["openOrders"]> {
    if (pools.length === 0) return { status: "unavailable", reason: "No listed markets to read open orders from." };
    const chunks: Address[][] = [];
    for (let i = 0; i < pools.length; i += OPEN_ORDER_POOLS_PER_CALL) chunks.push(pools.slice(i, i + OPEN_ORDER_POOLS_PER_CALL));
    const chain = await attempt(() =>
      Promise.all(
        chunks.map((chunk) =>
          timed("getOpenOrdersOnchain", () => sdk().getOpenOrdersOnchain(chunk, account, block === null ? undefined : { blockNumber: block })),
        ),
      ),
    );
    if (chain.ok) {
      const pinned = chain.value[0]?.blockNumber;
      if (pinned !== undefined) {
        return {
          status: "ok",
          orders: chain.value.flatMap((result) => result.orders.map((row) => normalizeOnchainOrder(row))),
          source: pinnedSource(pinned, readAt, "getOpenOrdersOnchain"),
        };
      }
    }
    const indexed = await attempt(() =>
      timed("getOpenOrders", () => sdk().getOpenOrders(account, { pools: pools.map((p) => p.toLowerCase()), limit: 200 })),
    );
    if (indexed.ok) {
      return {
        status: "ok",
        orders: indexed.value.map(normalizeIndexedOrder).filter((row): row is OpenOrderSnapshot => row !== null),
        source: { kind: "indexer", readAt: iso(), via: "getOpenOrders" },
      };
    }
    const chainReason = chain.ok ? "The chain read reported no block." : reason("Chain open-order read failed", chain.error);
    return { status: "unavailable", reason: `${chainReason} ${reason("Indexer fallback failed", indexed.error)}` };
  }

  async function readPositions(
    bank: Address,
    owner: Address,
    symbolByPool: ReadonlyMap<string, string>,
    issues: string[],
  ): Promise<{ readable: boolean; positions: PositionSnapshot[]; block: bigint | null; unpriceable: boolean }> {
    const result = await attempt(() => timed("listPerpPositionAnalytics", () => sdk().listPerpPositionAnalytics({ marginBank: bank, account: owner })));
    if (!result.ok) {
      issues.push(reason("Positions unavailable", result.error));
      return { readable: false, positions: [], block: null, unpriceable: classifyError(result.error).code === "MARK_UNAVAILABLE" };
    }
    const symbolFor = (pool: Address): string | null => symbolByPool.get(pool.toLowerCase()) ?? null;
    const unpriceableRows = result.value.filter((row) => !row.priceable && row.size !== 0n);
    if (unpriceableRows.length > 0) issues.push("At least one market this account holds cannot be priced right now.");
    const resolved = await Promise.all(
      result.value.map(async (row) => {
        if (row.priceable || row.size === 0n) return normalizePosition(row, symbolFor);
        // The unpriceable analytics row drops the entry price; the stored position still has it.
        const stored = await attempt(() => timed("getPerpPosition", () => sdk().getPerpPosition({ marginBank: bank, account: owner, pool: row.pool })));
        if (stored.ok) return normalizePosition(row, symbolFor, stored.value.avgEntryPrice);
        issues.push(reason(`A position in ${symbolFor(row.pool) ?? row.pool} (size ${row.size}) could not be read in full`, stored.error));
        return null;
      }),
    );
    return {
      readable: true,
      positions: resolved.filter((p): p is PositionSnapshot => p !== null),
      block: result.value[0]?.asOfBlock ?? null,
      unpriceable: unpriceableRows.length > 0,
    };
  }

  async function getAccountSnapshot(account: Address, marginBank: Address, listed: readonly MarketMeta[]): Promise<AccountSnapshot> {
    const owner = getAddress(account);
    const bank = getAddress(marginBank);
    const readAt = iso();
    const issues: string[] = [];
    const onBank = listed.filter((m) => sameAddress(m.marginBank, bank));
    const symbolByPool = new Map(onBank.map((m) => [m.pool.toLowerCase(), m.baseSymbol]));
    const collateralToken = onBank[0]?.quoteToken ?? null;

    // One head read anchors the reads that accept a block pin, so balances and orders describe one state.
    const anchorRead = await attempt(headBlock);
    const anchor = anchorRead.ok ? anchorRead.value : null;
    if (!anchorRead.ok) issues.push(reason("Chain head unavailable, so wallet balances were not read", anchorRead.error));

    const [marginRead, positionsRead, voucherRead, gasRead, balanceRead, allowanceRead, openOrders] = await Promise.all([
      attempt(() => timed("getMarginAccount", () => sdk().getMarginAccount(bank, owner))),
      readPositions(bank, owner, symbolByPool, issues),
      attempt(() => timed("getPerpVoucher", () => sdk().getPerpVoucher(bank, owner))),
      anchor === null ? null : attempt(() => timed("eth_getBalance", () => viem().getBalance({ address: owner, blockNumber: anchor }))),
      anchor === null || collateralToken === null
        ? null
        : attempt(() =>
            timed("erc20.balanceOf", () =>
              viem().readContract({ address: collateralToken, abi: erc20Abi, functionName: "balanceOf", args: [owner], blockNumber: anchor }),
            ),
          ),
      anchor === null || collateralToken === null
        ? null
        : attempt(() =>
            timed("erc20.allowance", () =>
              viem().readContract({ address: collateralToken, abi: erc20Abi, functionName: "allowance", args: [owner, bank], blockNumber: anchor }),
            ),
          ),
      readOpenOrders(
        owner,
        onBank.map((m) => m.pool),
        anchor,
        readAt,
      ),
    ]);

    let margin: MarginAccountState | null = null;
    let marginBlock: bigint | null = null;
    let unpriceable = positionsRead.unpriceable;
    if (marginRead.ok) {
      margin = normalizeMarginAccount(marginRead.value);
      marginBlock = marginRead.value.asOfBlock;
    } else {
      if (classifyError(marginRead.error).code === "MARK_UNAVAILABLE") unpriceable = true;
      issues.push(reason("Margin account unavailable", marginRead.error));
    }

    let voucher: VoucherState | null = null;
    if (voucherRead.ok) voucher = normalizeVoucher(voucherRead.value);
    else issues.push(reason("Voucher state unavailable", voucherRead.error));

    let gasBalance: bigint | null = null;
    if (gasRead?.ok) gasBalance = gasRead.value;
    else if (gasRead) issues.push(reason("STT balance unavailable", gasRead.error));

    let walletCollateral: AccountSnapshot["walletCollateral"] = null;
    if (balanceRead?.ok && allowanceRead?.ok) walletCollateral = { balance: balanceRead.value, allowanceToBank: allowanceRead.value };
    else if (balanceRead && !balanceRead.ok) issues.push(reason("Wallet USDso unavailable", balanceRead.error));
    else if (allowanceRead && !allowanceRead.ok) issues.push(reason("Wallet USDso allowance unavailable", allowanceRead.error));
    else if (collateralToken === null) issues.push("No listed market names the collateral token for this MarginBank.");

    if (openOrders.status === "unavailable") issues.push(openOrders.reason);
    else if (openOrders.source.kind === "indexer") issues.push("Open orders came from the indexer, which can lag the chain.");

    const block = marginBlock ?? anchor;
    if (block === null) {
      throw marginRead.ok ? new Error("No read for this account could be dated to a block.") : marginRead.error;
    }
    // An empty analytics list reports no block; it is grounded on the margin read's active-pool list.
    const positionsBlock = positionsRead.readable ? (positionsRead.block ?? marginBlock) : null;
    const incomplete =
      margin === null ||
      !positionsRead.readable ||
      voucher === null ||
      gasBalance === null ||
      walletCollateral === null ||
      openOrders.status === "unavailable" ||
      openOrders.source.kind !== "chain" ||
      issues.length > 0;
    const readStatus: ReadStatus = unpriceable
      ? "unpriceable"
      : margin === null && !positionsRead.readable
        ? "error"
        : incomplete
          ? "partial"
          : "verified";

    return {
      chainId: HIDEKI_CHAIN_ID,
      account: owner,
      marginBank: bank,
      block,
      readAt,
      margin,
      positions: positionsRead.positions,
      positionsBlock,
      voucher,
      gasBalance,
      walletCollateral,
      openOrders,
      readStatus,
      issues,
      sources: {
        margin: marginBlock !== null ? pinnedSource(marginBlock, readAt, "getMarginAccount") : null,
        positions: positionsBlock !== null ? { kind: "sdk", block: positionsBlock, readAt, via: "listPerpPositionAnalytics" } : null,
        voucher: voucher !== null && anchor !== null ? headSource(anchor, readAt, "getPerpVoucher") : null,
        gasBalance: gasBalance !== null && anchor !== null ? pinnedSource(anchor, readAt, "eth_getBalance") : null,
        walletCollateral: walletCollateral !== null && anchor !== null ? pinnedSource(anchor, readAt, "erc20 balanceOf/allowance") : null,
      },
    };
  }

  async function quoteRoute(account: Address, intent: OrderIntent, market: MarketMeta, quoteOptions: QuoteOptions = {}): Promise<RouteQuote> {
    if (!sameAddress(intent.pool, market.pool)) {
      throw new SidecarAdapterError("INVALID_ORDER", `The order targets ${intent.pool}, not ${market.displaySymbol}.`);
    }
    const autoPull = quoteOptions.autoPull ?? true;
    const owner = getAddress(account);
    const readAt = iso();
    const base = { pool: market.pool, marginBank: market.marginBank, account: owner, isBid: intent.side === "long" };
    const [maxRead, marginRead, liqRead] = await Promise.all([
      attempt(() => timed("getMaxPerpOrderSize", () => sdk().getMaxPerpOrderSize({ ...base, price: intent.price, autoPull }))),
      attempt(() =>
        timed("previewPerpOrderMargin", () => sdk().previewPerpOrderMargin({ ...base, quantity: intent.quantity, price: intent.price, autoPull })),
      ),
      attempt(() =>
        timed("previewPerpLiquidationPrice", () => sdk().previewPerpLiquidationPrice({ ...base, quantity: intent.quantity, price: intent.price })),
      ),
    ]);
    if (!maxRead.ok && !marginRead.ok && !liqRead.ok) {
      throw new AggregateError([maxRead.error, marginRead.error, liqRead.error], "Every order preview failed.");
    }

    const errors: string[] = [];
    if (!maxRead.ok) errors.push(reason("Max order size unavailable", maxRead.error));
    if (!marginRead.ok) errors.push(reason("Margin preview unavailable", marginRead.error));
    if (!liqRead.ok) errors.push(reason("Liquidation preview unavailable", liqRead.error));

    const max = maxRead.ok ? maxRead.value : null;
    const margin = marginRead.ok ? marginRead.value : null;
    const liq = liqRead.ok ? liqRead.value : null;
    const answered = [max, margin, liq].filter((r) => r !== null);
    const priceable = answered.every((r) => r.priceable);
    if (!priceable) errors.push(UNPRICEABLE);

    const marginOk = margin?.priceable ? margin : null;
    const maxOk = max?.priceable ? max : null;
    const liqOk = liq?.priceable ? liq : null;
    const block = margin?.asOfBlock ?? max?.asOfBlock ?? liq?.asOfBlock;
    if (block === undefined) throw new Error("No order preview reported a block.");

    return {
      account: owner,
      intent,
      block,
      readAt,
      priceable,
      markPrice: marginOk?.markPrice ?? maxOk?.markPrice ?? liqOk?.markPrice ?? null,
      effectiveImfBps: marginOk?.effectiveImfBps ?? maxOk?.effectiveImfBps ?? null,
      maxSize: maxOk ? mapMaxSize(maxOk) : null,
      margin: marginOk ? mapMarginPreview(marginOk) : null,
      projection: liqOk ? mapProjection(liqOk) : null,
      errors,
      blocks: { maxSize: max?.asOfBlock ?? null, margin: margin?.asOfBlock ?? null, projection: liq?.asOfBlock ?? null },
      autoPull,
    };
  }

  async function buildOrder(intent: OrderIntent, market: MarketMeta, buildOptions: { expectedSigner?: Address } = {}): Promise<BuiltOrder> {
    assertOrderOnGrid(intent, market);
    const signer = markets.walletAddress;
    if (!signer) throw new SidecarAdapterError("SIGNER_MISSING", "No wallet is bound to the SDK, so the order cannot be built.");
    if (buildOptions.expectedSigner && !sameAddress(signer, buildOptions.expectedSigner)) {
      throw new SidecarAdapterError("SIGNER_MISMATCH", "The bound wallet is not the selected account.", {
        expectedAccount: getAddress(buildOptions.expectedSigner),
        actualAccount: getAddress(signer),
      });
    }
    const orderType = ORDER_TYPE_BY_TIME_IN_FORCE[intent.timeInForce];
    const { order: call } = await timed("buildPlacePerpOrder", () =>
      markets.trader.buildPlacePerpOrder({
        pool: market.pool,
        isBid: intent.side === "long",
        price: intent.price,
        quantity: intent.quantity,
        orderType,
        gas: PERP_ORDER_GAS_LIMIT,
      }),
    );
    if (call.chainId !== HIDEKI_CHAIN_ID) {
      throw new SidecarAdapterError("WRONG_CHAIN", `The SDK built the order for chain ${call.chainId}.`, {
        expectedChainId: HIDEKI_CHAIN_ID,
        actualChainId: call.chainId,
      });
    }
    const decoded = decodePlaceOrderCalldata(call.data);
    if (!sameAddress(call.to, market.pool) || decoded === null || !calldataMatchesIntent(decoded, intent)) {
      throw new SidecarAdapterError("INVALID_ORDER", "The built calldata does not encode the requested order.");
    }
    // The SDK's unsigned call drops the gas field, so the ceiling travels with the built order instead.
    return {
      chainId: HIDEKI_CHAIN_ID,
      to: getAddress(call.to),
      data: call.data,
      value: call.value,
      gas: PERP_ORDER_GAS_LIMIT,
      description: call.description,
      orderType,
      intent,
      builtAt: iso(),
    };
  }

  async function sendOrder({ walletClient, account, built }: { walletClient: WalletClient; account: Address; built: BuiltOrder }): Promise<Hash> {
    const walletAccount = walletClient.account;
    if (!walletAccount) throw new SidecarAdapterError("SIGNER_MISSING", "The wallet client has no account to sign with.");
    if (!sameAddress(walletAccount.address, account)) {
      throw new SidecarAdapterError("SIGNER_MISMATCH", "The connected wallet is not the selected account.", {
        expectedAccount: getAddress(account),
        actualAccount: getAddress(walletAccount.address),
      });
    }
    const decoded = decodePlaceOrderCalldata(built.data);
    if (built.chainId !== HIDEKI_CHAIN_ID || decoded === null || !calldataMatchesIntent(decoded, built.intent) || !sameAddress(built.to, built.intent.pool)) {
      throw new SidecarAdapterError("INVALID_ORDER", "The prepared transaction no longer matches its order.");
    }
    const walletChainId = await timed("wallet.getChainId", () => walletClient.getChainId());
    if (walletChainId !== HIDEKI_CHAIN_ID) {
      throw new SidecarAdapterError("WRONG_CHAIN", `The wallet is on chain ${walletChainId}.`, {
        expectedChainId: HIDEKI_CHAIN_ID,
        actualChainId: walletChainId,
      });
    }
    // Passing `chain` makes viem assert the wallet's chain again immediately before it signs.
    return timed("wallet.sendTransaction", () =>
      walletClient.sendTransaction({
        account: walletAccount,
        chain: sidecarChain(network),
        to: built.to,
        data: built.data,
        value: built.value,
        gas: built.gas,
        maxFeePerGas: PERP_ORDER_FEES.maxFeePerGas,
        maxPriorityFeePerGas: PERP_ORDER_FEES.maxPriorityFeePerGas,
      }),
    );
  }

  /**
   * Polls eth_getTransactionReceipt on a fixed interval instead of using viem's
   * waitForTransactionReceipt. viem re-checks only when it observes a new block number and
   * skips a block that arrives while its previous check is still running. A transaction that
   * mines during that check, followed by no further block (an automining fork, or a quiet
   * chain), is then never re-checked and the wait runs out its deadline with the receipt
   * already on chain. A time-based poll does not depend on block cadence at all.
   */
  async function waitForReceipt(hash: Hash, waitOptions: { timeoutMs?: number } = {}): Promise<ReceiptWait> {
    const timeout = waitOptions.timeoutMs ?? receiptTimeoutMs;
    const started = performance.now();
    let lastFailure: unknown = null;
    return timed("waitForReceipt", async () => {
      for (;;) {
        const read = await attempt(() => withDeadline(viem().getTransactionReceipt({ hash }), Math.max(timeout - (performance.now() - started), RECEIPT_POLL_MS)));
        const waitedMs = performance.now() - started;
        if (read.ok) {
          const mined = { hash: read.value.transactionHash, block: read.value.blockNumber, gasUsed: read.value.gasUsed, waitedMs };
          return read.value.status === "success" ? { status: "success", ...mined } : { status: "reverted", ...mined };
        }
        // Only a failure on the latest answered look makes the end state "error"; a clean not-found after a blip is a timeout.
        if (!(read.error instanceof DeadlineError)) lastFailure = errorName(read.error) === "TransactionReceiptNotFoundError" ? null : read.error;
        if (waitedMs >= timeout) {
          return lastFailure === null
            ? { status: "timeout", hash, waitedMs }
            : { status: "error", hash, reason: classifyError(lastFailure).message, waitedMs };
        }
        await sleep(Math.max(Math.min(RECEIPT_POLL_MS, timeout - waitedMs), 0));
      }
    });
  }

  async function replayRevert(tx: Transaction, receipt: TransactionReceipt): Promise<{ reason: string; source: NonNullable<VerifiedOrder["revertSource"]> }> {
    const target = tx.to;
    if (target === null) return { reason: "The transaction created a contract; there is no call to replay.", source: "not-recoverable" };
    const attempts: ReadonlyArray<readonly [bigint, "parent-block-replay" | "receipt-block-replay"]> = [
      [receipt.blockNumber - 1n, "parent-block-replay"],
      [receipt.blockNumber, "receipt-block-replay"],
    ];
    const notes: string[] = [];
    for (const [blockNumber, source] of attempts) {
      const replay = await attempt(() =>
        timed("eth_call.replay", () => viem().call({ account: tx.from, to: target, data: tx.input, value: tx.value, gas: tx.gas, blockNumber })),
      );
      if (replay.ok) {
        notes.push(`the replay at block ${blockNumber} did not revert`);
        continue;
      }
      if (!isRevertLike(replay.error)) {
        notes.push(`the replay at block ${blockNumber} failed: ${classifyError(replay.error).message}`);
        continue;
      }
      const decoded = decodeRevert(replay.error);
      if (decoded.errorName) return { reason: decoded.errorName, source };
      if (decoded.reason) return { reason: `reverted: ${decoded.reason.slice(0, MAX_REVERT_DETAIL)}`, source };
      notes.push(`the replay at block ${blockNumber} reverted with no decodable data`);
    }
    return { reason: `Reverted; the reason could not be recovered (${notes.join("; ")}).`, source: "not-recoverable" };
  }

  async function fetchMined(hash: Hash): Promise<{ tx: Transaction; receipt: TransactionReceipt }> {
    const pc = viem();
    const tx = await attempt(() => timed("eth_getTransactionByHash", () => pc.getTransaction({ hash })));
    if (!tx.ok) {
      if (errorName(tx.error) === "TransactionNotFoundError") {
        throw new SidecarAdapterError("TX_NOT_FOUND", "The network has no transaction with this hash.", { hash });
      }
      throw tx.error;
    }
    const receipt = await attempt(() => timed("eth_getTransactionReceipt", () => pc.getTransactionReceipt({ hash })));
    if (!receipt.ok) {
      if (errorName(receipt.error) === "TransactionReceiptNotFoundError") {
        throw new SidecarAdapterError("OUTCOME_UNKNOWN", "The transaction is known but not mined yet.", { hash });
      }
      throw receipt.error;
    }
    return { tx: tx.value, receipt: receipt.value };
  }

  async function reconcileOrder(hash: Hash, reconcile: ReconcileOptions): Promise<VerifiedOrder> {
    const readAt = iso();
    const { tx, receipt } = await fetchMined(hash);
    const pc = viem();
    const from = getAddress(tx.from);
    const to = tx.to ? getAddress(tx.to) : null;
    const market = to ? (reconcile.markets.find((m) => sameAddress(m.pool, to)) ?? null) : null;
    const expectedBank = reconcile.expectedMarginBank ?? market?.marginBank ?? null;
    const calldata = decodePlaceOrderCalldata(tx.input);
    const decoding: ReceiptDecoding = to ? decodePlacementReceipt(receipt, to, expectedBank) : { placement: null, fills: [], marginEvents: [] };
    const placement = decoding.placement;
    const { outcome, filledQuantity, note } = classifyPlacementOutcome({
      receiptStatus: receipt.status,
      requestedQuantity: calldata?.quantity ?? null,
      placement,
      fills: decoding.fills,
    });

    const [rpcChainId, poolBank, minedBlock, revert] = await Promise.all([
      timed("eth_chainId", () => pc.getChainId()),
      to
        ? attempt(() => timed("pool.marginBank", () => pc.readContract({ address: to, abi: perpPoolWriteAbi, functionName: "marginBank", blockNumber: receipt.blockNumber })))
        : Promise.resolve(null),
      attempt(() => timed("eth_getBlockByNumber", () => pc.getBlock({ blockNumber: receipt.blockNumber }))),
      receipt.status === "reverted" ? replayRevert(tx, receipt) : Promise.resolve(null),
    ]);

    const requested = requestedFromCalldata(calldata);

    const checks = buildTruthChecks({
      rpcChainId,
      txChainId: tx.chainId ?? null,
      from,
      to,
      market,
      expectedAccount: reconcile.expectedAccount ?? null,
      expectedBank,
      poolBank: poolBank?.ok ? getAddress(poolBank.value) : null,
      receiptStatus: receipt.status,
      block: receipt.blockNumber,
      revertReason: revert?.reason ?? null,
      calldata,
      intent: reconcile.intent ?? null,
      placement,
      filledQuantity,
      outcomeNote: note,
      outcome,
      marginEvents: decoding.marginEvents,
      counterpart: reconcile.counterpartAccount ?? null,
    });

    return {
      hash,
      chainId: rpcChainId,
      receiptStatus: receipt.status,
      from,
      to,
      block: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
      orderId: placement?.rested ? placement.orderId : null,
      fills: decoding.fills,
      filledQuantity,
      requested,
      market,
      outcome,
      revertReason: revert?.reason ?? null,
      explorerUrl: explorerTxUrl(hash, network),
      checks,
      readAt,
      placement,
      marginEvents: decoding.marginEvents,
      calldata,
      revertSource: revert?.source ?? null,
      effectiveGasPrice: receipt.effectiveGasPrice ?? null,
      feePaid: receipt.effectiveGasPrice !== undefined ? receipt.gasUsed * receipt.effectiveGasPrice : null,
      blockTimestamp: minedBlock.ok ? Number(minedBlock.value.timestamp) : null,
    };
  }

  async function readAccountAtBlock(account: Address, marginBank: Address, block: bigint, readOptions: ReadAtBlockOptions = {}): Promise<AccountAtBlock> {
    const owner = getAddress(account);
    const bank = getAddress(marginBank);
    const readAt = iso();
    const pools = (readOptions.pools ?? []).slice(0, OPEN_ORDER_POOLS_PER_CALL);
    const token = readOptions.collateralToken ?? null;
    const issues: string[] = [];
    const missing = (what: string): Promise<never> => Promise.reject(new MissingInputError(`No ${what} was supplied, so this read was not attempted.`));

    const [equity, orders, gas, balance, allowance] = await Promise.all([
      attempt(() => timed("getAccountEquity@block", () => sdk().getAccountEquity(owner, { scope: "perps", marginBank: bank, blockNumber: block }))),
      attempt(() =>
        pools.length > 0 ? timed("getOpenOrdersOnchain@block", () => sdk().getOpenOrdersOnchain([...pools], owner, { blockNumber: block })) : missing("pool list"),
      ),
      attempt(() => timed("eth_getBalance@block", () => viem().getBalance({ address: owner, blockNumber: block }))),
      attempt(() =>
        token
          ? timed("erc20.balanceOf@block", () => viem().readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner], blockNumber: block }))
          : missing("collateral token"),
      ),
      attempt(() =>
        token
          ? timed("erc20.allowance@block", () =>
              viem().readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [owner, bank], blockNumber: block }),
            )
          : missing("collateral token"),
      ),
    ]);
    const source = (via: string): Source => pinnedSource(block, readAt, via);
    const unavailable = <T>(label: string, error: unknown): Reading<T> => {
      const message = error instanceof MissingInputError ? `${label}: ${error.message}` : reason(label, error);
      issues.push(message);
      return { ok: false, reason: message };
    };

    return {
      account: owner,
      marginBank: bank,
      block,
      readAt,
      historicalReads: [equity, orders, gas, balance].some((r) => r.ok) ? "supported" : "unsupported",
      equity: equity.ok
        ? {
            ok: true,
            value: { equity: equity.value.equity, lockedCollateral: equity.value.lockedCollateral, totalEquity: equity.value.totalEquity },
            source: source("getAccountEquity"),
          }
        : unavailable("Equity unavailable at this block", equity.error),
      openOrders: orders.ok
        ? { ok: true, value: orders.value.orders.map((row) => normalizeOnchainOrder(row)), source: source("getOpenOrdersOnchain") }
        : unavailable("Open orders unavailable at this block", orders.error),
      gasBalance: gas.ok ? { ok: true, value: gas.value, source: source("eth_getBalance") } : unavailable("STT balance unavailable at this block", gas.error),
      walletCollateral:
        balance.ok && allowance.ok
          ? { ok: true, value: { balance: balance.value, allowanceToBank: allowance.value }, source: source("erc20 balanceOf/allowance") }
          : unavailable("Wallet USDso unavailable at this block", balance.ok ? (allowance.ok ? null : allowance.error) : balance.error),
      positions: {
        ok: false,
        reason: "The SDK has no block-pinned position read: getPerpPosition and listPerpPositionAnalytics answer at head only.",
      },
      issues,
    };
  }

  async function readCollateral(owner: Address, bank: Address, token: Address, block: bigint | undefined): Promise<{ balance: bigint; allowance: bigint }> {
    const [balance, allowance] = await Promise.all([
      timed("erc20.balanceOf", () => viem().readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner], blockNumber: block })),
      timed("erc20.allowance", () => viem().readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [owner, bank], blockNumber: block })),
    ]);
    return { balance, allowance };
  }

  async function buildMarginDeposit({ account, amount, market }: MarginDepositInput): Promise<BuiltMarginDeposit> {
    const invalid = (message: string): never => {
      throw new SidecarAdapterError("INVALID_DEPOSIT", message);
    };
    const owner = getAddress(account);
    const bank = getAddress(market.marginBank);
    const token = getAddress(market.quoteToken);
    if (amount <= 0n) invalid("The deposit amount must be greater than zero.");
    if (amount >= maxUint256) invalid("The deposit amount is the unlimited-approval sentinel, not an amount.");
    const signer = markets.walletAddress;
    if (!signer) throw new SidecarAdapterError("SIGNER_MISSING", "No wallet is bound to the SDK, so the deposit cannot be built.");
    if (!sameAddress(signer, owner)) {
      throw new SidecarAdapterError("SIGNER_MISMATCH", "The bound wallet is not the depositing account.", { expectedAccount: owner, actualAccount: getAddress(signer) });
    }

    const [config, block] = await Promise.all([getSystemConfig(bank), headBlock()]);
    if (!sameAddress(config.collateralToken, token)) {
      invalid(`The MarginBank's collateral token is ${config.collateralToken}, not the market's quote token ${token}.`);
    }
    const { balance, allowance } = await readCollateral(owner, bank, token, block);
    if (balance < amount) invalid(`The wallet holds ${balance} raw units of collateral at block ${block}, less than the ${amount} requested.`);

    // autoApprove false: the SDK's own approval is always maxUint256, and Sidecar approves only what this deposit pulls.
    const { deposit: call } = await timed("buildDepositMargin", () =>
      markets.trader.buildDepositMargin({ marginBank: bank, amount, collateral: token, autoApprove: false, gas: MARGIN_DEPOSIT_GAS_LIMIT }),
    );
    if (call.chainId !== HIDEKI_CHAIN_ID) {
      throw new SidecarAdapterError("WRONG_CHAIN", `The SDK built the deposit for chain ${call.chainId}.`, { expectedChainId: HIDEKI_CHAIN_ID, actualChainId: call.chainId });
    }
    if (!sameAddress(call.to, bank) || call.value !== 0n || decodeDepositCall(call.data) !== amount) {
      invalid("The SDK's call does not encode deposit(amount) on this MarginBank.");
    }

    const approval: BuiltCall | null = approvalNeeded(allowance, amount)
      ? {
          chainId: HIDEKI_CHAIN_ID,
          to: token,
          data: encodeExactApproval(bank, amount),
          value: 0n,
          gas: MARGIN_DEPOSIT_GAS_LIMIT,
          description: `Approve the MarginBank to pull exactly ${amount} raw units of ${market.quoteSymbol}`,
        }
      : null;
    return {
      chainId: HIDEKI_CHAIN_ID,
      account: owner,
      marginBank: bank,
      collateralToken: token,
      amount,
      approval,
      deposit: { chainId: HIDEKI_CHAIN_ID, to: getAddress(call.to), data: call.data, value: 0n, gas: MARGIN_DEPOSIT_GAS_LIMIT, description: call.description },
      walletBalance: balance,
      allowance,
      block,
      builtAt: iso(),
    };
  }

  /** The prepared deposit still says exactly what it was built to say. Checked again right before signing. */
  function depositIntact(built: BuiltMarginDeposit): boolean {
    const deposit = built.deposit;
    const depositOk =
      deposit.chainId === HIDEKI_CHAIN_ID && sameAddress(deposit.to, built.marginBank) && deposit.value === 0n && decodeDepositCall(deposit.data) === built.amount;
    const approval = built.approval;
    const approvalOk =
      approval === null ||
      (approval.chainId === HIDEKI_CHAIN_ID &&
        sameAddress(approval.to, built.collateralToken) &&
        approval.value === 0n &&
        isExactApproval(approval.data, built.marginBank, built.amount));
    return built.chainId === HIDEKI_CHAIN_ID && built.amount > 0n && depositOk && approvalOk;
  }

  async function sendMarginDeposit({ walletClient, account, built, onSubmitted, approvalTimeoutMs }: SendMarginDepositInput): Promise<MarginDepositSend> {
    const walletAccount = walletClient.account;
    if (!walletAccount) throw new SidecarAdapterError("SIGNER_MISSING", "The wallet client has no account to sign with.");
    if (!sameAddress(walletAccount.address, account) || !sameAddress(built.account, account)) {
      throw new SidecarAdapterError("SIGNER_MISMATCH", "The connected wallet is not the account this deposit funds.", {
        expectedAccount: getAddress(built.account),
        actualAccount: getAddress(walletAccount.address),
      });
    }
    if (!depositIntact(built)) throw new SidecarAdapterError("INVALID_DEPOSIT", "The prepared deposit no longer matches its amount, bank or exact approval.");
    const walletChainId = await timed("wallet.getChainId", () => walletClient.getChainId());
    if (walletChainId !== HIDEKI_CHAIN_ID) {
      throw new SidecarAdapterError("WRONG_CHAIN", `The wallet is on chain ${walletChainId}.`, { expectedChainId: HIDEKI_CHAIN_ID, actualChainId: walletChainId });
    }
    const send = (call: BuiltCall): Promise<Hash> =>
      timed("wallet.sendTransaction", () =>
        walletClient.sendTransaction({
          account: walletAccount,
          chain: sidecarChain(network),
          to: call.to,
          data: call.data,
          value: call.value,
          gas: call.gas,
          maxFeePerGas: PERP_ORDER_FEES.maxFeePerGas,
          maxPriorityFeePerGas: PERP_ORDER_FEES.maxPriorityFeePerGas,
        }),
      );

    let approval: { hash: Hash; wait: ReceiptWait } | null = null;
    if (built.approval) {
      const hash = await send(built.approval);
      onSubmitted?.("approval", hash);
      const wait = await waitForReceipt(hash, { timeoutMs: approvalTimeoutMs });
      approval = { hash, wait };
      if (wait.status !== "success") return { status: "approval-not-confirmed", approval, depositHash: null };
    }

    // The allowance can change between build and send (another tab, another dapp); a short one would revert the deposit.
    const { allowance } = await readCollateral(getAddress(account), built.marginBank, built.collateralToken, approval?.wait.status === "success" ? approval.wait.block : undefined);
    if (allowance < built.amount) {
      throw new SidecarAdapterError(
        "INVALID_DEPOSIT",
        `The MarginBank may pull ${allowance} raw units, less than the ${built.amount} to deposit. Nothing was deposited${approval ? ` (approval ${approval.hash} confirmed)` : ""}.`,
      );
    }
    const depositHash = await send(built.deposit);
    onSubmitted?.("deposit", depositHash);
    return { status: "deposit-submitted", approval, depositHash };
  }

  async function reconcileDeposit(hash: Hash, reconcile: ReconcileDepositOptions): Promise<VerifiedDeposit> {
    const readAt = iso();
    const { tx, receipt } = await fetchMined(hash);
    const bank = getAddress(reconcile.marginBank);
    const [rpcChainId, token, revert] = await Promise.all([
      timed("eth_chainId", () => viem().getChainId()),
      reconcile.collateralToken
        ? Promise.resolve(getAddress(reconcile.collateralToken))
        : attempt(() => getSystemConfig(bank)).then((read) => (read.ok ? getAddress(read.value.collateralToken) : null)),
      receipt.status === "reverted" ? replayRevert(tx, receipt) : Promise.resolve(null),
    ]);
    const requestedAmount = decodeDepositCall(tx.input);
    const from = getAddress(tx.from);
    const to = tx.to ? getAddress(tx.to) : null;
    const verdict = verifyDeposit({
      rpcChainId,
      txChainId: tx.chainId ?? null,
      expectedChainId: HIDEKI_CHAIN_ID,
      from,
      to,
      expectedAccount: getAddress(reconcile.account),
      marginBank: bank,
      collateralToken: token,
      receiptStatus: receipt.status,
      block: receipt.blockNumber,
      revertReason: revert?.reason ?? null,
      requestedAmount,
      decoding: decodeDepositReceipt(receipt, bank, token),
    });
    return {
      hash,
      chainId: rpcChainId,
      receiptStatus: receipt.status,
      outcome: verdict.outcome,
      from,
      to,
      marginBank: bank,
      collateralToken: token,
      block: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
      feePaid: receipt.effectiveGasPrice !== undefined ? receipt.gasUsed * receipt.effectiveGasPrice : null,
      requestedAmount,
      creditedAmount: verdict.creditedAmount,
      transferredAmount: verdict.transferredAmount,
      revertReason: revert?.reason ?? null,
      checks: verdict.checks,
      explorerUrl: explorerTxUrl(hash, network),
      readAt,
    };
  }

  return {
    network,
    timing,
    getChainStatus,
    getSystemConfig,
    getMarketListing,
    listMarkets: async () => (await getMarketListing()).markets,
    getMarketHealth,
    getBookTop,
    getAccountSnapshot,
    quoteRoute,
    buildOrder,
    sendOrder,
    waitForReceipt,
    reconcileOrder,
    readAccountAtBlock,
    buildMarginDeposit,
    sendMarginDeposit,
    reconcileDeposit,
  };
}

export interface TruthCheckInput {
  rpcChainId: number;
  txChainId: number | null;
  from: Address;
  to: Address | null;
  market: MarketMeta | null;
  expectedAccount: Address | null;
  expectedBank: Address | null;
  /** The pool's own `marginBank()` at the transaction's block. */
  poolBank: Address | null;
  receiptStatus: "success" | "reverted";
  block: bigint;
  revertReason: string | null;
  calldata: DecodedPlaceOrderCall | null;
  intent: OrderIntent | null;
  placement: PlacementRecord | null;
  filledQuantity: bigint;
  outcomeNote: string | null;
  outcome: VerifiedOrder["outcome"];
  marginEvents: readonly MarginEventRecord[];
  counterpart: Address | null;
}

/** The truth checks, each decided from chain data alone. `unknown` whenever the input to decide is missing. */
export function buildTruthChecks(input: TruthCheckInput): TruthCheck[] {
  const checks: TruthCheck[] = [];
  const add = (id: string, label: string, status: TruthCheck["status"], detail: string): void => {
    checks.push({ id, label, status, detail });
  };
  const reverted = input.receiptStatus === "reverted";

  const chainOk = input.rpcChainId === HIDEKI_CHAIN_ID && (input.txChainId === null || input.txChainId === HIDEKI_CHAIN_ID);
  add("chain-id", `Transaction is on Somnia Hideki (${HIDEKI_CHAIN_ID})`, chainOk ? "pass" : "fail", `RPC chain id ${input.rpcChainId}; transaction chain id ${input.txChainId ?? "not encoded"}.`);

  if (input.expectedAccount === null) {
    add("sender", "Sent by the selected account", "unknown", `No expected account was supplied. Sender: ${input.from}.`);
  } else {
    const ok = sameAddress(input.from, input.expectedAccount);
    add("sender", "Sent by the selected account", ok ? "pass" : "fail", `Sender ${input.from}; expected ${input.expectedAccount}.`);
  }

  add(
    "pool-listed",
    "Target is a listed perp market",
    input.market ? "pass" : "fail",
    input.market ? `${input.market.displaySymbol} at ${input.market.pool}.` : `${input.to ?? "No target"} is not in the market list.`,
  );

  if (input.poolBank === null || input.expectedBank === null) {
    add("margin-bank", "Market settles on the expected MarginBank", "unknown", "The pool's MarginBank or the expected one could not be determined.");
  } else {
    const ok = sameAddress(input.poolBank, input.expectedBank);
    add(
      "margin-bank",
      "Market settles on the expected MarginBank",
      ok ? "pass" : "fail",
      `The pool reports MarginBank ${input.poolBank} at block ${input.block}; expected ${input.expectedBank}.`,
    );
  }

  add(
    "receipt-success",
    "Receipt confirms success",
    reverted ? "fail" : "pass",
    reverted ? `Reverted: ${input.revertReason ?? "reason unknown"}.` : `Mined in block ${input.block}.`,
  );

  if (reverted) {
    add("placement-decoded", "Order id and fills decoded from the receipt", "unknown", "Not applicable: the transaction reverted, so no order was placed.");
  } else if (input.placement === null) {
    add("placement-decoded", "Order id and fills decoded from the receipt", "fail", "A successful placement must emit OrderPlaced, and none was found.");
  } else {
    const ownerOk = sameAddress(input.placement.owner, input.from);
    const consistent = ownerOk && input.outcome !== "UNKNOWN";
    add(
      "placement-decoded",
      "Order id and fills decoded from the receipt",
      consistent ? "pass" : "fail",
      consistent
        ? `Order ${input.placement.orderId} is owned by the sender; ${input.filledQuantity} of ${input.placement.fullQuantity} filled.`
        : (input.outcomeNote ?? `OrderPlaced names owner ${input.placement.owner}, not the sender.`),
    );
  }

  if (input.calldata === null) {
    add("calldata-intent", "Calldata matches the intended order", "fail", "The calldata is not a perp placeOrder call.");
  } else if (input.intent === null) {
    add("calldata-intent", "Calldata matches the intended order", "unknown", "No local intent was supplied to compare.");
  } else {
    const ok = calldataMatchesIntent(input.calldata, input.intent);
    add("calldata-intent", "Calldata matches the intended order", ok ? "pass" : "fail", ok ? "Side, size, price and time in force match." : "The sent order differs from the intent.");
  }

  const senderMoved = input.marginEvents.some((e) => e.kind === "PositionUpdated" && sameAddress(e.account, input.from) && sameAddress(e.pool, input.to));
  if (reverted) {
    add("position-attribution", "Position change belongs to the sender", "unknown", "Not applicable: the transaction reverted, so no position changed.");
  } else if (input.filledQuantity > 0n) {
    add(
      "position-attribution",
      "Position change belongs to the sender",
      senderMoved ? "pass" : "fail",
      senderMoved ? "The MarginBank updated the sender's position in this market." : "Fills were decoded, but the sender's position did not update.",
    );
  } else {
    add(
      "position-attribution",
      "Position change belongs to the sender",
      senderMoved ? "fail" : "pass",
      senderMoved ? "The sender's position changed although nothing filled." : "Nothing filled and the sender's position did not change.",
    );
  }

  const funders: string[] = [];
  let senderFunded = false;
  for (const e of input.marginEvents) {
    if (e.kind === "CollateralLocked" || e.kind === "DepositedFor") {
      if (sameAddress(e.account, input.from)) senderFunded = true;
      else funders.push(e.account);
    } else if (e.kind === "MainFundedChild") {
      funders.push(`${e.payer} (linked main wallet)`);
    }
  }
  add(
    "collateral-attribution",
    "Only the sender's collateral backs the order",
    funders.length > 0 ? "fail" : "pass",
    funders.length > 0
      ? `Collateral moved for ${funders.join(", ")}.`
      : senderFunded
        ? "Every collateral lock and wallet top-up in this transaction is the sender's."
        : "No collateral was locked in this transaction.",
  );

  const other = input.counterpart;
  const isolationLabel = "The other account's collateral did not fund this trade";
  if (other === null) {
    add("counterpart-isolation", isolationLabel, "unknown", "No counterpart account was supplied.");
  } else if (sameAddress(other, input.from)) {
    add("counterpart-isolation", isolationLabel, "fail", "The counterpart is the sender itself.");
  } else {
    const fundedByOther = input.marginEvents.some(
      (e) =>
        ((e.kind === "CollateralLocked" || e.kind === "DepositedFor") && sameAddress(e.account, other)) ||
        (e.kind === "MainFundedChild" && sameAddress(e.payer, other)),
    );
    const touchedOther = input.marginEvents.some((e) => e.kind !== "MainFundedChild" && sameAddress(e.account, other));
    add(
      "counterpart-isolation",
      isolationLabel,
      fundedByOther ? "fail" : touchedOther ? "unknown" : "pass",
      fundedByOther
        ? `${other} locked or supplied collateral in this transaction.`
        : touchedOther
          ? `${other} appears in this transaction as a counterparty (its own resting order filled), so its state changed independently.`
          : `No MarginBank event in this transaction names ${other}.`,
    );
  }

  return checks;
}
