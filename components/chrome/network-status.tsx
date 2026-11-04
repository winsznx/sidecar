"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { NetworkLabel } from "@/components/icons/token-label";
import { cx } from "@/components/ui/cx";
import { ProvenanceBadge } from "@/components/ui/provenance-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { chainAgeMs, NETWORK_NAME } from "@/lib/dreamdex/chain-age";
import { classifyError } from "@/lib/dreamdex/errors";
import { HIDEKI_CHAIN_ID, type ChainStatus } from "@/lib/dreamdex/types";
import { formatAge } from "@/lib/format/units";

// The head is re-read every 10 s; a reading older than a minute means the refreshes are failing.
const STALE_AFTER_MS = 60_000;

/** A skeleton that keeps the caption's line height, so the row does not grow when the block arrives. */
export function NetworkLinePlaceholder(): ReactNode {
  return (
    <span className="inline-flex items-center type-data text-caption">
      <Skeleton className="h-3.5 w-36" />
      {"​"}
    </span>
  );
}

export interface NetworkStatusProps {
  chain: UseQueryResult<ChainStatus>;
  nowMs: number;
}

/** The live head block and its age. A failed or mismatched read says so and shows no block. */
export function NetworkStatus({ chain, nowMs }: NetworkStatusProps): ReactNode {
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
  const stale = ageMs !== null && ageMs > STALE_AFTER_MS;
  // The badge carries the block number and its read time, so below xl the word "Block" is only
  // spoken, and between lg and xl, where the line shares a row with the nav, so is the age.
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap type-data text-caption text-ink-3">
      <span aria-hidden="true" className={cx("size-1.5 shrink-0 rounded-full max-sm:hidden", stale ? "bg-warning" : "bg-positive")} />
      {stale ? <span className="text-warning">Stale</span> : null}
      <span className="max-xl:sr-only">Block</span>
      <ProvenanceBadge size="sm" source={{ kind: "chain", block: status.headBlock, readAt: status.readAt, via: "eth_blockNumber" }} />
      <span className="lg:max-xl:sr-only">· {ageMs === null ? "age unknown" : `${formatAge(ageMs)} old`}</span>
    </span>
  );
}

/**
 * Network facts for the header's meta slot. Every figure in it is a live read.
 *
 * The network name only fits beside the nav from about 1344px, so narrower headers keep it for
 * screen readers and the tooltip, and the paper funds badge drops its tracked capitals. On a phone
 * the live dot goes too, so the block, its age and the badge share one row.
 */
export function NetworkMeta({ network }: { network: ReactNode }): ReactNode {
  const networkName = `${NETWORK_NAME} · ${HIDEKI_CHAIN_ID}`;
  return (
    <>
      <p aria-label="Network status" title={networkName} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
        <NetworkLabel className="text-small text-ink-2 max-[84rem]:sr-only">{networkName}</NetworkLabel>
        {network}
      </p>
      <span className="inline-flex h-6 items-center whitespace-nowrap rounded-full border border-dashed border-line-strong px-2.5 type-eyebrow text-ink-2 max-xl:px-2 max-xl:tracking-normal max-xl:normal-case max-sm:h-5 max-sm:px-1.5">
        Paper funds only
      </span>
    </>
  );
}
