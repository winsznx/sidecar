import type { ReactNode } from "react";

import { cx } from "./cx";
import { Eyebrow } from "./eyebrow";

export interface AccentProps {
  children: ReactNode;
  className?: string;
}

/**
 * The marker stroke behind the one phrase a headline is about. Use it once per headline, on the
 * words that carry the claim ("its own margin"), never on a figure.
 */
export function Accent({ children, className }: AccentProps): ReactNode {
  return <mark className={cx("marker", className)}>{children}</mark>;
}

export type SectionHeadingSize = "hero" | "display" | "section";

export interface SectionHeadingProps {
  /** Step number for the eyebrow. Only when the sections really are an ordered flow. */
  index?: number;
  /** Eyebrow words, e.g. "Choose the account". */
  eyebrow?: ReactNode;
  /** The headline. Wrap the key phrase in <Accent>. */
  title: ReactNode;
  /** One or two sentences under the headline. */
  lede?: ReactNode;
  as?: "h1" | "h2" | "h3";
  /** `hero` once per page; `display` for a band or a major section; `section` for the rest. */
  size?: SectionHeadingSize;
  align?: "start" | "center";
  /** Id for the heading element, so a <section aria-labelledby> can point at it. */
  id?: string;
  /** Right side on wide screens (start alignment only), e.g. a secondary link. */
  actions?: ReactNode;
  className?: string;
}

const TITLE_SIZE: Record<SectionHeadingSize, string> = {
  hero: "type-hero text-hero",
  display: "type-hero text-display-xl",
  section: "type-display text-section text-balance",
};

const LEDE_SIZE: Record<SectionHeadingSize, string> = {
  hero: "mt-6 text-lead md:text-title md:leading-relaxed",
  display: "mt-5 text-lead",
  section: "mt-4 text-lead",
};

/** Eyebrow, display headline and lede, as one block with the type scale's spacing. */
export function SectionHeading({
  index,
  eyebrow,
  title,
  lede,
  as: Heading = "h2",
  size = "section",
  align = "start",
  id,
  actions,
  className,
}: SectionHeadingProps): ReactNode {
  const centered = align === "center";
  const block = (
    <div className={cx("flex min-w-0 flex-col", centered ? "items-center text-center" : "items-start")}>
      {eyebrow !== undefined || index !== undefined ? (
        <Eyebrow index={index} className="mb-4 md:mb-5">
          {eyebrow}
        </Eyebrow>
      ) : null}
      <Heading id={id} className={cx("max-w-full text-ink", TITLE_SIZE[size])}>
        {title}
      </Heading>
      {lede !== undefined ? (
        <div className={cx("max-w-measure text-ink-2", LEDE_SIZE[size])}>{lede}</div>
      ) : null}
    </div>
  );

  if (actions === undefined || centered) return <div className={className}>{block}</div>;

  return (
    <div className={cx("flex flex-col gap-5 md:flex-row md:items-end md:justify-between md:gap-10", className)}>
      {block}
      <div className="flex shrink-0 items-center gap-3">{actions}</div>
    </div>
  );
}
