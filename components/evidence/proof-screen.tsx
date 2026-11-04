"use client";

import { RotateCw } from "lucide-react";
import type { ReactNode } from "react";

import { Band } from "@/components/ui/band";
import { Button } from "@/components/ui/button";
import { KeyValueList, type KeyValueItem } from "@/components/ui/key-value-list";
import { ProvenanceBadge } from "@/components/ui/provenance-badge";
import { Accent, SectionHeading } from "@/components/ui/section-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { Unavailable } from "@/components/ui/unavailable";
import { useAdapterTiming, useProofLiveChecks, type ProofLiveChecks } from "@/hooks/use-proof-checks";
import { useProofIndex, type ProofIndexLookup } from "@/hooks/use-proof-index";
import { HIDEKI_CHAIN_ID } from "@/lib/dreamdex/types";

import { ExportJsonButton } from "./export-json-button";
import { deriveJourneys, deriveProofRuns, type ProofRun } from "./journeys";
import { liveChecksSummary, type LiveCheckRow } from "./live-checks";
import { buildProofExport } from "./proof-export";
import { PublicFillCard } from "./public-fill-card";
import { ProofRuns, type RecordsState } from "./proof-runs";
import { formatIsoUtc } from "./receipt-model";
import { RecordedRunList, RecordListAlerts } from "./receipt-lookup-records";
import { ReceiptLookupForm } from "./receipt-lookup";

function checkItem(row: LiveCheckRow): KeyValueItem {
  const base = { id: row.id, label: row.label };
  if (row.status === "loading") return { ...base, value: <Skeleton className="h-4 w-24" /> };
  const value =
    row.value === null ? (
      <Unavailable variant="inline" reason={row.reason ?? "The read did not return a value."} />
    ) : (
      <span>{row.value}</span>
    );
  const reason = row.value !== null && row.reason !== null ? row.reason : null;
  // The badge sits under the label, not beside the value, so a narrow screen keeps one line for value and verdict.
  const hint =
    row.source !== null || reason !== null ? (
      <span className="mt-1 flex flex-col items-start gap-1">
        {reason !== null ? <span>{reason}</span> : null}
        {row.source !== null ? <ProvenanceBadge source={row.source} size="sm" /> : null}
      </span>
    ) : undefined;
  return { ...base, value, hint, source: row.source ?? undefined, check: row.status };
}

function readTime(iso: string): string {
  return formatIsoUtc(iso).slice(11);
}

function summaryLine(rows: readonly LiveCheckRow[]): string {
  const summary = liveChecksSummary(rows);
  if (!summary.settled) return "Reading";
  return `${summary.passed} / ${summary.total} checks pass`;
}

/** The live head block for the band's corner. A failed read says so; it never reads as pending. */
function HeadCorner({ head, lastRunAt }: { head: LiveCheckRow | undefined; lastRunAt: string | null }): ReactNode {
  if (head === undefined || head.status === "loading") return <span>Reading head block</span>;
  if (head.value === null) return <span>Head block unavailable</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      <span>
        Head block {head.value}
        {lastRunAt ? ` · read ${readTime(lastRunAt)}` : ""}
      </span>
      {head.source !== null ? <ProvenanceBadge source={head.source} size="sm" /> : null}
    </span>
  );
}

/**
 * The page's one dark moment: a fresh read of the chain from this browser. The checklist is
 * composed here rather than with InspectionCard because rows can still be in flight, and a tally
 * over only the finished rows would overstate the pass count.
 */
function LiveRead({ live, exportJson }: { live: ProofLiveChecks; exportJson: () => string }): ReactNode {
  const summary = liveChecksSummary(live.rows);
  const head = live.rows.find((row) => row.id === "head-block");
  const reading = live.rows.filter((row) => row.status === "loading").length;
  return (
    <Band
      aria-labelledby="proof-live"
      padding="lg"
      corners={{
        topStart: <span>Somnia Hideki · {HIDEKI_CHAIN_ID}</span>,
        topEnd: <HeadCorner head={head} lastRunAt={live.lastRunAt} />,
        bottomStart: <span>Paper funds only</span>,
        bottomEnd: <span>Read from this browser</span>,
      }}
    >
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:gap-16">
        <div className="flex flex-col gap-8">
          <SectionHeading
            id="proof-live"
            size="display"
            eyebrow="Right now, on Hideki"
            title="Don't take our word. Read the chain."
            lede="These reads go from your browser to the public Hideki RPC and indexer. They ran when this page opened. Run them again and every value below is replaced by the new read."
          />
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <Button
              variant="accent"
              size="lg"
              loading={live.running}
              loadingLabel="Reading the chain"
              leading={<RotateCw aria-hidden="true" className="size-4" />}
              onClick={live.runAgain}
            >
              Read the chain again
            </Button>
            <p role="status" className="type-eyebrow text-ink-2">
              {summaryLine(live.rows)}
            </p>
          </div>
        </div>
        <article aria-labelledby="proof-live-checks" className="min-w-0 rounded-xl border border-line bg-raised shadow-card">
          <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-dashed border-line-strong px-5 py-3">
            <h3 id="proof-live-checks" className="type-eyebrow text-ink">
              Network checks
            </h3>
            <span className="type-eyebrow text-ink-3">{live.lastRunAt ? `${readTime(live.lastRunAt)}` : "Not read yet"}</span>
          </header>
          <div className="px-5 py-1" aria-busy={!summary.settled || undefined}>
            <KeyValueList leaders badges={false} items={live.rows.map(checkItem)} />
          </div>
          <footer className="flex flex-wrap items-end justify-between gap-4 border-t border-dashed border-line-strong px-5 py-3.5">
            <p className="type-eyebrow text-ink">
              {summary.passed} / {summary.total} pass
              {reading > 0 ? (
                <>
                  {" "}
                  <span aria-hidden="true">·</span> {reading} reading
                </>
              ) : null}
            </p>
            <ExportJsonButton
              build={exportJson}
              fileName="sidecar-proof-checks.json"
              label="Download as JSON"
              disabledReason={summary.settled ? undefined : "Checks are still reading."}
            />
          </footer>
        </article>
      </div>
    </Band>
  );
}

function OpenReceiptSection(): ReactNode {
  return (
    <section aria-labelledby="proof-open" className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] lg:gap-16">
      <SectionHeading
        id="proof-open"
        title="Open any receipt"
        lede="Paste a Hideki transaction hash. Sidecar reads the receipt from the chain, decodes the order and runs the checks every Sidecar order has to pass."
      />
      <div className="flex flex-col gap-6 lg:pt-3">
        <ReceiptLookupForm labelledBy="proof-open" />
      </div>
    </section>
  );
}

function recordsState(lookup: ProofIndexLookup): RecordsState {
  if (lookup.state === "loading") return "loading";
  if (lookup.state === "error" || lookup.state === "invalid") return "unavailable";
  return "read";
}

function heroLede(runs: readonly ProofRun[], records: RecordsState): string {
  if (records === "loading") return "Reading the list of recorded runs. Nothing below counts as recorded until it arrives.";
  if (records === "unavailable") return "The list of recorded runs couldn't be read, so no run is shown as recorded. The live chain checks below still run.";
  const recorded = runs.filter((run) => run.status === "recorded").length;
  if (recorded === 0) {
    return "Sidecar hasn't recorded a live run on Hideki yet. Each card says what its receipt will have to show, and the network checks below run in your browser now.";
  }
  return `${recorded} of ${runs.length} runs recorded. Each links to its receipt, which is read from the chain again when you open it.`;
}

export function ProofScreen(): ReactNode {
  const live = useProofLiveChecks();
  const timing = useAdapterTiming();
  const index = useProofIndex();
  const entries = index.lookup.state === "ok" ? index.lookup.index.records : [];
  const journeys = deriveJourneys(entries);
  const runs = deriveProofRuns(entries);
  const records = recordsState(index.lookup);

  const exportJson = (): string =>
    buildProofExport({
      exportedAt: new Date().toISOString(),
      checks: live.rows,
      timing,
      journeys,
      runs,
      records: index.lookup.state === "ok" ? index.lookup.index.records : index.lookup.state === "missing" ? [] : null,
    });

  return (
    <div className="flex flex-col gap-20 md:gap-28">
      <div className="flex flex-col gap-12 md:gap-16">
        <div className="flex flex-col gap-10">
          <SectionHeading
            as="h1"
            size="hero"
            title={
              <>
                Two trades. Two accounts. <Accent className="ms-0 ps-0">One chain to check.</Accent>
              </>
            }
          />
          <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:gap-16">
            <div className="flex min-w-0 flex-col gap-6">
              <p className="max-w-measure text-lead text-ink-2 md:text-title md:leading-relaxed">{heroLede(runs, records)}</p>
              <RecordListAlerts lookup={index.lookup} onReload={index.reload} fetching={index.fetching} />
            </div>
            <div className="lg:-mt-10">
              <PublicFillCard ownRuns={records !== "read" ? "unread" : runs.some((run) => run.status === "recorded") ? "recorded" : "none"} />
            </div>
          </div>
        </div>
        <section aria-labelledby="proof-runs" className="flex flex-col">
          <h2 id="proof-runs" className="sr-only">
            The three runs
          </h2>
          <ProofRuns runs={runs} records={records} />
        </section>
      </div>

      <LiveRead live={live} exportJson={exportJson} />

      <OpenReceiptSection />

      {entries.length > 0 ? (
        <section aria-labelledby="proof-records" className="flex flex-col gap-6">
          <SectionHeading
            id="proof-records"
            title="Every recorded run"
            lede="Captured from Hideki and dated. Opening one reads its receipt from the chain again. It is not a new transaction."
          />
          <RecordedRunList entries={entries} />
        </section>
      ) : null}

    </div>
  );
}
