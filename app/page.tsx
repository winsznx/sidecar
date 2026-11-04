import type { Metadata } from "next";
import type { ReactNode } from "react";

import { LandingPage } from "@/components/landing/landing-page";
import { readRecordedRuns } from "@/components/landing/read-recorded-runs";

export const metadata: Metadata = {
  title: "Sidecar",
  description:
    "Place a dreamDEX perp order next to your positions or in a second wallet with its own margin, compared side by side on Somnia Hideki testnet.",
};

export default function HomePage(): ReactNode {
  return <LandingPage records={readRecordedRuns()} />;
}
