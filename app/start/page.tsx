import type { Metadata } from "next";
import type { ReactNode } from "react";

import { PageShell } from "@/components/chrome/page-shell";
import { StartScreen } from "@/components/start/start-screen";

export const metadata: Metadata = {
  title: "Get started | Sidecar",
  description: "Ready a fresh testnet wallet for Somnia Hideki: network, faucet funds, gas, USDso and margin, each read live.",
};

export default function StartPage(): ReactNode {
  return (
    <PageShell current="start">
      <StartScreen />
    </PageShell>
  );
}
