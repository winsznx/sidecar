import { CircleCheck, ExternalLink } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { TokenLabel } from "@/components/icons/token-label";
import { AccountLetter } from "@/components/ui/account-badge";
import { buttonClassName } from "@/components/ui/button";
import { Connector } from "@/components/ui/connector";
import { Eyebrow } from "@/components/ui/eyebrow";
import { FloatingCard } from "@/components/ui/floating-card";
import { KeyValueList, type KeyValueItem } from "@/components/ui/key-value-list";
import { StatusPill } from "@/components/ui/status-pill";
import { explorerTxUrl } from "@/lib/dreamdex/config";
import { formatBlockNumber } from "@/lib/format/units";

import type { ProofRun } from "./journeys";
import { checkStatus, type ProofIndexEntry } from "./proof-index";
import { outcomeWords } from "./receipt-format";
import { formatIsoUtc } from "./receipt-model";

/** Whether the record list has been read, so an unread list never reads as "nothing recorded". */
export type RecordsState = "read" | "loading" | "unavailable";

/** The index keeps only check ids, so the card names them in the receipt's own words. */
const CHECK_LABELS: Readonly<Record<string, string>> = {
  sender: "Sent by the selected account",
  "pool-listed": "Target is a listed perp market",
  "collateral-attribution": "Only the sender's collateral backs the order",
  "position-attribution": "Position change belongs to the sender",
  "counterpart-isolation": "The other account's collateral did not fund this trade",
};

/** Carries the context the capture checked against, so the receipt can check the same things again. */
export function receiptHref(entry: ProofIndexEntry): string {
  if (!entry.selectedGiven) return `/receipt/${entry.hash}`;
  const query = new URLSearchParams({ account: entry.account });
  if (entry.counterpart !== null) query.set("counterpart", entry.counterpart);
  return `/receipt/${entry.hash}?${query.toString()}`;
}

function shortHash(hash: string): string {
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

function RunStatus({ run, records }: { run: ProofRun; records: RecordsState }): ReactNode {
  if (run.status === "recorded") {
    return (
      <StatusPill size="sm" tone="positive" icon={CircleCheck}>
        Recorded run
      </StatusPill>
    );
  }
  if (records === "loading") return <StatusPill size="sm" appearance="outline">Reading records</StatusPill>;
  if (records === "unavailable") return <StatusPill size="sm" appearance="outline" tone="warning">Records unavailable</StatusPill>;
  return <StatusPill size="sm" appearance="outline">Not yet recorded</StatusPill>;
}

function RecordedEvidence({ run, entry }: { run: ProofRun; entry: ProofIndexEntry }): ReactNode {
  const items: KeyValueItem[] = run.checkIds.map((id) => {
    const status = checkStatus(entry, id);
    return {
      id,
      label: CHECK_LABELS[id] ?? id,
      value: status === null ? <span className="text-ink-3">Not in the record</span> : "",
      check: status ?? undefined,
    };
  });
  const earlier = run.evidence.length - 1;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="flex flex-wrap items-center gap-2 text-body font-semibold text-ink">
          {entry.market === null ? "Unlisted target" : <TokenLabel symbol={entry.market} size={20} />}
          <span className="font-normal text-ink-2">{outcomeWords(entry.outcome)}</span>
        </p>
        <p className="type-data text-caption text-ink-3">
          Captured {formatIsoUtc(entry.capturedAt)} <span aria-hidden="true">·</span> block {formatBlockNumber(BigInt(entry.block))}
        </p>
      </div>
      <KeyValueList leaders density="compact" badges={false} items={items} />
      <div className="flex flex-wrap items-center gap-2">
        <Link href={receiptHref(entry)} className={buttonClassName({ variant: "secondary", size: "sm" })}>
          Open receipt <span className="type-data text-caption text-ink-3">{shortHash(entry.hash)}</span>
        </Link>
        <a href={explorerTxUrl(entry.hash)} target="_blank" rel="noreferrer" className={buttonClassName({ variant: "ghost", size: "sm" })}>
          Explorer
          <ExternalLink aria-hidden="true" className="size-3.5" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </div>
      {earlier > 0 ? (
        <p className="text-caption text-ink-3">
          {earlier} earlier recorded run{earlier === 1 ? "" : "s"} listed below.
        </p>
      ) : null}
    </div>
  );
}

function PendingEvidence({ run, records }: { run: ProofRun; records: RecordsState }): ReactNode {
  return (
    <div className="flex flex-col gap-3">
      <div className="hatch flex h-10 items-center rounded-md border border-dashed border-line-strong px-3">
        <span className="rounded-xs border border-line bg-raised px-2 py-0.5 type-eyebrow text-ink-2">
          {records === "read" ? "No receipt yet" : records === "loading" ? "Reading the record list" : "Record list unread"}
        </span>
      </div>
      <p className="text-small text-ink-2">
        <span className="font-medium text-ink">Its receipt will have to show</span> {run.counts}
      </p>
    </div>
  );
}

function RunCard({
  run,
  records,
  depth = "front",
  tilt = 0,
  className,
}: {
  run: ProofRun;
  records: RecordsState;
  depth?: "front" | "back";
  tilt?: -1 | 0 | 1;
  className?: string;
}): ReactNode {
  const titleId = `run-${run.id}`;
  const latest = run.evidence[0];
  return (
    <FloatingCard as="article" aria-labelledby={titleId} depth={depth} tilt={tilt} className={className}>
      <div className="flex h-full flex-col gap-5 p-5 md:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Eyebrow index={run.step} className="inline-flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5">
              <AccountLetter account={run.account} size="sm" />
              Account {run.account}
            </span>
          </Eyebrow>
          <RunStatus run={run} records={records} />
        </div>
        <div className="flex flex-col gap-2">
          <h3 id={titleId} className="type-display text-heading text-balance text-ink md:text-display">
            {run.title}
          </h3>
          <p className="max-w-measure text-body text-ink-2">{run.summary}</p>
        </div>
        <div className="mt-auto border-t border-dashed border-line-strong pt-5">
          {run.status === "recorded" && latest !== undefined ? <RecordedEvidence run={run} entry={latest} /> : <PendingEvidence run={run} records={records} />}
        </div>
      </div>
    </FloatingCard>
  );
}

/**
 * The live run as one stacked composition. A's order and B's order sit behind with equal depth and
 * mirrored tilt, so neither route reads as favoured. The read that shows A was not touched comes
 * forward over both, because it is the claim the other two set up. The dashed line runs down the
 * gutter between the two back cards into the front one.
 */
export function ProofRuns({ runs, records }: { runs: readonly ProofRun[]; records: RecordsState }): ReactNode {
  const [shared, separate, unchanged] = runs;
  if (shared === undefined || separate === undefined || unchanged === undefined) return null;
  return (
    <div className="relative flex flex-col">
      <div className="grid items-stretch gap-6 lg:grid-cols-2 lg:gap-x-12">
        <RunCard run={shared} records={records} depth="back" tilt={-1} className="lg:pb-20" />
        <RunCard run={separate} records={records} depth="back" tilt={1} className="lg:pb-20" />
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-10 bottom-24 hidden justify-center lg:flex">
        <Connector className="h-full" start="ring" end="none" />
      </div>
      <Connector className="h-8 self-center lg:hidden" />
      <RunCard run={unchanged} records={records} className="mx-auto w-full max-w-3xl lg:-mt-14" />
    </div>
  );
}
