"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { TokenLabel } from "@/components/icons/token-label";
import { ProvenanceBadge, provenanceRuleClass } from "@/components/ui/provenance-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { Unavailable } from "@/components/ui/unavailable";
import { getBrowserAdapter } from "@/hooks/use-perps-adapter";
import { sidecarKeys } from "@/hooks/use-sidecar-queries";
import { classifyError } from "@/lib/dreamdex/errors";
import type { MarketListing, MarketMeta, Source } from "@/lib/dreamdex/types";
import { formatPrice, formatQuantity } from "@/lib/format/units";

const LISTING_REFRESH_MS = 30_000;
const SKELETON_TILES = 12;

/**
 * The full listing rather than `useMarkets`, because the listing keeps its Source: the badge and
 * the decision to show indexed marks both depend on whether the rows came from the indexer or
 * from the chain fallback.
 */
function useMarketListing(): UseQueryResult<MarketListing> {
  return useQuery<MarketListing>({
    queryKey: [...sidecarKeys.all, "landing", "market-listing"],
    queryFn: () => getBrowserAdapter().getMarketListing(),
    staleTime: LISTING_REFRESH_MS,
    refetchInterval: LISTING_REFRESH_MS,
  });
}

function gateWord(market: MarketMeta): string | null {
  if (market.tradeable === false) return "Not tradeable";
  if (market.restricted === true) return "Close only";
  return null;
}

function MarketTile({ market, source }: { market: MarketMeta; source: Source }): ReactNode {
  const gate = gateWord(market);
  const rule = provenanceRuleClass(source.kind);
  // The indexed mark is a display hint and is only shown when the rows came from the indexer.
  const mark = source.kind === "indexer" ? market.indexedMarkPrice : null;
  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-lg border border-line bg-panel px-4 py-3 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <TokenLabel symbol={market.displaySymbol} size={20} className="text-body font-semibold text-ink" />
        {gate !== null ? (
          <StatusPill size="sm" tone="warning" appearance="outline">
            {gate}
          </StatusPill>
        ) : null}
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-caption">
        {source.kind === "indexer" ? (
          <>
            <dt className="text-ink-3">Mark</dt>
            <dd className="min-w-0 text-right [overflow-wrap:anywhere] font-medium text-ink tabular">
              {mark === null ? <Unavailable variant="inline" reason="The indexer has no live mark for this market." /> : <span className={rule}>{formatPrice(mark, market)}</span>}
            </dd>
          </>
        ) : null}
        <dt className="text-ink-3">Min size</dt>
        <dd className="min-w-0 text-right [overflow-wrap:anywhere] text-ink-2 tabular">
          <span className={rule}>{formatQuantity(market.minQuantity, market)}</span>
        </dd>
        <dt className="text-ink-3">Tick</dt>
        <dd className="min-w-0 text-right [overflow-wrap:anywhere] text-ink-2 tabular">
          <span className={rule}>{formatPrice(market.tickSize, market)}</span>
        </dd>
      </dl>
    </li>
  );
}

const GRID = "grid grid-cols-2 gap-2.5 md:grid-cols-3 md:gap-3 lg:grid-cols-5 xl:grid-cols-6";

/** Every listed perp market, read in this browser. A failed read shows why, never an empty or zero list. */
export function LiveMarketList(): ReactNode {
  const listing = useMarketListing();

  let summary: ReactNode;
  let body: ReactNode;
  if (listing.isPending) {
    summary = (
      <>
        <Skeleton className="h-5 w-40" />
        <span className="sr-only">Reading the market list</span>
      </>
    );
    body = (
      <ul aria-hidden="true" className={GRID}>
        {Array.from({ length: SKELETON_TILES }, (_, index) => (
          <li key={index} className="rounded-lg border border-line bg-panel px-4 py-3">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="mt-3 h-3.5 w-full" />
            <Skeleton className="mt-1.5 h-3.5 w-4/5" />
          </li>
        ))}
      </ul>
    );
  } else if (listing.isError) {
    summary = <span className="text-body font-medium text-ink">Markets unavailable</span>;
    body = <Unavailable reason={`The market list could not be read. ${classifyError(listing.error).nextStep}`} />;
  } else if (listing.data.markets.length === 0) {
    summary = <span className="text-body font-medium text-ink">No markets listed</span>;
    body = <Unavailable reason="The listing answered with no perp markets. Nothing is shown until it lists one." />;
  } else {
    const { markets, source } = listing.data;
    summary = (
      <>
        <span className="text-body font-medium text-ink">
          <span className={provenanceRuleClass(source.kind)}>{markets.length}</span> perp market{markets.length === 1 ? "" : "s"} listed
        </span>
        <ProvenanceBadge source={source} size="sm" />
        <span className="text-caption text-ink-3">{source.kind === "indexer" ? "Marks and ticks" : "Ticks"} in USDso, sizes in the base token</span>
      </>
    );
    body = (
      <ul className={GRID}>
        {markets.map((market) => (
          <MarketTile key={market.pool} market={market} source={source} />
        ))}
      </ul>
    );
  }

  return (
    <div
      role="group"
      aria-label="Listed markets"
      aria-busy={listing.isPending || undefined}
      className="flex min-w-0 flex-col gap-4"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">{summary}</div>
      {body}
    </div>
  );
}
