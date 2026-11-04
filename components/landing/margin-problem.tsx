import type { ReactNode } from "react";

import { TokenLabel } from "@/components/icons/token-label";
import { AccountLetter } from "@/components/ui/account-badge";
import { cx } from "@/components/ui/cx";
import { FloatingCard } from "@/components/ui/floating-card";
import { ProvenanceBadge } from "@/components/ui/provenance-badge";
import { Accent, SectionHeading } from "@/components/ui/section-heading";
import { SideTag } from "@/components/ui/side-tag";
import { StatusPill } from "@/components/ui/status-pill";
import type { AccountRole } from "@/components/ui/types";

import { Chapter } from "./chapter";
import { LandingEyebrow } from "./landing-eyebrow";
import { LANDING_SAMPLE, SAMPLE_MOVE } from "./sample-data";

// Every bar is drawn against the shared account's deposit, so lengths compare across both cards.
const SCALE_UNITS = SAMPLE_MOVE.shared.depositUnits;

interface MeterProps {
  account: AccountRole;
  label: string;
  holds: ReadonlyArray<"ETH-PERP" | "BTC-PERP">;
  deposit: string;
  left: string;
  depositUnits: number;
  lossUnits: number;
}

/**
 * One account's collateral as a bar: the solid part is what is left after the move, the dashed
 * part is what the BTC loss took. The figures sit beside the bar, so the bar never carries them.
 */
function Meter({ account, label, holds, deposit, left, depositUnits, lossUnits }: MeterProps): ReactNode {
  const trackPct = (depositUnits / SCALE_UNITS) * 100;
  const leftPct = ((depositUnits - lossUnits) / depositUnits) * 100;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-2 text-small font-medium text-ink">
          <AccountLetter account={account} size="sm" />
          {label}
        </span>
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {holds.map((market) => (
            <span key={market} className="inline-flex items-center gap-1 text-caption text-ink-2">
              <TokenLabel symbol={market} />
              <SideTag side="long" size="sm" />
            </span>
          ))}
        </span>
      </div>
      <div aria-hidden="true" className="h-3 w-full">
        <div className="flex h-full" style={{ width: `${trackPct}%` }}>
          <span
            className={cx("h-full rounded-l-xs border", account === "A" ? "border-account-a-line bg-account-a-soft" : "border-account-b-line bg-account-b-soft", lossUnits === 0 && "rounded-r-xs")}
            style={{ width: `${leftPct}%` }}
          />
          {lossUnits > 0 ? <span className="h-full flex-1 rounded-r-xs border border-l-0 border-dashed border-line-strong bg-sunken" /> : null}
        </div>
      </div>
      <p className="type-data text-caption text-ink-2">
        <span className="rule-simulated">{left}</span> of <span className="rule-simulated">{deposit}</span> USDso left
        {lossUnits > 0 ? (
          <>
            , <span className="rule-simulated">{SAMPLE_MOVE.loss}</span> lost
          </>
        ) : (
          ", untouched"
        )}
      </p>
    </div>
  );
}

function OutcomeCard({ shared, children, effect }: { shared: boolean; children: ReactNode; effect: string }): ReactNode {
  return (
    <FloatingCard as="article" tilt={shared ? -1 : 1} className="flex flex-col gap-5 p-5 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <StatusPill size="sm">{shared ? "Shared margin" : "Separate margin"}</StatusPill>
        <ProvenanceBadge source={LANDING_SAMPLE} size="sm" />
      </div>
      <div className="flex flex-col gap-4">{children}</div>
      <p className="mt-auto border-t border-dashed border-line-strong pt-4 text-small text-ink-2">{effect}</p>
    </FloatingCard>
  );
}

export function MarginProblem(): ReactNode {
  return (
    <Chapter labelledBy="margin-problem">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-center lg:gap-14">
        <div className="flex min-w-0 flex-col gap-6">
          <LandingEyebrow index={2}>Why separate margin</LandingEyebrow>
          <SectionHeading
            id="margin-problem"
            title={
              <>
                In one shared account, a losing trade draws on <Accent>every position&apos;s margin.</Accent>
              </>
            }
            lede="Every position in a shared margin account draws on the same collateral, so one bad trade can pull the others toward liquidation. A separate account caps the damage at that account's own deposit."
          />
          <p className="max-w-measure text-body text-ink-2">
            The cap has a cost. A separate account can&apos;t borrow from your main one, so it runs out sooner, and either
            account can still be liquidated. Sidecar shows both and leaves the choice to you.
          </p>
        </div>
        <figure className="flex min-w-0 flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
            <OutcomeCard
              shared
              effect="BTC's loss comes out of the collateral ETH also relies on. Any further drop in either market draws on the same 640."
            >
              <Meter
                account="A"
                label="Main account"
                holds={["ETH-PERP", "BTC-PERP"]}
                deposit={SAMPLE_MOVE.shared.deposit}
                left={SAMPLE_MOVE.shared.left}
                depositUnits={SAMPLE_MOVE.shared.depositUnits}
                lossUnits={SAMPLE_MOVE.shared.lossUnits}
              />
            </OutcomeCard>
            <OutcomeCard
              shared={false}
              effect="The loss stays in B, and ETH keeps all 600 behind it. B has 40 left and can't draw on A to stay open."
            >
              <Meter
                account="A"
                label="Main account"
                holds={["ETH-PERP"]}
                deposit={SAMPLE_MOVE.separate.A.deposit}
                left={SAMPLE_MOVE.separate.A.left}
                depositUnits={SAMPLE_MOVE.separate.A.depositUnits}
                lossUnits={SAMPLE_MOVE.separate.A.lossUnits}
              />
              <Meter
                account="B"
                label="Second wallet"
                holds={["BTC-PERP"]}
                deposit={SAMPLE_MOVE.separate.B.deposit}
                left={SAMPLE_MOVE.separate.B.left}
                depositUnits={SAMPLE_MOVE.separate.B.depositUnits}
                lossUnits={SAMPLE_MOVE.separate.B.lossUnits}
              />
            </OutcomeCard>
          </div>
          <figcaption className="flex flex-wrap items-center gap-2 text-small text-ink-2">
            <ProvenanceBadge source={LANDING_SAMPLE} size="sm" />
            <span className="max-w-measure">
              The same BTC drop of {SAMPLE_MOVE.loss} USDso in both. Sample figures for illustration, not live state.
            </span>
          </figcaption>
        </figure>
      </div>
    </Chapter>
  );
}
