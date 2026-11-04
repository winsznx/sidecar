import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";

import { EvidenceShell } from "@/components/evidence/evidence-shell";
import { ReceiptScreen } from "@/components/evidence/receipt-screen";
import { ReceiptSkeleton } from "@/components/evidence/receipt-states";

export const metadata: Metadata = {
  title: "Order receipt | Sidecar",
  description: "A perp order reconciled from Somnia Hideki chain reads.",
};

export default function ReceiptPage({ params, searchParams }: PageProps<"/receipt/[txHash]">): ReactNode {
  return (
    <EvidenceShell current="receipt">
      {/* The hash is left out of the fallback on purpose: it is only shown once it has been validated. */}
      <Suspense fallback={<ReceiptSkeleton />}>
        <ReceiptRoute params={params} searchParams={searchParams} />
      </Suspense>
    </EvidenceShell>
  );
}

async function ReceiptRoute({
  params,
  searchParams,
}: Pick<PageProps<"/receipt/[txHash]">, "params" | "searchParams">): Promise<ReactNode> {
  const [{ txHash }, query] = await Promise.all([params, searchParams]);
  const account = typeof query.account === "string" ? query.account : null;
  const counterpart = typeof query.counterpart === "string" ? query.counterpart : null;
  return <ReceiptScreen rawHash={txHash} linkAccount={account} linkCounterpart={counterpart} />;
}
