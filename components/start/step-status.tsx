import { CircleCheck, Hand, TriangleAlert, Wallet } from "lucide-react";
import type { ReactNode } from "react";

import { StatusPill } from "@/components/ui/status-pill";
import { Unavailable } from "@/components/ui/unavailable";

import type { StepStatus } from "./start-steps";

export const CONNECT_TO_CHECK = "Connect a wallet to check";

/** A step's verdict as icon + word. No wallet reads as "connect to check", never as a pass. */
export function StepStatusMark({ status }: { status: StepStatus }): ReactNode {
  switch (status.kind) {
    case "pass":
      return (
        <StatusPill tone="positive" icon={CircleCheck}>
          {status.label}
        </StatusPill>
      );
    case "short":
      return (
        <StatusPill tone="warning" icon={TriangleAlert}>
          {status.label}
        </StatusPill>
      );
    case "connect":
      return (
        <StatusPill appearance="outline" icon={Wallet}>
          {CONNECT_TO_CHECK}
        </StatusPill>
      );
    case "reading":
      return (
        <span aria-busy="true">
          <StatusPill appearance="outline">Reading</StatusPill>
        </span>
      );
    case "unavailable":
      return <Unavailable variant="inline" reason={status.reason} />;
    case "manual":
      return (
        <StatusPill appearance="outline" icon={Hand}>
          {status.label}
        </StatusPill>
      );
  }
}
