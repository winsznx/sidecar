"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { Button, buttonClassName } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { StatusPill } from "@/components/ui/status-pill";
import type { ProofIndexLookup } from "@/hooks/use-proof-index";
import { formatBlockNumber, shortAddress } from "@/lib/format/units";

import type { ProofIndexEntry } from "./proof-index";
import { receiptHref } from "./proof-runs";
import { outcomeWords } from "./receipt-format";
import { formatIsoUtc } from "./receipt-model";

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

/** Recorded runs from the published index, each linked to its receipt. */
export function RecordedRunList({ entries }: { entries: readonly ProofIndexEntry[] }): ReactNode {
  return (
    <ul className="flex flex-col divide-y divide-line border-y border-line">
      {entries.map((entry) => (
        <RecordRow key={entry.hash} entry={entry} />
      ))}
    </ul>
  );
}

/** Problems with the record list itself. Shown above the runs so no card is read as settled while they stand. */
export function RecordListAlerts({ lookup, onReload, fetching }: { lookup: ProofIndexLookup; onReload: () => void; fetching: boolean }): ReactNode {
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
