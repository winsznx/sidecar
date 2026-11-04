import type { ReactNode } from "react";

import { NetworkLabel } from "@/components/icons/token-label";
import { cx } from "@/components/ui/cx";
import { SiteHeader } from "@/components/ui/site-header";
import { StatusPill } from "@/components/ui/status-pill";
import { HIDEKI_CHAIN_ID } from "@/lib/dreamdex/types";

export interface EvidenceShellProps {
  /** Which page is open. A receipt is not the proof page, so neither nav link reads as current. */
  current: "proof" | "receipt";
  children: ReactNode;
}

/**
 * The site header and a paper page: wide for the proof page, a document measure for a receipt.
 * The wrapper sets no surface of its own: <html> already carries paper, and a second
 * [data-surface] would paint an opaque canvas over the dotted grid on <body>.
 */
export function EvidenceShell({ current, children }: EvidenceShellProps): ReactNode {
  return (
    <div className="min-h-dvh">
      <SiteHeader
        current={current === "proof" ? "proof" : undefined}
        meta={
          <>
            <NetworkLabel className="type-data text-caption text-ink-2">
              Somnia Hideki Testnet <span aria-hidden="true">·</span> {HIDEKI_CHAIN_ID}
            </NetworkLabel>
            <StatusPill size="sm" appearance="outline">
              Paper funds only
            </StatusPill>
          </>
        }
      />
      <main
        id="main"
        className={cx(
          "mx-auto w-full px-4 md:px-8",
          current === "proof" ? "max-w-page py-12 md:py-20" : "max-w-5xl py-8 md:py-14",
        )}
      >
        {children}
      </main>
    </div>
  );
}
