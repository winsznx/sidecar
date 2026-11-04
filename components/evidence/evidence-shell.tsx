import type { ReactNode } from "react";

import { PageShell } from "@/components/chrome/page-shell";

export interface EvidenceShellProps {
  /** Which page is open: the proof page, or a receipt (looked up or opened by hash). */
  current: "proof" | "receipt";
  children: ReactNode;
}

/** The site frame for evidence pages: wide for the proof page, a document measure for a receipt. */
export function EvidenceShell({ current, children }: EvidenceShellProps): ReactNode {
  return (
    <PageShell current={current} measure={current === "proof" ? "page" : "document"}>
      {children}
    </PageShell>
  );
}
