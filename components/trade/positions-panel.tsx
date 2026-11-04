"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import { TokenLabel } from "@/components/icons/token-label";
import { AccountBadge } from "@/components/ui/account-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { InlineAlert } from "@/components/ui/inline-alert";
import { KeyValueList, type KeyValueItem } from "@/components/ui/key-value-list";
import { Panel, PanelStrip, type FeedStatus } from "@/components/ui/panel";
import { ProvenanceBadge, provenanceRuleClass } from "@/components/ui/provenance-badge";
import { RiskPill } from "@/components/ui/risk-pill";
import { SideTag } from "@/components/ui/side-tag";
import { Skeleton } from "@/components/ui/skeleton";
import { Stat } from "@/components/ui/stat";
import { Unavailable } from "@/components/ui/unavailable";
import { classifyError } from "@/lib/dreamdex/errors";
import { HIDEKI_CHAIN_ID, type AccountSnapshot, type MarketMeta, type PositionSnapshot, type Source } from "@/lib/dreamdex/types";
import { formatAge, formatBlockNumber, formatPrice, formatQuantity, formatSignedUsdso, formatStt, formatUsdso, shortAddress } from "@/lib/format/units";
import { accountBuffer, gasSource, marginSource, positionsSource, snapshotAgeMs, snapshotFreshness } from "@/lib/risk/snapshot";
import type { AccountIdentity } from "@/lib/wallets/identity";

import { MARGIN_LABELS, riskLabelFor, riskStateFor } from "./trade-copy";

const COLLATERAL_DECIMALS_FALLBACK_REASON = "No listed market gives this collateral's decimals.";

function stripStatus(query: UseQueryResult<AccountSnapshot>, nowMs: number): { status: FeedStatus; items: string[]; age?: string } {
  const network = `Hideki ${HIDEKI_CHAIN_ID}`;
  if (query.data === undefined) return { status: "degraded", items: [network, query.isError ? "Read failed" : "Reading"] };
  const snapshot = query.data;
  const items = [network, `Block ${formatBlockNumber(snapshot.block)}`];
  const age = nowMs === 0 ? undefined : formatAge(snapshotAgeMs(snapshot, nowMs));
  if (snapshot.readStatus !== "verified") return { status: "degraded", items: [...items, snapshot.readStatus], age };
  if (query.isError || (nowMs !== 0 && !snapshotFreshness(snapshot, { nowMs }).fresh)) return { status: "stale", items, age };
  return { status: "live", items, age };
}

function magnitude(size: bigint): bigint {
  return size < 0n ? -size : size;
}

function marketFor(markets: readonly MarketMeta[], position: PositionSnapshot): MarketMeta | null {
  return markets.find((market) => market.pool.toLowerCase() === position.pool.toLowerCase()) ?? null;
}

function pnlEmphasis(value: bigint | null): string {
  if (value === null || value === 0n) return "text-ink";
  return value > 0n ? "text-long" : "text-short";
}

function Cell({ value, source, reason, className }: { value: string | null; source: Source; reason: string; className?: string }): ReactNode {
  if (value === null) return <Unavailable variant="inline" reason={reason} />;
  return <span className={[provenanceRuleClass(source.kind), className].filter(Boolean).join(" ")}>{value}</span>;
}

/** An unlisted pool has no symbol to resolve a logo from, so it keeps the bare address. */
function MarketName({ symbol, logo, className }: { symbol: string; logo: string | null; className?: string }): ReactNode {
  if (logo === null) return <span className={className}>{symbol}</span>;
  return (
    <TokenLabel symbol={logo} className={className}>
      {symbol}
    </TokenLabel>
  );
}

function PositionRows({ snapshot, markets }: { snapshot: AccountSnapshot; markets: readonly MarketMeta[] }): ReactNode {
  const source = positionsSource(snapshot);
  const rows = snapshot.positions.map((position) => {
    const market = marketFor(markets, position);
    const unpriced = "The protocol cannot currently price this market.";
    const unlisted = "Sidecar does not list this market, so its units are unknown.";
    return {
      position,
      symbol: market?.displaySymbol ?? position.baseSymbol ?? shortAddress(position.pool),
      logo: market?.baseSymbol ?? position.baseSymbol ?? null,
      size: market === null ? null : formatQuantity(magnitude(position.size), market, { withSymbol: true }),
      entry: market === null ? null : formatPrice(position.entryPrice, market),
      mark: market === null || position.markPrice === null || !position.priceable ? null : formatPrice(position.markPrice, market),
      pnl:
        market === null || position.unrealizedPnl === null
          ? null
          : formatSignedUsdso(position.unrealizedPnl, market.quoteDecimals, { symbol: market.quoteSymbol }),
      reason: market === null ? unlisted : unpriced,
    };
  });

  return (
    <>
      <div className="-mx-4 hidden sm:block md:-mx-5">
        <table className="w-full border-collapse text-small">
          <caption className="sr-only">Open positions on {shortAddress(snapshot.account)}</caption>
          <thead>
            <tr className="border-b border-line text-left text-caption whitespace-nowrap text-ink-3">
              <th scope="col" className="pt-1 pb-2 pr-3 pl-4 font-normal md:pl-5">Market</th>
              <th scope="col" className="px-3 pt-1 pb-2 font-normal">Side</th>
              <th scope="col" className="px-3 pt-1 pb-2 text-right font-normal">Size</th>
              <th scope="col" className="px-3 pt-1 pb-2 text-right font-normal">Entry</th>
              <th scope="col" className="px-3 pt-1 pb-2 text-right font-normal">Mark</th>
              <th scope="col" className="pt-1 pb-2 pr-4 pl-3 text-right font-normal md:pr-5">Unrealized PnL</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.position.pool} className="border-b border-dashed border-line whitespace-nowrap last:border-b-0">
                <th scope="row" className="py-3 pr-3 pl-4 text-left text-body font-semibold text-ink md:pl-5">
                  <MarketName symbol={row.symbol} logo={row.logo} />
                </th>
                <td className="px-3 py-3"><SideTag side={row.position.side} size="sm" /></td>
                <td className="px-3 py-3 text-right text-ink tabular"><Cell value={row.size} source={source} reason={row.reason} /></td>
                <td className="px-3 py-3 text-right text-ink tabular"><Cell value={row.entry} source={source} reason={row.reason} /></td>
                <td className="px-3 py-3 text-right text-ink tabular"><Cell value={row.mark} source={source} reason={row.reason} /></td>
                <td className="py-3 pr-4 pl-3 text-right text-body font-semibold tabular md:pr-5">
                  <Cell value={row.pnl} source={source} reason={row.reason} className={pnlEmphasis(row.position.unrealizedPnl)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col divide-y divide-line border-y border-line sm:hidden" aria-label={`Open positions on ${shortAddress(snapshot.account)}`}>
        {rows.map((row) => (
          <li key={row.position.pool} className="flex flex-col gap-2 py-3">
            <p className="flex items-center gap-2">
              <MarketName symbol={row.symbol} logo={row.logo} className="text-body font-semibold text-ink" />
              <SideTag side={row.position.side} size="sm" />
              <span className="ml-auto text-small text-ink tabular"><Cell value={row.size} source={source} reason={row.reason} /></span>
            </p>
            <KeyValueList
              density="compact"
              badges={false}
              items={[
                { id: "entry", label: "Entry", value: <Cell value={row.entry} source={source} reason={row.reason} /> },
                { id: "mark", label: "Mark", value: <Cell value={row.mark} source={source} reason={row.reason} /> },
                {
                  id: "pnl",
                  label: "Unrealized PnL",
                  value: <Cell value={row.pnl} source={source} reason={row.reason} className={pnlEmphasis(row.position.unrealizedPnl)} />,
                },
              ]}
            />
          </li>
        ))}
      </ul>
      <p className="mt-2 flex items-center justify-end gap-2 text-caption text-ink-3">
        Positions <ProvenanceBadge source={source} size="sm" />
      </p>
    </>
  );
}

/**
 * `compact` folds the breakdown and wallet rows away, for the second account whose headline
 * figures are what a trader compares; every row is still one click from view.
 */
function MarginSummary({ snapshot, collateral, compact }: { snapshot: AccountSnapshot; collateral: MarketMeta | null; compact: boolean }): ReactNode {
  const margin = snapshot.margin;
  const reason = snapshot.issues[0] ?? "The margin account could not be read.";
  const source = marginSource(snapshot);
  const decimals = collateral?.quoteDecimals ?? null;
  const symbol = collateral?.quoteSymbol ?? "USDso";
  const usd = (raw: bigint): string | null => (decimals === null ? null : formatUsdso(raw, decimals));

  const unavailableReason = margin === null ? reason : COLLATERAL_DECIMALS_FALLBACK_REASON;
  const equity = margin === null ? null : usd(margin.equity);
  const buffer = accountBuffer(snapshot);
  const signedUsd = (raw: bigint): string | null => (decimals === null ? null : formatSignedUsdso(raw, decimals));
  const room = buffer.ok ? signedUsd(buffer.value) : null;
  const marginItem = (id: string, label: string, raw: bigint | undefined, hint?: string): KeyValueItem => {
    const formatted = raw === undefined ? null : usd(raw);
    return formatted === null
      ? { id, label, hint, value: <Unavailable variant="inline" reason={margin === null ? reason : COLLATERAL_DECIMALS_FALLBACK_REASON} /> }
      : { id, label, hint, value: `${formatted} ${symbol}`, source };
  };

  const wallet: KeyValueItem[] = [
    snapshot.gasBalance === null
      ? { id: "gas", label: <TokenLabel symbol="STT">STT for gas</TokenLabel>, value: <Unavailable variant="inline" reason="The STT balance could not be read." /> }
      : { id: "gas", label: <TokenLabel symbol="STT">STT for gas</TokenLabel>, value: formatStt(snapshot.gasBalance, { withSymbol: true }), source: gasSource(snapshot) },
    snapshot.walletCollateral === null || decimals === null || !snapshot.sources?.walletCollateral
      ? { id: "wallet-usdso", label: <TokenLabel symbol={symbol}>{symbol} in wallet</TokenLabel>, value: <Unavailable variant="inline" reason="The wallet's collateral balance could not be read." /> }
      : {
          id: "wallet-usdso",
          label: <TokenLabel symbol={symbol}>{symbol} in wallet</TokenLabel>,
          hint: "Outside the margin account",
          value: formatUsdso(snapshot.walletCollateral.balance, decimals, { withSymbol: true, symbol }),
          source: snapshot.sources.walletCollateral,
        },
    snapshot.openOrders.status === "ok"
      ? { id: "orders", label: "Resting orders", value: String(snapshot.openOrders.orders.length), source: snapshot.openOrders.source }
      : { id: "orders", label: "Resting orders", value: <Unavailable variant="inline" reason={snapshot.openOrders.reason} /> },
  ];

  const breakdown: KeyValueItem[] = [
    marginItem("withdrawable", MARGIN_LABELS.withdrawable, margin?.withdrawable),
    marginItem("unlocked", MARGIN_LABELS.unlocked, margin?.unlockedCollateral, "Not locked, before PnL"),
    marginItem("locked", MARGIN_LABELS.locked, margin?.lockedCollateral),
    marginItem("mm", "Maintenance req.", margin?.mmReq),
  ];

  return (
    <div className="mt-2 flex flex-col gap-4 border-t border-dashed border-line-strong pt-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="type-eyebrow text-ink-3">Margin account</h4>
        <span className="flex items-center gap-2">
          <RiskPill state={riskStateFor(margin?.status)} label={riskLabelFor(margin?.status)} size="sm" />
          <ProvenanceBadge source={source} size="sm" />
        </span>
      </div>
      <div className="grid gap-x-6 gap-y-5 min-[26rem]:grid-cols-2">
        {/* Equity is a raw margin read, so the group's chain badge above labels it. */}
        {equity === null ? (
          <Stat state="unavailable" label={MARGIN_LABELS.equity} reason={unavailableReason} size="xl" />
        ) : (
          <Stat state="known" label={MARGIN_LABELS.equity} value={equity} unit={<TokenLabel symbol={symbol}>{symbol}</TokenLabel>} source={source} badge={false} size="xl" />
        )}
        {/* Room is Sidecar's own arithmetic over those reads, so it carries its own estimate badge. */}
        {!buffer.ok ? (
          <Stat state="unavailable" label={MARGIN_LABELS.room} reason={buffer.reason} size="xl" />
        ) : room === null ? (
          <Stat state="unavailable" label={MARGIN_LABELS.room} reason={COLLATERAL_DECIMALS_FALLBACK_REASON} size="xl" />
        ) : (
          <div className="flex flex-col gap-2.5">
            <Stat state="known" label={MARGIN_LABELS.room} value={room} unit={<TokenLabel symbol={symbol}>{symbol}</TokenLabel>} source={buffer.source} size="xl" />
            {/* Outside the Stat, so the line clears the estimate's dashed rule under the display figure. */}
            <p className="text-caption text-ink-3">Equity minus maintenance</p>
          </div>
        )}
      </div>
      {compact ? (
        <details className="group border-t border-dashed border-line-strong pt-3">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xs text-small font-medium text-ink-2 focus-ring hover:text-ink pointer-coarse:min-h-10 [&::-webkit-details-marker]:hidden">
            Margin breakdown and wallet
            <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-ink-3 transition-transform duration-fast group-open:rotate-180" />
          </summary>
          <div className="flex flex-col gap-4 pt-3">
            <MarginRows breakdown={breakdown} wallet={wallet} />
          </div>
        </details>
      ) : (
        <MarginRows breakdown={breakdown} wallet={wallet} />
      )}
    </div>
  );
}

function MarginRows({ breakdown, wallet }: { breakdown: readonly KeyValueItem[]; wallet: readonly KeyValueItem[] }): ReactNode {
  return (
    <>
      <div className="grid gap-x-8 sm:grid-cols-2">
        <KeyValueList density="compact" leaders badges={false} items={breakdown.slice(0, 2)} />
        <KeyValueList density="compact" leaders badges={false} items={breakdown.slice(2)} />
      </div>
      <div className="flex flex-col gap-1">
        <h4 className="type-eyebrow text-ink-3">Wallet, outside the margin account</h4>
        <KeyValueList density="compact" leaders items={wallet} />
      </div>
    </>
  );
}

/** Shaped like a read account: one position row, the margin header, six stats and the wallet rows. */
function LoadingBody(): ReactNode {
  return (
    <div aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">Reading this account from the chain</span>
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-4 w-24 self-end" />
      <div className="mt-2 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-6 w-40" />
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 7 }, (_, index) => (
            <Skeleton key={index} className="h-6 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Stands in for an account's panel before the market list (and so the account) can be read. */
export function PositionsSkeletonPanel({ index }: { index?: number }): ReactNode {
  return (
    <Panel
      variant="viewfinder"
      strip={<PanelStrip status="degraded" items={[`Hideki ${HIDEKI_CHAIN_ID}`, "Reading"]} />}
      eyebrow={index === undefined ? undefined : <Eyebrow index={index}>Your positions</Eyebrow>}
      title={<Skeleton className="h-7 w-56" />}
      titleAs="h3"
      aria-label="Account positions and margin, loading"
    >
      <LoadingBody />
    </Panel>
  );
}

export function AccountPositions({
  letter,
  identity,
  query,
  markets,
  collateral,
  nowMs,
  index,
  compact = false,
}: {
  letter: "A" | "B";
  identity: AccountIdentity;
  query: UseQueryResult<AccountSnapshot>;
  markets: readonly MarketMeta[];
  collateral: MarketMeta | null;
  nowMs: number;
  index?: number;
  compact?: boolean;
}): ReactNode {
  const strip = stripStatus(query, nowMs);
  const snapshot = query.data;

  return (
    <Panel
      variant="viewfinder"
      data-testid={`positions-${letter.toLowerCase()}`}
      strip={<PanelStrip status={strip.status} items={strip.items} age={strip.age} />}
      eyebrow={index === undefined ? undefined : <Eyebrow index={index}>Your positions</Eyebrow>}
      title={<AccountBadge account={letter} label={identity.label} address={identity.address} shortAddress={shortAddress(identity.address)} />}
      titleAs="h3"
      aria-label={`Account ${letter} positions and margin`}
    >
      {snapshot === undefined ? (
        query.isError ? (
          <InlineAlert tone="danger" title="This account could not be read">
            {classifyError(query.error).message} {classifyError(query.error).nextStep}
          </InlineAlert>
        ) : (
          <LoadingBody />
        )
      ) : (
        <div className="flex flex-col gap-3">
          {snapshot.issues.length > 0 ? (
            <InlineAlert tone={snapshot.readStatus === "partial" ? "warning" : "danger"} title={snapshot.readStatus === "partial" ? "Some reads are incomplete" : "Reads failed"}>
              <ul className="list-disc pl-4">
                {snapshot.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </InlineAlert>
          ) : null}
          {query.isError ? (
            <InlineAlert tone="warning" title="Showing the last successful read">
              The latest refresh failed: {classifyError(query.error).message}
            </InlineAlert>
          ) : null}
          {snapshot.positionsBlock === null ? (
            <Unavailable reason="Open positions could not be read." />
          ) : snapshot.positions.length === 0 ? (
            <EmptyState size="sm" title="No open positions on this account">
              Nothing here shares collateral with a new trade yet.
            </EmptyState>
          ) : (
            <PositionRows snapshot={snapshot} markets={markets} />
          )}
          <MarginSummary snapshot={snapshot} collateral={collateral} compact={compact} />
        </div>
      )}
    </Panel>
  );
}
