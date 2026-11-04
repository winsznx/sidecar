import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cx } from "./cx";

/** Mono metadata pinned to the band's corners. Real readings only, such as chain id and live block. */
export interface BandCorners {
  topStart?: ReactNode;
  topEnd?: ReactNode;
  bottomStart?: ReactNode;
  bottomEnd?: ReactNode;
}

export interface BandProps extends Omit<ComponentPropsWithoutRef<"section">, "children"> {
  corners?: BandCorners;
  as?: "section" | "div" | "aside" | "footer";
  /** `lg` for the page's big moment, `md` for a band that holds a working panel. */
  padding?: "md" | "lg";
  /** Dotted grid on the band, in the band's own dot colour. */
  grid?: boolean;
  children: ReactNode;
}

const PADDING = {
  md: "px-5 py-8 md:px-10 md:py-12",
  lg: "px-5 py-12 md:px-14 md:py-24",
} as const;

// Pulls the corner rows toward the edges so they read as pinned metadata, not as content.
const CORNER_PULL = {
  md: { top: "-mt-2 md:-mt-6", bottom: "-mb-2 md:-mb-6" },
  lg: { top: "-mt-4 md:-mt-12", bottom: "-mb-4 md:-mb-12" },
} as const;

function CornerRow({ start, end, className }: { start?: ReactNode; end?: ReactNode; className?: string }): ReactNode {
  if (start === undefined && end === undefined) return null;
  return (
    <div className={cx("flex flex-wrap items-center justify-between gap-x-6 gap-y-1 type-eyebrow text-ink-3", className)}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">{start}</div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 sm:justify-end">{end}</div>
    </div>
  );
}

/**
 * The dark section a page gets once: the page's ink turned into the surface. Everything inside
 * resolves the BAND tokens, so primitives work unchanged. Corner rows sit in the flow rather
 * than absolutely, so on a phone they stack above and below the content instead of covering it.
 */
export function Band({
  corners,
  as: Element = "section",
  padding = "lg",
  grid = false,
  className,
  children,
  ...rest
}: BandProps): ReactNode {
  return (
    <Element
      data-surface="band"
      className={cx(
        "relative isolate flex min-w-0 flex-col gap-10 overflow-hidden rounded-xl md:gap-14 md:rounded-2xl",
        grid && "paper-grid",
        PADDING[padding],
        className,
      )}
      {...rest}
    >
      <CornerRow start={corners?.topStart} end={corners?.topEnd} className={CORNER_PULL[padding].top} />
      <div className="min-w-0">{children}</div>
      <CornerRow start={corners?.bottomStart} end={corners?.bottomEnd} className={CORNER_PULL[padding].bottom} />
    </Element>
  );
}
