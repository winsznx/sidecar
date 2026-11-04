import type { ComponentPropsWithRef, ReactNode } from "react";

import type { Source, SourceKind } from "@/lib/dreamdex/types";

import { cx } from "./cx";

/** Groups a non-negative integer string with commas without going through floating point. */
export function groupDigits(value: bigint): string {
  const digits = (value < 0n ? -value : value).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return value < 0n ? `-${grouped}` : grouped;
}

/** "12:04:31 UTC" for a valid ISO time, otherwise the raw string so nothing is invented. */
function formatReadAt(readAt: string): string {
  const time = new Date(readAt);
  return Number.isNaN(time.getTime()) ? readAt : `${time.toISOString().slice(11, 19)} UTC`;
}

const KIND_WORD: Record<SourceKind, string> = {
  chain: "CHAIN",
  sdk: "SDK",
  indexer: "INDEXED",
  estimate: "EST",
  scenario: "SCENARIO",
  simulated: "SIMULATED",
};

/**
 * An unpinned read only knows the head seen in the same request batch, so the badge must not
 * claim the value was read at exactly that block.
 */
function blockPhrase(source: { block: bigint; pinned?: boolean }): string {
  return source.pinned === false
    ? `at the head (about block ${groupDigits(source.block)}, not pinned)`
    : `at block ${groupDigits(source.block)}`;
}

/** The short visible label, e.g. "CHAIN · #38,357,692". */
export function provenanceLabel(source: Source): string {
  switch (source.kind) {
    case "chain":
    case "sdk":
      return source.pinned === false
        ? `${KIND_WORD[source.kind]} · HEAD ~#${groupDigits(source.block)}`
        : `${KIND_WORD[source.kind]} · #${groupDigits(source.block)}`;
    case "indexer":
      return source.updatedAtBlock === undefined
        ? KIND_WORD.indexer
        : `${KIND_WORD.indexer} · #${groupDigits(source.updatedAtBlock)}`;
    case "estimate":
    case "scenario":
    case "simulated":
      return KIND_WORD[source.kind];
  }
}

/** The full sentence a screen reader hears, and what a tooltip can show. */
export function provenanceDescription(source: Source): string {
  switch (source.kind) {
    case "chain":
      return `Chain read ${blockPhrase(source)} via ${source.via}, ${formatReadAt(source.readAt)}.`;
    case "sdk":
      return `SDK calculation over chain state ${blockPhrase(source)} via ${source.via}, ${formatReadAt(source.readAt)}.`;
    case "indexer":
      return `Indexed data via ${source.via}, ${formatReadAt(source.readAt)}${
        source.updatedAtBlock === undefined ? "" : `, updated at block ${groupDigits(source.updatedAtBlock)}`
      }. It can lag the chain.`;
    case "estimate":
      return `Sidecar estimate: ${source.basis}`;
    case "scenario":
      return `Scenario estimate, not a protocol value: ${source.basis}`;
    case "simulated":
      return `Simulated sample data, not live state: ${source.note}`;
  }
}

const KIND_STYLE: Record<SourceKind, string> = {
  chain: "border-solid border-ink-3 bg-raised text-ink",
  sdk: "border-solid border-line-strong bg-raised text-ink-2",
  indexer: "border-dotted border-ink-3 text-ink-2",
  estimate: "border-dashed border-ink-3 text-ink-2",
  scenario: "border-dashed border-warning text-warning",
  simulated: "hatch-sim border-solid border-line-strong bg-raised text-ink",
};

/** The underline a figure carries for its source (see the provenance rules in the design system). */
export function provenanceRuleClass(kind: SourceKind | undefined): string {
  switch (kind) {
    case "indexer":
      return "rule-indexed";
    case "estimate":
    case "scenario":
      return "rule-estimate";
    case "simulated":
      return "rule-simulated";
    default:
      return "";
  }
}

export interface ProvenanceBadgeProps extends Omit<ComponentPropsWithRef<"span">, "children"> {
  source: Source;
  size?: "sm" | "md";
}

export function ProvenanceBadge({ source, size = "md", className, ...rest }: ProvenanceBadgeProps): ReactNode {
  return (
    <span
      data-provenance={source.kind}
      className={cx(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-xs border font-mono font-medium uppercase tracking-label",
        size === "sm" ? "h-4.5 px-1 text-micro" : "h-5 px-1.5 text-micro",
        KIND_STYLE[source.kind],
        className,
      )}
      {...rest}
    >
      <span aria-hidden="true">{provenanceLabel(source)}</span>
      <span className="sr-only">{provenanceDescription(source)}</span>
    </span>
  );
}
