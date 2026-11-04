import { CircleCheck, CircleQuestionMark, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { StatusPill } from "./status-pill";
import type { RiskState, StatusTone } from "./types";

interface RiskPresentation {
  tone: StatusTone;
  icon: LucideIcon;
  label: string;
}

export const RISK_PRESENTATION: Readonly<Record<RiskState, RiskPresentation>> = {
  healthy: { tone: "positive", icon: CircleCheck, label: "Healthy" },
  "margin-call": { tone: "warning", icon: TriangleAlert, label: "Margin call" },
  "liquidation-risk": { tone: "danger", icon: OctagonAlert, label: "Liquidation risk" },
  unknown: { tone: "neutral", icon: CircleQuestionMark, label: "Unknown" },
};

export interface RiskPillProps {
  state: RiskState;
  /** Overrides the default word, e.g. "Unknown: market cannot be priced". Keep the state word first. */
  label?: string;
  size?: "sm" | "md";
  className?: string;
}

/** Account health as hue + icon + word. `unknown` is its own state and never renders as healthy. */
export function RiskPill({ state, label, size = "md", className }: RiskPillProps): ReactNode {
  const presentation = RISK_PRESENTATION[state];
  return (
    <StatusPill tone={presentation.tone} icon={presentation.icon} size={size} className={className}>
      {label ?? presentation.label}
    </StatusPill>
  );
}
