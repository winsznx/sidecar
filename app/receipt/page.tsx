import type { Metadata } from "next";
import type { ReactNode } from "react";

import { EvidenceShell } from "@/components/evidence/evidence-shell";
import { ReceiptLookupScreen } from "@/components/evidence/receipt-lookup-screen";

export const metadata: Metadata = {
  title: "Receipts",
  description: "Open any Somnia Hideki perp order receipt by hash, or one of Sidecar's recorded runs.",
};

export default function ReceiptLookupPage(): ReactNode {
  return (
    <EvidenceShell current="receipt">
      <ReceiptLookupScreen />
    </EvidenceShell>
  );
}
