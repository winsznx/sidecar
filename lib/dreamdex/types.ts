import type { MarginStatus, PerpMaxOrderSizeLimit } from "@somnia-chain/markets-sdk";
import type { Address, Hash, Hex } from "viem";

/**
 * Domain contract shared by the protocol adapter, the risk/order logic and the UI.
 *
 * Raw protocol units stay `bigint` end to end. Human strings exist only at the
 * input and display edges (lib/format). A value that could not be read is
 * `null` or an explicit unavailable state, never a zero.
 */

export const HIDEKI_CHAIN_ID = 50383;
export type HidekiChainId = typeof HIDEKI_CHAIN_ID;

export type { MarginStatus, PerpMaxOrderSizeLimit };

/** Where a displayed figure came from. The UI renders this as a provenance badge. */
export type Source =
  /**
   * A contract read, pinned to `block`. `via` names the SDK method.
   * `pinned: false` marks a head read whose SDK method reports no block: `block` is
   * then the head observed in the same request batch, not a pin.
   */
  | { kind: "chain"; block: bigint; readAt: string; via: string; pinned?: boolean }
  /** An SDK calculation over chain reads pinned to `block` (previews, analytics). */
  | { kind: "sdk"; block: bigint; readAt: string; via: string; pinned?: boolean }
  /** Indexed history. It can lag the chain, so it never drives risk figures. */
  | { kind: "indexer"; readAt: string; via: string; updatedAtBlock?: bigint }
  /**
   * Sidecar arithmetic over chain or SDK inputs. Always labelled as an estimate.
   * `block` is the newest read the arithmetic used, when known.
   */
  | { kind: "estimate"; basis: string; block?: bigint }
  /** A hypothetical the trader asked for (scenario slider). `block` as for `estimate`. */
  | { kind: "scenario"; basis: string; block?: bigint }
  /** Fixture data for tests and previews. Never shown as live state. */
  | { kind: "simulated"; note: string };

export type SourceKind = Source["kind"];

/** A value that is either known with its source, or explicitly unavailable. */
export type Reading<T> =
  | { ok: true; value: T; source: Source }
  | { ok: false; reason: string; source?: Source };

export interface MarketMeta {
  pool: Address;
  marginBank: Address;
  /** The perps collateral token for this market (USDso). Not the address bundle's `collateral`. */
  quoteToken: Address;
  stopRegistry: Address | null;
  baseSymbol: string;
  quoteSymbol: string;
  /** e.g. "BTC-PERP" */
  displaySymbol: string;
  baseDecimals: number;
  quoteDecimals: number;
  /** Raw quote units per whole base. Prices must sit on this grid. */
  tickSize: bigint;
  /** Raw base units. Quantities must sit on this grid. */
  lotSize: bigint;
  /** Raw base units. Smaller orders revert. */
  minQuantity: bigint;
  /** Indexed floor of the IMF curve. The live rate comes from previews (`effectiveImfBps`). */
  initialMarginBps: number;
  /** 10_000 / initialMarginBps. Display only. */
  maxLeverageX: number;
  /** Indexed mark, a display hint only. Risk figures use chain reads. */
  indexedMarkPrice: bigint | null;
  /** Unix seconds of the indexed mark. */
  indexedMarkUpdatedAt: number | null;
  /** Raw rate per 8h funding window, as the SDK reports it. */
  fundingRate8h: bigint | null;
  openInterest: bigint | null;
  /** From the factory's tradeable gates. `null` when not checked. */
  tradeable: boolean | null;
  /** Close-only gate from the factory. `null` when not checked. */
  restricted?: boolean | null;
  /** MarginBank activation gate. `null` when unreadable or not checked. */
  registered?: boolean | null;
  /** Synthetic base token the market tracks. */
  baseToken?: Address;
  /** Seconds in the window `fundingRate8h` is quoted per, as the row reports it. */
  fundingWindowSec?: number | null;
}

/** The market list plus where each part of it came from. */
export interface MarketListing {
  markets: MarketMeta[];
  /** The indexed market rows: grid, decimals and addresses. */
  source: Source;
  /** The factory's tradeable gates, read from chain. */
  gates: { status: "ok"; readAt: string; via: string } | { status: "unavailable"; reason: string };
}

/** Per-market inputs from `getPerpHealthSnapshot`, present only while the market is priceable. */
export interface MarketHealthSnapshot {
  /** 10^baseDecimals, the divisor for notional math. */
  oneBase: bigint;
  markPrice: bigint;
  /** 1e18-scaled, signed, including unsettled intervals. */
  projectedCumulativeFunding: bigint;
  /** The initial-margin rate in force (OI-scaled), not the indexed floor. */
  effectiveImfBps: bigint;
  maintenanceMarginBps: bigint;
  closeOutMarginBps: bigint;
}

/** The pool's own verdict on its mark feed. */
export interface MarketFeedStatus {
  markPriceOk: boolean;
  /** The feed's raw value, 0n or stale when the feed is down. For display use `liveMarkPrice`. */
  markPrice: bigint;
  /** `markPriceOk && markPrice > 0n`, the SDK's own liveness test. */
  live: boolean;
  /**
   * The mark only when `live`, otherwise `null`. Render this (with `live`), never the raw `markPrice`,
   * which the feed reports as 0n or stale when it is down.
   */
  liveMarkPrice?: bigint | null;
  /** Raw base units. */
  openInterest: bigint;
  /** Unix seconds of the index oracle. `null` when that leg reverted. */
  indexUpdatedAt: number | null;
}

/** The pool's frozen risk configuration. Fee fields are bps x 1000. */
export interface MarketRiskParams {
  initialMarginBps: bigint;
  maintenanceMarginBps: bigint;
  closeOutMarginBps: bigint;
  maxOpenInterest: bigint;
  maxPositionSize: bigint;
  takerFeeBpsTimes1k: bigint;
  makerFeeBpsTimes1k: bigint;
  insuranceFundShareBps: bigint;
}

export interface MarketHealth {
  pool: Address;
  readAt: string;
  /** `unpriceable` means the protocol declined to price the market; the snapshot is then unavailable. */
  status: "priceable" | "unpriceable" | "error";
  snapshot: Reading<MarketHealthSnapshot>;
  feed: Reading<MarketFeedStatus>;
  risk: Reading<MarketRiskParams>;
  errors: string[];
}

/** Top of the resting book, read from pool state at one block. */
export interface BookTopReading {
  pool: Address;
  /** Raw quote units per whole base. `null` when that side is empty. */
  bestBid: bigint | null;
  bestAsk: bigint | null;
  block: bigint;
  readAt: string;
}

/** The RPC's own chain id and head, for the network badge and the doctor. */
export interface ChainStatus {
  chainId: number;
  expectedChainId: HidekiChainId;
  matches: boolean;
  headBlock: bigint;
  readAt: string;
}

/**
 * How to read a single-market liquidation solve. The SDK floors the solve at `0n`,
 * which means opposite things for a long and a short, so never render `0n` as a price.
 */
export type LiquidationPriceEstimate =
  /** No position in this market. */
  | { kind: "flat" }
  /** The mark at which this market's move alone trips maintenance. */
  | { kind: "price"; price: bigint }
  /** Long whose solve is at or below zero: no positive price trips maintenance from this market alone. */
  | { kind: "unreachable" }
  /** Short whose solve is at or below zero: maintenance is already breached at any positive price. */
  | { kind: "breached" };

export interface PositionSnapshot {
  pool: Address;
  /** Resolved from the market list, e.g. "ETH". `null` for a pool Sidecar does not list. */
  baseSymbol: string | null;
  side: "long" | "short";
  /** Signed raw base units. */
  size: bigint;
  /** Raw quote units per whole base. */
  entryPrice: bigint;
  priceable: boolean;
  markPrice: bigint | null;
  notional: bigint | null;
  /** Price PnL only, excludes funding. */
  unrealizedPnl: bigint | null;
  /** Funding owed since entry. Positive means the account pays. */
  accruedFunding: bigint | null;
  /** unrealizedPnl - accruedFunding, what the position adds to equity. */
  equityContribution: bigint | null;
  imRequirement: bigint | null;
  mmRequirement: bigint | null;
  block: bigint;
}

export interface OpenOrderSnapshot {
  pool: Address;
  orderId: bigint;
  side: "long" | "short";
  price: bigint;
  /** Remaining raw base units. */
  quantity: bigint;
  placedAt: string | null;
}

export interface VoucherState {
  claimed: boolean;
  /** Paper USDso still counted as non-withdrawable house money. `0n` on an ordinary account. */
  floor: bigint;
  /** Unix seconds. */
  expiresAt: number | null;
  /** `off` when the MarginBank has no live voucher programme; the other fields then describe no voucher. */
  programme?: "active" | "off";
}

export interface MarginAccountState {
  unlockedCollateral: bigint;
  lockedCollateral: bigint;
  /** Protocol equity from MarginBank account health. */
  equity: bigint;
  withdrawable: bigint;
  imReq: bigint;
  mmReq: bigint;
  cmReq: bigint;
  status: MarginStatus;
  activePools: Address[];
}

export type ReadStatus = "verified" | "partial" | "unpriceable" | "error";

export interface AccountSnapshot {
  chainId: HidekiChainId;
  account: Address;
  marginBank: Address;
  /** Block of the margin-account read. */
  block: bigint;
  /** ISO time the snapshot resolved. */
  readAt: string;
  /** `null` when the margin read failed or the account cannot be priced. */
  margin: MarginAccountState | null;
  positions: PositionSnapshot[];
  positionsBlock: bigint | null;
  voucher: VoucherState | null;
  /** Native STT balance in wei, for gas. */
  gasBalance: bigint | null;
  /** Collateral token held in the wallet, outside the MarginBank. */
  walletCollateral: { balance: bigint; allowanceToBank: bigint } | null;
  openOrders:
    | { status: "ok"; orders: OpenOrderSnapshot[]; source: Source }
    | { status: "unavailable"; reason: string };
  readStatus: ReadStatus;
  /** Plain-language notes about partial or failed reads. */
  issues: string[];
  /** Provenance of each part of the snapshot. `null` where that read failed. */
  sources?: AccountSnapshotSources;
}

export interface AccountSnapshotSources {
  margin: Source | null;
  positions: Source | null;
  voucher: Source | null;
  gasBalance: Source | null;
  walletCollateral: Source | null;
}

/**
 * An account read pinned to a past block. The SDK can pin equity, open orders and
 * balances, but has no block-pinned position read, so `positions` is never `ok`.
 */
export interface AccountAtBlock {
  account: Address;
  marginBank: Address;
  block: bigint;
  readAt: string;
  /** `unsupported` when the RPC could not serve any read at `block`. */
  historicalReads: "supported" | "unsupported";
  equity: Reading<{ equity: bigint; lockedCollateral: bigint; totalEquity: bigint }>;
  openOrders: Reading<OpenOrderSnapshot[]>;
  gasBalance: Reading<bigint>;
  walletCollateral: Reading<{ balance: bigint; allowanceToBank: bigint }>;
  positions: Reading<PositionSnapshot[]>;
  issues: string[];
}

export type OrderSide = "long" | "short";

/** Maps onto the SDK's ORDER_TYPE: GTC=LIMIT(0), FOK=FILL_OR_KILL(1), IOC=MARKET(2), POST_ONLY=POST_ONLY(3). */
export type TimeInForce = "GTC" | "IOC" | "FOK" | "POST_ONLY";

/** A validated order on the market grid, in raw units. */
export interface OrderIntent {
  pool: Address;
  side: OrderSide;
  /** Raw base units, a multiple of lotSize, at least minQuantity. */
  quantity: bigint;
  /** Raw quote units per whole base, a multiple of tickSize. */
  price: bigint;
  timeInForce: TimeInForce;
}

/** One account's protocol preflight for one intent, all from SDK reads. */
export interface RouteQuote {
  account: Address;
  intent: OrderIntent;
  block: bigint;
  readAt: string;
  priceable: boolean;
  markPrice: bigint | null;
  effectiveImfBps: bigint | null;
  maxSize: {
    maxQuantity: bigint;
    placeable: boolean;
    limitedBy: PerpMaxOrderSizeLimit | null;
    maxPositionSize: bigint;
    positionSize: bigint;
    lotSize?: bigint;
    minQuantity?: bigint;
    increasingQuantity?: bigint;
    reducingQuantity?: bigint;
    lockAmount?: bigint;
    /** Total wallet pull requested at `maxQuantity`; split into the two legs below. */
    topUpRequired?: bigint;
    ownWalletPull?: bigint;
    /** Non-zero only when a linked main wallet would fund part of the order. */
    mainWalletPull?: bigint;
    fundingPayer?: Address | null;
  } | null;
  margin: {
    lockAmount: bigint;
    imRequirement: bigint;
    initialMarginPortion: bigint;
    adverseGapPortion: bigint;
    feeHeadroom: bigint;
    topUpRequired: bigint;
    ownWalletPull: bigint;
    mainWalletPull: bigint;
    fundingPayer: Address | null;
    unlockedCollateral: bigint;
    equity: bigint;
    sufficient: boolean;
    hasCollateralForLock: boolean;
    meetsInitialMargin: boolean;
    voucherBlocked: boolean;
    restrictedBlocked: boolean;
    isolationBlocked: boolean;
    mainFundingBlocked: boolean;
    /** The part of the order that increases the position, the only part that locks. */
    increasingQuantity?: bigint;
    reducingQuantity?: bigint;
    leverageSurcharge?: bigint;
    walletCoversTopUp?: boolean;
    /** The sender's own collateral balance and MarginBank allowance, when auto-pull was modelled. */
    wallet?: { balance: bigint; allowance: bigint } | null;
    mainWalletCapacity?: bigint | null;
  } | null;
  /** Single-market liquidation solve from the SDK. An estimate, never a guarantee. */
  projection: {
    currentSize: bigint;
    projectedSize: bigint;
    projectedEntryPrice: bigint;
    projectedEquity: bigint;
    projectedMmReq: bigint;
    currentLiquidationPrice: bigint | null;
    projectedLiquidationPrice: bigint | null;
    /** The raw solves above, interpreted. Read these instead of rendering a floored `0n`. */
    currentLiquidation?: LiquidationPriceEstimate;
    projectedLiquidation?: LiquidationPriceEstimate;
    realizedPnl?: bigint;
    fee?: bigint;
    projectedPositionLeverageBps?: bigint | null;
  } | null;
  /** Reads that failed, in plain language. */
  errors: string[];
  /** The block each preview was pinned to. `block` is the margin preview's when it succeeded. */
  blocks?: { maxSize: bigint | null; margin: bigint | null; projection: bigint | null };
  /** Whether the quote modelled the pool topping margin up from the sender's own wallet. */
  autoPull?: boolean;
}

/** An unsigned perp placement, ready for the connected wallet to send. */
export interface BuiltOrder {
  chainId: HidekiChainId;
  to: Address;
  data: Hex;
  value: bigint;
  /** Gas ceiling sent with the transaction. Unused gas is not charged. */
  gas: bigint;
  /** The SDK's label for a confirmation prompt. */
  description: string;
  /** The SDK `ORDER_TYPE` the calldata encodes. */
  orderType: number;
  intent: OrderIntent;
  builtAt: string;
}

/** What waiting for a sent transaction established. Anything but a receipt is UNKNOWN_OUTCOME. */
export type ReceiptWait =
  | { status: "success"; hash: Hash; block: bigint; gasUsed: bigint; waitedMs: number }
  | { status: "reverted"; hash: Hash; block: bigint; gasUsed: bigint; waitedMs: number }
  /** No receipt within the deadline. The transaction may still mine: never resend blindly. */
  | { status: "timeout"; hash: Hash; waitedMs: number }
  /** The wallet replaced it (speed-up or cancel); follow `replacement`. */
  | { status: "replaced"; hash: Hash; replacement: Hash; reason: string; waitedMs: number }
  /** The receipt lookup itself failed. The transaction may still mine. */
  | { status: "error"; hash: Hash; reason: string; waitedMs: number };

export type ExecutionPhase =
  | "EDITING"
  | "QUOTING"
  | "READY"
  | "AWAITING_WALLET_CONFIRMATION"
  | "WALLET_REJECTED"
  | "SUBMITTED"
  | "MINED_SUCCESS"
  | "MINED_REVERTED"
  | "UNKNOWN_OUTCOME"
  | "ORDER_ACCEPTED"
  | "ORDER_REJECTED"
  | "RESTING"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCELLED"
  | "ACCOUNT_RECONCILED";

export interface OrderFillRecord {
  makerOrderId: bigint;
  takerOrderId: bigint;
  /** Raw base units. */
  quantity: bigint;
  /** Raw quote units per whole base. */
  price: bigint;
}

/** What the book did with a mined placement, decoded from its receipt. */
export type PlacementOutcome =
  /** Everything requested filled in the transaction. */
  | "FILLED"
  /** Some filled; the remainder rests (GTC) or was cancelled (IOC). */
  | "PARTIALLY_FILLED"
  /** Nothing filled; the order rests on the book. */
  | "RESTING"
  /** Mined successfully but neither filled nor rested. */
  | "NO_FILL"
  | "REVERTED"
  /** Not enough information to say. */
  | "UNKNOWN";

export interface TruthCheck {
  id: string;
  label: string;
  status: "pass" | "fail" | "unknown";
  detail: string;
}

export interface VerifiedOrder {
  hash: Hash;
  chainId: number;
  receiptStatus: "success" | "reverted";
  from: Address;
  to: Address | null;
  block: bigint;
  gasUsed: bigint;
  /** The resting order's id, when one rested. */
  orderId: bigint | null;
  fills: OrderFillRecord[];
  filledQuantity: bigint;
  /** Decoded from the signed calldata. `null` when the calldata is not a perp placeOrder call; a local intent is never substituted. */
  requested: { side: OrderSide; quantity: bigint; price: bigint; timeInForce: TimeInForce | null } | null;
  market: MarketMeta | null;
  outcome: PlacementOutcome;
  /** Decoded revert name, or a bounded description when it cannot be decoded. */
  revertReason: string | null;
  explorerUrl: string;
  checks: TruthCheck[];
  readAt: string;
  /** The placement as the pool recorded it, from `OrderPlaced` and its follow-up events. */
  placement?: PlacementRecord | null;
  /** MarginBank events the transaction emitted: who locked collateral and whose position moved. */
  marginEvents?: MarginEventRecord[];
  /** The placeOrder call decoded from calldata. `null` when the calldata is not a perp placement. */
  calldata?: DecodedPlaceOrderCall | null;
  /** How `revertReason` was obtained. */
  revertSource?: "parent-block-replay" | "receipt-block-replay" | "not-recoverable" | null;
  effectiveGasPrice?: bigint | null;
  /** gasUsed x effectiveGasPrice, in wei of STT. */
  feePaid?: bigint | null;
  /** Unix seconds of the block the transaction mined in. */
  blockTimestamp?: number | null;
}

/** A `placeOrder` call decoded with the SDK's PerpPool ABI. */
export interface DecodedPlaceOrderCall {
  isBid: boolean;
  userData: bigint;
  price: bigint;
  quantity: bigint;
  expireTimestampNs: bigint;
  orderType: number;
  selfMatchingOption: number;
  builder: Address;
  builderFeeBpsTimes1k: bigint;
}

export interface PlacementRecord {
  orderId: bigint;
  owner: Address;
  side: OrderSide;
  price: bigint;
  fullQuantity: bigint;
  /** Left after matching inside the placement transaction. */
  quantityRemaining: bigint;
  /** An `OrderRested` event put the remainder on the book. */
  rested: boolean;
  /** An `OrderCancelled` event removed the remainder in the same transaction. */
  cancelled: boolean;
}

export type MarginEventRecord =
  | { kind: "CollateralLocked" | "CollateralUnlocked" | "DepositedFor" | "FeeCharged" | "RebatePaid"; account: Address; pool: Address; amount: bigint }
  | { kind: "PositionUpdated"; account: Address; pool: Address; newSize: bigint; avgEntryPrice: bigint; realizedPnl: bigint }
  | { kind: "FundingSettled"; account: Address; pool: Address; payment: bigint }
  | { kind: "MainFundedChild"; child: Address; payer: Address; amount: bigint };

/** JSON form of a reconciled transaction, written to `public/proof/<txHash>.json`. Raw units are decimal strings. */
export interface ProofEvidenceRecord {
  schema: "sidecar.proof.v1";
  /** A recorded previous execution, never a fresh read. */
  kind: "recorded-execution";
  recordedAt: string;
  network: {
    chainId: number;
    rpcUrl: string;
    explorerUrl: string;
    sdkVersion: string;
    /** The WebSocket the SDK read chain state over. Absent in records written before it was captured. */
    wsUrl?: string;
    indexerUrl?: string;
    /** The mined block's hash as the reading node saw it, compared with the default Hideki RPC's hash for the same block. */
    canonicalBlock?: { number: string; hash: Hash | null; defaultRpcHash: Hash | null; matches: boolean };
  };
  tx: {
    hash: Hash;
    explorerUrl: string;
    from: Address;
    to: Address | null;
    block: string;
    blockTimestamp: number | null;
    receiptStatus: "success" | "reverted";
    gasUsed: string;
    feePaidWei: string | null;
  };
  market: { pool: Address; displaySymbol: string; marginBank: Address; baseDecimals: number; quoteDecimals: number } | null;
  requested: { side: OrderSide; quantity: string; price: string; timeInForce: TimeInForce | null } | null;
  outcome: PlacementOutcome;
  /** The pool's id for this placement, whether or not it rested. */
  orderId: string | null;
  filledQuantity: string;
  fills: { makerOrderId: string; takerOrderId: string; quantity: string; price: string }[];
  revertReason: string | null;
  checks: TruthCheck[];
  marginEvents: Record<string, string>[];
  accounts: ProofAccountRecord[];
}

export interface ProofAccountRecord {
  role: "selected" | "counterpart";
  address: Address;
  /** Read at the parent block, before the transaction. */
  before: ProofAccountState | null;
  /** Read at the transaction's own block. */
  after: ProofAccountState | null;
}

export interface ProofAccountState {
  block: string;
  equity: string | null;
  lockedCollateral: string | null;
  totalEquity: string | null;
  openOrderCount: number | null;
  gasBalance: string | null;
  issues: string[];
}

/** One unsigned transaction Sidecar asks the wallet to send. */
export interface BuiltCall {
  chainId: HidekiChainId;
  to: Address;
  data: Hex;
  value: bigint;
  /** Gas ceiling sent with the transaction. Unused gas is not charged. */
  gas: bigint;
  description: string;
}

/**
 * A MarginBank deposit from a wallet into that same wallet's own margin account. The bank's
 * `deposit(amount)` credits the caller, so the payer and the credited account are one address.
 */
export interface BuiltMarginDeposit {
  chainId: HidekiChainId;
  account: Address;
  marginBank: Address;
  collateralToken: Address;
  amount: bigint;
  /** `approve(marginBank, amount)` for exactly `amount`. Null when the allowance read at `block` already covers it. */
  approval: BuiltCall | null;
  deposit: BuiltCall;
  /** Wallet collateral balance and allowance to the bank the build was checked against, both at `block`. */
  walletBalance: bigint;
  allowance: bigint;
  block: bigint;
  builtAt: string;
}

export type MarginDepositStep = "approval" | "deposit";

export type MarginDepositSend =
  | { status: "deposit-submitted"; approval: { hash: Hash; wait: ReceiptWait } | null; depositHash: Hash }
  /** The approval did not confirm, so the deposit was never sent. */
  | { status: "approval-not-confirmed"; approval: { hash: Hash; wait: ReceiptWait }; depositHash: null };

/** A deposit decoded and checked from its receipt alone. */
export interface VerifiedDeposit {
  hash: Hash;
  chainId: number;
  receiptStatus: "success" | "reverted";
  /** CREDITED only when the bank's Deposited event names the sender for the requested amount. */
  outcome: "CREDITED" | "REVERTED" | "UNVERIFIED";
  from: Address;
  to: Address | null;
  marginBank: Address;
  collateralToken: Address | null;
  block: bigint;
  gasUsed: bigint;
  feePaid: bigint | null;
  /** From the calldata. Null when it is not a `deposit(uint256)` call. */
  requestedAmount: bigint | null;
  /** From the bank's Deposited event for the sender. */
  creditedAmount: bigint | null;
  /** From the collateral token's Transfer from the sender to the bank. */
  transferredAmount: bigint | null;
  revertReason: string | null;
  checks: TruthCheck[];
  explorerUrl: string;
  readAt: string;
}
