"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { Address } from "viem";

import type { AccountSnapshot, ChainStatus, MarketMeta, OrderIntent, RouteQuote } from "@/lib/dreamdex/types";
import { HIDEKI_CHAIN_ID } from "@/lib/dreamdex/types";

import { getBrowserAdapter } from "./use-perps-adapter";

const MARKETS_STALE_MS = 30_000;
const ACCOUNT_REFRESH_MS = 10_000;
const QUOTE_STALE_MS = 5_000;

export const sidecarKeys = {
  all: ["sidecar", HIDEKI_CHAIN_ID] as const,
  markets: () => [...sidecarKeys.all, "markets"] as const,
  chainStatus: () => [...sidecarKeys.all, "chain-status"] as const,
  account: (marginBank: Address | null, account: Address | null) =>
    [...sidecarKeys.all, "account", marginBank, account] as const,
  accounts: () => [...sidecarKeys.all, "account"] as const,
  quote: (account: Address | null, intent: OrderIntent | null, autoPull: boolean) =>
    [...sidecarKeys.all, "quote", account, intent, autoPull] as const,
  quotes: () => [...sidecarKeys.all, "quote"] as const,
};

export function useMarkets(): UseQueryResult<MarketMeta[]> {
  return useQuery({
    queryKey: sidecarKeys.markets(),
    queryFn: () => getBrowserAdapter().listMarkets(),
    staleTime: MARKETS_STALE_MS,
    refetchInterval: MARKETS_STALE_MS,
  });
}

export function useChainStatus(): UseQueryResult<ChainStatus> {
  return useQuery({
    queryKey: sidecarKeys.chainStatus(),
    queryFn: () => getBrowserAdapter().getChainStatus(),
    refetchInterval: ACCOUNT_REFRESH_MS,
  });
}

/**
 * One account's chain state against the listed markets. Partial failures come back inside
 * the snapshot (readStatus, issues), so a resolved query is not a claim that every read worked.
 */
export function useAccountSnapshot(
  account: Address | null,
  marginBank: Address | null,
  markets: readonly MarketMeta[] | undefined,
): UseQueryResult<AccountSnapshot> {
  return useQuery({
    queryKey: sidecarKeys.account(marginBank, account),
    queryFn: () => {
      if (account === null || marginBank === null || markets === undefined) {
        throw new Error("Account snapshot requested without an account, MarginBank or market list.");
      }
      return getBrowserAdapter().getAccountSnapshot(account, marginBank, markets);
    },
    enabled: account !== null && marginBank !== null && markets !== undefined,
    refetchInterval: ACCOUNT_REFRESH_MS,
  });
}

/** The protocol's own sizing and margin preview for one account and one exact order. */
export function useRouteQuote(input: {
  account: Address | null;
  intent: OrderIntent | null;
  market: MarketMeta | null;
  autoPull?: boolean;
}): UseQueryResult<RouteQuote> {
  const { account, intent, market } = input;
  const autoPull = input.autoPull ?? true;
  return useQuery({
    queryKey: sidecarKeys.quote(account, intent, autoPull),
    queryFn: () => {
      if (account === null || intent === null || market === null) {
        throw new Error("Route quote requested without an account, order or market.");
      }
      return getBrowserAdapter().quoteRoute(account, intent, market, { autoPull });
    },
    enabled: account !== null && intent !== null && market !== null,
    staleTime: QUOTE_STALE_MS,
    refetchInterval: QUOTE_STALE_MS * 2,
  });
}
