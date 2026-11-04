"use client";

import { Check, ChevronDown, CircleQuestionMark, Link2, Minus, OctagonAlert, RefreshCw, TriangleAlert, Unlink2, Wallet } from "lucide-react";
import type { ReactNode } from "react";

import { TokenLabel } from "@/components/icons/token-label";
import { AccountBadge } from "@/components/ui/account-badge";
import { Button } from "@/components/ui/button";
import { ChoiceCard, ChoiceCardGroup } from "@/components/ui/choice-card";
import { Connector } from "@/components/ui/connector";
import { cx } from "@/components/ui/cx";
import { Eyebrow } from "@/components/ui/eyebrow";
import { FloatingCard } from "@/components/ui/floating-card";
import { KeyValueList } from "@/components/ui/key-value-list";
import { ProvenanceBadge, provenanceRuleClass } from "@/components/ui/provenance-badge";
import { Accent } from "@/components/ui/section-heading";
import { SideTag } from "@/components/ui/side-tag";
import { StatusPill } from "@/components/ui/status-pill";
import { Unavailable } from "@/components/ui/unavailable";
import { ValueFlash } from "@/components/ui/value-flash";
import type { MarketMeta, Reading, Source } from "@/lib/dreamdex/types";
import { formatAge, formatBlockNumber, formatPrice, formatQuantity, formatSignedUsdso, formatUsdso, shortAddress } from "@/lib/format/units";
import {
  explainComparison,
  fundingDisclosureLines,
  liquidationCell,
  ROUTE_TITLES,
  SEPARATE_TRADEOFF,
  type RouteExplanation,
} from "@/lib/risk/explanations";
import type { Comparison, RouteKind, RouteProjection } from "@/lib/risk/types";
import type { AccountIdentity } from "@/lib/wallets/identity";

import { readingItem } from "./reading-value";
import { MARGIN_LABELS, ROUTE_LETTER, ROUTE_TONE, TIME_IN_FORCE_COPY } from "./trade-copy";

const KINDS: readonly RouteKind[] = ["shared", "separate"];

export const COMPARISON_HEADING_ID = "compare-heading";

/** Why the protocol preview for a route failed to load, per route. `null` when it did not fail. */
export type QuoteFailures = Record<RouteKind, string | null>;

const NO_FAILURES: QuoteFailures = { shared: null, separate: null };

const PROJECTION_SOURCE: Source = {
  kind: "estimate",
  basis: "Protocol previews for this exact order, assuming it fills in full at its limit price.",
};

/** The pending "preview not available yet" issue, which a failed read replaces with its real reason. */
export function isPendingPreviewIssue(route: RouteProjection, issue: RouteProjection["issues"][number]): boolean {
  return issue.code === "READ_FAILED" && route.quote === null && issue.message.endsWith("is not available yet.");
}

function ShareRow({ route, primary, market }: { route: RouteProjection; primary: AccountIdentity; market: MarketMeta }): ReactNode {
  let answer: { word: string; icon: typeof Link2 } | null;
  const detail = `Shares collateral with ${primary.label}'s positions`;
  if (route.kind === "shared") {
    answer =
      route.sharesCollateralWithExisting === null
        ? null
        : route.sharesCollateralWithExisting
          ? { word: "Yes", icon: Link2 }
          : { word: "No positions yet", icon: Minus };
  } else {
    answer =
      route.identity === null
        ? null
        : route.issues.some((issue) => issue.code === "SAME_ACCOUNT")
          ? { word: "Yes", icon: Link2 }
          : { word: "No", icon: Unlink2 };
  }
  return (
    <div className="flex items-center justify-between gap-3 border-y border-dashed border-line-strong py-3">
      <span className="text-small text-ink-2">{detail}</span>
      {answer === null ? (
        <Unavailable
          variant="inline"
          label="Unknown"
          reason={route.identity === null ? "No second wallet added yet." : `Sidecar could not read this account's positions, so it can't say what ${market.baseSymbol} would share with.`}
        />
      ) : (
        <span className="inline-flex shrink-0 items-center gap-1.5 type-display text-heading leading-none text-ink">
          <answer.icon aria-hidden="true" className="size-4.5 text-ink-3" strokeWidth={2.25} />
          {answer.word}
        </span>
      )}
    </div>
  );
}

/** One of the two figures a route is decided on, set large in the display face. */
function DecisiveFigure({ label, reading, format, unit }: { label: string; reading: Reading<bigint>; format: (raw: bigint) => string; unit: string }): ReactNode {
  return (
    <dl className="flex min-w-0 flex-col gap-1.5">
      <dt className="text-caption text-ink-2">{label}</dt>
      <dd className="min-w-0">
        {reading.ok ? (
          <span className="inline-flex flex-wrap items-baseline gap-x-1.5 tabular">
            <ValueFlash
              value={format(reading.value)}
              className={cx("type-display text-display leading-none text-ink", provenanceRuleClass(reading.source.kind))}
            />
            <TokenLabel symbol={unit} className="text-small text-ink-3" />
          </span>
        ) : (
          <Unavailable reason={reading.reason} />
        )}
      </dd>
    </dl>
  );
}

function Eligibility({
  route,
  quoteFailure,
  onRetry,
}: {
  route: RouteProjection;
  quoteFailure: string | null;
  onRetry?: () => void;
}): ReactNode {
  if (route.eligible) {
    return (
      <StatusPill tone="positive" icon={Check} size="sm">
        This account can take this order
      </StatusPill>
    );
  }
  if (quoteFailure !== null && route.quote === null) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <StatusPill tone="danger" icon={OctagonAlert} size="sm">
          Preview failed
        </StatusPill>
        {onRetry !== undefined ? (
          <Button size="sm" variant="ghost" leading={<RefreshCw aria-hidden="true" className="size-3.5" />} onClick={onRetry}>
            Retry preview
          </Button>
        ) : null}
      </span>
    );
  }
  const pending = route.issues.every((issue) => !issue.blocking || issue.code === "READ_FAILED");
  if (pending && route.quote === null) {
    return (
      <StatusPill tone="neutral" icon={CircleQuestionMark} size="sm">
        Checking with the protocol
      </StatusPill>
    );
  }
  return (
    <StatusPill tone="danger" icon={OctagonAlert} size="sm">
      Can&apos;t place here
    </StatusPill>
  );
}

function Issues({
  explanation,
  route,
  quoteFailure,
}: {
  explanation: RouteExplanation;
  route: RouteProjection;
  quoteFailure: string | null;
}): ReactNode {
  const signerIssue = route.issues.find((issue) => issue.blocking && issue.category === "signer");
  const blockers = route.issues.filter(
    (issue) => issue.blocking && issue.category !== "signer" && !(quoteFailure !== null && isPendingPreviewIssue(route, issue)),
  );
  const failed = quoteFailure !== null && route.quote === null;
  if (!failed && blockers.length === 0 && explanation.warnings.length === 0 && signerIssue === undefined) return null;
  return (
    <div className="flex flex-col gap-2" data-testid={`route-issues-${route.kind}`}>
      {failed ? (
        <div className="rounded-sm border border-danger/40 bg-danger-soft px-3 py-2">
          <p className="text-small font-medium text-ink">The order preview for this account failed: {quoteFailure}</p>
          <p className="text-caption text-ink-2">Retry the preview. Orders stay off until it loads.</p>
        </div>
      ) : null}
      {blockers.map((issue) => (
        <div key={`${issue.code}-${issue.message}`} className="rounded-sm border border-danger/40 bg-danger-soft px-3 py-2">
          <p className="text-small font-medium text-ink">{issue.message}</p>
          <p className="text-caption text-ink-2">{issue.nextStep}</p>
        </div>
      ))}
      {explanation.warnings.map((warning) => (
        <div key={warning.message} className="rounded-sm border border-warning/40 bg-warning-soft px-3 py-2">
          <p className="text-small text-ink">{warning.message}</p>
          <p className="text-caption text-ink-2">{warning.nextStep}</p>
        </div>
      ))}
      {signerIssue !== undefined ? (
        <p className="flex items-start gap-1.5 text-caption text-ink-2">
          <Wallet aria-hidden="true" className="mt-0.5 size-3 shrink-0 text-ink-3" />
          {signerIssue.message}
        </p>
      ) : null}
    </div>
  );
}

/** Whose compartment a card is: A is the main body that carries your positions, B the sidecar beside it. */
const COMPARTMENT: Record<RouteKind, string> = {
  shared: "Account A · the main body",
  separate: "Account B · the sidecar",
};

function RouteCard({
  comparison,
  route,
  explanation,
  checked,
  onSelect,
  nowMs,
  quoteFailure,
  onRetry,
}: {
  comparison: Comparison;
  route: RouteProjection;
  explanation: RouteExplanation;
  checked: boolean;
  onSelect: () => void;
  nowMs: number;
  quoteFailure: string | null;
  onRetry?: () => void;
}): ReactNode {
  const { market } = comparison;
  const letter = ROUTE_LETTER[route.kind];
  const usd = (raw: bigint): string => formatUsdso(raw, market.quoteDecimals, { withSymbol: true, symbol: market.quoteSymbol });
  const signed = (raw: bigint): string => formatSignedUsdso(raw, market.quoteDecimals, { withSymbol: true, symbol: market.quoteSymbol });
  const bare = (raw: bigint): string => formatUsdso(raw, market.quoteDecimals);
  const bareSigned = (raw: bigint): string => formatSignedUsdso(raw, market.quoteDecimals);
  const figures = route.figures;
  const funding = fundingDisclosureLines(route, market);
  const anotherPays = route.funding.ok && route.funding.value.anotherWalletPays;
  const tradeoff =
    route.kind === "shared"
      ? (explanation.points[0] ??
        "Profit and loss offset across positions in one account, and a loss on one draws on the collateral behind the others.")
      : SEPARATE_TRADEOFF;
  const quoteAge = route.quote === null || nowMs === 0 ? null : Math.max(0, nowMs - Date.parse(route.quote.readAt));
  const fundingLines =
    funding.length > 0 ? (
      <div
        className={
          anotherPays
            ? "flex flex-col gap-1 rounded-sm border border-warning/40 bg-warning-soft px-3 py-2"
            : "flex flex-col gap-1 border-l-2 border-dashed border-line-strong py-0.5 pl-3"
        }
        data-testid={`funding-disclosure-${route.kind}`}
      >
        {anotherPays ? (
          <p className="flex items-center gap-1.5 text-small font-semibold text-ink">
            <TriangleAlert aria-hidden="true" className="size-3.5 text-warning" />
            Another wallet funds part of this order
          </p>
        ) : null}
        {funding.map((line) => (
          <p key={line} className="text-small text-ink-2">
            {line}
          </p>
        ))}
      </div>
    ) : null;

  return (
    <ChoiceCard
      name="trade-route"
      value={route.kind}
      tone={ROUTE_TONE[route.kind]}
      checked={checked}
      onSelect={onSelect}
      disabled={route.identity === null}
      title={ROUTE_TITLES[route.kind]}
      description={explanation.headline}
      className="h-full rounded-xl"
      header={
        route.identity === null ? (
          <span className="text-small text-ink-2">No second wallet added yet.</span>
        ) : (
          // No eyebrow row above the badge, so the decisive figures reach the first screen.
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <AccountBadge
              account={letter}
              label={route.identity.label}
              address={route.identity.address}
              shortAddress={shortAddress(route.identity.address)}
              size="sm"
            />
            {/* Both cards carry a pill, so their headers wrap alike and the rows below line up. */}
            {route.kind === "separate" && !route.issues.some((issue) => issue.code === "SAME_ACCOUNT") ? (
              <StatusPill size="sm" icon={Unlink2}>
                No shared margin with {comparison.primary.label}
              </StatusPill>
            ) : route.kind === "shared" ? (
              <StatusPill size="sm" icon={Link2}>
                One margin account for every position
              </StatusPill>
            ) : null}
          </span>
        )
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Eligibility route={route} quoteFailure={quoteFailure} onRetry={onRetry} />
          {route.quote !== null ? (
            <span className="inline-flex items-center gap-2 type-data text-caption text-ink-3">
              Preview #{formatBlockNumber(route.quote.block)} · {formatAge(quoteAge)}
            </span>
          ) : null}
        </div>
      }
    >
      <div className="flex flex-col gap-4" data-testid={`route-headline-${route.kind}`}>
        <div className="flex items-center justify-between gap-3">
          <span className="type-eyebrow text-ink-3">If the order fills</span>
          <ProvenanceBadge source={PROJECTION_SOURCE} size="sm" />
        </div>
        <div className="grid gap-4 min-[28rem]:grid-cols-2 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          {/* Room after leads: it is the figure that differs most between the two accounts. */}
          <DecisiveFigure label={MARGIN_LABELS.roomAfter} reading={figures.buffer.after} format={bareSigned} unit={market.quoteSymbol} />
          <DecisiveFigure label={MARGIN_LABELS.marginLocked} reading={figures.orderMargin} format={bare} unit={market.quoteSymbol} />
        </div>
        <ShareRow route={route} primary={comparison.primary} market={market} />
        <KeyValueList
          density="compact"
          leaders
          badges={false}
          items={[
            readingItem("free-after", MARGIN_LABELS.unlockedAfter, figures.freeCollateral.after, signed),
            readingItem("mm-after", MARGIN_LABELS.maintenanceAfter, figures.maintenance.after, usd),
            readingItem("liq-after", `Liquidation, ${market.baseSymbol} only`, figures.liquidationPrice.after, () =>
              liquidationCell(figures.liquidationPrice.after, market),
            ),
          ]}
        />
      </div>
      <Issues explanation={explanation} route={route} quoteFailure={quoteFailure} />
      {anotherPays ? fundingLines : null}
      <p className="text-small text-ink-2">
        <span className="font-medium text-ink">Trade-off.</span> {tradeoff}
      </p>
      <details className="group border-t border-dashed border-line-strong pt-3">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xs text-small font-medium text-ink-2 focus-ring hover:text-ink pointer-coarse:min-h-10 [&::-webkit-details-marker]:hidden">
          Account {letter} as read now{funding.length > 0 && !anotherPays ? ", and how it is funded" : ""}
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-ink-3 transition-transform duration-fast group-open:rotate-180" />
        </summary>
        <div className="flex flex-col gap-3 pt-3">
          <div>
            {/* These rows mix chain reads with Sidecar's own room estimate, so each row keeps its badge. */}
            <span className="text-caption font-medium text-ink-2">As read now</span>
            <KeyValueList
              density="compact"
              leaders
              items={[
                readingItem("equity", MARGIN_LABELS.equity, figures.equity.before, usd),
                readingItem("room-now", MARGIN_LABELS.room, figures.buffer.before, signed),
                readingItem("free-now", MARGIN_LABELS.unlocked, figures.freeCollateral.before, usd),
              ]}
            />
          </div>
          {anotherPays ? null : fundingLines}
          {route.untouched !== null ? (
            <p className="text-caption text-ink-3">
              {route.untouched.identity.label} ({shortAddress(route.untouched.identity.address)}): {route.untouched.note}
            </p>
          ) : null}
        </div>
      </details>
    </ChoiceCard>
  );
}

function PlaceholderCard({ kind, reason }: { kind: RouteKind; reason: string }): ReactNode {
  return (
    <ChoiceCard
      name="trade-route"
      value={kind}
      tone={ROUTE_TONE[kind]}
      checked={false}
      onSelect={() => undefined}
      disabled
      title={ROUTE_TITLES[kind]}
      description={reason}
      header={<span className="type-eyebrow text-ink-3">{COMPARTMENT[kind]}</span>}
      className="h-full rounded-xl lg:min-h-[28rem]"
    >
      <Unavailable label="Not compared yet" reason={reason} className="flex-1" />
    </ChoiceCard>
  );
}

/** The order both routes would carry, as the ticket holds it. These are the trader's inputs, not reads. */
function OrderCard({ comparison, placeholderReason }: { comparison: Comparison | null; placeholderReason: string }): ReactNode {
  return (
    <FloatingCard tone="ink" className="w-full max-w-xl px-5 py-3" data-testid="route-order">
      <p className="type-eyebrow text-ink-3">New order, from the ticket</p>
      {comparison === null ? (
        <p className="mt-1.5 text-small text-ink-2">{placeholderReason}</p>
      ) : (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <TokenLabel symbol={comparison.market.baseSymbol} size={24} className="text-title font-semibold text-ink">
            {comparison.market.displaySymbol}
          </TokenLabel>
          <SideTag side={comparison.intent.side} size="sm" />
          <span className="text-caption text-ink-3">{TIME_IN_FORCE_COPY[comparison.intent.timeInForce].label}</span>
          <span className="type-data text-small text-ink-2 sm:ml-auto">
            {formatQuantity(comparison.intent.quantity, comparison.market, { withSymbol: true })} at{" "}
            {formatPrice(comparison.intent.price, comparison.market, { withSymbol: true })}
          </span>
        </p>
      )}
    </FloatingCard>
  );
}

/** Each column's arm of the fork, so the branch always meets the centre of its own card. */
function ForkArm({ side }: { side: "start" | "end" }): ReactNode {
  return (
    <span aria-hidden="true" className="relative hidden h-6 sm:block">
      <span
        className={cx(
          "absolute top-0 h-0 border-t-2 border-dashed border-line-strong",
          side === "start" ? "left-1/2 -right-2" : "-left-2 right-1/2",
        )}
      />
      <Connector className="absolute inset-y-0 left-1/2 -translate-x-1/2" end="dot" />
    </span>
  );
}

export function RouteComparison({
  comparison,
  placeholderReason,
  selected,
  onSelect,
  nowMs,
  quoteFailures = NO_FAILURES,
  onRetryQuote,
  className,
}: {
  comparison: Comparison | null;
  placeholderReason: string;
  selected: RouteKind | null;
  onSelect: (kind: RouteKind) => void;
  nowMs: number;
  quoteFailures?: QuoteFailures;
  onRetryQuote?: (kind: RouteKind) => void;
  className?: string;
}): ReactNode {
  const explained = comparison === null ? null : explainComparison(comparison);
  const subject = comparison === null ? "order" : `${comparison.market.baseSymbol} order`;
  // SEPARATE_TRADEOFF already sits inside card B, so the footer carries only the rest.
  const footerLines = (explained?.tradeoff ?? []).filter((line) => line !== SEPARATE_TRADEOFF);

  return (
    <section
      id="comparison"
      aria-labelledby={COMPARISON_HEADING_ID}
      className={cx("flex min-w-0 scroll-mt-4 flex-col", className)}
      data-testid="route-comparison"
    >
      {/* Composed here rather than with SectionHeading: at xl the question drops to one line so both cards' figures stay in the first screen. */}
      <Eyebrow index={3} className="mb-4 md:mb-5">
        Choose the account
      </Eyebrow>
      <h2 id={COMPARISON_HEADING_ID} className="max-w-full type-hero text-section text-balance text-ink xl:text-display-lg xl:text-pretty">
        Where should this trade <Accent>live</Accent>?
      </h2>
      <p className="mt-4 max-w-measure text-lead text-ink-2 xl:mt-3">The same {subject}, held two ways. Pick one. Nothing is sent until you sign.</p>
      <ChoiceCardGroup legend="Where should this trade live?" hideLegend className="mt-6">
        <div className="flex flex-col items-center">
          <OrderCard comparison={comparison} placeholderReason={placeholderReason} />
          <Connector className="h-4 sm:h-5" start="none" end="none" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {KINDS.map((kind, index) => (
            <div key={kind} data-testid={`route-card-${kind}`} className="flex min-w-0 flex-col">
              <ForkArm side={index === 0 ? "start" : "end"} />
              {comparison === null || explained === null ? (
                <PlaceholderCard kind={kind} reason={placeholderReason} />
              ) : (
                <RouteCard
                  comparison={comparison}
                  route={comparison.routes[kind]}
                  explanation={explained[kind]}
                  checked={selected === kind}
                  onSelect={() => onSelect(kind)}
                  nowMs={nowMs}
                  quoteFailure={quoteFailures[kind]}
                  onRetry={onRetryQuote === undefined ? undefined : () => onRetryQuote(kind)}
                />
              )}
            </div>
          ))}
        </div>
      </ChoiceCardGroup>
      <div className="mt-4 flex flex-col gap-1 text-caption text-ink-3">
        {footerLines.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <p>Liquidation is still possible in either account.</p>
      </div>
    </section>
  );
}
