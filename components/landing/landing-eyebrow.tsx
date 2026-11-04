import type { ReactNode } from "react";

import { cx } from "@/components/ui/cx";

export interface LandingEyebrowProps {
  /** Position in the page's sequence: how it works comes before what gets checked after signing. */
  index: number;
  children: ReactNode;
  className?: string;
}

/**
 * A step up from the shared eyebrow: next to 80px headlines the 11px label disappears, so the
 * index sits in a solid ink tab and the words run a size larger, with the same letter-spacing.
 */
export function LandingEyebrow({ index, children, className }: LandingEyebrowProps): ReactNode {
  return (
    <p
      className={cx(
        "flex items-center gap-3 font-mono text-small font-medium uppercase tracking-[0.12em] text-ink-2",
        className,
      )}
    >
      <span className="inline-flex h-6 min-w-8 items-center justify-center rounded-xs bg-ink px-1.5 text-canvas tabular">
        {String(index).padStart(2, "0")}
      </span>
      {children}
    </p>
  );
}
