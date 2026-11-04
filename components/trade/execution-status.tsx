"use client";

import { ExternalLink, FileCheck2, RefreshCw } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { TokenLabel } from "@/components/icons/token-label";
import { Button, buttonClassName } from "@/components/ui/button";
import { KeyValueList, type KeyValueItem } from "@/components/ui/key-value-list";
import type { StatusTone } from "@/components/ui/types";
import type { ExecutionController } from "@/hooks/use-execution";
import { explorerTxUrl } from "@/lib/dreamdex/config";
import type { MarketMeta } from "@/lib/dreamdex/types";
import { formatQuantity } from "@/lib/format/units";
import type { PhaseTone } from "@/lib/orders/lifecycle";

import { EXPLORER_SIZE_NOTE } from "./trade-copy";

const BOX: Record<StatusTone, string> = {
  neutral: "border-line bg-raised",
  positive: "border-positive/40 bg-positive-soft",
  warning: "border-warning/40 bg-warning-soft",
  danger: "border-danger/40 bg-danger-soft",
};

function toneFor(tone: PhaseTone): StatusTone {
  if (tone === "success") return "positive";
  if (tone === "progress") return "neutral";
  return tone;
}

/** "Resting" only when the receipt shows part of a GTC or post-only order still on the book. */
export function orderIdLabel(verified: NonNullable<ExecutionController["verified"]>): string {
  const requested = verified.requested;
  const rests =
    requested !== null &&
    verified.filledQuantity < requested.quantity &&
    (requested.timeInForce === "GTC" || requested.timeInForce === "POST_ONLY");
  return rests ? "Resting order id" : "Order id";
}

/** Phases worth a status block. Editing and an untouched ticket say nothing. */
export function hasExecutionStatus(execution: ExecutionController): boolean {
  const { phase, notice } = execution.state;
  if (execution.nothingSent !== null || execution.refusal !== null) return true;
  if (phase === "EDITING") return notice !== null;
  return phase !== "READY" && phase !== "QUOTING";
}

export function ExecutionStatus({
  execution,
  market,
  compact = false,
}: {
  execution: ExecutionController;
  market: MarketMeta | null;
  compact?: boolean;
}): ReactNode {
  const { state, copy, nothingSent, refusal, verified, proof, afterStateIssue, checking, verificationFailures, recoveryNote } = execution;
  const hash = state.txHash;
  const showNothingSent = nothingSent !== null && (state.phase === "WALLET_REJECTED" || state.phase === "READY" || state.phase === "EDITING" || state.phase === "QUOTING");
  const headline = showNothingSent ? `Nothing was sent: ${nothingSent.title.toLowerCase()}.` : copy.headline;
  const detail = showNothingSent ? `${nothingSent.message} ${nothingSent.nextStep}` : copy.detail;
  const tone = showNothingSent ? "warning" : toneFor(copy.tone);
  const settled = !execution.locked && !["EDITING", "QUOTING", "READY", "WALLET_REJECTED"].includes(state.phase);

  const rows: KeyValueItem[] = [];
  if (verified !== null && market !== null) {
    const verdicts = verified.checks;
    const passed = verdicts.filter((check) => check.status === "pass").length;
    rows.push(
      {
        id: "filled",
        label: verificationFailures.length > 0 ? "Decoded fills, not verified" : "Filled",
        value: (
          <TokenLabel symbol={market.baseSymbol}>
            {`${formatQuantity(verified.filledQuantity, market, { withSymbol: true })}${
              verified.requested ? ` of ${formatQuantity(verified.requested.quantity, market, { withSymbol: true })}` : ""
            }`}
          </TokenLabel>
        ),
        source: { kind: "chain", block: verified.block, readAt: verified.readAt, via: "decoded receipt" },
      },
      {
        id: "sender",
        label: "Sent by",
        value: <span className="type-data">{verified.from}</span>,
        source: { kind: "chain", block: verified.block, readAt: verified.readAt, via: "transaction" },
      },
      { id: "checks", label: "Truth checks passed", value: `${passed} of ${verdicts.length}` },
    );
    if (verified.orderId !== null) rows.push({ id: "order", label: orderIdLabel(verified), value: verified.orderId.toString() });
  }

  return (
    <section
      aria-label="Order status"
      data-testid="execution-status"
      data-phase={state.phase}
      className={`flex flex-col gap-3 rounded-md border p-3.5 ${BOX[tone]}`}
    >
      {/* Announced by the screen's persistent live regions; a region mounted with its text is often skipped. */}
      <div className="flex flex-col gap-1">
        <p className="text-body font-semibold text-ink">{headline}</p>
        {detail ? <p className="text-small text-ink-2">{detail}</p> : null}
        {refusal !== null && !showNothingSent ? <p className="text-small text-ink-2">{refusal}</p> : null}
        {recoveryNote !== null && state.phase === "UNKNOWN_OUTCOME" ? <p className="text-small text-ink-2">{recoveryNote}</p> : null}
      </div>
      {hash !== null ? (
        <div className="flex flex-col gap-1.5">
          <p className="type-data text-caption break-all text-ink-2">
            <span className="sr-only">Transaction hash: </span>
            {hash}
          </p>
          <div className="flex flex-wrap gap-2">
            <a href={explorerTxUrl(hash)} target="_blank" rel="noopener noreferrer" className={buttonClassName({ variant: "secondary", size: "sm" })}>
              <ExternalLink aria-hidden="true" className="size-3.5" />
              View on explorer
              <span className="sr-only">(opens in a new tab)</span>
            </a>
            <Link href={`/receipt/${hash}`} className={buttonClassName({ variant: "secondary", size: "sm" })}>
              <FileCheck2 aria-hidden="true" className="size-3.5" />
              Open receipt
            </Link>
          </div>
          {!compact ? <p className="text-caption text-ink-3">{EXPLORER_SIZE_NOTE}</p> : null}
        </div>
      ) : null}
      {state.phase === "UNKNOWN_OUTCOME" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            leading={<RefreshCw aria-hidden="true" className="size-3.5" />}
            loading={checking}
            loadingLabel="Checking the chain"
            onClick={() => void execution.checkAgain()}
            disabledReason={hash === null ? "No hash came back from the wallet. Check your wallet's activity." : undefined}
          >
            Check again
          </Button>
          <span className="text-caption text-ink-2">Sidecar also looks it up every few seconds. Nothing is resent.</span>
        </div>
      ) : null}
      {rows.length > 0 ? <KeyValueList density="compact" items={rows} /> : null}
      {afterStateIssue !== null ? <p className="text-small text-ink-2">{afterStateIssue}</p> : null}
      {proof !== null && proof.status === "not-saved" ? <p className="text-caption text-ink-3">Proof record not saved: {proof.reason}</p> : null}
      {settled && !execution.locked ? (
        <div>
          <Button size="sm" variant="ghost" onClick={execution.reset}>
            Start a new order
          </Button>
        </div>
      ) : null}
    </section>
  );
}

const URGENT_PHASES: ReadonlySet<string> = new Set(["WALLET_REJECTED", "MINED_REVERTED", "ORDER_REJECTED", "UNKNOWN_OUTCOME"]);

/**
 * The text for the screen's always-mounted live regions. Rejections, reverts and unknown
 * outcomes interrupt; progress and results are polite. Empty strings say nothing.
 */
export function executionAnnouncement(execution: ExecutionController): { polite: string; assertive: string } {
  if (!hasExecutionStatus(execution)) return { polite: "", assertive: "" };
  const { state, copy, nothingSent } = execution;
  const showNothingSent = nothingSent !== null && !execution.locked;
  const headline = showNothingSent ? `Nothing was sent: ${nothingSent.title.toLowerCase()}.` : copy.headline;
  const phase = state.phase === "ACCOUNT_RECONCILED" ? (state.settledPhase ?? state.phase) : state.phase;
  const urgent = showNothingSent || URGENT_PHASES.has(phase);
  return urgent ? { polite: "", assertive: headline } : { polite: headline, assertive: "" };
}
