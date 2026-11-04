import type { RiskState } from "@/components/ui/types";
import type { MarginStatus, TimeInForce } from "@/lib/dreamdex/types";
import type { RouteKind } from "@/lib/risk/types";

export const TIME_IN_FORCE_COPY: Record<TimeInForce, { label: string; explanation: string }> = {
  GTC: {
    label: "Limit",
    explanation: "Good till cancelled. Fills what it can at your price or better, and the rest rests on the book.",
  },
  IOC: {
    label: "Fill now",
    explanation:
      "Immediate or cancel. Fills what it can right away and cancels the rest. If nothing fills, the transaction reverts.",
  },
  FOK: {
    label: "All or none",
    explanation: "Fill or kill. Fills the whole size right away, or nothing at all.",
  },
  POST_ONLY: {
    label: "Post only",
    explanation: "Only rests on the book as a maker order. If it would fill immediately, it is not placed.",
  },
};

/** The protocol's margin status as a presentation state. An unread status is unknown, never healthy. */
export function riskStateFor(status: MarginStatus | null | undefined): RiskState {
  switch (status) {
    case "Healthy":
      return "healthy";
    case "MarginCall":
      return "margin-call";
    case "PartialLiquidation":
    case "CloseOut":
      return "liquidation-risk";
    default:
      return "unknown";
  }
}

export function riskLabelFor(status: MarginStatus | null | undefined): string | undefined {
  switch (status) {
    case "PartialLiquidation":
      return "Partial liquidation";
    case "CloseOut":
      return "Close-out";
    default:
      return undefined;
  }
}

export const ROUTE_LETTER: Record<RouteKind, "A" | "B"> = { shared: "A", separate: "B" };
export const ROUTE_TONE: Record<RouteKind, "a" | "b"> = { shared: "a", separate: "b" };

export const FAUCET_COMMAND = "/faucet";
export const FAUCET_ALLOWANCE = "50 STT and 100 USDso per 24 hours, per Telegram account and per address";
export const EXPLORER_SIZE_NOTE = "The explorer may show size 0 for perp orders. Sidecar reads the size from the decoded receipt.";

/**
 * One vocabulary for margin figures across the cards, the positions panel and the
 * calculations sheet. "Unlocked collateral" is the bank's balance before unrealized PnL, so
 * it can exceed equity; the room a position has is equity minus maintenance.
 */
export const MARGIN_LABELS = {
  equity: "Equity",
  unlocked: "Unlocked collateral (before PnL)",
  unlockedAfter: "Unlocked collateral after the lock",
  room: "Room before maintenance",
  roomAfter: "Room before maintenance, after",
  marginLocked: "Margin locked",
  maintenanceAfter: "Maintenance after",
  withdrawable: "Withdrawable",
  locked: "Locked",
} as const;

/** The calculations sheet's row names as the explanations module writes them, mapped onto the labels above. */
export const CALCULATION_LABELS: Readonly<Record<string, string>> = {
  "Buffer before": MARGIN_LABELS.room,
  "Buffer if the order fills": `${MARGIN_LABELS.room} if the order fills`,
  "Free collateral before": MARGIN_LABELS.unlocked,
  "Free collateral after the margin lock": MARGIN_LABELS.unlockedAfter,
};
