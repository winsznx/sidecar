import Link from "next/link";
import type { ReactNode } from "react";

import { TokenLabel } from "@/components/icons/token-label";
import { Button } from "@/components/ui/button";
import { Connector } from "@/components/ui/connector";
import { SectionHeading } from "@/components/ui/section-heading";
import { MIN_GAS_BALANCE_FOR_ORDER_WEI } from "@/lib/dreamdex/config";
import { formatStt } from "@/lib/format/units";

import { Chapter } from "./chapter";
import { LandingEyebrow } from "./landing-eyebrow";

const MIN_GAS = formatStt(MIN_GAS_BALANCE_FOR_ORDER_WEI, { withSymbol: true });

interface StartStep {
  title: string;
  body: string;
  fact: ReactNode;
}

const STEPS: ReadonlyArray<StartStep> = [
  {
    title: "Claim testnet funds",
    body: "Send /faucet and your address to the faucet bot in the dreamDEX builder group on Telegram. Claim once for each wallet you trade from.",
    fact: (
      <>
        <TokenLabel symbol="STT">50 STT</TokenLabel> and <TokenLabel symbol="USDso">100 USDso</TokenLabel> per 24 hours
      </>
    ),
  },
  {
    title: "Keep enough gas",
    body: `The node only accepts an order from a wallet holding at least ${MIN_GAS}. An order spends far less than that.`,
    fact: <span className="type-data">At least {MIN_GAS}</span>,
  },
  {
    title: "Deposit margin",
    body: "Approve USDso and deposit it into the wallet's margin account. A second wallet needs its own deposit before it can trade.",
    fact: <span>Per wallet, before the first order</span>,
  },
];

export function GettingStarted(): ReactNode {
  return (
    <Chapter labelledBy="getting-started" className="gap-12">
      <div className="flex flex-col gap-5">
        <LandingEyebrow index={7}>Getting started</LandingEyebrow>
        <SectionHeading
          id="getting-started"
          title="Three things before your first order."
          lede="The start page walks through each one with your wallet connected and shows when it is done."
        />
      </div>
      <div className="relative">
        <Connector orientation="horizontal" start="ring" end="dot" className="absolute inset-x-0 top-8 hidden md:flex" />
        <ol className="relative grid gap-4 md:grid-cols-3 md:gap-6">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex min-w-0 flex-col gap-4 rounded-xl border border-line bg-raised p-5 shadow-card md:p-6">
              <span aria-hidden="true" className="type-hero text-display-lg text-ink-3 tabular">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="flex flex-col gap-1.5">
                <h3 className="type-display text-heading text-ink">{step.title}</h3>
                <p className="text-body text-ink-2">{step.body}</p>
              </div>
              <p className="mt-auto border-t border-dashed border-line-strong pt-3 text-small text-ink">{step.fact}</p>
            </li>
          ))}
        </ol>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Button asChild variant="primary" size="lg">
          <Link href="/start">Get started</Link>
        </Button>
        <p className="text-small text-ink-2">
          Already funded?{" "}
          <Link href="/trade" className="rounded-xs font-medium text-ink underline decoration-dashed underline-offset-4 focus-ring">
            Go to the trade screen
          </Link>
          .
        </p>
      </div>
    </Chapter>
  );
}
