import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains";

import type {
  AccountSnapshot,
  LiquidationPriceEstimate,
  MarketMeta,
  OrderSide,
  Reading,
  RouteQuote,
  Source,
} from "@/lib/dreamdex/types";
import { MIN_GAS_BALANCE_FOR_ORDER_WEI } from "@/lib/dreamdex/config";
import { formatQuantity, shortAddress } from "@/lib/format/units";
import { DEFAULT_QUOTE_MAX_AGE_MS, quoteValidity, type QuoteValidity } from "@/lib/orders/lifecycle";
import { computeNotional, intentGridIssues } from "@/lib/orders/validation";
import { eligibilityCopy, positionNote, untouchedNote, type IssueDetail } from "@/lib/risk/explanations";
import {
  DEFAULT_SNAPSHOT_MAX_AGE_MS,
  NO_MAINTENANCE_REASON,
  accountBuffer,
  marginSource,
  positionsSource,
  riskUsability,
  snapshotFreshness,
} from "@/lib/risk/snapshot";
import type {
  CapitalTradeoff,
  Comparison,
  ComparisonInput,
  ComparisonPolicy,
  EligibilityIssue,
  FigurePair,
  IssueCategory,
  LiquidationView,
  PositionShare,
  RouteAccountInput,
  RouteFigures,
  RouteKind,
  RouteProjection,
  RouteSizing,
  UntouchedAccount,
  WalletFundingDisclosure,
} from "@/lib/risk/types";
import {
  sameAddress,
  signerAuthority,
  type AccountIdentity,
  type ConnectedWallet,
  type SignerAuthority,
} from "@/lib/wallets/identity";

/**
 * Builds the shared-versus-separate comparison for one proposed order.
 *
 * Grounding rules:
 * - "shares collateral" is decided only by which MarginBank account would sign;
 * - every figure carries its source, and anything unread, stale or unpriceable is
 *   unavailable with a reason, never zero;
 * - order requirements come from the account's own quote (effective IMF, lock amount),
 *   never from a static rate table;
 * - no route is ever picked or recommended.
 */

/**
 * STT a route must hold before Sidecar offers to send: the node admits a perp order only
 * when the sender holds the SDK's gas limit x maxFeePerGas up front, even though far
 * less is actually spent. A lower floor would offer a send the node then refuses.
 */
export const DEFAULT_MIN_GAS_WEI: bigint = MIN_GAS_BALANCE_FOR_ORDER_WEI;

export const DEFAULT_COMPARISON_POLICY: ComparisonPolicy = {
  maxQuoteAgeMs: DEFAULT_QUOTE_MAX_AGE_MS,
  maxSnapshotAgeMs: DEFAULT_SNAPSHOT_MAX_AGE_MS,
  minGasWei: DEFAULT_MIN_GAS_WEI,
};

const CATEGORY: Record<EligibilityIssue["code"], IssueCategory> = {
  NO_ACCOUNT: "identity",
  SAME_ACCOUNT: "identity",
  READ_FAILED: "data",
  UNPRICEABLE: "data",
  STALE_QUOTE: "data",
  STALE_ACCOUNT: "data",
  BELOW_MIN: "order",
  OFF_GRID: "order",
  SIZE_LIMIT: "order",
  MAX_POSITION: "order",
  VOUCHER_BLOCKED: "market",
  RESTRICTED: "market",
  ISOLATED: "market",
  INSUFFICIENT_COLLATERAL: "funding",
  INITIAL_MARGIN: "funding",
  MAIN_FUNDING_BLOCKED: "funding",
  NO_GAS: "funding",
  NOT_CONNECTED: "signer",
  WRONG_CHAIN: "signer",
  WALLET_MISMATCH: "signer",
  WATCH_ONLY: "signer",
};

const CATEGORY_ORDER: readonly IssueCategory[] = ["identity", "data", "market", "order", "funding", "signer"];

interface RouteContext {
  market: MarketMeta;
  intent: ComparisonInput["intent"];
  nowMs: number;
  policy: ComparisonPolicy;
  connected: ConnectedWallet | null;
  primary: RouteAccountInput;
}

interface SnapshotAssessment {
  issues: EligibilityIssue[];
  /** Why the account-as-read figures are unavailable; `null` when they are usable. */
  unavailableReason: string | null;
  unpriceable: boolean;
}

interface QuoteAssessment {
  issues: EligibilityIssue[];
  unavailableReason: string | null;
  unpriceable: boolean;
  validity: QuoteValidity | null;
}

export function buildComparison(input: ComparisonInput): Comparison {
  const policy: ComparisonPolicy = { ...DEFAULT_COMPARISON_POLICY, ...input.policy };
  const context: RouteContext = {
    market: input.market,
    intent: input.intent,
    nowMs: input.nowMs,
    policy,
    connected:
      input.wallet.address === null ? null : { address: input.wallet.address, chainId: input.wallet.chainId },
    primary: input.primary,
  };

  const shared = projectRoute("shared", input.primary, input.separate, context);
  const separate =
    input.separate === null ? missingSeparateRoute(context) : projectRoute("separate", input.separate, input.primary, context);

  return {
    market: input.market,
    intent: input.intent,
    orderNotional: computeNotional(input.intent.quantity, input.intent.price, input.market.baseDecimals),
    evaluatedAtMs: input.nowMs,
    policy,
    primary: input.primary.identity,
    routes: { shared, separate },
    tradeoff: buildTradeoff(shared, separate, input.primary.quote),
  };
}

/**
 * Reads the SDK's single-market liquidation solve. The SDK floors the solve at `0n`,
 * which on a long means no positive price trips maintenance from this market alone and
 * on a short means maintenance is already breached; neither is ever a price of zero.
 * The adapter's own interpretation is used when the quote carries one.
 */
export function interpretLiquidationSolve(raw: bigint | null, size: bigint): LiquidationPriceEstimate {
  if (size === 0n) return { kind: "flat" };
  if (raw === null) return size > 0n ? { kind: "unreachable" } : { kind: "flat" };
  if (raw === 0n) return size > 0n ? { kind: "unreachable" } : { kind: "breached" };
  return { kind: "price", price: raw };
}

export function liquidationView(
  estimate: LiquidationPriceEstimate,
  size: bigint,
  markPrice: bigint | null,
): LiquidationView {
  const side: OrderSide | null = size === 0n || estimate.kind === "flat" ? null : size > 0n ? "long" : "short";
  const pastMark =
    estimate.kind === "price" &&
    side !== null &&
    markPrice !== null &&
    (side === "long" ? estimate.price >= markPrice : estimate.price <= markPrice);
  return { estimate, side, markPrice, atOrPastMark: estimate.kind === "breached" || pastMark };
}

function projectRoute(
  kind: RouteKind,
  route: RouteAccountInput,
  other: RouteAccountInput | null,
  context: RouteContext,
): RouteProjection {
  const { market, intent } = context;
  const identity = route.identity;
  const issues: EligibilityIssue[] = [];

  const repeatsPrimary = kind === "separate" && sameAddress(identity.address, context.primary.identity.address);
  if (repeatsPrimary) issues.push(makeIssue({ code: "SAME_ACCOUNT", address: identity.address }));

  for (const gridIssue of intentGridIssues(intent, market)) {
    issues.push(
      makeIssue({ code: gridIssue.code === "BELOW_MIN_SIZE" ? "BELOW_MIN" : "OFF_GRID", message: gridIssue.message }),
    );
  }

  const snapshotCheck = assessSnapshot(route.snapshot, identity, context);
  const quoteCheck = assessQuote(route.quote, identity, context);
  issues.push(...snapshotCheck.issues, ...quoteCheck.issues);

  const identityReason = repeatsPrimary
    ? `${shortAddress(identity.address)} is your primary account, so it is not shown as a separate one.`
    : null;
  const unpriceableReason = quoteCheck.unpriceable
    ? eligibilityCopy({ code: "UNPRICEABLE", scope: "order-market" }).message
    : snapshotCheck.unpriceable
      ? snapshotCheck.unavailableReason
      : null;
  const beforeReason = identityReason ?? unpriceableReason ?? snapshotCheck.unavailableReason;
  const afterReason = identityReason ?? unpriceableReason ?? quoteCheck.unavailableReason;
  const quote = afterReason === null ? route.quote : null;

  if (quote !== null) issues.push(...gateIssues(quote, context));
  if (!repeatsPrimary) issues.push(...gasIssues(route.snapshot, identity, context));

  const signer = signerAuthority({ identity, connected: context.connected });
  issues.push(...signerIssues(signer));

  const sharedPositions = positionShares(route.snapshot, identity, "same-account", context);
  const ordered = orderIssues(dedupe(issues));
  const eligible = !ordered.some((issue) => issue.blocking && issue.category !== "signer");

  return {
    kind,
    identity,
    account: identity.address,
    sharesCollateralWithExisting: sharedPositions === null ? null : sharedPositions.length > 0,
    sharedPositions,
    untouched: repeatsPrimary ? null : untouchedAccount(kind, other, context),
    figures: buildFigures(route, quote, beforeReason, afterReason),
    sizing: sizingReading(quote, afterReason, context),
    funding: fundingReading(quote, afterReason, context),
    signer,
    issues: ordered,
    eligible,
    canPlace: eligible && !ordered.some((issue) => issue.blocking),
    quote: route.quote === null ? null : quoteStamp(route.quote, quoteCheck.validity),
  };
}

function missingSeparateRoute(context: RouteContext): RouteProjection {
  const reason = eligibilityCopy({ code: "NO_ACCOUNT" }).message;
  const unavailable = (): Reading<bigint> => ({ ok: false, reason });
  const pair = (): FigurePair => ({ before: unavailable(), after: unavailable() });
  return {
    kind: "separate",
    identity: null,
    account: null,
    sharesCollateralWithExisting: null,
    sharedPositions: null,
    untouched: null,
    figures: {
      equity: pair(),
      maintenance: pair(),
      buffer: pair(),
      freeCollateral: pair(),
      orderMargin: unavailable(),
      orderMarginBreakdown: { ok: false, reason },
      initialMarginRateBps: unavailable(),
      liquidationPrice: { before: { ok: false, reason }, after: { ok: false, reason } },
    },
    sizing: { ok: false, reason },
    funding: { ok: false, reason },
    signer: signerAuthority({ identity: null, connected: context.connected }),
    issues: [makeIssue({ code: "NO_ACCOUNT" })],
    eligible: false,
    canPlace: false,
    quote: null,
  };
}

function assessSnapshot(
  snapshot: AccountSnapshot | null,
  identity: AccountIdentity,
  context: RouteContext,
): SnapshotAssessment {
  const failed = (subject: string, details: string[] = []): SnapshotAssessment => {
    const issue = makeIssue({ code: "READ_FAILED", subject, details });
    return { issues: [issue], unavailableReason: issue.message, unpriceable: false };
  };
  if (snapshot === null) return failed(`Account state for ${shortAddress(identity.address)}`);
  if (!sameAddress(snapshot.account, identity.address)) {
    return failed("This account's state", ["The data received belongs to a different address."]);
  }
  if (!sameAddress(snapshot.marginBank, context.market.marginBank)) {
    return failed("This account's state", [
      `The data is for a different margin bank than ${context.market.displaySymbol} uses.`,
    ]);
  }

  const usability = riskUsability(snapshot);
  if (!usability.ok) {
    if (usability.code === "UNPRICEABLE") {
      const issue = makeIssue({ code: "UNPRICEABLE", scope: "account", detail: usability.reason });
      return { issues: [issue], unavailableReason: issue.message, unpriceable: true };
    }
    return failed("This account's margin state", [usability.reason]);
  }

  const issues: EligibilityIssue[] = [];
  if (usability.warnings.length > 0) {
    issues.push(makeIssue({ code: "READ_FAILED", subject: "This account", details: usability.warnings, partial: true }));
  }
  const freshness = snapshotFreshness(snapshot, { nowMs: context.nowMs, maxAgeMs: context.policy.maxSnapshotAgeMs });
  if (!freshness.fresh) {
    const issue = makeIssue({ code: "STALE_ACCOUNT", message: freshness.reason ?? "Account data is out of date." });
    return { issues: [...issues, issue], unavailableReason: issue.message, unpriceable: false };
  }
  return { issues, unavailableReason: null, unpriceable: false };
}

function assessQuote(quote: RouteQuote | null, identity: AccountIdentity, context: RouteContext): QuoteAssessment {
  if (quote === null) {
    const issue = makeIssue({ code: "READ_FAILED", subject: "The order preview for this account", details: [], pending: true });
    return { issues: [issue], unavailableReason: issue.message, unpriceable: false, validity: null };
  }
  const validity = quoteValidity(quote, context.intent, identity.address, context.nowMs, context.policy.maxQuoteAgeMs);
  // A preview for another order says nothing about this one, so none of its flags are read.
  if (!validity.valid && validity.reason !== "age" && validity.reason !== "timestamp") {
    const issue = makeIssue({ code: "STALE_QUOTE", message: validity.message });
    return { issues: [issue], unavailableReason: validity.message, unpriceable: false, validity };
  }

  const issues: EligibilityIssue[] = [];
  let unavailableReason: string | null = null;
  const unpriceable = !quote.priceable || quote.markPrice === null;
  // An unpriceable market also fails the reads that depend on the mark, so the price
  // feed is the cause to report, not the reads.
  if (unpriceable) {
    issues.push(makeIssue({ code: "UNPRICEABLE", scope: "order-market" }));
  } else if (quote.errors.length > 0) {
    const issue = makeIssue({ code: "READ_FAILED", subject: "Part of the order preview", details: quote.errors });
    issues.push(issue);
    unavailableReason = issue.message;
  }
  if (!validity.valid) {
    issues.push(makeIssue({ code: "STALE_QUOTE", message: validity.message }));
    unavailableReason ??= validity.message;
  }
  return { issues, unavailableReason, unpriceable, validity };
}

/** The protocol's own placement gates, as reported by the account's quote. */
function gateIssues(quote: RouteQuote, context: RouteContext): EligibilityIssue[] {
  const { market, intent } = context;
  const { margin, maxSize } = quote;
  if (margin === null || maxSize === null) {
    return [
      makeIssue({
        code: "READ_FAILED",
        subject: "The margin preview for this order",
        details: ["It came back incomplete."],
      }),
    ];
  }

  const issues: EligibilityIssue[] = [...poolGridIssues(maxSize, context)];
  if (margin.voucherBlocked) issues.push(makeIssue({ code: "VOUCHER_BLOCKED", market }));
  if (margin.restrictedBlocked) issues.push(makeIssue({ code: "RESTRICTED", market }));
  if (margin.isolationBlocked) issues.push(makeIssue({ code: "ISOLATED", market }));

  // Margin gates go before the size cap: when both name the same cause, de-duplication
  // keeps the first, and the margin gate is the one that knows the exact shortfall.
  const pulled = margin.ownWalletPull + margin.mainWalletPull;
  if (!margin.hasCollateralForLock) {
    const available = margin.unlockedCollateral + pulled;
    issues.push(
      makeIssue({
        code: "INSUFFICIENT_COLLATERAL",
        market,
        variant: "lock",
        lockAmount: margin.lockAmount,
        available,
        shortfall: margin.lockAmount > available ? margin.lockAmount - available : null,
      }),
    );
  }
  if (!margin.meetsInitialMargin) issues.push(makeIssue({ code: "INITIAL_MARGIN", market }));
  if (margin.mainFundingBlocked) {
    issues.push(makeIssue({ code: "MAIN_FUNDING_BLOCKED", blocking: !margin.sufficient }));
  }

  if (!maxSize.placeable || intent.quantity > maxSize.maxQuantity) {
    issues.push(sizeLimitIssue(maxSize, market));
  }

  if (!margin.sufficient && !issues.some((issue) => issue.blocking)) {
    const walletShort = margin.topUpRequired - pulled;
    issues.push(
      makeIssue(
        walletShort > 0n
          ? {
              code: "INSUFFICIENT_COLLATERAL",
              market,
              variant: "walletTopUp",
              topUpRequired: margin.topUpRequired,
              shortfall: walletShort,
            }
          : { code: "INSUFFICIENT_COLLATERAL", market, variant: "rejected" },
      ),
    );
  }
  return issues;
}

/**
 * The market row's grid is indexed data; the size preview reads the pool's own lot and
 * minimum. When they disagree the pool wins, because the pool is what reverts.
 */
function poolGridIssues(maxSize: NonNullable<RouteQuote["maxSize"]>, context: RouteContext): EligibilityIssue[] {
  const { market, intent } = context;
  const issues: EligibilityIssue[] = [];
  if (maxSize.minQuantity !== undefined && intent.quantity < maxSize.minQuantity) {
    issues.push(
      makeIssue({
        code: "BELOW_MIN",
        message: `Minimum size on the pool is ${formatQuantity(maxSize.minQuantity, market, { withSymbol: true })}.`,
      }),
    );
  }
  if (maxSize.lotSize !== undefined && maxSize.lotSize > 0n && intent.quantity % maxSize.lotSize !== 0n) {
    issues.push(
      makeIssue({
        code: "OFF_GRID",
        message: `Size must be a multiple of ${formatQuantity(maxSize.lotSize, market, { withSymbol: true })} on the pool.`,
      }),
    );
  }
  return issues;
}

function sizeLimitIssue(maxSize: NonNullable<RouteQuote["maxSize"]>, market: MarketMeta): EligibilityIssue {
  const { maxQuantity } = maxSize;
  switch (maxSize.limitedBy) {
    case "collateral":
    case "walletBalance":
    case "walletAllowance":
    case "mainWallet":
      return makeIssue({ code: "INSUFFICIENT_COLLATERAL", market, variant: maxSize.limitedBy, maxQuantity });
    case "initialMargin":
      return makeIssue({ code: "INITIAL_MARGIN", market });
    case "maxPositionSize":
      return makeIssue({ code: "MAX_POSITION", market, maxQuantity, maxPositionSize: maxSize.maxPositionSize });
    case "voucherBlocked":
      return makeIssue({ code: "VOUCHER_BLOCKED", market });
    case "mainFundingBlocked":
      return makeIssue({ code: "MAIN_FUNDING_BLOCKED", blocking: true });
    case "restricted":
      return makeIssue({ code: "RESTRICTED", market });
    case "isolated":
      return makeIssue({ code: "ISOLATED", market });
    case null:
      return makeIssue({ code: "SIZE_LIMIT", market, maxQuantity });
  }
}

function gasIssues(
  snapshot: AccountSnapshot | null,
  identity: AccountIdentity,
  context: RouteContext,
): EligibilityIssue[] {
  if (snapshot === null || !sameAddress(snapshot.account, identity.address)) return [];
  if (snapshot.gasBalance === null) {
    return [makeIssue({ code: "READ_FAILED", subject: "This wallet's STT balance for gas", details: [] })];
  }
  if (snapshot.gasBalance < context.policy.minGasWei) {
    return [makeIssue({ code: "NO_GAS", balance: snapshot.gasBalance, required: context.policy.minGasWei })];
  }
  return [];
}

function signerIssues(signer: SignerAuthority): EligibilityIssue[] {
  switch (signer.status) {
    case "ready":
      return [];
    case "watch-only":
      return [makeIssue({ code: "WATCH_ONLY", signer })];
    case "not-connected":
      return [makeIssue({ code: "NOT_CONNECTED", signer })];
    case "wrong-chain":
      return [makeIssue({ code: "WRONG_CHAIN", signer })];
    case "mismatch":
      return signer.chainMatches
        ? [makeIssue({ code: "WALLET_MISMATCH", signer })]
        : [makeIssue({ code: "WALLET_MISMATCH", signer }), makeIssue({ code: "WRONG_CHAIN", signer })];
  }
}

function buildFigures(
  route: RouteAccountInput,
  quote: RouteQuote | null,
  beforeReason: string | null,
  afterReason: string | null,
): RouteFigures {
  const asRead = beforeFigures(beforeReason === null ? route.snapshot : null, beforeReason);
  const projected = afterFigures(quote, afterReason);
  return {
    equity: { before: asRead.equity, after: projected.equity },
    maintenance: { before: asRead.maintenance, after: projected.maintenance },
    buffer: { before: asRead.buffer, after: projected.buffer },
    freeCollateral: { before: asRead.freeCollateral, after: projected.freeCollateral },
    orderMargin: projected.orderMargin,
    orderMarginBreakdown: projected.orderMarginBreakdown,
    initialMarginRateBps: projected.initialMarginRateBps,
    liquidationPrice: { before: projected.liquidationNow, after: projected.liquidationAfter },
  };
}

/** The account exactly as read from the chain. */
function beforeFigures(snapshot: AccountSnapshot | null, reason: string | null) {
  const margin = snapshot?.margin ?? null;
  const unavailable = reason ?? "The margin account could not be read.";
  const read = (pick: (m: NonNullable<AccountSnapshot["margin"]>) => bigint): Reading<bigint> =>
    snapshot !== null && margin !== null
      ? { ok: true, value: pick(margin), source: marginSource(snapshot) }
      : missing(unavailable);
  return {
    equity: read((m) => m.equity),
    maintenance: read((m) => m.mmReq),
    buffer: snapshot === null ? missing(unavailable) : accountBuffer(snapshot),
    freeCollateral: read((m) => m.unlockedCollateral),
  };
}

/** The SDK's projection of this order, assuming it fills in full at its limit price. */
function afterFigures(quote: RouteQuote | null, reason: string | null) {
  const projection = quote?.projection ?? null;
  const margin = quote?.margin ?? null;
  const mark = quote?.markPrice ?? null;
  const projectionMissing = reason ?? "The SDK returned no projection for this order.";
  const marginMissing = reason ?? "The margin preview is missing.";
  const sdk = (value: bigint, via: PreviewRead, missingReason: string): Reading<bigint> =>
    quote === null ? missing(missingReason) : { ok: true, value, source: sdkSource(quote, via) };
  const liquidation = (
    interpreted: LiquidationPriceEstimate | undefined,
    raw: bigint | null,
    size: bigint,
  ): Reading<LiquidationView> =>
    quote !== null && mark !== null
      ? {
          ok: true,
          value: liquidationView(interpreted ?? interpretLiquidationSolve(raw, size), size, mark),
          source: sdkSource(quote, "previewPerpLiquidationPrice"),
        }
      : { ok: false, reason: projectionMissing };

  return {
    equity: projection
      ? sdk(projection.projectedEquity, "previewPerpLiquidationPrice", projectionMissing)
      : missing(projectionMissing),
    maintenance: projection
      ? sdk(projection.projectedMmReq, "previewPerpLiquidationPrice", projectionMissing)
      : missing(projectionMissing),
    buffer: projectedBuffer(quote, projectionMissing),
    freeCollateral: freeCollateralAfterLock(quote, marginMissing),
    orderMargin: margin ? sdk(margin.lockAmount, "previewPerpOrderMargin", marginMissing) : missing(marginMissing),
    orderMarginBreakdown: orderMarginBreakdown(quote, marginMissing),
    initialMarginRateBps:
      quote !== null && quote.effectiveImfBps !== null
        ? sdk(quote.effectiveImfBps, "previewPerpOrderMargin", marginMissing)
        : missing(quote === null ? marginMissing : "The preview did not include the initial margin rate in force."),
    liquidationNow: projection
      ? liquidation(projection.currentLiquidation, projection.currentLiquidationPrice, projection.currentSize)
      : missing<LiquidationView>(projectionMissing),
    liquidationAfter: projection
      ? liquidation(projection.projectedLiquidation, projection.projectedLiquidationPrice, projection.projectedSize)
      : missing<LiquidationView>(projectionMissing),
  };
}

function freeCollateralAfterLock(quote: RouteQuote | null, unavailableReason: string): Reading<bigint> {
  const margin = quote?.margin ?? null;
  if (quote === null || margin === null) return missing(unavailableReason);
  return {
    ok: true,
    value: margin.unlockedCollateral + margin.ownWalletPull + margin.mainWalletPull - margin.lockAmount,
    source: {
      kind: "estimate",
      basis: "Unlocked collateral plus any wallet top-up minus this order's margin lock, from previewPerpOrderMargin",
      block: quote.block,
    },
  };
}

function orderMarginBreakdown(
  quote: RouteQuote | null,
  unavailableReason: string,
): RouteFigures["orderMarginBreakdown"] {
  const margin = quote?.margin ?? null;
  if (quote === null || margin === null) return missing(unavailableReason);
  return {
    ok: true,
    value: {
      initialMarginPortion: margin.initialMarginPortion,
      adverseGapPortion: margin.adverseGapPortion,
      feeHeadroom: margin.feeHeadroom,
    },
    source: sdkSource(quote, "previewPerpOrderMargin"),
  };
}

function projectedBuffer(quote: RouteQuote | null, unavailableReason: string): Reading<bigint> {
  const projection = quote?.projection ?? null;
  if (quote === null || projection === null) return missing(unavailableReason);
  if (projection.projectedMmReq === 0n) {
    return { ok: false, reason: NO_MAINTENANCE_REASON, source: sdkSource(quote, "previewPerpLiquidationPrice") };
  }
  return {
    ok: true,
    value: projection.projectedEquity - projection.projectedMmReq,
    source: {
      kind: "estimate",
      basis: "Projected equity minus projected maintenance requirement, from previewPerpLiquidationPrice",
      block: quote.block,
    },
  };
}

function sizingReading(quote: RouteQuote | null, afterReason: string | null, context: RouteContext): Reading<RouteSizing> {
  if (quote === null || quote.maxSize === null) {
    return { ok: false, reason: afterReason ?? "The size preview is missing." };
  }
  const size = quote.maxSize;
  return {
    ok: true,
    value: {
      maxQuantity: size.maxQuantity,
      placeable: size.placeable,
      limitedBy: size.limitedBy,
      maxPositionSize: size.maxPositionSize,
      positionSize: size.positionSize,
      fitsOrder: size.placeable && context.intent.quantity <= size.maxQuantity,
    },
    source: sdkSource(quote, "getMaxPerpOrderSize"),
  };
}

function fundingReading(
  quote: RouteQuote | null,
  afterReason: string | null,
  context: RouteContext,
): Reading<WalletFundingDisclosure> {
  if (quote === null || quote.margin === null) {
    return { ok: false, reason: afterReason ?? "The margin preview is missing." };
  }
  const margin = quote.margin;
  const anotherWalletPays = margin.mainWalletPull > 0n;
  return {
    ok: true,
    value: {
      topUpRequired: margin.topUpRequired,
      ownWalletPull: margin.ownWalletPull,
      mainWalletPull: margin.mainWalletPull,
      fundingPayer: margin.fundingPayer,
      anotherWalletPays,
      payerIsPrimary: anotherWalletPays && sameAddress(margin.fundingPayer, context.primary.identity.address),
      autoPullModelled: quote.autoPull === true,
    },
    source: sdkSource(quote, "previewPerpOrderMargin"),
  };
}

/**
 * Positions held by the account, in the context of this order. `null` when they were
 * not read: unknown is never presented as "no positions".
 */
function positionShares(
  snapshot: AccountSnapshot | null,
  identity: AccountIdentity,
  relation: "same-account" | "untouched-primary" | "untouched-other",
  context: RouteContext,
): PositionShare[] | null {
  if (snapshot === null || snapshot.positionsBlock === null || !sameAddress(snapshot.account, identity.address)) {
    return null;
  }
  const source = positionsSource(snapshot);
  return snapshot.positions
    .filter((position) => position.size !== 0n)
    .map((position) => {
      const sameMarket = sameAddress(position.pool, context.market.pool);
      return {
        pool: position.pool,
        symbol: position.baseSymbol ?? shortAddress(position.pool),
        side: position.side,
        size: position.size,
        sameMarketAsOrder: sameMarket,
        note: positionNote({
          relation,
          market: context.market,
          positionSide: position.side,
          orderSide: context.intent.side,
          sameMarket,
        }),
        source,
      };
    });
}

function untouchedAccount(
  kind: RouteKind,
  other: RouteAccountInput | null,
  context: RouteContext,
): UntouchedAccount | null {
  if (other === null) return null;
  if (kind === "shared" && sameAddress(other.identity.address, context.primary.identity.address)) return null;

  const snapshot = other.snapshot;
  const usable =
    snapshot !== null &&
    sameAddress(snapshot.account, other.identity.address) &&
    riskUsability(snapshot).ok &&
    snapshotFreshness(snapshot, { nowMs: context.nowMs, maxAgeMs: context.policy.maxSnapshotAgeMs }).fresh;
  const reason = usable ? null : untouchedUnavailableReason(snapshot, other.identity, context);
  const read = (value: (m: NonNullable<AccountSnapshot["margin"]>) => bigint): Reading<bigint> =>
    usable && snapshot !== null && snapshot.margin !== null
      ? { ok: true, value: value(snapshot.margin), source: marginSource(snapshot) }
      : { ok: false, reason: reason ?? "The margin account could not be read." };

  return {
    identity: other.identity,
    equity: read((m) => m.equity),
    maintenance: read((m) => m.mmReq),
    buffer: usable && snapshot !== null ? accountBuffer(snapshot) : { ok: false, reason: reason ?? "Unavailable." },
    freeCollateral: read((m) => m.unlockedCollateral),
    positions: positionShares(snapshot, other.identity, kind === "separate" ? "untouched-primary" : "untouched-other", context),
    note: untouchedNote(kind, context.market),
  };
}

function untouchedUnavailableReason(
  snapshot: AccountSnapshot | null,
  identity: AccountIdentity,
  context: RouteContext,
): string {
  if (snapshot === null || !sameAddress(snapshot.account, identity.address)) {
    return `Account state for ${shortAddress(identity.address)} could not be read.`;
  }
  const usability = riskUsability(snapshot);
  if (!usability.ok) return usability.reason;
  return (
    snapshotFreshness(snapshot, { nowMs: context.nowMs, maxAgeMs: context.policy.maxSnapshotAgeMs }).reason ??
    "Account data is out of date."
  );
}

function buildTradeoff(
  shared: RouteProjection,
  separate: RouteProjection,
  primaryQuote: RouteQuote | null,
): CapitalTradeoff {
  const primaryCouldFundOrder =
    shared.figures.orderMargin.ok && primaryQuote?.margin
      ? primaryQuote.margin.sufficient && primaryQuote.margin.hasCollateralForLock
      : null;
  return {
    primaryFreeCollateral: shared.figures.freeCollateral.before,
    separateFreeCollateral: separate.figures.freeCollateral.before,
    sharedOrderMargin: shared.figures.orderMargin,
    separateOrderMargin: separate.figures.orderMargin,
    primaryCouldFundOrder,
  };
}

function quoteStamp(quote: RouteQuote, validity: QuoteValidity | null): RouteProjection["quote"] {
  return {
    block: quote.block,
    readAt: quote.readAt,
    ageMs: validity?.valid ? validity.ageMs : null,
    fresh: validity?.valid === true,
  };
}

function makeIssue(detail: IssueDetail): EligibilityIssue {
  const { message, nextStep } = eligibilityCopy(detail);
  const issue: EligibilityIssue = {
    code: detail.code,
    category: CATEGORY[detail.code],
    blocking: isBlocking(detail),
    message,
    nextStep,
  };
  const shortfall = shortfallOf(detail);
  if (shortfall !== null) issue.shortfall = shortfall;
  return issue;
}

function isBlocking(detail: IssueDetail): boolean {
  if (detail.code === "READ_FAILED") return detail.partial !== true;
  if (detail.code === "MAIN_FUNDING_BLOCKED") return detail.blocking;
  return true;
}

function shortfallOf(detail: IssueDetail): EligibilityIssue["shortfall"] | null {
  if (detail.code === "INSUFFICIENT_COLLATERAL" && detail.shortfall !== undefined && detail.shortfall !== null && detail.shortfall > 0n) {
    return {
      asset: "collateral",
      amount: detail.shortfall,
      decimals: detail.market.quoteDecimals,
      symbol: detail.market.quoteSymbol,
    };
  }
  if (detail.code === "NO_GAS" && detail.required > detail.balance) {
    const { decimals, symbol } = hidekiTestnet.nativeCurrency;
    return { asset: "gas", amount: detail.required - detail.balance, decimals, symbol };
  }
  return null;
}

/**
 * One issue per cause. When the same cause is reported twice, a blocking report wins
 * over an informational one: a note must never mask a gate that refuses the order.
 */
function dedupe(issues: EligibilityIssue[]): EligibilityIssue[] {
  const kept = new Map<string, EligibilityIssue>();
  for (const issue of issues) {
    const key = issue.code === "READ_FAILED" ? `${issue.code}:${issue.message}` : issue.code;
    const existing = kept.get(key);
    if (existing === undefined || (!existing.blocking && issue.blocking)) kept.set(key, issue);
  }
  return [...kept.values()];
}

function orderIssues(issues: EligibilityIssue[]): EligibilityIssue[] {
  return issues
    .map((issue, index) => ({ issue, index }))
    .sort((a, b) => {
      const byCategory = CATEGORY_ORDER.indexOf(a.issue.category) - CATEGORY_ORDER.indexOf(b.issue.category);
      if (byCategory !== 0) return byCategory;
      if (a.issue.blocking !== b.issue.blocking) return a.issue.blocking ? -1 : 1;
      return a.index - b.index;
    })
    .map(({ issue }) => issue);
}

type PreviewRead = "previewPerpOrderMargin" | "getMaxPerpOrderSize" | "previewPerpLiquidationPrice";

/** Each preview is pinned to its own block; `quote.block` is only the fallback. */
function sdkSource(quote: RouteQuote, via: PreviewRead): Source {
  const pinned =
    via === "previewPerpOrderMargin"
      ? quote.blocks?.margin
      : via === "getMaxPerpOrderSize"
        ? quote.blocks?.maxSize
        : quote.blocks?.projection;
  return { kind: "sdk", block: pinned ?? quote.block, readAt: quote.readAt, via };
}

function missing<T = bigint>(reason: string): Reading<T> {
  return { ok: false, reason };
}
