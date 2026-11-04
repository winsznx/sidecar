import type { ReactNode } from "react";

import { cx } from "./cx";
import { KeyValueList, type KeyValueItem } from "./key-value-list";

export interface CheckTally {
  passed: number;
  failed: number;
  unknown: number;
  total: number;
}

/** Counts the verdicts on rows that carry a check. Rows without one are not checks. */
export function tallyChecks(items: ReadonlyArray<KeyValueItem>): CheckTally {
  const tally: CheckTally = { passed: 0, failed: 0, unknown: 0, total: 0 };
  for (const item of items) {
    if (item.check === undefined) continue;
    tally.total += 1;
    if (item.check === "pass") tally.passed += 1;
    else if (item.check === "fail") tally.failed += 1;
    else tally.unknown += 1;
  }
  return tally;
}

/** "8 / 10 passed · 1 failed · 1 unknown": every verdict is counted, none is rounded into a pass. */
export function tallyLabel(tally: CheckTally): string {
  const parts = [`${tally.passed} / ${tally.total} passed`];
  if (tally.failed > 0) parts.push(`${tally.failed} failed`);
  if (tally.unknown > 0) parts.push(`${tally.unknown} unknown`);
  return parts.join(" · ");
}

export interface InspectionCardProps {
  /** Mono title in the header, e.g. "Truth checks". */
  title: ReactNode;
  headingAs?: "h2" | "h3";
  /** Right side of the header, e.g. a short transaction hash or a provenance badge. */
  meta?: ReactNode;
  items: ReadonlyArray<KeyValueItem>;
  /** Dotted leaders between label and value (default). */
  leaders?: boolean;
  /** See KeyValueList: false when one badge labels the whole card. */
  badges?: boolean;
  /** Extra facts after the tally, e.g. "re-read at block 38,357,701". */
  footnote?: ReactNode;
  /** The verdict, usually a <Stamp>. Pass it only when the tally supports it. */
  verdict?: ReactNode;
  className?: string;
}

/**
 * An inspection record: header, label/value rows with their verdicts, and a mono footer that
 * counts the checks. The tally is computed from the rows, so the footer cannot disagree with them.
 */
export function InspectionCard({
  title,
  headingAs: Heading = "h3",
  meta,
  items,
  leaders = true,
  badges = true,
  footnote,
  verdict,
  className,
}: InspectionCardProps): ReactNode {
  const tally = tallyChecks(items);
  return (
    <article className={cx("min-w-0 rounded-xl border border-line bg-raised shadow-card", className)}>
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-dashed border-line-strong px-5 py-3">
        <Heading className="type-eyebrow text-ink">{title}</Heading>
        {meta !== undefined ? <div className="flex items-center gap-2 type-eyebrow text-ink-3">{meta}</div> : null}
      </header>
      <div className="px-5 py-1">
        <KeyValueList items={items} leaders={leaders} badges={badges} />
      </div>
      <footer className="flex flex-wrap items-end justify-between gap-4 border-t border-dashed border-line-strong px-5 py-3.5">
        <div className="flex min-w-0 flex-col gap-1 type-eyebrow">
          {tally.total > 0 ? (
            <p data-testid="inspection-tally" className="text-ink">
              {tallyLabel(tally)}
            </p>
          ) : null}
          {footnote !== undefined ? <p className="text-ink-3">{footnote}</p> : null}
        </div>
        {verdict}
      </footer>
    </article>
  );
}
