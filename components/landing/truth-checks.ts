/**
 * The receipt checks in the order buildTruthChecks runs them. Labels are copied from the adapter
 * so the landing page names exactly what a receipt shows; tests/unit/landing-checks.test.tsx
 * fails if the two lists drift apart.
 */
export interface LandingCheck {
  id: string;
  label: string;
  /** What the check reads to decide. */
  reads: string;
}

export const LANDING_CHECKS: ReadonlyArray<LandingCheck> = [
  { id: "chain-id", label: "Transaction is on Somnia Hideki (50383)", reads: "Chain id" },
  { id: "sender", label: "Sent by the selected account", reads: "Sender" },
  { id: "pool-listed", label: "Target is a listed perp market", reads: "Market list" },
  { id: "margin-bank", label: "Market settles on the expected MarginBank", reads: "Pool's MarginBank" },
  { id: "receipt-success", label: "Receipt confirms success", reads: "Receipt status" },
  { id: "placement-decoded", label: "Order id and fills decoded from the receipt", reads: "OrderPlaced" },
  { id: "calldata-intent", label: "Calldata matches the intended order", reads: "placeOrder calldata" },
  { id: "position-attribution", label: "Position change belongs to the sender", reads: "PositionUpdated" },
  { id: "collateral-attribution", label: "Only the sender's collateral backs the order", reads: "Collateral events" },
  { id: "counterpart-isolation", label: "The other account's collateral did not fund this trade", reads: "MarginBank events" },
];
