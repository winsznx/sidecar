"use client";

import type { ReactNode } from "react";

import { NetworkLabel } from "@/components/icons/token-label";
import { cx } from "@/components/ui/cx";
import { ProvenanceBadge } from "@/components/ui/provenance-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { Unavailable } from "@/components/ui/unavailable";
import { chainAgeMs, NETWORK_NAME } from "@/lib/dreamdex/chain-age";
import { useChainStatus } from "@/hooks/use-sidecar-queries";
import { useTradeClock } from "@/hooks/use-trade-clock";
import { classifyError } from "@/lib/dreamdex/errors";
import { HIDEKI_CHAIN_ID } from "@/lib/dreamdex/types";
import { formatAge } from "@/lib/format/units";

// The head is re-read every 10 s; a reading older than a minute means the refreshes are failing.
const STALE_AFTER_MS = 60_000;

export interface LiveNetworkLineProps {
  className?: string;
}

/**
 * Chain id and head block, read from Hideki in the browser. A failed read shows Unavailable
 * with the cause instead of a number, and a wrong chain is named rather than shown as live.
 */
export function LiveNetworkLine({ className }: LiveNetworkLineProps): ReactNode {
  const chain = useChainStatus();
  const nowMs = useTradeClock();

  let body: ReactNode;
  if (chain.isPending) {
    body = (
      <>
        <Skeleton className="h-4 w-56" />
        <span className="sr-only">Reading the Hideki head block</span>
      </>
    );
  } else if (chain.isError) {
    body = (
      <>
        <NetworkLabel>
          {NETWORK_NAME} · {HIDEKI_CHAIN_ID}
        </NetworkLabel>
        <Unavailable variant="inline" reason={`Network unreachable. ${classifyError(chain.error).nextStep}`} />
      </>
    );
  } else if (!chain.data.matches) {
    body = (
      <span className="text-danger">
        The RPC reports chain {chain.data.chainId}, not {HIDEKI_CHAIN_ID}. Nothing here is treated as live.
      </span>
    );
  } else {
    const status = chain.data;
    const ageMs = chainAgeMs(status, nowMs);
    const stale = ageMs !== null && ageMs > STALE_AFTER_MS;
    body = (
      <>
        <StatusPill size="sm" tone={stale ? "warning" : "positive"} appearance="outline">
          {stale ? "Stale" : "Live"}
        </StatusPill>
        <NetworkLabel>
          {NETWORK_NAME} · {status.chainId}
        </NetworkLabel>
        {/* Same words and order as the trade header ("Block … · … old"); the badge carries the number. */}
        <span className="inline-flex items-center gap-1.5">
          Block
          <ProvenanceBadge
            size="sm"
            source={{ kind: "chain", block: status.headBlock, readAt: status.readAt, via: "eth_blockNumber" }}
          />
          · {ageMs === null ? "age unknown" : `${formatAge(ageMs)} old`}
        </span>
      </>
    );
  }

  return (
    <div
      role="group"
      aria-label="Network status"
      aria-busy={chain.isPending || undefined}
      className={cx("flex flex-wrap items-center gap-x-3 gap-y-1.5 type-data text-caption text-ink-2", className)}
    >
      {body}
    </div>
  );
}
