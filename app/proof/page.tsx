import type { Metadata } from "next";
import type { ReactNode } from "react";

import { EvidenceShell } from "@/components/evidence/evidence-shell";
import { ProofScreen } from "@/components/evidence/proof-screen";

export const metadata: Metadata = {
  title: "Proof | Sidecar",
  description: "Live checks against Somnia Hideki and Sidecar's recorded executions.",
};

export default function ProofPage(): ReactNode {
  return (
    <EvidenceShell current="proof">
      <ProofScreen />
    </EvidenceShell>
  );
}
