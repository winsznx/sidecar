"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { NetworkLabel } from "@/components/icons/token-label";
import { ProvenanceBadge } from "@/components/ui/provenance-badge";
import { SiteHeader } from "@/components/ui/site-header";
import { Skeleton } from "@/components/ui/skeleton";
import type { WalletState } from "@/hooks/use-wallet-state";
import { chainAgeMs, NETWORK_NAME } from "@/lib/dreamdex/chain-age";
import { classifyError } from "@/lib/dreamdex/errors";
import { HIDEKI_CHAIN_ID, type ChainStatus } from "@/lib/dreamdex/types";
import { formatAge } from "@/lib/format/units";
import type { AccountBook } from "@/lib/wallets/identity";

import { WalletControl } from "./wallet-control";


/** A skeleton that keeps the caption's line height, so the row does not grow when the block arrives. */
function NetworkLinePlaceholder(): ReactNode {
  return (
    <span className="inline-flex items-center type-data text-caption">
      <Skeleton className="h-3.5 w-36" />
      {"​"}
    </span>
  );
}

function NetworkStatus({ chain, nowMs }: { chain: UseQueryResult<ChainStatus>; nowMs: number }): ReactNode {
  if (chain.isPending) {
    return (
      <span className="inline-flex items-center gap-2 type-data text-caption" aria-busy="true">
        <NetworkLinePlaceholder />
        <span className="sr-only">Reading the chain head</span>
      </span>
    );
  }
  if (chain.isError || chain.data === undefined) {
    return (
      <span className="type-data text-caption text-danger">
        Network unreachable. {classifyError(chain.error).nextStep}
      </span>
    );
  }
  const status = chain.data;
  if (!status.matches) {
    return (
      <span className="type-data text-caption text-danger">
        The RPC reports chain {status.chainId}, not {HIDEKI_CHAIN_ID}. Reads are not trusted.
      </span>
    );
  }
  const ageMs = chainAgeMs(status, nowMs);
  // Same words and order as the landing network line: the badge carries the block number.
  return (
    <span className="inline-flex items-center gap-1.5 type-data text-caption text-ink-3">
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-positive" />
      Block
      <ProvenanceBadge size="sm" source={{ kind: "chain", block: status.headBlock, readAt: status.readAt, via: "eth_blockNumber" }} />
      · {ageMs === null ? "age unknown" : `${formatAge(ageMs)} old`}
    </span>
  );
}

/** Network facts for the header's meta slot. Every figure in it is a live read. */
function NetworkMeta({ network }: { network: ReactNode }): ReactNode {
  return (
    <>
      <p
        aria-label="Network status"
        className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 max-sm:flex-col max-sm:items-start"
      >
        <NetworkLabel className="text-small text-ink-2">
          {NETWORK_NAME} · {HIDEKI_CHAIN_ID}
        </NetworkLabel>
        {network}
      </p>
      <span className="inline-flex h-6 items-center whitespace-nowrap rounded-full border border-dashed border-line-strong px-2.5 type-eyebrow text-ink-2">
        Paper funds only
      </span>
    </>
  );
}

/** Same rows and heights as the live header, so nothing moves when it arrives. */
export function TopBarSkeleton(): ReactNode {
  return (
    <SiteHeader
      current="trade"
      meta={<NetworkMeta network={<NetworkLinePlaceholder />} />}
      wallet={<Skeleton className="h-8 w-32 pointer-coarse:h-10" />}
    />
  );
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
  return (
    <SiteHeader
      current="trade"
      meta={<NetworkMeta network={<NetworkStatus chain={chain} nowMs={nowMs} />} />}
      wallet={<WalletControl wallet={wallet} book={book} />}
    />
  );
}
