"use client";

import { Hourglass, SearchX } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Hash } from "viem";

import { NetworkLabel } from "@/components/icons/token-label";
import { buttonClassName, Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { SkeletonText, Skeleton } from "@/components/ui/skeleton";
import { Stamp } from "@/components/ui/stamp";
import type { SidecarError } from "@/lib/dreamdex/errors";
import { HIDEKI_CHAIN_ID } from "@/lib/dreamdex/types";

import { CopyValue } from "./copy-value";
import { formatIsoUtc } from "./receipt-model";
import { RecordFrame } from "./record-frame";

/** The full hash, breakable on narrow screens, with a copy control. */
export function HashLine({ hash }: { hash: string }): ReactNode {
  return (
    <p className="flex min-w-0 items-start gap-1 type-data text-small text-ink-2">
      <span className="sr-only">Transaction hash </span>
      <span className="min-w-0 wrap-anywhere">{hash}</span>
      <CopyValue value={hash} label="transaction hash" />
    </p>
  );
}

function NetworkLine(): ReactNode {
  return (
    <p className="type-data text-caption text-ink-3">
      <NetworkLabel>
        Somnia Hideki Testnet <span aria-hidden="true">·</span> chain {HIDEKI_CHAIN_ID}
      </NetworkLabel>
    </p>
  );
}

function BackToProof(): ReactNode {
  return (
    <Link href="/proof" className={buttonClassName({ variant: "secondary", size: "sm" })}>
      Back to proof
    </Link>
  );
}

/** A malformed hash. Nothing was sent to the network. */
export function InvalidHashRecord({ raw, reason }: { raw: string; reason: string }): ReactNode {
  return (
    <RecordFrame
      eyebrow="Order receipt"
      labelledBy="receipt-title"
      title="This is not a transaction hash"
      lead={`${reason} Sidecar did not look anything up.`}
      meta={
        <p className="type-data text-small text-ink-2">
          <span className="text-ink-3">From the link: </span>
          <span className="wrap-anywhere">{raw === "" ? "(empty)" : raw}</span>
        </p>
      }
      footer={
        <>
          <p className="max-w-measure text-small text-ink-2">
            Copy the hash from your wallet’s activity list or from the explorer. It is 0x followed by 64 characters.
          </p>
          <BackToProof />
        </>
      }
    />
  );
}

/** Known to the network but not mined. */
export function PendingRecord({ hash, checkedAt, fetching, onCheck }: { hash: Hash; checkedAt: number; fetching: boolean; onCheck: () => void }): ReactNode {
  return (
    <RecordFrame
      eyebrow="Order receipt"
      labelledBy="receipt-title"
      title="Waiting for the chain receipt"
      lead="The network has this transaction but it is not mined yet. Sidecar keeps reading the chain every few seconds. It never resends."
      meta={
        <>
          <HashLine hash={hash} />
          <NetworkLine />
        </>
      }
      footer={
        <>
          <p className="max-w-measure text-small text-ink-2">
            Last checked {formatIsoUtc(new Date(checkedAt).toISOString())}.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" size="sm" loading={fetching} loadingLabel="Checking" onClick={onCheck}>
              Check now
            </Button>
            <Stamp status="pending" detail="No receipt yet" />
          </div>
        </>
      }
    >
      <InlineAlert tone="neutral" icon={Hourglass} title="No outcome yet">
        Until the receipt exists, nothing about this order is confirmed: not a fill, not a resting order, not a revert.
      </InlineAlert>
    </RecordFrame>
  );
}

/** The network does not know this hash. */
export function NotFoundRecord({ hash, checkedAt, fetching, onCheck }: { hash: Hash; checkedAt: number; fetching: boolean; onCheck: () => void }): ReactNode {
  return (
    <RecordFrame
      eyebrow="Order receipt"
      labelledBy="receipt-title"
      title={`Not found on Hideki ${HIDEKI_CHAIN_ID}`}
      lead="The Hideki RPC has no transaction with this hash. It may belong to another network, be mistyped, or have been sent moments ago and not reached the node yet."
      meta={
        <>
          <HashLine hash={hash} />
          <NetworkLine />
        </>
      }
      footer={
        <>
          <p className="max-w-measure text-small text-ink-2">
            Last checked {formatIsoUtc(new Date(checkedAt).toISOString())}. Sidecar looks again every 10 seconds while this page is open.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" size="sm" loading={fetching} loadingLabel="Checking" onClick={onCheck}>
              Check again
            </Button>
            <Stamp status="pending" detail="Not on this chain yet" />
          </div>
        </>
      }
    >
      <InlineAlert tone="neutral" icon={SearchX} title="Nothing to verify">
        Sidecar shows no outcome for a transaction the chain does not have. If you sent this from Sidecar, keep this page open: the wallet’s hash
        is looked up again automatically.
      </InlineAlert>
    </RecordFrame>
  );
}

/** A read failed for a reason other than the transaction's own state. */
export function ReadFailedRecord({
  hash,
  title,
  error,
  fetching,
  onRetry,
}: {
  hash: Hash;
  title: string;
  error: Pick<SidecarError, "title" | "message" | "nextStep">;
  fetching: boolean;
  onRetry: () => void;
}): ReactNode {
  return (
    <RecordFrame
      eyebrow="Order receipt"
      labelledBy="receipt-title"
      title={title}
      lead="Sidecar could not finish reading the chain, so it shows no outcome."
      meta={
        <>
          <HashLine hash={hash} />
          <NetworkLine />
        </>
      }
      footer={
        <>
          <Stamp status="not-verified" detail="Read failed" />
          <Button variant="secondary" size="sm" loading={fetching} loadingLabel="Reading" onClick={onRetry}>
            Try again
          </Button>
        </>
      }
    >
      <InlineAlert tone="danger" title={error.title} announce="polite">
        {error.message} {error.nextStep}
      </InlineAlert>
    </RecordFrame>
  );
}

function SkeletonSection({ title, lines }: { title: string; lines: number }): ReactNode {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-title font-semibold text-ink-3">{title}</span>
      <SkeletonText lines={lines} />
    </div>
  );
}

/**
 * Placeholder with the record's shape and breakpoints while the receipt is read, so the page does
 * not jump when it arrives. The route fallback passes no hash: it is shown only once validated.
 */
export function ReceiptSkeleton({ hash }: { hash?: string }): ReactNode {
  return (
    <RecordFrame
      eyebrow="Order receipt"
      labelledBy="receipt-title"
      busy
      title={<span>Reading the chain receipt</span>}
      meta={hash !== undefined ? <HashLine hash={hash} /> : <Skeleton className="h-4 w-4/5" />}
      footer={
        <div aria-hidden="true" className="flex w-full flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex min-w-0 max-w-measure flex-1 flex-col gap-2">
            <SkeletonText lines={2} />
          </div>
          <Skeleton className="h-12 w-40" />
        </div>
      }
    >
      <div className="flex flex-col gap-8" aria-hidden="true">
        <div className="grid gap-8 lg:grid-cols-2">
          <SkeletonSection title="Transaction" lines={7} />
          <SkeletonSection title="Order" lines={5} />
        </div>
        <SkeletonSection title="Fills" lines={2} />
        <SkeletonSection title="Truth checks" lines={10} />
        <div className="flex flex-col gap-2">
          <span className="text-title font-semibold text-ink-3">Account before and after</span>
          <div className="grid gap-6 md:grid-cols-2">
            <SkeletonText lines={7} />
            <SkeletonText lines={7} />
          </div>
        </div>
      </div>
      <p role="status" className="sr-only">
        Reading the transaction and its receipt from Hideki.
      </p>
    </RecordFrame>
  );
}
