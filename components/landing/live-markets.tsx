import Link from "next/link";
import type { ReactNode } from "react";

import { SectionHeading } from "@/components/ui/section-heading";

import { Chapter } from "./chapter";
import { LandingEyebrow } from "./landing-eyebrow";
import { LiveMarketList } from "./live-market-list";

export function LiveMarkets(): ReactNode {
  return (
    <Chapter labelledBy="live-markets" className="gap-10">
      <div className="flex flex-col gap-5">
        <LandingEyebrow index={4}>Live markets</LandingEyebrow>
        <SectionHeading
          id="live-markets"
          title="Every dreamDEX perp market, read as this page opened."
          lede="Your browser reads the list from the dreamDEX indexer, or from Hideki itself when the indexer is down, and reads it again every 30 seconds. Each market shows the smallest order it accepts and its price step, the two limits the trade screen checks before you sign."
          actions={
            <Link
              href="/trade"
              className="rounded-xs text-body font-medium text-ink underline decoration-dashed underline-offset-4 focus-ring"
            >
              Trade any of them
            </Link>
          }
        />
      </div>
      <LiveMarketList />
    </Chapter>
  );
}
