import type { Metadata } from "next";
import { Suspense } from "react";

import { TradeScreen, TradeScreenFallback } from "@/components/trade/trade-screen";

export const metadata: Metadata = {
  title: "Trade",
  description: "Compare sharing collateral with your positions against a separate margin account, then place the order.",
};

// The screen reads the market from the URL and everything else from the browser, so the
// prerendered shell is the fallback and the screen itself renders on the client.
export default function TradePage() {
  return (
    <Suspense fallback={<TradeScreenFallback />}>
      <TradeScreen />
    </Suspense>
  );
}
