"use client";

import type { ReactNode } from "react";

import type { Source } from "@/lib/dreamdex/types";

import { cx } from "./cx";
import { ProvenanceBadge, provenanceRuleClass } from "./provenance-badge";
import { Skeleton } from "./skeleton";
import { Unavailable } from "./unavailable";
import { ValueFlash } from "./value-flash";

/** `xl` sets the figure in the display face, for the one headline number a section is about. */
export type StatSize = "sm" | "md" | "lg" | "xl";

interface StatBase {
  label: ReactNode;
  size?: StatSize;
  /**
   * Show the provenance badge (default). Turn it off when one badge already labels the whole
   * group, such as a panel strip; the value keeps its provenance rule either way.
   */
  badge?: boolean;
  /** Extra line under the value, e.g. "after this trade". */
  note?: ReactNode;
  className?: string;
}

export interface KnownStatProps extends StatBase {
  state: "known";
  /** Preformatted figure. Formatting and arithmetic happen before the UI. */
  value: string;
  unit?: ReactNode;
  source?: Source;
  /** Colour for signed figures; the sign itself must already be in `value`. */
  emphasis?: "default" | "long" | "short" | "positive" | "danger";
}

export interface UnavailableStatProps extends StatBase {
  state: "unavailable";
  reason: string;
  source?: Source;
}

export interface LoadingStatProps extends StatBase {
  state: "loading";
}

export type StatProps = KnownStatProps | UnavailableStatProps | LoadingStatProps;

const VALUE_SIZE: Record<StatSize, string> = {
  sm: "text-body font-semibold",
  md: "text-figure font-semibold",
  lg: "text-heading font-semibold",
  xl: "type-display text-display-lg leading-none",
};

const SKELETON_SIZE: Record<StatSize, string> = {
  sm: "h-5 w-20",
  md: "h-6.5 w-28",
  lg: "h-7.5 w-36",
  xl: "h-12 w-48",
};

const EMPHASIS: Record<NonNullable<KnownStatProps["emphasis"]>, string> = {
  default: "text-ink",
  long: "text-long",
  short: "text-short",
  positive: "text-positive",
  danger: "text-danger",
};

/** One labelled figure with its source. Unavailable and loading are first-class states, never a zero. */
export function Stat(props: StatProps): ReactNode {
  const { label, size = "md", note, badge = true, className } = props;
  const source = props.state === "loading" || !badge ? undefined : props.source;

  return (
    <dl aria-busy={props.state === "loading" || undefined} className={cx("min-w-0", className)}>
      {/* DOM order is the reading order (label, value, source, note); `order` lifts the badge onto the label row. */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <dt className="min-w-0 text-caption text-ink-2">{label}</dt>

        <dd className="order-3 min-w-0 basis-full">
          {props.state === "known" ? (
            <span className={cx("inline-flex items-baseline gap-1.5 tabular", VALUE_SIZE[size])}>
              <ValueFlash
                value={props.value}
                className={cx(EMPHASIS[props.emphasis ?? "default"], provenanceRuleClass(props.source?.kind))}
              />
              {props.unit ? <span className="text-small font-normal text-ink-3">{props.unit}</span> : null}
            </span>
          ) : props.state === "unavailable" ? (
            <Unavailable reason={props.reason} />
          ) : (
            <>
              <Skeleton className={SKELETON_SIZE[size]} />
              <span className="sr-only">Loading</span>
            </>
          )}
        </dd>

        {source ? (
          <dd className="order-2">
            <ProvenanceBadge source={source} size="sm" />
          </dd>
        ) : null}

        {note ? <dd className="order-4 basis-full text-caption text-ink-3">{note}</dd> : null}
      </div>
    </dl>
  );
}
