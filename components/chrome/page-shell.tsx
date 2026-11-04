import type { ReactNode } from "react";

import { cx } from "@/components/ui/cx";
import type { SiteSection } from "@/components/ui/site-header";

import { GlobalHeader } from "./global-header";
import { SiteFooter } from "./site-footer";

export interface PageShellProps {
  current?: SiteSection;
  /** `page` for wide layouts, `document` for a single record read top to bottom. */
  measure?: "page" | "document";
  children: ReactNode;
}

const MAIN: Record<NonNullable<PageShellProps["measure"]>, string> = {
  page: "max-w-page py-12 md:py-20",
  document: "max-w-5xl py-8 md:py-14",
};

/**
 * The site header, a paper page and the site footer. The wrapper sets no surface of its own:
 * <html> already carries paper, and a second [data-surface] would paint an opaque canvas over
 * the dotted grid on <body>.
 */
export function PageShell({ current, measure = "page", children }: PageShellProps): ReactNode {
  return (
    <div className="flex min-h-dvh flex-col">
      <GlobalHeader current={current} />
      <main id="main" className={cx("mx-auto w-full flex-1 px-4 md:px-8", MAIN[measure])}>
        {children}
      </main>
      <div className="mx-auto w-full max-w-page px-4 pb-10 md:px-8">
        <SiteFooter />
      </div>
    </div>
  );
}
