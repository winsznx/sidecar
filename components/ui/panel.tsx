import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cx } from "./cx";

export type PanelVariant = "default" | "viewfinder";
export type FeedStatus = "live" | "stale" | "degraded" | "simulated";

const FEED: Record<FeedStatus, { word: string; text: string; mark: string }> = {
  live: { word: "Live", text: "text-positive", mark: "bg-positive" },
  stale: { word: "Stale", text: "text-warning", mark: "border border-warning" },
  degraded: { word: "Degraded", text: "text-danger", mark: "bg-danger" },
  simulated: { word: "Simulated", text: "text-ink", mark: "hatch-sim border border-ink-3" },
};

export interface PanelStripProps {
  status: FeedStatus;
  /** Short facts joined with middle dots, e.g. ["Hideki 50383", "Block 38,357,692"]. */
  items: ReadonlyArray<string>;
  /** Data age, e.g. "2s". Kept in its own case so units like "s" are not shouted as "S". */
  age?: string;
  /** Right-aligned extra, e.g. a refresh icon button. */
  trailing?: ReactNode;
  className?: string;
}

/** Mono status line for panels that show chain reads. The status word is always spelled out. */
export function PanelStrip({ status, items, age, trailing, className }: PanelStripProps): ReactNode {
  const feed = FEED[status];
  return (
    <div className={cx("flex min-h-10 items-center gap-3 border-b border-dashed border-line-strong py-2 pr-4 pl-6", className)}>
      <p className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 type-eyebrow text-ink-3">
        <span className={cx("inline-flex items-center gap-1.5", feed.text)}>
          <span aria-hidden="true" className={cx("size-2 shrink-0 rounded-full", feed.mark)} />
          {feed.word}
        </span>
        {items.map((item, index) => (
          <span key={`${index}-${item}`} className="inline-flex items-center gap-2">
            <span aria-hidden="true">·</span>
            <span>{item}</span>
          </span>
        ))}
        {age !== undefined ? (
          <span className="inline-flex items-center gap-2">
            <span aria-hidden="true">·</span>
            <span className="normal-case">{age}</span>
          </span>
        ) : null}
      </p>
      {trailing}
    </div>
  );
}

export interface PanelProps extends Omit<ComponentPropsWithoutRef<"section">, "title"> {
  variant?: PanelVariant;
  /** Header strip, usually a <PanelStrip>. Viewfinder panels are expected to have one. */
  strip?: ReactNode;
  eyebrow?: ReactNode;
  title?: ReactNode;
  titleAs?: "h2" | "h3";
  /** Right side of the title row. */
  actions?: ReactNode;
  padding?: "none" | "sm" | "md";
  /** Override the element, e.g. "div" when a panel sits inside another landmark. */
  as?: "section" | "div" | "article" | "aside";
}

const PADDING = {
  none: "",
  sm: "p-3",
  md: "p-4 md:p-5",
} as const;

/**
 * Container for a group of related readings. The viewfinder variant adds corner brackets,
 * reserved for panels that frame chain reads (live, stale or simulated, as the strip says).
 */
export function Panel({
  variant = "default",
  strip,
  eyebrow,
  title,
  titleAs: Title = "h2",
  actions,
  padding = "md",
  as: Element = "section",
  className,
  children,
  ...rest
}: PanelProps): ReactNode {
  const hasHeading = eyebrow !== undefined || title !== undefined || actions !== undefined;
  return (
    <Element
      className={cx(
        "relative min-w-0 rounded-lg border border-line bg-panel shadow-card",
        variant === "viewfinder" && "viewfinder",
        className,
      )}
      {...rest}
    >
      {strip}
      <div className={PADDING[padding]}>
        {hasHeading ? (
          <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              {eyebrow}
              {title !== undefined ? <Title className="text-title font-semibold tracking-tight text-ink">{title}</Title> : null}
            </div>
            {actions !== undefined ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
          </div>
        ) : null}
        {children}
      </div>
    </Element>
  );
}
