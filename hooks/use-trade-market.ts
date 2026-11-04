"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import type { BookTopReading, MarketHealth, MarketMeta } from "@/lib/dreamdex/types";

import { getBrowserAdapter } from "./use-perps-adapter";
import { sidecarKeys } from "./use-sidecar-queries";

const HEALTH_REFRESH_MS = 10_000;
const BOOK_REFRESH_MS = 5_000;

export const tradeKeys = {
  marketHealth: (pool: string | null) => [...sidecarKeys.all, "market-health", pool] as const,
  bookTop: (pool: string | null) => [...sidecarKeys.all, "book-top", pool] as const,
};

/** The selected market's mark, feed and risk parameters from chain reads. */
export function useMarketHealth(market: MarketMeta | null): UseQueryResult<MarketHealth> {
  return useQuery({
    queryKey: tradeKeys.marketHealth(market?.pool ?? null),
    queryFn: () => {
      if (market === null) throw new Error("Market health requested without a market.");
      return getBrowserAdapter().getMarketHealth(market.pool);
    },
    enabled: market !== null,
    refetchInterval: HEALTH_REFRESH_MS,
  });
}

/** Best bid and ask on the selected market's book, read from pool state. */
export function useBookTop(market: MarketMeta | null): UseQueryResult<BookTopReading> {
  return useQuery({
    queryKey: tradeKeys.bookTop(market?.pool ?? null),
    queryFn: () => {
      if (market === null) throw new Error("Book top requested without a market.");
      return getBrowserAdapter().getBookTop(market);
    },
    enabled: market !== null,
    refetchInterval: BOOK_REFRESH_MS,
  });
}
