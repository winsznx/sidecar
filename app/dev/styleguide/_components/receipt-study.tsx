import type { ReactNode } from "react";

import { AccountLetter } from "@/components/ui/account-badge";
import { Divider } from "@/components/ui/divider";
import { Eyebrow } from "@/components/ui/eyebrow";
import { InspectionCard, tallyChecks } from "@/components/ui/inspection-card";
import type { KeyValueItem } from "@/components/ui/key-value-list";
import { ProvenanceBadge } from "@/components/ui/provenance-badge";
import { SideTag } from "@/components/ui/side-tag";
import { SidecarGlyph } from "@/components/ui/sidecar-mark";
import { Stamp } from "@/components/ui/stamp";
import { StatusPill } from "@/components/ui/status-pill";

import { SAMPLE_ACCOUNTS, SAMPLE_NETWORK, SAMPLE_ORDER, SAMPLE_RECEIPT, SIMULATED } from "./sample-data";

const PLACED_ROWS: ReadonlyArray<KeyValueItem> = [
  { id: "net", label: "Network", value: `Hideki ${SAMPLE_NETWORK.chainId}`, check: "pass", source: SIMULATED },
  {
    id: "signer",
    label: "Signed by the selected account",
    value: (
      <span className="inline-flex items-center gap-1.5">
        <AccountLetter account="B" size="sm" />
        <span className="sr-only">Account B,</span>
        <span className="type-data whitespace-nowrap">{SAMPLE_ACCOUNTS.B.short}</span>
      </span>
    ),
    check: "pass",
  },
  { id: "pool", label: "Pool is BTC-PERP", value: "0x4181dd…94c0", check: "pass", source: SIMULATED },
  {
    id: "req",
    label: "Requested",
    value: (
      <span className="inline-flex items-center gap-2">
        <SideTag side="long" size="sm" /> {SAMPLE_ORDER.size} BTC at {SAMPLE_ORDER.price}
      </span>
    ),
  },
  { id: "id", label: "Order id", value: SAMPLE_RECEIPT.orderId, source: SIMULATED },
  {
    id: "state",
    label: "Order state",
    value: (
      <StatusPill tone="warning" size="sm">
        Resting, not filled
      </StatusPill>
    ),
    check: "pass",
  },
  { id: "a", label: "Main account margin used", value: "No", check: "pass", source: SIMULATED },
];

const PENDING_ROWS: ReadonlyArray<KeyValueItem> = [
  { id: "net", label: "Network", value: `Hideki ${SAMPLE_NETWORK.chainId}`, check: "pass", source: SIMULATED },
  { id: "receipt", label: "Chain receipt", value: "Not found yet", check: "unknown" },
  { id: "fills", label: "Indexed fills", value: "Waiting for the indexer", check: "unknown" },
];

function ReceiptHeader({ title }: { title: string }): ReactNode {
  return (
    <div className="flex flex-col gap-3">
      <Eyebrow className="inline-flex items-center gap-2">
        <SidecarGlyph className="size-3.5 text-ink-2" />
        Order receipt
      </Eyebrow>
      <h3 className="type-display text-display leading-tight text-ink">{title}</h3>
      <p className="flex flex-wrap gap-x-3 gap-y-1 type-data text-small text-ink-2">
        <span>{SAMPLE_RECEIPT.hashShort}</span>
        <span>
          {SAMPLE_NETWORK.name} {SAMPLE_NETWORK.chainId}
        </span>
      </p>
      <Divider variant="double" className="mt-1" />
    </div>
  );
}

/** Records read like inspection sheets: each check with its verdict, and a footer that counts them. */
export function ReceiptStudy(): ReactNode {
  const placed = tallyChecks(PLACED_ROWS);
  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-measure text-small text-ink-2">
        Two simulated specimens. On a real receipt the verdict comes from the chain receipt and fresh reads, and the
        stamp appears only when every check passed.
      </p>
      <div className="grid items-start gap-8 lg:grid-cols-2">
        <div className="flex flex-col gap-5">
          <ReceiptHeader title="BTC order placed from account B" />
          <InspectionCard
            title="Truth checks"
            meta={<ProvenanceBadge source={SIMULATED} size="sm" />}
            items={PLACED_ROWS}
            badges={false}
            footnote={`re-read at block ${SAMPLE_RECEIPT.block}`}
            verdict={placed.failed === 0 && placed.unknown === 0 ? <Stamp status="verified" detail="Specimen" /> : undefined}
          />
        </div>
        <div className="flex flex-col gap-5">
          <ReceiptHeader title="Outcome not confirmed yet" />
          <InspectionCard
            title="Truth checks"
            meta={<ProvenanceBadge source={SIMULATED} size="sm" />}
            items={PENDING_ROWS}
            badges={false}
            footnote="Sidecar does not resend. It keeps reading the chain."
            verdict={<Stamp status="pending" detail="Waiting for receipt" />}
          />
        </div>
      </div>
    </div>
  );
}
