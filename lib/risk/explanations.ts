import type { Address } from "viem";

import { HIDEKI_CHAIN_ID, type MarketMeta, type OrderSide, type Reading, type Source } from "@/lib/dreamdex/types";
import {
  formatBlockNumber,
  formatBps,
  formatPrice,
  formatQuantity,
  formatSignedUsdso,
  formatStt,
  formatUsdso,
  shortAddress,
  UNAVAILABLE_TEXT,
} from "@/lib/format/units";
import type {
  Comparison,
  EligibilityIssue,
  LiquidationView,
  PositionShare,
  RouteKind,
  RouteProjection,
  ScenarioResult,
} from "@/lib/risk/types";
import type { SignerAuthority } from "@/lib/wallets/identity";

/**
 * Every sentence Sidecar shows about a comparison. All of it is generated from the same
 * objects that gate the trade, so the copy cannot drift from the decision.
 */

export const UNPRICEABLE_MESSAGE = "Preview unavailable: the protocol cannot currently price this market.";
export const SEPARATE_TRADEOFF =
  "Separate accounts limit shared collateral exposure, but use capital less efficiently.";
export const SCENARIO_LABEL = "Scenario estimate";
export const SCENARIO_DISCLAIMER =
  "Scenario estimate: actual liquidation depends on live account and protocol state.";

export const ROUTE_TITLES: Record<RouteKind, string> = {
  shared: "Share with my current positions",
  separate: "Give this trade its own margin",
};

function fundingNextStep(symbol: string): string {
  return `Add ${symbol} to this wallet (the faucet sends it here) and approve it for the margin bank, then refresh. When the order is placed, the pool pulls it into this wallet's own margin account.`;
}

export type InsufficientCollateralVariant =
  | "lock"
  | "collateral"
  | "walletBalance"
  | "walletAllowance"
  | "mainWallet"
  | "walletTopUp"
  | "rejected";

/** Everything needed to word one eligibility issue. */
export type IssueDetail =
  | { code: "NO_ACCOUNT" }
  | { code: "SAME_ACCOUNT"; address: Address }
  | {
      code: "READ_FAILED";
      subject: string;
      details: string[];
      /** Some reads failed but the essential ones arrived. Not blocking. */
      partial?: boolean;
      /** The read has not produced a result yet. */
      pending?: boolean;
    }
  | { code: "UNPRICEABLE"; scope: "order-market" | "account"; detail?: string }
  | { code: "STALE_QUOTE"; message: string }
  | { code: "STALE_ACCOUNT"; message: string }
  | { code: "BELOW_MIN" | "OFF_GRID"; message: string }
  | {
      code: "INSUFFICIENT_COLLATERAL";
      market: MarketMeta;
      variant: InsufficientCollateralVariant;
      lockAmount?: bigint;
      available?: bigint;
      topUpRequired?: bigint;
      shortfall?: bigint | null;
      maxQuantity?: bigint;
    }
  | { code: "INITIAL_MARGIN"; market: MarketMeta }
  | { code: "VOUCHER_BLOCKED"; market: MarketMeta }
  | { code: "MAX_POSITION"; market: MarketMeta; maxQuantity: bigint; maxPositionSize: bigint }
  | { code: "SIZE_LIMIT"; market: MarketMeta; maxQuantity: bigint }
  | { code: "RESTRICTED"; market: MarketMeta }
  | { code: "ISOLATED"; market: MarketMeta }
  | { code: "MAIN_FUNDING_BLOCKED"; blocking: boolean }
  | { code: "NO_GAS"; balance: bigint; required: bigint }
  | { code: "NOT_CONNECTED" | "WALLET_MISMATCH" | "WATCH_ONLY"; signer: SignerAuthority }
  | { code: "WRONG_CHAIN"; signer: SignerAuthority };

export interface IssueCopy {
  message: string;
  nextStep: string;
}

export interface RouteExplanation {
  title: string;
  headline: string;
  points: string[];
  blockers: IssueCopy[];
  warnings: IssueCopy[];
  status: string;
}

export interface NumberProvenance {
  field: string;
  value: string;
  sourceLabel: string;
  detail: string;
  block: bigint | null;
  available: boolean;
}

export function eligibilityCopy(detail: IssueDetail): IssueCopy {
  switch (detail.code) {
    case "NO_ACCOUNT":
      return {
        message: "No second wallet added yet.",
        nextStep: "Add a second wallet you control, funded with its own USDso and STT.",
      };
    case "SAME_ACCOUNT":
      return {
        message: `${shortAddress(detail.address)} is your primary account. One address is one margin balance, so it cannot be the separate account.`,
        nextStep: "Add a different wallet as the second account.",
      };
    case "READ_FAILED":
      if (detail.partial === true) {
        return {
          message: `Some account reads are incomplete. ${detail.details.join(" ")}`.trim(),
          nextStep: "Refresh to retry. The figures shown use the reads that succeeded.",
        };
      }
      if (detail.pending === true) {
        return { message: `${detail.subject} is not available yet.`, nextStep: "Refresh the preview." };
      }
      return {
        message: [`${detail.subject} could not be read.`, ...detail.details].join(" "),
        nextStep: "Refresh. Orders stay off until the read succeeds.",
      };
    case "UNPRICEABLE":
      return {
        message:
          detail.scope === "order-market"
            ? UNPRICEABLE_MESSAGE
            : `Preview unavailable: ${lowerFirst(detail.detail ?? "the protocol cannot currently price a market this account holds.")}`,
        nextStep: "Wait for the price feed to recover, then refresh. Orders stay off until then.",
      };
    case "STALE_QUOTE":
      return { message: detail.message, nextStep: "Refresh the preview." };
    case "STALE_ACCOUNT":
      return { message: detail.message, nextStep: "Refresh before signing." };
    case "BELOW_MIN":
    case "OFF_GRID":
      return { message: detail.message, nextStep: "Correct the size or price." };
    case "INSUFFICIENT_COLLATERAL":
      return insufficientCollateralCopy(detail);
    case "INITIAL_MARGIN":
      return {
        message: "After this order locks its margin, the account would fall below its initial margin requirement.",
        nextStep: "Reduce the size, add USDso, or close another position.",
      };
    case "VOUCHER_BLOCKED":
      return {
        message: `Paper USDso can't open ${detail.market.displaySymbol}. This wallet trades on voucher credit, which only opens allowlisted markets.`,
        nextStep: "Pick an allowed market, or fund this wallet with its own USDso.",
      };
    case "MAX_POSITION": {
      const cap = formatQuantity(detail.maxPositionSize, detail.market, { withSymbol: true });
      const max = formatQuantity(detail.maxQuantity, detail.market, { withSymbol: true });
      return {
        message: `This order would take the ${detail.market.baseSymbol} position past the cap of ${cap} per account. The most this account can add is ${max}.`,
        nextStep: `Reduce the size to ${max} or less.`,
      };
    }
    case "SIZE_LIMIT": {
      const max = formatQuantity(detail.maxQuantity, detail.market, { withSymbol: true });
      return {
        message: `This order is larger than the ${max} this account can place right now.`,
        nextStep: "Reduce the size, then refresh.",
      };
    }
    case "RESTRICTED":
      return {
        message: `${detail.market.displaySymbol} is close-only right now. New positions can't be opened.`,
        nextStep: "Choose another market. Closing and reducing still work.",
      };
    case "ISOLATED":
      return {
        message: `This account is in isolated margin with a footprint in another market, so it can't trade ${detail.market.displaySymbol}.`,
        nextStep: "Use a different wallet, or close out the other market first.",
      };
    case "MAIN_FUNDING_BLOCKED":
      return detail.blocking
        ? {
            message:
              "This wallet still owes an earlier funding wallet, so its linked main wallet can't fund this order.",
            nextStep: "Repay the outstanding main-wallet funding, then refresh.",
          }
        : {
            message:
              "The linked main wallet can't fund this order while an earlier funding claim is outstanding. This wallet funds it alone.",
            nextStep: "No action needed for this order.",
          };
    case "NO_GAS": {
      const deficit = detail.required - detail.balance;
      return {
        message: `Not enough STT for gas: this wallet has ${formatStt(detail.balance, { withSymbol: true })} and the network requires ${formatStt(detail.required, { withSymbol: true })} up front before it accepts a perp order. Short by ${formatStt(deficit, { withSymbol: true, rounding: "ceil" })}. The gas actually spent is much lower.`,
        nextStep: "Add testnet STT to this wallet, then refresh.",
      };
    }
    case "NOT_CONNECTED":
      return { message: detail.signer.message, nextStep: "Connect your wallet." };
    case "WALLET_MISMATCH":
      return {
        message: detail.signer.message,
        nextStep: `Switch your wallet's active account to ${shortAddress(detail.signer.expected)}, then refresh the preview.`,
      };
    case "WATCH_ONLY":
      return {
        message: detail.signer.message,
        nextStep: "Connect this wallet with a signer, or choose an account you control.",
      };
    case "WRONG_CHAIN": {
      const network =
        detail.signer.connectedChainId === null ? "an unknown network" : `chain ${detail.signer.connectedChainId}`;
      return {
        message: `Your wallet is on ${network}. Switch to Hideki (${HIDEKI_CHAIN_ID}) to sign.`,
        nextStep: `Switch your wallet to Hideki (${HIDEKI_CHAIN_ID}).`,
      };
    }
  }
}

/** The note shown on a position in the context of one route. */
export function positionNote(input: {
  relation: "same-account" | "untouched-primary" | "untouched-other";
  market: MarketMeta;
  positionSide: OrderSide;
  orderSide: OrderSide;
  sameMarket: boolean;
}): string {
  const base = input.market.baseSymbol;
  switch (input.relation) {
    case "same-account":
      if (input.sameMarket) {
        return input.positionSide === input.orderSide
          ? `This ${base} order adds to this position.`
          : `This ${base} order reduces or flips this position.`;
      }
      return `Shares collateral with this ${base} order.`;
    case "untouched-primary":
      return `No shared margin with ${base} account`;
    case "untouched-other":
      return "Not affected by this order.";
  }
}

export function untouchedNote(kind: RouteKind, market: MarketMeta): string {
  return kind === "separate"
    ? `Unchanged by this order. Its collateral is not used for this ${market.baseSymbol} trade.`
    : "Unchanged by this order.";
}

export function placeButtonLabel(comparison: Comparison, kind: RouteKind): string {
  const route = comparison.routes[kind];
  if (route.account === null) return "Add a second wallet";
  return `Place ${comparison.market.baseSymbol} trade in ${shortAddress(route.account)}`;
}

export function explainComparison(comparison: Comparison): {
  shared: RouteExplanation;
  separate: RouteExplanation;
  tradeoff: string[];
} {
  return {
    shared: explainRoute(comparison, "shared"),
    separate: explainRoute(comparison, "separate"),
    tradeoff: tradeoffLines(comparison),
  };
}

export function explainRoute(comparison: Comparison, kind: RouteKind): RouteExplanation {
  const route = comparison.routes[kind];
  const { market } = comparison;
  const blockers = route.issues.filter((issue) => issue.blocking).map(toCopy);
  const warnings = route.issues.filter((issue) => !issue.blocking).map(toCopy);
  const points = kind === "shared" ? sharedPoints(comparison) : separatePoints(comparison);
  points.push(...fundingDisclosureLines(route, market));
  const liquidation = describeLiquidation(route.figures.liquidationPrice.after, market, "after");
  if (liquidation !== null) points.push(liquidation);

  return {
    title: ROUTE_TITLES[kind],
    headline: kind === "shared" ? sharedHeadline(route, market) : separateHeadline(route, market),
    points,
    blockers,
    warnings,
    status: routeStatus(route),
  };
}

/** Lines to show before signing when the pool would move wallet funds. */
export function fundingDisclosureLines(route: RouteProjection, market: MarketMeta): string[] {
  if (!route.funding.ok) return [];
  const funding = route.funding.value;
  if (!funding.autoPullModelled) {
    return [
      `This preview did not check wallet top-ups. If the margin account is short when the order is placed, the pool can pull ${market.quoteSymbol} from the wallet.`,
    ];
  }
  const lines: string[] = [];
  const amount = (raw: bigint): string =>
    formatUsdso(raw, market.quoteDecimals, { withSymbol: true, symbol: market.quoteSymbol, rounding: "ceil" });
  if (funding.anotherWalletPays) {
    lines.push(
      `Placing this order moves ${amount(funding.mainWalletPull)} from ${shortAddress(funding.fundingPayer)} into this account's margin.`,
    );
    if (funding.payerIsPrimary) {
      lines.push("That wallet is your primary account. Its margin balance is not used, but its wallet funds move.");
    }
  }
  if (funding.ownWalletPull > 0n) {
    const lead = funding.anotherWalletPays ? "It also moves" : "Placing this order moves";
    lines.push(`${lead} ${amount(funding.ownWalletPull)} from this wallet into its own margin account.`);
  }
  return lines;
}

/**
 * Plain wording for a liquidation solve. Always framed as an SDK estimate for one
 * market moving alone, never as a guarantee.
 */
export function describeLiquidation(
  reading: Reading<LiquidationView>,
  market: MarketMeta,
  when: "before" | "after",
): string | null {
  if (!reading.ok) return null;
  const subject = when === "after" ? "After this order" : "Now";
  const view = reading.value;
  if (view.atOrPastMark) {
    return `${subject}, SDK estimate: this account is at or below its maintenance level at the current mark.`;
  }
  switch (view.estimate.kind) {
    case "flat":
      return null;
    case "unreachable":
      return `${subject}, SDK estimate: no ${market.baseSymbol} price above zero reaches this account's maintenance level from ${market.baseSymbol} alone.`;
    case "breached":
      return `${subject}, SDK estimate: this account is at or below its maintenance level at the current mark.`;
    case "price":
      return `${subject}, SDK estimate: a ${market.baseSymbol} move alone reaches this account's maintenance level near ${formatPrice(view.estimate.price, market, { withSymbol: true, rounding: cautiousRounding(view) })}. Moves in other markets change this.`;
  }
}

/** Short label for a liquidation figure in a table cell. */
export function liquidationCell(reading: Reading<LiquidationView>, market: MarketMeta): string {
  if (!reading.ok) return UNAVAILABLE_TEXT;
  const view = reading.value;
  if (view.atOrPastMark) return "At or below maintenance now";
  switch (view.estimate.kind) {
    case "flat":
      return "No position";
    case "unreachable":
      return "None above zero";
    case "breached":
      return "At or below maintenance now";
    case "price":
      return formatPrice(view.estimate.price, market, { rounding: cautiousRounding(view) });
  }
}

/** Rounds a liquidation price toward the mark, so the figure shown is never the optimistic one. */
function cautiousRounding(view: LiquidationView): "ceil" | "floor" {
  return view.side === "short" ? "floor" : "ceil";
}

export function sourceLabel(source: Source): { label: string; detail: string; block: bigint | null } {
  switch (source.kind) {
    case "chain":
      return { label: "Chain read", detail: `${source.via} at block ${formatBlockNumber(source.block)}`, block: source.block };
    case "sdk":
      return {
        label: "SDK calculation",
        detail: `${source.via} at block ${formatBlockNumber(source.block)}`,
        block: source.block,
      };
    case "indexer":
      return {
        label: "Indexed data",
        detail: `${source.via}${source.updatedAtBlock === undefined ? "" : ` as of block ${formatBlockNumber(source.updatedAtBlock)}`}. Can lag the chain.`,
        block: source.updatedAtBlock ?? null,
      };
    case "estimate":
      return {
        label: "Sidecar estimate",
        detail: source.block === undefined ? source.basis : `${source.basis}, block ${formatBlockNumber(source.block)}`,
        block: source.block ?? null,
      };
    case "scenario":
      return {
        label: SCENARIO_LABEL,
        detail: source.block === undefined ? source.basis : `${source.basis}, block ${formatBlockNumber(source.block)}`,
        block: source.block ?? null,
      };
    case "simulated":
      return { label: "Simulated", detail: source.note, block: null };
  }
}

/** The "Why these numbers?" breakdown for one route: every figure with its source and block. */
export function whyTheseNumbers(comparison: Comparison, kind: RouteKind): NumberProvenance[] {
  const { market } = comparison;
  const figures = comparison.routes[kind].figures;
  const usdso = (raw: bigint): string =>
    formatUsdso(raw, market.quoteDecimals, { withSymbol: true, symbol: market.quoteSymbol });
  const signedUsdso = (raw: bigint): string =>
    formatSignedUsdso(raw, market.quoteDecimals, { withSymbol: true, symbol: market.quoteSymbol });

  const rows: NumberProvenance[] = [
    provenance("Equity before", figures.equity.before, usdso),
    provenance("Equity if the order fills", figures.equity.after, usdso),
    provenance("Maintenance requirement before", figures.maintenance.before, usdso),
    provenance("Maintenance requirement if the order fills", figures.maintenance.after, usdso),
    provenance("Buffer before", figures.buffer.before, signedUsdso),
    provenance("Buffer if the order fills", figures.buffer.after, signedUsdso),
    provenance("Free collateral before", figures.freeCollateral.before, usdso),
    provenance("Free collateral after the margin lock", figures.freeCollateral.after, signedUsdso),
    provenance("Margin this order locks", figures.orderMargin, usdso),
    provenance("Initial margin part", mapReading(figures.orderMarginBreakdown, (b) => b.initialMarginPortion), usdso),
    provenance("Reserve for entering away from the mark", mapReading(figures.orderMarginBreakdown, (b) => b.adverseGapPortion), usdso),
    provenance("Fee reserve (not locked)", mapReading(figures.orderMarginBreakdown, (b) => b.feeHeadroom), usdso),
    provenance("Initial margin rate in force", figures.initialMarginRateBps, (bps) => formatBps(bps)),
    provenance("Liquidation estimate now", figures.liquidationPrice.before, () =>
      liquidationCell(figures.liquidationPrice.before, market),
    ),
    provenance("Liquidation estimate if the order fills", figures.liquidationPrice.after, () =>
      liquidationCell(figures.liquidationPrice.after, market),
    ),
  ];
  const sizing = comparison.routes[kind].sizing;
  rows.push(
    provenance("Largest order this account can place", mapReading(sizing, (s) => s.maxQuantity), (raw) =>
      formatQuantity(raw, market, { withSymbol: true }),
    ),
  );
  return rows;
}

export function explainScenario(result: ScenarioResult, market: MarketMeta): string[] {
  if (!result.estimate.ok) return [`${SCENARIO_LABEL} unavailable: ${result.estimate.reason}`, result.disclaimer];
  const figures = result.estimate.value;
  const usdso = (raw: bigint): string =>
    formatUsdso(raw, market.quoteDecimals, { withSymbol: true, symbol: market.quoteSymbol });
  const lines: string[] = [];
  const move = `${figures.moveBps >= 0n ? "+" : ""}${formatBps(figures.moveBps)}`;
  const target =
    figures.shockedMark === null ? "" : ` to ${formatPrice(figures.shockedMark, market, { withSymbol: true })}`;

  if (!figures.exposed) {
    lines.push(
      `${SCENARIO_LABEL}: this account holds no ${figures.marketSymbol}, so a ${figures.marketSymbol} move alone leaves its figures unchanged.`,
    );
  } else {
    lines.push(
      `${SCENARIO_LABEL}: if ${figures.marketSymbol} moves ${move}${target}, this account's buffer goes from ${usdso(figures.buffer.start)} to ${usdso(figures.buffer.shocked)}.`,
    );
    lines.push(
      figures.belowMaintenance
        ? "In this scenario the account falls below its maintenance requirement, where liquidation can begin."
        : "In this scenario the account stays above its maintenance requirement.",
    );
  }
  lines.push(`Not modelled: ${result.omitted.join(", ")}.`);
  lines.push(result.disclaimer);
  return lines;
}

function insufficientCollateralCopy(detail: Extract<IssueDetail, { code: "INSUFFICIENT_COLLATERAL" }>): IssueCopy {
  const { market } = detail;
  const symbol = market.quoteSymbol;
  const usdso = (raw: bigint | undefined, rounding: "ceil" | "trunc"): string =>
    formatUsdso(raw ?? null, market.quoteDecimals, { withSymbol: true, symbol, rounding });
  const shortBy =
    detail.shortfall !== undefined && detail.shortfall !== null && detail.shortfall > 0n
      ? ` Short by ${usdso(detail.shortfall, "ceil")}.`
      : "";
  const capacity = sizeCapacity(detail.maxQuantity, market);
  switch (detail.variant) {
    case "lock":
      return {
        message: `Not enough ${symbol} in this account: the order locks ${usdso(detail.lockAmount, "ceil")} and ${usdso(detail.available, "trunc")} is available.${shortBy}`,
        nextStep: fundingNextStep(symbol),
      };
    case "collateral":
      return {
        message: `This account's free collateral ${capacity}.`,
        nextStep: `Reduce the size, or ${lowerFirst(fundingNextStep(symbol))}`,
      };
    case "walletBalance":
      return {
        message: `This wallet holds too little ${symbol} for the top-up this order needs. Its funding ${capacity}.`,
        nextStep: `Add ${symbol} to this wallet, or deposit into its margin account first.`,
      };
    case "walletAllowance":
      return {
        message: `This wallet has not approved enough ${symbol} for the margin bank. Its approval ${capacity}.`,
        nextStep: `Approve ${symbol} for the margin bank in your wallet, or deposit into the margin account first.`,
      };
    case "mainWallet":
      return {
        message: `The linked main wallet can't cover the rest of this order's margin. Together the wallets' funding ${capacity}.`,
        nextStep: `Fund the main wallet, or add ${symbol} to this wallet.`,
      };
    case "walletTopUp":
      return {
        message: `The wallets funding this order can't cover the ${usdso(detail.topUpRequired, "ceil")} it pulls.${shortBy}`,
        nextStep: `Add ${symbol} to this wallet or its margin account, then refresh.`,
      };
    case "rejected":
      return {
        message: "The protocol preview says this order would not be accepted from this account.",
        nextStep: `Reduce the size or add ${symbol}, then refresh.`,
      };
  }
}

/** "covers at most 0.0012 BTC", or the honest version when even the minimum is out of reach. */
function sizeCapacity(maxQuantity: bigint | undefined, market: MarketMeta): string {
  if (maxQuantity === undefined) return "does not cover this size";
  if (maxQuantity < market.minQuantity) return "does not cover even the minimum size";
  return `covers at most ${formatQuantity(maxQuantity, market, { withSymbol: true })}`;
}

function sharedHeadline(route: RouteProjection, market: MarketMeta): string {
  const base = market.baseSymbol;
  if (route.sharedPositions === null) {
    return `Sidecar could not read this account's positions, so it can't say what ${base} would share collateral with.`;
  }
  if (route.sharedPositions.length === 0) {
    return `This account has no open positions, so nothing shares collateral with ${base} yet.`;
  }
  return `${base} on this account shares collateral with your existing ${positionList(route.sharedPositions)}.`;
}

function separateHeadline(route: RouteProjection, market: MarketMeta): string {
  if (route.identity === null) return "Add a second wallet to give this trade its own margin.";
  if (route.issues.some((issue) => issue.code === "SAME_ACCOUNT")) {
    return "This is your primary address, so it shares the same margin balance.";
  }
  return `${market.baseSymbol} in your second wallet uses a different margin balance.`;
}

function sharedPoints(comparison: Comparison): string[] {
  const route = comparison.routes.shared;
  const points: string[] = [];
  if (route.sharedPositions !== null && route.sharedPositions.length > 0) {
    points.push(
      "Gains and losses on these positions offset each other in one account, and a loss on one can use collateral that backs the others.",
    );
  }
  return points;
}

function separatePoints(comparison: Comparison): string[] {
  const route = comparison.routes.separate;
  const { market } = comparison;
  if (route.identity === null || route.issues.some((issue) => issue.code === "SAME_ACCOUNT")) return [];
  const points = [SEPARATE_TRADEOFF];
  if (route.sharedPositions !== null && route.sharedPositions.length > 0) {
    points.push(`It shares collateral with that wallet's ${positionList(route.sharedPositions)}.`);
  }
  points.push(
    `This wallet needs its own ${market.quoteSymbol} for margin and its own STT for gas.`,
    "A position here can still be liquidated, against this wallet's own margin.",
  );
  return points;
}

function tradeoffLines(comparison: Comparison): string[] {
  const { market, tradeoff } = comparison;
  const usdso = (raw: bigint): string =>
    formatUsdso(raw, market.quoteDecimals, { withSymbol: true, symbol: market.quoteSymbol });
  const lines = [SEPARATE_TRADEOFF];
  if (tradeoff.separateOrderMargin.ok && tradeoff.primaryFreeCollateral.ok && tradeoff.primaryCouldFundOrder === true) {
    lines.push(
      `Your primary account has ${usdso(tradeoff.primaryFreeCollateral.value)} free, but the second wallet must post its own ${usdso(tradeoff.separateOrderMargin.value)} for this order.`,
    );
  } else if (tradeoff.separateOrderMargin.ok) {
    lines.push(`The second wallet must post its own ${usdso(tradeoff.separateOrderMargin.value)} for this order.`);
  }
  return lines;
}

function routeStatus(route: RouteProjection): string {
  if (route.canPlace) return `Ready. ${route.signer.message}`;
  const firstBlocker = route.issues.find((issue) => issue.blocking && issue.category !== "signer");
  if (firstBlocker) return `Can't place here: ${firstBlocker.message}`;
  return route.signer.message;
}

function positionList(positions: PositionShare[]): string {
  const symbols = [...new Set(positions.map((position) => position.symbol))];
  const names =
    symbols.length <= 1
      ? (symbols[0] ?? "")
      : `${symbols.slice(0, -1).join(", ")} and ${symbols[symbols.length - 1]}`;
  return `${names} position${positions.length === 1 ? "" : "s"}`;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function toCopy(issue: EligibilityIssue): IssueCopy {
  return { message: issue.message, nextStep: issue.nextStep };
}

function mapReading<T, U>(reading: Reading<T>, map: (value: T) => U): Reading<U> {
  return reading.ok ? { ok: true, value: map(reading.value), source: reading.source } : reading;
}

function provenance<T>(field: string, reading: Reading<T>, format: (value: T) => string): NumberProvenance {
  if (!reading.ok) {
    const source = reading.source ? sourceLabel(reading.source) : null;
    return {
      field,
      value: UNAVAILABLE_TEXT,
      sourceLabel: source?.label ?? UNAVAILABLE_TEXT,
      detail: reading.reason,
      block: source?.block ?? null,
      available: false,
    };
  }
  const source = sourceLabel(reading.source);
  return {
    field,
    value: format(reading.value),
    sourceLabel: source.label,
    detail: source.detail,
    block: source.block,
    available: true,
  };
}
