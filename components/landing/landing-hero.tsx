import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Accent } from "@/components/ui/section-heading";

import { DECODED_FILL_HREF } from "./links";
import { LiveNetworkLine } from "./live-network-line";
import { RouteComposition } from "./route-composition";

/**
 * Headline and product side by side from lg up, so the first screen shows the order and both
 * routes next to the claim instead of below the fold.
 */
export function LandingHero(): ReactNode {
  return (
    <section
      aria-labelledby="landing-title"
      className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-12 xl:gap-16"
    >
      <div className="flex min-w-0 flex-col gap-8">
        <h1 id="landing-title" className="type-hero text-display-xl text-ink">
          Put the trade next to your positions, or give it <Accent>its own margin.</Accent>
        </h1>
        <p className="max-w-measure text-lead text-ink-2 md:text-title md:leading-relaxed">
          Sidecar puts one dreamDEX perp order on screen two ways: in your main account, sharing collateral with what you
          already hold, or in a second wallet with separate margin. You compare, pick and sign.
        </p>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="accent" size="lg">
              <Link href="/trade">Open the trade screen</Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link href={DECODED_FILL_HREF}>See a real Hideki fill, decoded</Link>
            </Button>
          </div>
          <p className="max-w-measure text-small text-ink-3">
            Someone else sent that fill. Sidecar&apos;s own runs are on the proof page.
          </p>
        </div>
        <LiveNetworkLine />
      </div>
      <RouteComposition />
    </section>
  );
}
