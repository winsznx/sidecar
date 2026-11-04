import type { ReactNode } from "react";

import { AccountBadge } from "@/components/ui/account-badge";
import { Band } from "@/components/ui/band";
import { Button } from "@/components/ui/button";
import { Connector } from "@/components/ui/connector";
import { Eyebrow } from "@/components/ui/eyebrow";
import { FloatingCard } from "@/components/ui/floating-card";
import { KeyValueList } from "@/components/ui/key-value-list";
import { ProvenanceBadge } from "@/components/ui/provenance-badge";
import { Accent, SectionHeading } from "@/components/ui/section-heading";
import { SideTag } from "@/components/ui/side-tag";
import { SiteHeader } from "@/components/ui/site-header";
import { StatusPill } from "@/components/ui/status-pill";

import { Specimen } from "./guide-section";
import { SAMPLE_ACCOUNT_A, SAMPLE_ACCOUNT_B, SAMPLE_ACCOUNTS, SAMPLE_NETWORK, SAMPLE_ORDER, SIMULATED, SIMULATED_ESTIMATE } from "./sample-data";

function OrderCard(): ReactNode {
  return (
    <FloatingCard tone="ink" className="w-full max-w-sm p-5">
      <div className="flex items-center justify-between gap-3">
        <Eyebrow>New order</Eyebrow>
        <ProvenanceBadge source={SIMULATED} size="sm" />
      </div>
      <p className="mt-4 flex flex-wrap items-center gap-2 text-title font-semibold text-ink">
        {SAMPLE_ORDER.market} <SideTag side="long" size="sm" />
      </p>
      <p className="mt-1 type-data text-small text-ink-2">
        {SAMPLE_ORDER.size} BTC at {SAMPLE_ORDER.price} USDso
      </p>
    </FloatingCard>
  );
}

function RouteCard({ account }: { account: "A" | "B" }): ReactNode {
  const shared = account === "A";
  const figures = shared ? SAMPLE_ACCOUNT_A : SAMPLE_ACCOUNT_B;
  return (
    <FloatingCard tilt={shared ? -1 : 1} className="w-full p-5">
      <div className="flex items-center justify-between gap-3">
        <StatusPill size="sm">{shared ? "Shared margin" : "Separate margin"}</StatusPill>
        <ProvenanceBadge source={SIMULATED} size="sm" />
      </div>
      <div className="mt-4">
        <AccountBadge account={account} label={SAMPLE_ACCOUNTS[account].label} address={SAMPLE_ACCOUNTS[account].address} size="sm" copyable={false} />
      </div>
      <KeyValueList
        className="mt-3"
        density="compact"
        badges={false}
        items={[
          { id: "free", label: "Free collateral", value: `${figures.available} USDso`, source: SIMULATED },
          {
            id: "after",
            label: "Free after this trade",
            value: `${shared ? SAMPLE_ORDER.freeAfterA : SAMPLE_ORDER.freeAfterB} USDso`,
            source: SIMULATED_ESTIMATE,
          },
        ]}
      />
    </FloatingCard>
  );
}

/**
 * The composition the system is built for: one order, a dashed path, two places to hold it.
 * The two route cards mirror each other (same depth, same size, opposite tilt) so neither reads
 * as the recommended one. Every figure is a simulated sample and says so.
 */
export function HeroStudy(): ReactNode {
  return (
    <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-16">
      <SectionHeading
        as="h1"
        size="hero"
        eyebrow="Sidecar design system"
        title={
          <>
            One order. <Accent>Two places</Accent> to hold it.
          </>
        }
        lede="Share the collateral behind your open positions, or give the trade its own margin in a second wallet. Paper funds only, on Somnia Hideki."
      />
      <figure className="flex flex-col items-center">
        <figcaption className="sr-only">Sample composition: one order and the two accounts that could hold it.</figcaption>
        <OrderCard />
        <Connector className="h-10" end="none" />
        <div aria-hidden="true" className="hidden w-1/2 border-t-2 border-dashed border-line-strong sm:block" />
        <div className="grid w-full gap-6 sm:grid-cols-2 sm:gap-5">
          <div className="flex flex-col items-center">
            <Connector className="hidden h-8 sm:flex" />
            <RouteCard account="A" />
          </div>
          <div className="flex flex-col items-center">
            <Connector className="hidden h-8 sm:flex" />
            <RouteCard account="B" />
          </div>
        </div>
      </figure>
    </div>
  );
}

export function NewPrimitives(): ReactNode {
  return (
    <div className="grid gap-x-10 gap-y-14 lg:grid-cols-2">
      <Specimen label="Site header" className="lg:col-span-2">
        <div className="overflow-hidden rounded-lg border border-line">
          <SiteHeader
            current="trade"
            meta={
              <span className="type-data text-caption text-ink-3">
                {SAMPLE_NETWORK.name} · {SAMPLE_NETWORK.chainId}
              </span>
            }
            wallet={
              <Button variant="secondary" size="sm">
                Connect wallet
              </Button>
            }
          />
        </div>
      </Specimen>

      <Specimen label="Section heading" className="lg:col-span-2">
        <SectionHeading
          index={3}
          eyebrow="Choose the account"
          title={
            <>
              Where should this trade <Accent>live?</Accent>
            </>
          }
          lede="The same order, held two ways. Pick one. Nothing is sent until you sign."
          actions={<Button variant="secondary">See exact calculations</Button>}
        />
      </Specimen>

      <Specimen label="Floating cards">
        <div className="flex flex-wrap items-start gap-6 py-4">
          <FloatingCard depth="back" tilt={-2} className="w-44 p-4">
            <p className="text-small text-ink-2">depth back, tilt -2</p>
          </FloatingCard>
          <FloatingCard className="w-44 p-4">
            <p className="text-small text-ink-2">depth front, level</p>
          </FloatingCard>
          <FloatingCard tone="ink" tilt={1} offset="down" className="w-44 p-4">
            <p className="text-small text-ink-2">tone ink, tilt 1, offset down</p>
          </FloatingCard>
        </div>
      </Specimen>

      <Specimen label="Connectors">
        <div className="flex items-stretch gap-8">
          <Connector className="h-28" />
          <Connector className="h-28" variant="dotted" start="ring" end="ring" />
          <Connector className="h-28" tone="accent" start="dot" />
          <div className="flex flex-1 flex-col justify-center gap-6">
            <Connector orientation="horizontal" />
            <Connector orientation="horizontal" variant="dotted" start="ring" end="none" />
          </div>
        </div>
      </Specimen>

      <Specimen label="Band" className="lg:col-span-2">
        <Band
          corners={{
            topStart: <span>Somnia Hideki · {SAMPLE_NETWORK.chainId}</span>,
            topEnd: <span>Paper funds only</span>,
            bottomStart: <span>Corner slots take real readings only</span>,
            bottomEnd: <span>Testnet</span>,
          }}
        >
          <SectionHeading
            size="display"
            align="center"
            eyebrow="Before you sign"
            title={
              <>
                Pick the account. <Accent>Then sign.</Accent>
              </>
            }
            lede="Sidecar shows both routes with the same rows, in the same order. It never picks for you."
          />
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Button variant="accent" size="lg">
              Open the trade screen
            </Button>
            <Button variant="secondary" size="lg">
              See the proof page
            </Button>
          </div>
        </Band>
      </Specimen>
    </div>
  );
}
