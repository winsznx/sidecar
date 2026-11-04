import type { Address } from "viem";

import type {
  AccountSnapshot,
  LiquidationPriceEstimate,
  MarketMeta,
  OrderIntent,
  OrderSide,
  PerpMaxOrderSizeLimit,
  Reading,
  RouteQuote,
  Source,
} from "@/lib/dreamdex/types";
import type { AccountIdentity, SignerAuthority } from "@/lib/wallets/identity";

/**
 * The shared-versus-separate comparison the trade screen renders and gates on.
 *
 * One object drives both the numbers and the copy (lib/risk/explanations), so the words
 * can never claim more than the figures support. There is deliberately no
 * "recommended" route: the trader chooses.
 */

/** `shared`: the order lives in the primary account. `separate`: it lives in the second wallet. */
export type RouteKind = "shared" | "separate";

export type EligibilityCode =
  | "NO_ACCOUNT"
  | "SAME_ACCOUNT"
  | "READ_FAILED"
  | "UNPRICEABLE"
  | "STALE_QUOTE"
  | "STALE_ACCOUNT"
  | "BELOW_MIN"
  | "OFF_GRID"
  /** Larger than the account's max size, and the preview did not say which gate binds. */
  | "SIZE_LIMIT"
  | "INSUFFICIENT_COLLATERAL"
  | "INITIAL_MARGIN"
  | "VOUCHER_BLOCKED"
  | "MAX_POSITION"
  | "RESTRICTED"
  | "ISOLATED"
  | "MAIN_FUNDING_BLOCKED"
  | "NO_GAS"
  | "NOT_CONNECTED"
  | "WRONG_CHAIN"
  | "WALLET_MISMATCH"
  | "WATCH_ONLY";

/**
 * `signer` issues are fixed in the wallet (connect, switch account or chain). Every
 * other category means the account itself cannot take this order right now.
 */
export type IssueCategory = "identity" | "data" | "market" | "order" | "funding" | "signer";

/** An exact missing amount, in raw units of `symbol`. */
export interface Shortfall {
  asset: "collateral" | "gas";
  amount: bigint;
  decimals: number;
  symbol: string;
}

export interface EligibilityIssue {
  code: EligibilityCode;
  category: IssueCategory;
  /** Blocks placing the order on this route. */
  blocking: boolean;
  message: string;
  nextStep: string;
  shortfall?: Shortfall;
}

/** One figure before the order and after it. */
export interface FigurePair {
  before: Reading<bigint>;
  /** Assumes the whole order fills at its limit price, which is the SDK projection's assumption. */
  after: Reading<bigint>;
}

/**
 * A single-market liquidation solve, read against the mark it was measured at. The
 * estimate itself uses the shared vocabulary (a floored `0n` is never a price); this
 * adds what the UI needs to word it honestly.
 */
export interface LiquidationView {
  estimate: LiquidationPriceEstimate;
  /** Side of the position the solve is for. `null` when flat. */
  side: OrderSide | null;
  /** The mark the solve was measured against. `null` only for a flat position with no mark read. */
  markPrice: bigint | null;
  /** At or past the current mark, or already breached: the account is at or below maintenance now. */
  atOrPastMark: boolean;
}

export interface OrderMarginBreakdown {
  initialMarginPortion: bigint;
  adverseGapPortion: bigint;
  /** Fee reserve the pool may pull. Not locked and not charged. */
  feeHeadroom: bigint;
}

export interface RouteFigures {
  equity: FigurePair;
  maintenance: FigurePair;
  /** Equity minus maintenance requirement. Illustrative, not a liquidation price or probability. */
  buffer: FigurePair;
  /** `after` is free collateral once this order's margin is locked, including any wallet top-up. */
  freeCollateral: FigurePair;
  /** What the pool locks for this order (`lockAmount`). */
  orderMargin: Reading<bigint>;
  orderMarginBreakdown: Reading<OrderMarginBreakdown>;
  /** The OI-scaled initial margin rate the quote applied. Never a static table value. */
  initialMarginRateBps: Reading<bigint>;
  /** SDK estimates for this market moving alone. Never a guarantee. */
  liquidationPrice: {
    before: Reading<LiquidationView>;
    after: Reading<LiquidationView>;
  };
}

export interface RouteSizing {
  maxQuantity: bigint;
  placeable: boolean;
  limitedBy: PerpMaxOrderSizeLimit | null;
  maxPositionSize: bigint;
  positionSize: bigint;
  /** The order's quantity is within `maxQuantity` and the max clears the market minimum. */
  fitsOrder: boolean;
}

/**
 * Wallet funds the pool would move when this order is placed. A non-zero
 * `mainWalletPull` means ANOTHER wallet pays, which must be shown before signing.
 */
export interface WalletFundingDisclosure {
  /** Total the pool requests. Not one wallet's spend when a main wallet is involved. */
  topUpRequired: bigint;
  ownWalletPull: bigint;
  mainWalletPull: bigint;
  /** The linked main eligible to fund a shortfall. Eligibility, not a debit. */
  fundingPayer: Address | null;
  anotherWalletPays: boolean;
  /** The paying main wallet is this comparison's primary account. */
  payerIsPrimary: boolean;
  /**
   * The quote modelled the pool's own-wallet top-up. When false, the figures above are
   * zero because nothing was checked, not because nothing moves.
   */
  autoPullModelled: boolean;
}

/** A position in the context of this order. */
export interface PositionShare {
  pool: Address;
  /** Base symbol, or a short pool address for a market Sidecar does not list. */
  symbol: string;
  side: OrderSide;
  /** Signed raw base units. */
  size: bigint;
  sameMarketAsOrder: boolean;
  note: string;
  source: Source;
}

/** An account this route leaves alone. Its figures are exactly as read, before and after. */
export interface UntouchedAccount {
  identity: AccountIdentity;
  equity: Reading<bigint>;
  maintenance: Reading<bigint>;
  buffer: Reading<bigint>;
  freeCollateral: Reading<bigint>;
  /** `null` when the positions could not be read. */
  positions: PositionShare[] | null;
  note: string;
}

export interface QuoteStamp {
  block: bigint;
  readAt: string;
  ageMs: number | null;
  fresh: boolean;
}

export interface RouteProjection {
  kind: RouteKind;
  identity: AccountIdentity | null;
  account: Address | null;
  /**
   * The order would be signed for a MarginBank account that already holds positions,
   * so they share one collateral balance. `null` when that account's positions are
   * unknown.
   */
  sharesCollateralWithExisting: boolean | null;
  /** Positions already in this route's account. They share collateral with the order. */
  sharedPositions: PositionShare[] | null;
  untouched: UntouchedAccount | null;
  figures: RouteFigures;
  sizing: Reading<RouteSizing>;
  funding: Reading<WalletFundingDisclosure>;
  signer: SignerAuthority;
  /** Most fundamental first. */
  issues: EligibilityIssue[];
  /** The account can take this order. Ignores whether the right wallet is connected. */
  eligible: boolean;
  /** Eligible, and the connected wallet can sign for it right now. */
  canPlace: boolean;
  quote: QuoteStamp | null;
}

/**
 * The capital-efficiency side of the choice, as data: a separate account posts its
 * own margin even when the primary already has free collateral.
 */
export interface CapitalTradeoff {
  primaryFreeCollateral: Reading<bigint>;
  separateFreeCollateral: Reading<bigint>;
  sharedOrderMargin: Reading<bigint>;
  separateOrderMargin: Reading<bigint>;
  /** The primary's own preview says it could fund this order. `null` when unknown. */
  primaryCouldFundOrder: boolean | null;
}

export interface ComparisonPolicy {
  maxQuoteAgeMs: number;
  maxSnapshotAgeMs: number;
  /** STT, in wei, the node requires the sender to hold up front before it admits a perp order. */
  minGasWei: bigint;
}

export interface RouteAccountInput {
  identity: AccountIdentity;
  snapshot: AccountSnapshot | null;
  quote: RouteQuote | null;
}

export interface ComparisonInput {
  market: MarketMeta;
  intent: OrderIntent;
  primary: RouteAccountInput;
  separate: RouteAccountInput | null;
  wallet: { address: Address | null; chainId: number | null };
  nowMs: number;
  policy?: Partial<ComparisonPolicy>;
}

export interface Comparison {
  market: MarketMeta;
  intent: OrderIntent;
  /** quantity x limit price, raw quote units. Exact arithmetic on the order itself. */
  orderNotional: bigint;
  evaluatedAtMs: number;
  policy: ComparisonPolicy;
  primary: AccountIdentity;
  routes: { shared: RouteProjection; separate: RouteProjection };
  tradeoff: CapitalTradeoff;
}

/** A hypothetical move of one market's mark. */
export type ScenarioMove =
  /** Relative move in basis points: -1000 is a 10% drop. */
  | { kind: "bps"; bps: bigint }
  /** An absolute hypothetical mark, raw quote units per whole base. */
  | { kind: "price"; price: bigint };

export interface ScenarioInput {
  market: MarketMeta;
  /** The market's maintenance threshold, from the pool's risk parameters or health snapshot. */
  maintenanceMarginBps: bigint | null;
  snapshot: AccountSnapshot | null;
  /** The route's quote. Required when `includeOrder` is true. */
  quote: RouteQuote | null;
  /** Start from the SDK's post-fill projection instead of the account as read. */
  includeOrder: boolean;
  /** The ticket's current order. With `includeOrder`, the quote must still describe it. */
  intent: OrderIntent | null;
  move: ScenarioMove;
  /** Freshness is judged at this time, the same way the comparison judges it. */
  nowMs: number;
  policy?: Partial<Pick<ComparisonPolicy, "maxQuoteAgeMs" | "maxSnapshotAgeMs">>;
}

export interface ScenarioFigures {
  marketSymbol: string;
  startMark: bigint | null;
  shockedMark: bigint | null;
  /** The move actually applied, in bps of the starting mark. */
  moveBps: bigint;
  /** The account holds (or would hold) a position in the moved market. */
  exposed: boolean;
  /** Signed raw base units in the moved market. */
  positionSize: bigint;
  equity: { start: bigint; shocked: bigint };
  maintenance: { start: bigint; shocked: bigint };
  buffer: { start: bigint; shocked: bigint };
  /** Change in unrealized PnL from the move. */
  pnlChange: bigint;
  /** Shocked equity would sit below the maintenance requirement. */
  belowMaintenance: boolean;
  /** Single-market solve at the starting state. An estimate, never a guarantee. */
  liquidationEstimate: LiquidationView;
  afterOrder: boolean;
}

export interface ScenarioResult {
  /** Always sourced `scenario` when available. */
  estimate: Reading<ScenarioFigures>;
  /** What the estimate leaves out. Always shown with it. */
  omitted: readonly string[];
  label: string;
  disclaimer: string;
}
