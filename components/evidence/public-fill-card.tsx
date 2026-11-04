"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { TokenLabel } from "@/components/icons/token-label";
import { FloatingCard } from "@/components/ui/floating-card";
import { KeyValueList, type KeyValueItem } from "@/components/ui/key-value-list";
import { ProvenanceBadge } from "@/components/ui/provenance-badge";
import { SideTag } from "@/components/ui/side-tag";
import { SkeletonText } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { Unavailable } from "@/components/ui/unavailable";
import { useReceiptReconcile, type ReceiptLookup } from "@/hooks/use-receipt-reconcile";
import { useMarkets } from "@/hooks/use-sidecar-queries";
import { PUBLIC_FILL_HASH } from "@/lib/evidence/public-fill";
import { classifyError } from "@/lib/dreamdex/errors";
import type { VerifiedOrder } from "@/lib/dreamdex/types";
import { formatBlockNumber } from "@/lib/format/units";

import { outcomeWords, priceText, quantityText } from "./receipt-format";
import { receiptSource } from "./receipt-model";

/** A real BTC-PERP fill on Hideki sent by another trader, so a visitor can open a decoded receipt today. */


function shortHash(hash: string): string {
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}

function fillItems(order: VerifiedOrder): KeyValueItem[] {
  const source = receiptSource(order);
  const market = order.market;
  const requested = order.requested;
  const notDecoded = <Unavailable variant="inline" label="Not decoded" reason="The calldata did not decode as a perp order." />;
  return [
    { id: "market", label: "Market", value: market ? <TokenLabel symbol={market.baseSymbol}>{market.displaySymbol}</TokenLabel> : <Unavailable variant="inline" label="Not listed" reason="The target is not in the market list." />, source },
    {
      id: "side",
      label: "Requested",
      value: requested ? (
        <span className="inline-flex items-center gap-2">
          <SideTag side={requested.side} size="sm" />
          {market ? <TokenLabel symbol={market.baseSymbol}>{quantityText(requested.quantity, market)}</TokenLabel> : quantityText(requested.quantity, market)}
        </span>
      ) : (
        notDecoded
      ),
      source,
    },
    { id: "price", label: "Limit price", value: requested ? priceText(requested.price, market) : notDecoded, source },
    { id: "filled", label: "Filled", value: quantityText(order.filledQuantity, market), hint: "Sum of decoded fills", source },
    { id: "outcome", label: "Outcome", value: outcomeWords(order.outcome), source },
  ];
}

function FillBody({ lookup, marketsError }: { lookup: ReceiptLookup; marketsError: string | null }): ReactNode {
  if (marketsError !== null) return <Unavailable reason={marketsError} />;
  switch (lookup.state) {
    case "loading":
      return (
        <div aria-busy="true">
          <SkeletonText lines={5} />
          <span className="sr-only">Reading the receipt from Hideki.</span>
        </div>
      );
    case "pending":
      return <Unavailable reason="The network reports the transaction as not mined yet." />;
    case "not-found":
      return <Unavailable reason="The RPC did not return this transaction." />;
    case "error":
      return <Unavailable reason={lookup.error.message} />;
    case "ready":
      return <KeyValueList leaders density="compact" badges={false} items={fillItems(lookup.order)} />;
  }
}

/**
 * The hero's focal card: a fill someone else placed on Hideki, decoded from the chain in this
 * browser. It sits in front of the empty plate for Sidecar's own run so the page shows a real
 * read without passing another trader's order off as Sidecar's.
 */
/** What the plate behind the card says about Sidecar's own runs. "unread" while the record list is loading or failed. */
export type OwnRunsState = "recorded" | "none" | "unread";

const OWN_RUNS_WORDS: Record<OwnRunsState, string> = {
  recorded: "Sidecar's own runs are below",
  none: "Sidecar's own run, not recorded",
  unread: "Sidecar's own runs, not read yet",
};

export function PublicFillCard({ ownRuns }: { ownRuns: OwnRunsState }): ReactNode {
  const markets = useMarkets();
  const { lookup } = useReceiptReconcile({ hash: PUBLIC_FILL_HASH, markets: markets.data, expectedAccount: null, counterpart: null });
  const order = lookup.state === "ready" ? lookup.order : null;
  const marketsError = markets.status === "error" ? classifyError(markets.error).message : null;

  return (
    <div className="relative isolate pt-11 pl-5 sm:pl-10">
      <div aria-hidden="true" className="absolute top-0 right-10 bottom-16 left-0 -z-10">
        <FloatingCard depth="back" tilt={-2} className="hatch size-full border-dashed border-line-strong">
          <span className="absolute top-3 left-4 rounded-xs border border-line bg-raised px-2 py-0.5 type-eyebrow text-ink-3">
            {OWN_RUNS_WORDS[ownRuns]}
          </span>
        </FloatingCard>
      </div>
      <FloatingCard as="figure" aria-labelledby="public-fill-title">
        <div className="flex flex-col gap-4 p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <h2 id="public-fill-title" className="text-body font-semibold text-ink">
                A real fill on Hideki, decoded
              </h2>
              <p className="text-caption text-ink-3">Placed by another trader, not by Sidecar.</p>
            </div>
            {order !== null ? <ProvenanceBadge source={receiptSource(order)} size="sm" /> : <StatusPill size="sm" appearance="outline">Reading</StatusPill>}
          </div>
          <div className="border-t border-dashed border-line-strong pt-2">
            <FillBody lookup={lookup} marketsError={marketsError} />
          </div>
          <Link
            href={`/receipt/${PUBLIC_FILL_HASH}`}
            className="group -mx-2 flex min-w-0 items-center justify-between gap-3 rounded-md px-2 py-2 focus-ring hover:bg-hover pointer-coarse:min-h-10"
          >
            <span className="flex min-w-0 flex-col">
              <span className="text-small font-medium text-ink">Open its receipt and checks</span>
              <span className="type-data text-caption text-ink-3 wrap-anywhere">
                {shortHash(PUBLIC_FILL_HASH)}
                {order !== null ? ` · block ${formatBlockNumber(order.block)}` : ""}
              </span>
            </span>
            <ArrowUpRight aria-hidden="true" className="size-4 shrink-0 text-ink-3 group-hover:text-ink" />
          </Link>
        </div>
      </FloatingCard>
    </div>
  );
}
