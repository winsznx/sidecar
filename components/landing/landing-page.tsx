import type { ReactNode } from "react";

import { GlobalHeader } from "@/components/chrome/global-header";
import { SiteFooter } from "@/components/chrome/site-footer";

import { GettingStarted } from "./getting-started";
import { HowItWorks } from "./how-it-works";
import { LandingHero } from "./landing-hero";
import { LiveMarkets } from "./live-markets";
import { MarginProblem } from "./margin-problem";
import type { LandingRecords } from "./recorded-runs-model";
import { RecordedRuns } from "./recorded-runs";
import { StatusBand } from "./status-band";
import { TruthCheckSection } from "./truth-check-section";

export interface LandingPageProps {
  /** Sidecar's recorded runs, read from public/proof on the server. */
  records: LandingRecords;
}

/**
 * Eight chapters, each a screen tall from lg up. Server-rendered apart from the network line,
 * the market list and the head block, and it never asks the wallet for anything.
 */
export function LandingPage({ records }: LandingPageProps): ReactNode {
  return (
    <>
      <GlobalHeader />
      <main className="mx-auto flex max-w-page flex-col px-4 md:px-8">
        <LandingHero />
        <MarginProblem />
        <HowItWorks />
        <LiveMarkets />
        <RecordedRuns records={records} />
        <TruthCheckSection records={records} />
        <GettingStarted />
        <div className="flex flex-col pt-14 md:pt-20 lg:min-h-svh lg:py-12">
          <StatusBand />
        </div>
      </main>
      <div className="mx-auto max-w-page px-4 pt-12 pb-10 md:px-8 md:pt-16">
        <SiteFooter />
      </div>
    </>
  );
}
