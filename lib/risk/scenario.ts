import { perpLiquidationPrice, perpPositionAnalytics } from "@somnia-chain/markets-sdk";

import type { Reading } from "@/lib/dreamdex/types";
import { formatBps, formatPrice } from "@/lib/format/units";
import { DEFAULT_QUOTE_MAX_AGE_MS, quoteValidity } from "@/lib/orders/lifecycle";
import { SCENARIO_DISCLAIMER, SCENARIO_LABEL } from "@/lib/risk/explanations";
import { interpretLiquidationSolve, liquidationView } from "@/lib/risk/preview";
import {
  DEFAULT_SNAPSHOT_MAX_AGE_MS,
  findPosition,
  riskUsability,
  snapshotFreshness,
} from "@/lib/risk/snapshot";
import type { ScenarioFigures, ScenarioInput, ScenarioMove, ScenarioResult } from "@/lib/risk/types";
import { sameAddress } from "@/lib/wallets/identity";

/**
 * What-if estimate for a hypothetical mark move in ONE market.
 *
 * The arithmetic is the SDK's own pure kernels (`perpPositionAnalytics` for PnL and
 * maintenance, `perpLiquidationPrice` for the single-market solve), so a scenario and a
 * live preview cannot disagree on identical inputs. Everything else is held constant
 * and listed in `omitted`. The output is always labelled a scenario estimate.
 */

export const SCENARIO_OMITTED_TERMS: readonly string[] = [
  "funding during the move",
  "price impact and slippage",
  "auto-deleveraging (ADL)",
  "other markets moving",
  "mark price smoothing",
];

/** A move to zero or below is not a price. */
export const MIN_SCENARIO_MOVE_BPS = -9_999n;
/** Sanity bound for a slider: ten times the starting mark. */
export const MAX_SCENARIO_MOVE_BPS = 100_000n;

const BPS = 10_000n;

interface StartingState {
  equity: bigint;
  mmReq: bigint;
  size: bigint;
  entryPrice: bigint;
  mark: bigint | null;
  block: bigint;
  afterOrder: boolean;
}

export function estimateScenario(input: ScenarioInput): ScenarioResult {
  return {
    estimate: computeScenario(input),
    omitted: SCENARIO_OMITTED_TERMS,
    label: SCENARIO_LABEL,
    disclaimer: SCENARIO_DISCLAIMER,
  };
}

function computeScenario(input: ScenarioInput): Reading<ScenarioFigures> {
  const { market } = input;
  const start = startingState(input);
  if (!start.ok) return start;
  const state = start.value;

  const exposed = state.size !== 0n;
  if (!exposed) {
    const moved = state.mark === null ? null : applyMove(state.mark, input.move);
    return {
      ok: true,
      value: {
        marketSymbol: market.baseSymbol,
        startMark: state.mark,
        shockedMark: moved?.ok ? moved.value.price : null,
        moveBps: moved?.ok ? moved.value.moveBps : requestedBps(input.move),
        exposed: false,
        positionSize: 0n,
        equity: { start: state.equity, shocked: state.equity },
        maintenance: { start: state.mmReq, shocked: state.mmReq },
        buffer: { start: state.equity - state.mmReq, shocked: state.equity - state.mmReq },
        pnlChange: 0n,
        belowMaintenance: state.equity < state.mmReq,
        liquidationEstimate: liquidationView({ kind: "flat" }, 0n, state.mark),
        afterOrder: state.afterOrder,
      },
      source: {
        kind: "scenario",
        basis: `${market.baseSymbol} mark moved alone; this account holds no ${market.baseSymbol}, so nothing it holds is repriced`,
        block: state.block,
      },
    };
  }

  if (state.mark === null) return unavailable(`No live ${market.displaySymbol} mark to move.`);
  if (input.maintenanceMarginBps === null) {
    return unavailable(`The ${market.displaySymbol} maintenance threshold was not read.`);
  }
  const moved = applyMove(state.mark, input.move);
  if (!moved.ok) return moved;

  const oneBase = 10n ** BigInt(market.baseDecimals);
  // Funding indices are zeroed so only the price legs move: the funding already owed is
  // inside `equity`, and funding during the move is one of the omitted terms.
  const position = {
    size: state.size,
    avgEntryPrice: state.entryPrice,
    entryFundingIndex: 0n,
    projectedCumulativeFunding: 0n,
    oneBase,
    effectiveImfBps: 0n,
    maintenanceMarginBps: input.maintenanceMarginBps,
    closeOutMarginBps: 0n,
  };
  const atStart = perpPositionAnalytics({ ...position, markPrice: state.mark });
  const atShock = perpPositionAnalytics({ ...position, markPrice: moved.value.price });
  const pnlChange = atShock.unrealizedPnl - atStart.unrealizedPnl;
  const shockedEquity = state.equity + pnlChange;
  const shockedMm = state.mmReq - atStart.maintenanceMarginRequirement + atShock.maintenanceMarginRequirement;

  const liquidation = perpLiquidationPrice({
    equity: state.equity,
    mmReq: state.mmReq,
    size: state.size,
    markPrice: state.mark,
    maintenanceMarginBps: input.maintenanceMarginBps,
    oneBase,
  });

  return {
    ok: true,
    value: {
      marketSymbol: market.baseSymbol,
      startMark: state.mark,
      shockedMark: moved.value.price,
      moveBps: moved.value.moveBps,
      exposed: true,
      positionSize: state.size,
      equity: { start: state.equity, shocked: shockedEquity },
      maintenance: { start: state.mmReq, shocked: shockedMm },
      buffer: { start: state.equity - state.mmReq, shocked: shockedEquity - shockedMm },
      pnlChange,
      belowMaintenance: shockedEquity < shockedMm,
      liquidationEstimate: liquidationView(interpretLiquidationSolve(liquidation, state.size), state.size, state.mark),
      afterOrder: state.afterOrder,
    },
    source: {
      kind: "scenario",
      basis: `${market.baseSymbol} mark moved ${formatBps(moved.value.moveBps)} from ${formatPrice(state.mark, market, { withSymbol: true })}; funding and other markets held constant`,
      block: state.block,
    },
  };
}

function startingState(input: ScenarioInput): Reading<StartingState> {
  const { market, snapshot, quote } = input;
  const usability = riskUsability(snapshot);
  if (!usability.ok) {
    return unavailable(
      usability.code === "UNPRICEABLE"
        ? `${usability.reason} A scenario would hide that, so none is shown.`
        : usability.reason,
    );
  }
  if (snapshot === null || snapshot.margin === null) return unavailable("The margin account could not be read.");
  const freshness = snapshotFreshness(snapshot, {
    nowMs: input.nowMs,
    maxAgeMs: input.policy?.maxSnapshotAgeMs ?? DEFAULT_SNAPSHOT_MAX_AGE_MS,
  });
  if (!freshness.fresh) {
    return unavailable(`${freshness.reason ?? "Account data is out of date."} Refresh it to see a scenario.`);
  }

  if (input.includeOrder) {
    if (quote === null) return unavailable("No order preview to start from.");
    if (input.intent === null) return unavailable("No order on the ticket to start from.");
    if (!sameAddress(quote.intent.pool, market.pool)) return unavailable("The order preview is for a different market.");
    const validity = quoteValidity(
      quote,
      input.intent,
      snapshot.account,
      input.nowMs,
      input.policy?.maxQuoteAgeMs ?? DEFAULT_QUOTE_MAX_AGE_MS,
    );
    if (!validity.valid) return unavailable(validity.message);
    if (quote.errors.length > 0) return unavailable(`Some preview reads failed: ${quote.errors.join("; ")}`);
    if (!quote.priceable || quote.markPrice === null || quote.projection === null) {
      return unavailable(`The protocol cannot currently price ${market.displaySymbol}.`);
    }
    return {
      ok: true,
      value: {
        equity: quote.projection.projectedEquity,
        mmReq: quote.projection.projectedMmReq,
        size: quote.projection.projectedSize,
        entryPrice: quote.projection.projectedEntryPrice,
        mark: quote.markPrice,
        block: quote.block,
        afterOrder: true,
      },
      source: { kind: "sdk", block: quote.block, readAt: quote.readAt, via: "previewPerpLiquidationPrice" },
    };
  }

  const position = findPosition(snapshot, market.pool);
  const quoteIsCurrent =
    quote !== null &&
    input.intent !== null &&
    quoteValidity(quote, input.intent, snapshot.account, input.nowMs, input.policy?.maxQuoteAgeMs).valid;
  const quoteMark =
    quoteIsCurrent && quote.priceable && sameAddress(quote.intent.pool, market.pool) ? quote.markPrice : null;
  return {
    ok: true,
    value: {
      equity: snapshot.margin.equity,
      mmReq: snapshot.margin.mmReq,
      size: position?.size ?? 0n,
      entryPrice: position?.entryPrice ?? 0n,
      mark: position?.markPrice ?? quoteMark,
      block: snapshot.block,
      afterOrder: false,
    },
    source: { kind: "chain", block: snapshot.block, readAt: snapshot.readAt, via: "getMarginAccount" },
  };
}

function applyMove(mark: bigint, move: ScenarioMove): Reading<{ price: bigint; moveBps: bigint }> {
  if (mark <= 0n) return unavailable("The starting mark is not a positive price.");
  const scenarioSource = { kind: "scenario", basis: "hypothetical mark" } as const;
  if (move.kind === "bps") {
    if (move.bps < MIN_SCENARIO_MOVE_BPS || move.bps > MAX_SCENARIO_MOVE_BPS) return outOfRange();
    const price = (mark * (BPS + move.bps)) / BPS;
    if (price <= 0n) return outOfRange();
    return { ok: true, value: { price, moveBps: move.bps }, source: scenarioSource };
  }
  if (move.price <= 0n) return unavailable("A scenario price must be above zero.");
  const moveBps = ((move.price - mark) * BPS) / mark;
  if (moveBps < MIN_SCENARIO_MOVE_BPS || moveBps > MAX_SCENARIO_MOVE_BPS) return outOfRange();
  return { ok: true, value: { price: move.price, moveBps }, source: scenarioSource };
}

function requestedBps(move: ScenarioMove): bigint {
  return move.kind === "bps" ? move.bps : 0n;
}

function outOfRange<T>(): Reading<T> {
  return unavailable(
    `Choose a move between ${formatBps(MIN_SCENARIO_MOVE_BPS)} and +${formatBps(MAX_SCENARIO_MOVE_BPS)}.`,
  );
}

function unavailable<T>(reason: string): Reading<T> {
  return { ok: false, reason };
}
