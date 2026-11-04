import type { ReactNode } from "react";

import { cx } from "@/components/ui/cx";

export interface ChapterProps {
  /** Id of the chapter's heading, for aria-labelledby. */
  labelledBy: string;
  /**
   * `screen` fills the viewport from lg up. `after-header` does the same for the first chapter,
   * which shares its screen with the site header.
   */
  fill?: "screen" | "after-header";
  className?: string;
  children: ReactNode;
}

const FILL = {
  screen: "lg:min-h-svh",
  // The site header measures 61px when it fits one row; if it wraps, the hero simply runs a little long.
  "after-header": "lg:min-h-[calc(100svh-3.8125rem)]",
} as const;

/**
 * One landing chapter. From lg up it is a screen tall with its content centred, so each scroll
 * stop shows one idea; on smaller screens chapters flow at their natural height.
 */
export function Chapter({ labelledBy, fill = "screen", className, children }: ChapterProps): ReactNode {
  return (
    <section
      aria-labelledby={labelledBy}
      className={cx("flex min-w-0 flex-col justify-center py-14 md:py-20 lg:py-12", FILL[fill], className)}
    >
      {children}
    </section>
  );
}
