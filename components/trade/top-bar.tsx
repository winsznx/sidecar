"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { ChromeHeader, ChromeHeaderSkeleton } from "@/components/chrome/global-header";
import type { WalletState } from "@/hooks/use-wallet-state";
import type { ChainStatus } from "@/lib/dreamdex/types";
import type { AccountBook } from "@/lib/wallets/identity";

/** Same rows and heights as the live header, so nothing moves when it arrives. */
export function TopBarSkeleton(): ReactNode {
  return <ChromeHeaderSkeleton current="trade" />;
}

export function TopBar({
  chain,
  nowMs,
  wallet,
  book,
}: {
  chain: UseQueryResult<ChainStatus>;
  nowMs: number;
  wallet: WalletState;
  book: AccountBook;
}): ReactNode {
  return <ChromeHeader current="trade" chain={chain} nowMs={nowMs} wallet={wallet} book={book} />;
}
