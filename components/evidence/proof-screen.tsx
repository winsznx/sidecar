"use client";

import { RotateCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";

import { Band } from "@/components/ui/band";
import { buttonClassName, Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { KeyValueList, type KeyValueItem } from "@/components/ui/key-value-list";
import { ProvenanceBadge } from "@/components/ui/provenance-badge";
import { Accent, SectionHeading } from "@/components/ui/section-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { TextField } from "@/components/ui/text-field";
import { Unavailable } from "@/components/ui/unavailable";
import { useAdapterTiming, useProofLiveChecks, type ProofLiveChecks } from "@/hooks/use-proof-checks";
import { useProofIndex, type ProofIndexLookup } from "@/hooks/use-proof-index";
import { HIDEKI_CHAIN_ID } from "@/lib/dreamdex/types";
import { formatBlockNumber, shortAddress } from "@/lib/format/units";

import { ExportJsonButton } from "./export-json-button";
import { deriveJourneys, deriveProofRuns, type ProofRun } from "./journeys";
import { liveChecksSummary, type LiveCheckRow } from "./live-checks";
import { buildProofExport } from "./proof-export";
import { PublicFillCard } from "./public-fill-card";
import type { ProofIndexEntry } from "./proof-index";
import { ProofRuns, receiptHref, type RecordsState } from "./proof-runs";
import { outcomeWords } from "./receipt-format";
import { formatIsoUtc, parseTxHashParam } from "./receipt-model";

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

/** Opens any Hideki transaction's receipt by hash. Invalid input is explained in place and never navigates. */
function OpenReceiptForm(): ReactNode {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const parsed = parseTxHashParam(value);
    if (!parsed.ok) {
      setError(parsed.reason);
      return;
    }
    setError(null);
    router.push(`/receipt/${parsed.hash}`);
  }

  return (
    <section aria-labelledby="proof-open" className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] lg:gap-16">
      <SectionHeading
        id="proof-open"
        title="Open any receipt"
        lede="Paste a Hideki transaction hash. Sidecar reads the receipt from the chain, decodes the order and runs the checks every Sidecar order has to pass."
      />
      <div className="flex flex-col gap-6 lg:pt-3">
        <form onSubmit={handleSubmit} noValidate aria-labelledby="proof-open" className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <TextField
            className="min-w-0 flex-1"
            label="Transaction hash"
            hint="0x followed by 64 hex characters."
            placeholder="0x…"
            autoComplete="off"
            spellCheck={false}
            inputClassName="type-data"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              if (error !== null) setError(null);
            }}
            error={error ?? undefined}
          />
          <Button type="submit" variant="primary" className="sm:mt-6">
            Open receipt
          </Button>
        </form>
      </div>
    </section>
  );
}

function RecordRow({ entry }: { entry: ProofIndexEntry }): ReactNode {
  const failed = entry.checks.filter((check) => check.status === "fail" && !(entry.outcome === "REVERTED" && check.id === "receipt-success")).length;
  return (
    <li className="grid gap-x-6 gap-y-2 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-2 text-body font-semibold text-ink">
          {entry.market ?? "Unlisted target"}
          <StatusPill size="sm" tone={entry.outcome === "REVERTED" ? "danger" : entry.outcome === "FILLED" || entry.outcome === "PARTIALLY_FILLED" ? "positive" : "warning"}>
            {outcomeWords(entry.outcome)}
          </StatusPill>
        </p>
        <p className="text-caption text-ink-2">
          Captured {formatIsoUtc(entry.capturedAt)}. Block {formatBlockNumber(BigInt(entry.block))}, sent by {shortAddress(entry.sender)}
          {entry.selectedGiven ? "" : ", no selected account was named at capture"}.
          {failed > 0 ? <span className="text-danger"> {failed} check{failed === 1 ? "" : "s"} failed at capture.</span> : null}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={receiptHref(entry)} className={buttonClassName({ variant: "secondary", size: "sm" })}>
          Open receipt
        </Link>
        <a href={`/proof/${entry.file}`} className={buttonClassName({ variant: "ghost", size: "sm" })}>
          Raw record
        </a>
      </div>
    </li>
  );
}

/** Problems with the record list itself. Shown above the runs so no card is read as settled while they stand. */
function RecordListAlerts({ lookup, onReload, fetching }: { lookup: ProofIndexLookup; onReload: () => void; fetching: boolean }): ReactNode {
  if (lookup.state === "error") {
    return (
      <InlineAlert
        tone="danger"
        title="The recorded list could not be read"
        action={
          <Button variant="secondary" size="sm" loading={fetching} onClick={onReload}>
            Try again
          </Button>
        }
      >
        {lookup.reason}
      </InlineAlert>
    );
  }
  if (lookup.state === "invalid") {
    return (
      <InlineAlert tone="warning" title="The recorded list is malformed, so nothing from it is shown">
        {lookup.reason}
      </InlineAlert>
    );
  }
  if (lookup.state === "ok" && lookup.rejected.length > 0) {
    const rejected = lookup.rejected;
    return (
      <InlineAlert tone="warning" title={`${rejected.length} listed record${rejected.length === 1 ? " was" : "s were"} left out`}>
        {rejected.map((row) => `Entry ${row.position + 1}: ${row.reason}.`).join(" ")}
      </InlineAlert>
    );
  }
  return null;
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

      <OpenReceiptForm />

      {entries.length > 0 ? (
        <section aria-labelledby="proof-records" className="flex flex-col gap-6">
          <SectionHeading
            id="proof-records"
            title="Every recorded run"
            lede="Captured from Hideki and dated. Opening one reads its receipt from the chain again. It is not a new transaction."
          />
          <ul className="flex flex-col divide-y divide-line border-y border-line">
            {entries.map((entry) => (
              <RecordRow key={entry.hash} entry={entry} />
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-dashed border-line-strong pt-5 type-eyebrow text-ink-3">
        <span>Somnia Hideki testnet, chain {HIDEKI_CHAIN_ID}</span>
        <span>Paper funds only. This page reads, it never sends.</span>
      </footer>
    </div>
  );
}
