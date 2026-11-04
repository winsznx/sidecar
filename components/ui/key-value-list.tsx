import { CircleCheck, CircleQuestionMark, CircleX } from "lucide-react";
import type { ReactNode } from "react";

import type { Source } from "@/lib/dreamdex/types";

import { cx } from "./cx";
import { ProvenanceBadge, provenanceRuleClass } from "./provenance-badge";
import type { CheckStatus } from "./types";

const CHECK = {
  pass: { icon: CircleCheck, word: "Pass", className: "text-positive" },
  fail: { icon: CircleX, word: "Fail", className: "text-danger" },
  unknown: { icon: CircleQuestionMark, word: "Unknown", className: "text-ink-3" },
} as const;

/** A truth-check verdict as icon + word. */
export function CheckMark({ status, className }: { status: CheckStatus; className?: string }): ReactNode {
  const { icon: Icon, word, className: tone } = CHECK[status];
  return (
    <span className={cx("inline-flex shrink-0 items-center gap-1 type-eyebrow", tone, className)}>
      <Icon aria-hidden="true" className="size-3.5" strokeWidth={2.25} />
      {word}
    </span>
  );
}

export interface KeyValueItem {
  /** Stable key; defaults to the index. */
  id?: string;
  label: ReactNode;
  value: ReactNode;
  /** Secondary line under the label. */
  hint?: ReactNode;
  /** Draws the provenance rule under the value and, unless the list hides badges, its badge. */
  source?: Source;
  check?: CheckStatus;
}

export interface KeyValueListProps {
  items: ReadonlyArray<KeyValueItem>;
  /** Dotted leaders between label and value, for the paper inspection record. Rows get hairlines otherwise. */
  leaders?: boolean;
  density?: "compact" | "comfortable";
  /**
   * Set false when one badge already labels the whole group (for example a card header);
   * each value still carries its provenance rule.
   */
  badges?: boolean;
  className?: string;
}

/** Inspection rows: label left, value right, optional source and verdict. Renders a <dl>. */
export function KeyValueList({
  items,
  leaders = false,
  density = "comfortable",
  badges = true,
  className,
}: KeyValueListProps): ReactNode {
  return (
    <dl className={cx("flex flex-col", !leaders && "divide-y divide-line", className)}>
      {items.map((item, index) => (
        <div key={item.id ?? index} className={cx("flex items-baseline gap-3", density === "compact" ? "py-1.5" : "py-2.5")}>
          {leaders ? (
            // The leader lives inside the <dt> because a <dl> group may only hold dt and dd children.
            <dt className="flex min-w-0 flex-1 items-baseline gap-3 text-small text-ink-2">
              <span className="min-w-0 shrink">
                {item.label}
                {item.hint !== undefined ? <span className="block text-caption text-ink-3">{item.hint}</span> : null}
              </span>
              <span aria-hidden="true" className="min-w-6 flex-1 self-baseline border-b border-dotted border-line-strong" />
            </dt>
          ) : (
            <dt className="min-w-0 shrink text-small text-ink-2">
              {item.label}
              {item.hint !== undefined ? <span className="block text-caption text-ink-3">{item.hint}</span> : null}
            </dt>
          )}
          <dd
            className={cx(
              "flex min-w-0 flex-wrap items-baseline justify-end gap-x-2 gap-y-1 text-right text-small font-medium text-ink tabular",
              !leaders && "ml-auto",
            )}
          >
            <span className={cx("min-w-0", provenanceRuleClass(item.source?.kind))}>{item.value}</span>
            {badges && item.source !== undefined ? (
              <ProvenanceBadge source={item.source} size="sm" className="self-center" />
            ) : null}
            {item.check !== undefined ? <CheckMark status={item.check} className="self-center" /> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
