import type { ReactNode } from "react";

import { SiteHeader } from "@/components/ui/site-header";

import { HowItWorks } from "./how-it-works";
import { LandingFooter } from "./landing-footer";
import { LandingHero } from "./landing-hero";
import { StatusBand } from "./status-band";
import { TruthCheckSection } from "./truth-check-section";

/** Server-rendered apart from the live network line, and it never asks the wallet for anything. */
export function LandingPage(): ReactNode {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-page flex-col gap-28 px-4 pt-10 pb-10 md:gap-40 md:px-8 md:pt-14 lg:pt-12">
        <LandingHero />
        <HowItWorks />
        <TruthCheckSection />
        <div className="flex flex-col gap-16">
          <StatusBand />
          <LandingFooter />
        </div>
      </main>
    </>
  );
}
