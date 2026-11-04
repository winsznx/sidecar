import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Accent } from "@/components/ui/section-heading";

import { Chapter } from "./chapter";
import { LandingEyebrow } from "./landing-eyebrow";
import { RouteComposition } from "./route-composition";

/**
 * Headline and product side by side from lg up. Below lg the composition is left out, so the
 * claim and both calls to action fit the first phone screen; the routes it shows
 * come back as cards in the how-it-works chapter.
 */
export function LandingHero(): ReactNode {
  return (
    <Chapter labelledBy="landing-title" fill="after-header" className="pt-8 md:pt-14">
      <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-12 xl:gap-16">
        <div className="flex min-w-0 flex-col gap-6 md:gap-8">
          <LandingEyebrow index={1}>Sidecar for dreamDEX perps</LandingEyebrow>
          <h1 id="landing-title" className="type-hero text-display-xl text-ink">
            Put the trade next to your positions, or give it <Accent>its own margin.</Accent>
          </h1>
          <p className="max-w-measure text-lead text-ink-2 md:text-title md:leading-relaxed">
            Sidecar shows one perp order two ways: in your main account, sharing collateral with what you hold, or in a
            second wallet with separate margin. You compare, pick and sign.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="accent" size="lg">
              <Link href="/trade">Open the trade screen</Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link href="/start">Get started</Link>
            </Button>
          </div>
        </div>
        <RouteComposition className="max-lg:hidden" />
      </div>
    </Chapter>
  );
}
