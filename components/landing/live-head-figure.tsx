"use client";

import type { ReactNode } from "react";

import { chainAgeMs } from "@/lib/dreamdex/chain-age";
import { ProvenanceBadge } from "@/components/ui/provenance-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Unavailable } from "@/components/ui/unavailable";
import { useChainStatus } from "@/hooks/use-sidecar-queries";
import { useTradeClock } from "@/hooks/use-trade-clock";
import { classifyError } from "@/lib/dreamdex/errors";
import { HIDEKI_CHAIN_ID } from "@/lib/dreamdex/types";
import { formatAge, formatBlockNumber } from "@/lib/format/units";

// Matches the network line: past a minute the 10 s refreshes are failing.
const STALE_AFTER_MS = 60_000;

/**
 * The band's one big figure: Hideki's head block as this browser last read it. It is the only
 * number on the landing page that is not a sample, so it is set at headline size and keeps its
 * CHAIN badge; a failed or wrong-chain read shows why instead of a number.
 */
export function LiveHeadFigure(): ReactNode {
  const chain = useChainStatus();
  const nowMs = useTradeClock();

  let figure: ReactNode;
  let caption: ReactNode;
  if (chain.isPending) {
    figure = <Skeleton className="h-14 w-full max-w-md md:h-28" />;
    caption = "Reading the Hideki head block";
  } else if (chain.isError) {
    figure = <Unavailable reason={`Network unreachable. ${classifyError(chain.error).nextStep}`} />;
    caption = "No block shown until a read succeeds.";
  } else if (!chain.data.matches) {
    figure = (
      <Unavailable reason={`The RPC reports chain ${chain.data.chainId}, not ${HIDEKI_CHAIN_ID}. Nothing here is treated as live.`} />
    );
    caption = "No block shown for the wrong chain.";
  } else {
    const status = chain.data;
    figure = (
      <span className="flex flex-col items-start gap-4">
        <ProvenanceBadge source={{ kind: "chain", block: status.headBlock, readAt: status.readAt, via: "eth_blockNumber" }} />
        <span className="type-hero text-hero leading-none text-ink tabular">{formatBlockNumber(status.headBlock)}</span>
      </span>
    );
    const ageMs = chainAgeMs(status, nowMs);
    const stale = ageMs !== null && ageMs > STALE_AFTER_MS;
    caption = `${stale ? "Stale. " : ""}${ageMs === null ? "Read" : `Read ${formatAge(ageMs)} ago`} with eth_blockNumber, re-read every 10 s.`;
  }

  return (
    <div role="group" aria-label="Hideki head block" aria-busy={chain.isPending || undefined} className="flex min-w-0 flex-col gap-4">
      <p className="font-mono text-small font-medium uppercase tracking-[0.12em] text-ink-2">Head block on Hideki</p>
      <div className="min-w-0">{figure}</div>
      <p className="type-data text-small text-ink-3">{caption}</p>
    </div>
  );
}
