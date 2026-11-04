"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { WalletControl } from "@/components/trade/wallet-control";
import { SiteHeader, type SiteSection } from "@/components/ui/site-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccountBook } from "@/hooks/use-account-book";
import { useChainStatus } from "@/hooks/use-sidecar-queries";
import { useTradeClock } from "@/hooks/use-trade-clock";
import { useWalletState, type WalletState } from "@/hooks/use-wallet-state";
import type { ChainStatus } from "@/lib/dreamdex/types";
import type { AccountBook } from "@/lib/wallets/identity";

import { NetworkLinePlaceholder, NetworkMeta, NetworkStatus } from "./network-status";

export interface ChromeHeaderProps {
  current?: SiteSection;
  chain: UseQueryResult<ChainStatus>;
  nowMs: number;
  wallet: WalletState;
  book: AccountBook;
}

/**
 * The one header implementation. The trade screen feeds it the reads it already holds;
 * every other page goes through GlobalHeader, which makes the same reads itself.
 */
export function ChromeHeader({ current, chain, nowMs, wallet, book }: ChromeHeaderProps): ReactNode {
  return (
    <SiteHeader
      current={current}
      meta={<NetworkMeta network={<NetworkStatus chain={chain} nowMs={nowMs} />} />}
      wallet={<WalletControl wallet={wallet} book={book} />}
    />
  );
}

/** Same rows and heights as the live header, so nothing moves when it arrives. */
export function ChromeHeaderSkeleton({ current }: { current?: SiteSection }): ReactNode {
  return (
    <SiteHeader
      current={current}
      meta={<NetworkMeta network={<NetworkLinePlaceholder />} />}
      wallet={<Skeleton className="h-8 w-32 pointer-coarse:h-10" />}
    />
  );
}

/** The header every page outside the trade screen renders: nav, live network status and the wallet. */
export function GlobalHeader({ current }: { current?: SiteSection }): ReactNode {
  const chain = useChainStatus();
  const nowMs = useTradeClock();
  const wallet = useWalletState();
  const { book } = useAccountBook();
  return <ChromeHeader current={current} chain={chain} nowMs={nowMs} wallet={wallet} book={book} />;
}
