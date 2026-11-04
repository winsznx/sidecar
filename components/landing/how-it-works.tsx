import type { ReactNode } from "react";

import { TokenLabel } from "@/components/icons/token-label";
import { AccountLetter } from "@/components/ui/account-badge";
import { Connector } from "@/components/ui/connector";
import { cx } from "@/components/ui/cx";
import { FloatingCard, type FloatingCardTilt } from "@/components/ui/floating-card";
import { KeyValueList } from "@/components/ui/key-value-list";
import { ProvenanceBadge } from "@/components/ui/provenance-badge";
import { Accent, SectionHeading } from "@/components/ui/section-heading";
import { SideTag } from "@/components/ui/side-tag";

import { LandingEyebrow } from "./landing-eyebrow";
import { LANDING_SAMPLE, SAMPLE_ACCOUNTS, SAMPLE_ORDER, SAMPLE_POSITION } from "./sample-data";

function PositionsFragment(): ReactNode {
  return (
    <KeyValueList
      density="compact"
      badges={false}
      items={[
        {
          id: "account",
          label: "Account",
          value: (
            <span className="inline-flex items-center gap-1.5">
              <AccountLetter account="A" size="sm" />
              {SAMPLE_ACCOUNTS.A.short}
            </span>
          ),
        },
        {
          id: "market",
          label: "Holds",
          value: (
            <span className="inline-flex items-center gap-1.5">
              <TokenLabel symbol={SAMPLE_POSITION.market} />
              <SideTag side={SAMPLE_POSITION.side} size="sm" />
            </span>
          ),
        },
        { id: "size", label: "Size", value: SAMPLE_POSITION.size, source: LANDING_SAMPLE },
      ]}
    />
  );
}

function TicketFragment(): ReactNode {
  return (
    <KeyValueList
      density="compact"
      badges={false}
      items={[
        {
          id: "market",
          label: "Market",
          value: (
            <span className="inline-flex items-center gap-1.5">
              <TokenLabel symbol={SAMPLE_ORDER.market} />
              <SideTag side={SAMPLE_ORDER.side} size="sm" />
            </span>
          ),
        },
        { id: "size", label: "Size", value: SAMPLE_ORDER.size, source: LANDING_SAMPLE },
        { id: "price", label: "Limit price", value: SAMPLE_ORDER.price, source: LANDING_SAMPLE },
      ]}
    />
  );
}

/** Neither option is picked: Sidecar shows both and waits for the trader. */
function ChoiceFragment(): ReactNode {
  return (
    <ul className="flex flex-col gap-2">
      {(["A", "B"] as const).map((account) => (
        <li
          key={account}
          className="flex items-center gap-2.5 rounded-md border border-line-strong bg-raised px-3 py-2 text-small text-ink"
        >
          <span aria-hidden="true" className="size-3.5 shrink-0 rounded-full border-2 border-control" />
          <AccountLetter account={account} size="sm" />
          {account === "A" ? "Shared margin" : "Separate margin"}
        </li>
      ))}
    </ul>
  );
}

function SignFragment(): ReactNode {
  return (
    <div className="flex flex-col items-start gap-2">
      <span
        aria-hidden="true"
        className="inline-flex min-h-10 items-center gap-2 rounded-sm bg-account-b px-4 text-body font-medium text-ink-inverse shadow-button"
      >
        <AccountLetter account="B" size="sm" appearance="on-fill" />
        Place BTC trade in {SAMPLE_ACCOUNTS.B.short}
      </span>
      <p className="text-caption text-ink-2">Your wallet signs. Sidecar never sees a key.</p>
    </div>
  );
}

interface Step {
  title: string;
  body: string;
  fragment: ReactNode;
}

const STEPS: ReadonlyArray<Step> = [
  {
    title: "Your positions",
    body: "Connect account A. Sidecar reads its margin and open positions from the chain.",
    fragment: <PositionsFragment />,
  },
  {
    title: "New trade",
    body: "Enter one perp order: market, side, size and limit price.",
    fragment: <TicketFragment />,
  },
  {
    title: "Choose the account",
    body: "The order in A next to your positions, and in wallet B with its own margin. Same rows, side by side.",
    fragment: <ChoiceFragment />,
  },
  {
    title: "Sign",
    body: "Review the exact order, sign in the wallet you picked, then check the receipt.",
    fragment: <SignFragment />,
  },
];

// Alternate tilt and height so the strip reads as cards dealt onto the paper. Every step is the
// same size and depth: none of them is the "main" one.
const TILT: ReadonlyArray<FloatingCardTilt> = [-1, 1, -1, 1];
const LIFT = ["lg:mt-0", "lg:mt-10", "lg:mt-2", "lg:mt-12"] as const;

export function HowItWorks(): ReactNode {
  return (
    <section aria-labelledby="how-it-works" className="flex flex-col gap-12 md:gap-16">
      <div className="flex flex-col gap-5">
        <LandingEyebrow index={1}>How it works</LandingEyebrow>
        <SectionHeading
          id="how-it-works"
          title={
            <>
              Sidecar never picks the account. <Accent>You do.</Accent>
            </>
          }
          lede="Four steps, the same ones the trade screen walks through. Both accounts stay on screen, in the same rows, until you sign in one of them."
        />
      </div>
      <div className="relative">
        <Connector
          orientation="horizontal"
          start="ring"
          end="dot"
          className="absolute inset-x-0 top-1/2 hidden lg:flex"
        />
        <ol className="relative flex flex-col gap-3 md:grid md:grid-cols-2 md:gap-5 lg:flex lg:flex-row lg:items-start lg:gap-0">
          {STEPS.map((step, index) => (
            <li key={step.title} className={cx("min-w-0 lg:flex-1", index > 0 && "lg:-ml-5", LIFT[index])}>
              <FloatingCard
                tilt={TILT[index]}
                className="flex h-full flex-col gap-5 max-md:rotate-0 max-md:p-4 md:p-7"
              >
                <div className="flex items-baseline gap-4 md:flex-col md:gap-3">
                  <span aria-hidden="true" className="type-hero text-heading text-ink-3 tabular md:text-display-lg">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <h3 className="type-display text-title text-ink md:text-heading">{step.title}</h3>
                    <p className="mt-1.5 text-body text-ink-2">{step.body}</p>
                  </div>
                </div>
                <div className="hidden border-t border-dashed border-line-strong pt-4 md:block">
                  <div className="mb-2 flex justify-end">
                    <ProvenanceBadge source={LANDING_SAMPLE} size="sm" />
                  </div>
                  {step.fragment}
                </div>
              </FloatingCard>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
