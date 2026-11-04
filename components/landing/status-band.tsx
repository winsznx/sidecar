import Link from "next/link";
import type { ReactNode } from "react";

import { Band } from "@/components/ui/band";
import { cx } from "@/components/ui/cx";
import { Button } from "@/components/ui/button";
import { HIDEKI_CHAIN_ID } from "@/lib/dreamdex/types";

import { LandingEyebrow } from "./landing-eyebrow";
import { LiveHeadFigure } from "./live-head-figure";

// The band's own grid dot (--sc-grid-dot on band) all but vanishes at this size, so the landing
// draws the same 20px grid in paper ink at low alpha. Same pitch as the paper grid.
const BAND_GRID =
  "[background-image:radial-gradient(circle_at_1px_1px,rgb(242_241_236/0.15)_1px,transparent_1.5px)] [background-size:20px_20px]";

/**
 * The page's one dark section. Its figure is the live Hideki head, the only number on the page
 * that isn't a sample. The corners carry fixed facts only; the live reading lives in the figure,
 * so assistive tech hears it once.
 */
export function StatusBand(): ReactNode {
  return (
    <Band
      aria-labelledby="testnet-status"
      className={cx(BAND_GRID, "lg:flex-1 lg:justify-between")}
      corners={{
        topStart: <span>Chain {HIDEKI_CHAIN_ID} · Somnia Hideki</span>,
        topEnd: <span>Testnet · paper funds only</span>,
        bottomStart: <span>Nothing is sent until your wallet signs</span>,
        bottomEnd: <span>USDso from the testnet faucet</span>,
      }}
    >
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end lg:gap-16">
        <div className="flex min-w-0 flex-col gap-8">
          <LandingEyebrow index={8}>Testnet</LandingEyebrow>
          <h2 id="testnet-status" className="type-hero text-hero text-ink">
            Paper funds. Real blocks.
          </h2>
          <p className="max-w-measure text-lead text-ink-2">
            Every order runs on Somnia Hideki with faucet USDso, so nothing on Sidecar is real money. The chain under it is
            live, and every figure on the trade screen is labelled with its source.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="accent" size="lg">
              <Link href="/trade">Open the trade screen</Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link href="/proof">See the proof page</Link>
            </Button>
          </div>
        </div>
        <div className="min-w-0 border-t border-dashed border-line-strong pt-8 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-12">
          <LiveHeadFigure />
        </div>
      </div>
    </Band>
  );
}
