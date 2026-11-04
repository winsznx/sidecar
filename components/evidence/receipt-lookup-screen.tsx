"use client";

import { FileSearch } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { buttonClassName } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Accent, SectionHeading } from "@/components/ui/section-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { useProofIndex, type ProofIndexLookup } from "@/hooks/use-proof-index";
import { PUBLIC_FILL_HASH } from "@/lib/evidence/public-fill";

import { ReceiptLookupForm } from "./receipt-lookup";
import { RecordedRunList, RecordListAlerts } from "./receipt-lookup-records";

function RecordedRuns({ lookup }: { lookup: ProofIndexLookup }): ReactNode {
  if (lookup.state === "loading") {
    return (
      <div aria-busy="true" className="flex flex-col gap-3">
        <span className="sr-only">Reading the list of recorded runs</span>
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }
  if (lookup.state === "error" || lookup.state === "invalid") return null;
  const entries = lookup.state === "ok" ? lookup.index.records : [];
  if (entries.length === 0) {
    return (
      <EmptyState icon={FileSearch} title="No runs recorded yet">
        Sidecar has not published a recorded run. Paste any Hideki transaction hash above to read its receipt from the chain.
      </EmptyState>
    );
  }
  return <RecordedRunList entries={entries} />;
}

/** Paste a hash to open its receipt, or pick one of the runs Sidecar recorded. Reads only. */
export function ReceiptLookupScreen(): ReactNode {
  const index = useProofIndex();
  return (
    <div className="flex flex-col gap-16 md:gap-24">
      <section aria-labelledby="receipt-lookup" className="flex flex-col gap-8">
        <SectionHeading
          as="h1"
          size="display"
          id="receipt-lookup"
          title={
            <>
              Open a <Accent>receipt</Accent>
            </>
          }
          lede="Paste a Hideki transaction hash. Sidecar reads the receipt from the chain, decodes the order and runs its truth checks against it. Nothing is sent."
        />
        <div className="max-w-measure">
          <ReceiptLookupForm labelledBy="receipt-lookup" />
        </div>
        <p className="text-small text-ink-2">
          No hash to hand?{" "}
          <Link href={`/receipt/${PUBLIC_FILL_HASH}`} className="font-semibold text-ink underline underline-offset-4 focus-ring rounded-xs">
            Open a decoded public fill
          </Link>
          , a BTC-PERP order another trader placed on Hideki.
        </p>
      </section>

      <section aria-labelledby="receipt-recorded" className="flex flex-col gap-6">
        <SectionHeading
          id="receipt-recorded"
          size="section"
          title="Recorded runs"
          lede="Sidecar's own orders, captured from Hideki and dated. Opening one reads its receipt from the chain again."
          actions={
            <Link href="/proof" className={buttonClassName({ variant: "ghost", size: "sm" })}>
              See the proof page
            </Link>
          }
        />
        <RecordListAlerts lookup={index.lookup} onReload={index.reload} fetching={index.fetching} />
        <RecordedRuns lookup={index.lookup} />
      </section>
    </div>
  );
}
