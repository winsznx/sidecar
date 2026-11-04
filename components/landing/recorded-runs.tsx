import { CircleCheck, ExternalLink } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { checkStatus } from "@/components/evidence/proof-index";
import { receiptHref } from "@/components/evidence/proof-runs";
import { outcomeWords } from "@/components/evidence/receipt-format";
import { formatIsoUtc } from "@/components/evidence/receipt-model";
import { TokenLabel } from "@/components/icons/token-label";
import { AccountLetter } from "@/components/ui/account-badge";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { FloatingCard, type FloatingCardTilt } from "@/components/ui/floating-card";
import { KeyValueList, type KeyValueItem } from "@/components/ui/key-value-list";
import { ProvenanceBadge } from "@/components/ui/provenance-badge";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusPill } from "@/components/ui/status-pill";
import { Unavailable } from "@/components/ui/unavailable";
import { explorerTxUrl } from "@/lib/dreamdex/config";
import type { Source } from "@/lib/dreamdex/types";
import { formatBlockNumber } from "@/lib/format/units";

import { Chapter } from "./chapter";
import { LandingEyebrow } from "./landing-eyebrow";
import { DECODED_FILL_HREF } from "./links";
import { shortHash, type CounterpartReading, type LandingRecords, type LandingRun, type RecordedEquity } from "./recorded-runs-model";
import { LANDING_CHECKS } from "./truth-checks";

const TILT: ReadonlyArray<FloatingCardTilt> = [-1, 1, 0];

function chainSource(block: bigint, readAt: string, via: string): Source {
  return { kind: "chain", block, readAt, via };
}

function Missing({ what }: { what: string }): ReactNode {
  return <Unavailable variant="inline" label="Not in the record" reason={`The captured record has no ${what}.`} />;
}

function RunFacts({ run }: { run: LandingRun }): ReactNode {
  const { entry, facts } = run;
  if (entry === null) return null;
  const block = BigInt(entry.block);
  const filled = facts?.filled ?? null;
  if (run.run.id === "a-unchanged") return <UnchangedFacts reading={facts?.counterpart ?? null} readAt={entry.capturedAt} />;
  const items: KeyValueItem[] = [
    {
      id: "market",
      label: "Market",
      value: (
        <span className="inline-flex items-center gap-2">
          {entry.market === null ? "Unlisted target" : <TokenLabel symbol={entry.market} />}
          <span className="font-normal text-ink-2">{outcomeWords(entry.outcome)}</span>
        </span>
      ),
    },
    filled !== null
      ? { id: "filled", label: "Filled", value: filled, source: chainSource(block, entry.capturedAt, "eth_getTransactionReceipt") }
      : { id: "filled", label: "Filled", value: <Missing what="filled size" /> },
    { id: "block", label: "Block", value: <span className="type-data">{formatBlockNumber(block)}</span> },
  ];
  return <KeyValueList leaders density="compact" items={items} />;
}

function EquityReading({ label, equity, readAt }: { label: string; equity: RecordedEquity; readAt: string }): ReactNode {
  const source = chainSource(equity.block, readAt, "getAccountEquity");
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-small text-ink-2">{label}</span>
        <ProvenanceBadge source={source} size="sm" />
      </div>
      <span className="type-data text-small font-medium break-all text-ink">{equity.text}</span>
    </div>
  );
}

function UnchangedFacts({ reading, readAt }: { reading: CounterpartReading | null; readAt: string }): ReactNode {
  if (reading === null) {
    return <Unavailable reason="The record does not carry account A's equity before and after B's order." />;
  }
  const same = reading.before.raw === reading.after.raw;
  return (
    <div className="flex flex-col gap-3">
      <EquityReading label="A's equity before B's order" equity={reading.before} readAt={readAt} />
      <EquityReading label="A's equity after B's order" equity={reading.after} readAt={readAt} />
      <p className="text-small font-medium text-ink">
        {same ? "The same to the last digit." : "The two readings differ, so this run does not show A unchanged."}
      </p>
    </div>
  );
}

/** The checks the run's card is about, with the verdicts the captured record holds. */
function RunChecks({ run }: { run: LandingRun }): ReactNode {
  const { entry } = run;
  if (entry === null) return null;
  const items: KeyValueItem[] = run.run.checkIds.map((id) => {
    const status = checkStatus(entry, id);
    return {
      id,
      label: LANDING_CHECKS.find((check) => check.id === id)?.label ?? id,
      value: status === null ? <span className="text-ink-3">Not in the record</span> : "",
      check: status ?? undefined,
    };
  });
  return <KeyValueList leaders density="compact" badges={false} items={items} />;
}

function RunLinks({ run }: { run: LandingRun }): ReactNode {
  const { entry } = run;
  if (entry === null) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant="secondary" size="sm">
        <Link href={receiptHref(entry)}>
          Open receipt <span className="type-data text-caption text-ink-3">{shortHash(entry.hash)}</span>
        </Link>
      </Button>
      <Button asChild variant="ghost" size="sm">
        <a href={explorerTxUrl(entry.hash)} target="_blank" rel="noreferrer">
          Explorer
          <ExternalLink aria-hidden="true" className="size-3.5" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </Button>
    </div>
  );
}

function RunCard({ run, tilt }: { run: LandingRun; tilt: FloatingCardTilt }): ReactNode {
  const titleId = `landing-run-${run.run.id}`;
  const recorded = run.run.status === "recorded" && run.entry !== null;
  return (
    <FloatingCard as="article" aria-labelledby={titleId} tilt={tilt} className="flex w-full flex-col gap-4 p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Eyebrow index={run.run.step} className="inline-flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5">
            <AccountLetter account={run.run.account} size="sm" />
            Account {run.run.account}
          </span>
        </Eyebrow>
        {recorded ? (
          <StatusPill size="sm" tone="positive" icon={CircleCheck}>
            Recorded run
          </StatusPill>
        ) : (
          <StatusPill size="sm" appearance="outline">
            Not yet recorded
          </StatusPill>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 id={titleId} className="type-display text-title text-balance text-ink md:text-heading">
          {run.run.title}
        </h3>
        <p className="text-small text-ink-2">{run.run.summary}</p>
      </div>
      <div className="mt-auto flex flex-col gap-3 border-t border-dashed border-line-strong pt-4">
        {recorded ? (
          <>
            <RunFacts run={run} />
            <RunChecks run={run} />
            <RunLinks run={run} />
          </>
        ) : (
          <p className="text-small text-ink-2">
            <span className="font-medium text-ink">Its receipt will have to show</span> {run.run.counts}
          </p>
        )}
      </div>
    </FloatingCard>
  );
}

function capturedLine(runs: readonly LandingRun[]): string | null {
  const times = runs.flatMap((run) => (run.entry === null ? [] : [run.entry.capturedAt])).sort();
  const first = times[0];
  const last = times[times.length - 1];
  if (first === undefined || last === undefined) return null;
  return first === last ? `Captured ${formatIsoUtc(first)}.` : `Captured ${formatIsoUtc(first)} to ${formatIsoUtc(last)}.`;
}

export function RecordedRuns({ records }: { records: LandingRecords }): ReactNode {
  const anyRecorded = records.state === "read" && records.runs.some((run) => run.run.status === "recorded");
  const captured = records.state === "read" ? capturedLine(records.runs) : null;
  return (
    <Chapter labelledBy="recorded-runs" className="gap-10">
      <div className="flex flex-col gap-5">
        <LandingEyebrow index={5}>Recorded runs</LandingEyebrow>
        <SectionHeading
          id="recorded-runs"
          title="Sidecar's own orders on Hideki, with their receipts."
          lede="One order in shared margin, one in a separate wallet, then a check that the first account did not move. Each card links to the receipt, which runs its checks again when you open it."
          actions={
            <Link href="/proof" className="rounded-xs text-body font-medium text-ink underline decoration-dashed underline-offset-4 focus-ring">
              All records on the proof page
            </Link>
          }
        />
      </div>
      {records.state === "unavailable" ? (
        <Unavailable reason={records.reason} />
      ) : (
        <>
          {anyRecorded ? null : (
            <p className="text-body font-medium text-ink">No runs are recorded yet. Each card says what its receipt will have to show.</p>
          )}
          <ol className="grid gap-5 lg:grid-cols-3 lg:gap-6">
            {records.runs.map((run, index) => (
              <li key={run.run.id} className="flex min-w-0">
                <RunCard run={run} tilt={TILT[index] ?? 0} />
              </li>
            ))}
          </ol>
          <div className="flex flex-col gap-1 text-small text-ink-2 md:flex-row md:flex-wrap md:items-baseline md:gap-x-4">
            {captured !== null ? <p className="type-data text-caption text-ink-3">{captured}</p> : null}
            <p>
              Also on Hideki:{" "}
              <Link href={DECODED_FILL_HREF} className="rounded-xs font-medium text-ink underline decoration-dashed underline-offset-4 focus-ring">
                a BTC-PERP fill, decoded
              </Link>
              . Someone else sent it, not Sidecar.
            </p>
          </div>
        </>
      )}
    </Chapter>
  );
}
