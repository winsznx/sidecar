"use client";

import { useId, useMemo, useState, type ReactNode } from "react";

import { TokenLabel } from "@/components/icons/token-label";
import { AccountBadge } from "@/components/ui/account-badge";
import { KeyValueList } from "@/components/ui/key-value-list";
import { Panel } from "@/components/ui/panel";
import { ProvenanceBadge } from "@/components/ui/provenance-badge";
import { Slider } from "@/components/ui/slider";
import { Unavailable } from "@/components/ui/unavailable";
import type { AccountSnapshot, MarketHealth, MarketMeta, OrderIntent, RouteQuote, Source } from "@/lib/dreamdex/types";
import { formatPrice, formatSignedUsdso, formatUsdso, shortAddress } from "@/lib/format/units";
import { explainScenario, SCENARIO_DISCLAIMER, SCENARIO_LABEL } from "@/lib/risk/explanations";
import { estimateScenario } from "@/lib/risk/scenario";
import type { AccountIdentity } from "@/lib/wallets/identity";

const MIN_MOVE_PERCENT = -50;
const MAX_MOVE_PERCENT = 50;

function maintenanceBps(health: MarketHealth | undefined): bigint | null {
  if (health === undefined) return null;
  if (health.risk.ok) return health.risk.value.maintenanceMarginBps;
  if (health.snapshot.ok) return health.snapshot.value.maintenanceMarginBps;
  return null;
}

export function ScenarioPanel({
  market,
  health,
  identity,
  letter,
  snapshot,
  quote,
  intent,
  nowMs,
}: {
  market: MarketMeta;
  health: MarketHealth | undefined;
  identity: AccountIdentity | null;
  letter: "A" | "B";
  snapshot: AccountSnapshot | null;
  quote: RouteQuote | null;
  intent: OrderIntent | null;
  nowMs: number;
}): ReactNode {
  const [movePercent, setMovePercent] = useState(-10);
  const [includeOrder, setIncludeOrder] = useState(true);
  const toggleId = useId();
  const orderAvailable = quote !== null && intent !== null;
  const withOrder = includeOrder && orderAvailable;

  const result = useMemo(
    () =>
      nowMs === 0
        ? null
        : estimateScenario({
            market,
            maintenanceMarginBps: maintenanceBps(health),
            snapshot,
            quote,
            includeOrder: withOrder,
            intent,
            move: { kind: "bps", bps: BigInt(movePercent * 100) },
            nowMs,
          }),
    [health, intent, market, movePercent, nowMs, quote, snapshot, withOrder],
  );

  const scenarioSource: Source = {
    kind: "scenario",
    basis: `${market.baseSymbol} moves ${movePercent >= 0 ? "+" : ""}${movePercent}% from the mark; everything else held as read.`,
  };
  const usd = (raw: bigint): string => formatUsdso(raw, market.quoteDecimals, { withSymbol: true, symbol: market.quoteSymbol });
  const signed = (raw: bigint): string => formatSignedUsdso(raw, market.quoteDecimals, { withSymbol: true, symbol: market.quoteSymbol });
  const figures = result?.estimate.ok ? result.estimate.value : null;
  const valueText =
    figures?.shockedMark !== null && figures?.shockedMark !== undefined
      ? `${market.baseSymbol} ${movePercent >= 0 ? "+" : ""}${movePercent}% (${formatPrice(figures.shockedMark, market, { withSymbol: true })})`
      : `${market.baseSymbol} ${movePercent >= 0 ? "+" : ""}${movePercent}%`;

  return (
    <Panel
      title={
        <>
          {SCENARIO_LABEL}: what if <TokenLabel symbol={market.baseSymbol} size={20} /> moves?
        </>
      }
      titleAs="h3"
      actions={<ProvenanceBadge source={scenarioSource} />}
      className="border-dashed border-warning/50"
      data-testid="scenario-panel"
    >
      <div className="flex flex-col gap-4">
        <p className="text-small text-ink-2">
          A hypothetical, separate from every live figure above. It never changes the comparison or the order.
        </p>
        {identity === null ? (
          <Unavailable reason="Add an account to explore a scenario." />
        ) : (
          <>
            <AccountBadge account={letter} label={identity.label} address={identity.address} shortAddress={shortAddress(identity.address)} size="sm" />
            <Slider
              label={`Hypothetical ${market.baseSymbol} mark move`}
              value={movePercent}
              onValueChange={setMovePercent}
              min={MIN_MOVE_PERCENT}
              max={MAX_MOVE_PERCENT}
              step={1}
              origin={0}
              valueText={valueText}
              minLabel={`${MIN_MOVE_PERCENT}%`}
              maxLabel={`+${MAX_MOVE_PERCENT}%`}
              badge={<ProvenanceBadge source={scenarioSource} size="sm" />}
            />
            <label htmlFor={toggleId} className="inline-flex min-h-8 items-center gap-2 py-1 text-small text-ink-2 pointer-coarse:min-h-10 pointer-coarse:py-2">
              <input
                id={toggleId}
                type="checkbox"
                checked={withOrder}
                disabled={!orderAvailable}
                onChange={(event) => setIncludeOrder(event.target.checked)}
                className="size-4 accent-current focus-ring"
              />
              Include this order as if it filled
              {!orderAvailable ? <span className="text-ink-3">(needs a preview for this account)</span> : null}
            </label>
            {figures === null ? (
              <Unavailable reason={result !== null && !result.estimate.ok ? result.estimate.reason : "Waiting for live account data."} />
            ) : (
              <KeyValueList
                density="compact"
                items={[
                  { id: "pnl", label: "Change in unrealized PnL", value: signed(figures.pnlChange), source: scenarioSource },
                  { id: "equity", label: "Equity in this scenario", value: usd(figures.equity.shocked), source: scenarioSource },
                  { id: "mm", label: "Maintenance in this scenario", value: usd(figures.maintenance.shocked), source: scenarioSource },
                  { id: "buffer", label: "Buffer in this scenario", value: signed(figures.buffer.shocked), source: scenarioSource },
                ]}
              />
            )}
            {result !== null ? (
              <ul className="flex flex-col gap-1 text-caption text-ink-3">
                {explainScenario(result, market).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : (
              <p className="text-caption text-ink-3">{SCENARIO_DISCLAIMER}</p>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}
