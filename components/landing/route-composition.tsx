import { CircleSlash } from "lucide-react";
import type { ReactNode } from "react";

import { TokenLabel } from "@/components/icons/token-label";
import { AccountBadge } from "@/components/ui/account-badge";
import { Connector } from "@/components/ui/connector";
import { cx } from "@/components/ui/cx";
import { Eyebrow } from "@/components/ui/eyebrow";
import { FloatingCard } from "@/components/ui/floating-card";
import { KeyValueList } from "@/components/ui/key-value-list";
import { ProvenanceBadge } from "@/components/ui/provenance-badge";
import { SideTag } from "@/components/ui/side-tag";
import { StatusPill } from "@/components/ui/status-pill";
import type { AccountRole } from "@/components/ui/types";

import { LANDING_SAMPLE, SAMPLE_ACCOUNTS, SAMPLE_ORDER, SAMPLE_POSITION, SAMPLE_ROUTES } from "./sample-data";

function OrderCard(): ReactNode {
  return (
    <FloatingCard tone="ink" className="w-full p-5 sm:max-w-sm sm:pb-12">
      <div className="flex items-center justify-between gap-3">
        <Eyebrow>New order</Eyebrow>
        <ProvenanceBadge source={LANDING_SAMPLE} size="sm" />
      </div>
      <p className="mt-4 flex flex-wrap items-center gap-2 text-title font-semibold text-ink">
        <TokenLabel symbol={SAMPLE_ORDER.market} size={24} /> <SideTag side={SAMPLE_ORDER.side} size="sm" />
      </p>
      <p className="mt-1 type-data text-small text-ink-2">
        <span className="rule-simulated">{SAMPLE_ORDER.size}</span> at{" "}
        <span className="rule-simulated">{SAMPLE_ORDER.price}</span> <TokenLabel symbol="USDso" />
      </p>
      <p className="mt-3 border-t border-dashed border-line-strong pt-3 text-small text-ink-2">
        Needs{" "}
        <TokenLabel symbol="USDso">
          <span className="rule-simulated font-medium text-ink tabular">{SAMPLE_ORDER.initialMargin} USDso</span>
        </TokenLabel>{" "}
        initial margin. Where should it come from?
      </p>
    </FloatingCard>
  );
}

/** What each account already holds. A carries the position "shared" refers to; B holds nothing. */
function Holdings({ account }: { account: AccountRole }): ReactNode {
  if (account === "A") {
    return (
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-small">
        <TokenLabel symbol={SAMPLE_POSITION.market} className="font-semibold text-ink" />
        <SideTag side={SAMPLE_POSITION.side} size="sm" />
        <span className="type-data text-caption text-ink-2">
          <span className="rule-simulated">{SAMPLE_POSITION.size}</span>, entry{" "}
          <span className="rule-simulated">{SAMPLE_POSITION.entry}</span> USDso
        </span>
      </div>
    );
  }
  // Hatching means "nothing here", never a zero.
  return (
    <div className="hatch flex items-center rounded-sm p-1">
      <span className="inline-flex items-center gap-1.5 rounded-xs bg-raised px-2 py-0.5 text-small text-ink-2">
        <CircleSlash aria-hidden="true" className="size-3.5 text-ink-3" />
        No open positions
      </span>
    </div>
  );
}

/**
 * One route as two layers: the route card in front and, tucked under its lower edge, a card for
 * what that account already holds. Both routes use the same rows, depth and size, with mirrored
 * tilt, so neither one looks like the recommended answer.
 */
function Route({ account }: { account: AccountRole }): ReactNode {
  const shared = account === "A";
  const figures = SAMPLE_ROUTES[account];
  return (
    <div className="flex min-w-0 flex-col">
      <FloatingCard tilt={shared ? -1 : 1} className="p-5">
        <div className="flex items-center justify-between gap-3">
          <StatusPill size="sm">{shared ? "Shared margin" : "Separate margin"}</StatusPill>
          <ProvenanceBadge source={LANDING_SAMPLE} size="sm" />
        </div>
        <div className="mt-4">
          <AccountBadge
            account={account}
            label={SAMPLE_ACCOUNTS[account].label}
            address={SAMPLE_ACCOUNTS[account].address}
            shortAddress={SAMPLE_ACCOUNTS[account].short}
            size="sm"
            copyable={false}
          />
        </div>
        <KeyValueList
          className="mt-3"
          density="compact"
          badges={false}
          items={[
            {
              id: "shares",
              label: `Shares collateral with your ${SAMPLE_POSITION.market} position`,
              value: shared ? "Yes" : "No",
            },
            { id: "free", label: "Free collateral", value: `${figures.freeNow} USDso`, source: LANDING_SAMPLE },
            { id: "after", label: "Free after this trade", value: `${figures.freeAfter} USDso`, source: LANDING_SAMPLE },
          ]}
        />
      </FloatingCard>
      <FloatingCard
        depth="back"
        tilt={shared ? 1 : -1}
        className={cx("-mt-4 flex flex-col gap-2 px-5 pt-7 pb-4", shared ? "mr-3 ml-1" : "mr-1 ml-3")}
      >
        <p className="type-eyebrow text-ink-3">{shared ? "Already open in A" : "Open in B"}</p>
        <Holdings account={account} />
      </FloatingCard>
    </div>
  );
}

/**
 * The order card sits behind the two routes, and the routes ride up over its lower corners. The
 * extra bottom padding on the order card is the strip they cover, so no order text is hidden.
 * The dashed stem runs down the centre gutter behind every card; because the route grid is
 * symmetric about that gutter, the stem stays centred at any width.
 */
export function RouteComposition({ className }: { className?: string }): ReactNode {
  return (
    <figure className={cx("relative flex min-w-0 flex-col", className)}>
      <Connector
        start="ring"
        end="dot"
        className="absolute inset-y-0 left-1/2 hidden -translate-x-1/2 sm:flex"
      />
      <div className="relative z-base flex justify-center">
        <OrderCard />
      </div>
      <div className="relative z-raised grid gap-3 max-sm:mt-6 sm:-mt-7 sm:grid-cols-2 sm:gap-x-10">
        <div>
          <Route account="A" />
        </div>
        <p className="flex items-center gap-3 type-eyebrow text-ink-3 sm:hidden">
          <Connector orientation="horizontal" start="none" end="none" className="flex-1" />
          or
          <Connector orientation="horizontal" start="none" end="none" className="flex-1" />
        </p>
        <div>
          <Route account="B" />
        </div>
      </div>
      <figcaption className="relative z-raised mt-8 flex flex-wrap items-center gap-2 text-small text-ink-2 sm:justify-center sm:text-center">
        <ProvenanceBadge source={LANDING_SAMPLE} size="sm" />
        <span className="max-w-measure bg-canvas">
          Sample figures, not live state. On the trade screen every figure is read from Hideki and labelled with its
          source.
        </span>
      </figcaption>
    </figure>
  );
}
