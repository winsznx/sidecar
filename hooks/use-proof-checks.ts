"use client";

import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { useMemo, useSyncExternalStore } from "react";

import { deriveLiveChecks, findMarket, type LiveCheckRow, type Settled } from "@/components/evidence/live-checks";
import type { TimingSummary } from "@/lib/dreamdex/timing";

import { getBrowserAdapter } from "./use-perps-adapter";
import { sidecarKeys } from "./use-sidecar-queries";

export const proofKeys = {
  all: () => [...sidecarKeys.all, "proof"] as const,
  chain: () => [...proofKeys.all(), "chain"] as const,
  listing: () => [...proofKeys.all(), "listing"] as const,
  config: (marginBank: string | null) => [...proofKeys.all(), "config", marginBank] as const,
  health: (pool: string | null) => [...proofKeys.all(), "health", pool] as const,
};

function settle<T>(query: UseQueryResult<T>): Settled<T> {
  if (query.status === "success") return { state: "ok", value: query.data, readAt: new Date(query.dataUpdatedAt).toISOString() };
  if (query.status === "error") return { state: "error", error: query.error };
  return { state: "loading" };
}

// Each check runs every time the page opens, including a client-side return within the cache
// window, and again only when the person asks. No figure is carried over from an earlier visit.
const ON_DEMAND = { retry: false, staleTime: Number.POSITIVE_INFINITY, refetchOnMount: "always", refetchOnWindowFocus: false } as const;

export interface ProofLiveChecks {
  rows: LiveCheckRow[];
  running: boolean;
  /** ISO time of the newest finished read, `null` before the first. */
  lastRunAt: string | null;
  runAgain: () => void;
}

export function useProofLiveChecks(): ProofLiveChecks {
  const queryClient = useQueryClient();
  const chain = useQuery({ queryKey: proofKeys.chain(), queryFn: () => getBrowserAdapter().getChainStatus(), ...ON_DEMAND });
  const listing = useQuery({ queryKey: proofKeys.listing(), queryFn: () => getBrowserAdapter().getMarketListing(), ...ON_DEMAND });

  const markets = listing.data?.markets;
  const btc = markets ? findMarket(markets, "BTC") : null;
  const eth = markets ? findMarket(markets, "ETH") : null;
  const marginBank = btc?.marginBank ?? markets?.[0]?.marginBank ?? null;

  const config = useQuery({
    queryKey: proofKeys.config(marginBank),
    queryFn: () => {
      if (marginBank === null) throw new Error("No MarginBank is known yet.");
      return getBrowserAdapter().getSystemConfig(marginBank);
    },
    enabled: marginBank !== null,
    ...ON_DEMAND,
  });
  const btcHealth = useQuery({
    queryKey: proofKeys.health(btc?.pool ?? null),
    queryFn: () => {
      if (btc === null) throw new Error("BTC-PERP is not listed.");
      return getBrowserAdapter().getMarketHealth(btc.pool);
    },
    enabled: btc !== null,
    ...ON_DEMAND,
  });
  const ethHealth = useQuery({
    queryKey: proofKeys.health(eth?.pool ?? null),
    queryFn: () => {
      if (eth === null) throw new Error("ETH-PERP is not listed.");
      return getBrowserAdapter().getMarketHealth(eth.pool);
    },
    enabled: eth !== null,
    ...ON_DEMAND,
  });

  const queries = [chain, listing, config, btcHealth, ethHealth];
  const rows = deriveLiveChecks({
    chain: settle(chain),
    listing: settle(listing),
    config: settle(config),
    btc: settle(btcHealth),
    eth: settle(ethHealth),
  });
  const updated = queries.map((query) => Math.max(query.dataUpdatedAt, query.errorUpdatedAt)).filter((time) => time > 0);

  return {
    rows,
    running: queries.some((query) => query.isFetching),
    lastRunAt: updated.length > 0 ? new Date(Math.max(...updated)).toISOString() : null,
    runAgain: () => {
      void queryClient.refetchQueries({ queryKey: proofKeys.all() });
    },
  };
}

let timingVersion = 0;
const timingListeners = new Set<() => void>();
let stopTiming: (() => void) | null = null;

function subscribeTiming(onChange: () => void): () => void {
  timingListeners.add(onChange);
  stopTiming ??= getBrowserAdapter().timing.subscribe(() => {
    timingVersion += 1;
    for (const listener of timingListeners) listener();
  });
  return () => {
    timingListeners.delete(onChange);
    if (timingListeners.size === 0 && stopTiming !== null) {
      stopTiming();
      stopTiming = null;
    }
  };
}

/** Latency of every adapter read since Sidecar loaded in this tab, from the adapter's own recorder. */
export function useAdapterTiming(): TimingSummary[] {
  const version = useSyncExternalStore(
    subscribeTiming,
    () => timingVersion,
    () => -1,
  );
  return useMemo(() => (version < 0 ? [] : getBrowserAdapter().timing.summary()), [version]);
}
