"use client";

import { Calculator, Check, CircleQuestionMark, Eye, TriangleAlert } from "lucide-react";
import type { ReactNode, Ref } from "react";

import { AccountLetter } from "@/components/ui/account-badge";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { IconButton } from "@/components/ui/icon-button";
import { Sheet, SheetTrigger } from "@/components/ui/sheet";
import { StatusPill } from "@/components/ui/status-pill";
import { HIDEKI_CHAIN_ID } from "@/lib/dreamdex/types";
import { formatAge, shortAddress } from "@/lib/format/units";
import { placeButtonLabel } from "@/lib/risk/explanations";
import type { Comparison, RouteKind, RouteProjection } from "@/lib/risk/types";

import { CalculationsSheet } from "./calculations-sheet";
import { ROUTE_LETTER } from "./trade-copy";

export interface CtaInput {
  hasPrimary: boolean;
  /** The ticket's first problem, or null when it holds a valid order. */
  ticketIssue: string | null;
  comparison: Comparison | null;
  selected: RouteKind | null;
  executionLocked: boolean;
  executionHeadline: string;
  /** Why the selected route's protocol preview failed to load, when it did. */
  quoteFailure?: string | null;
}

/** Signer states that no amount of funding fixes, so they are named before any shortfall. */
const SIGNER_FIRST: ReadonlySet<RouteProjection["signer"]["status"]> = new Set(["watch-only", "not-connected"]);

/** Why the sign button is off, in the order a trader would fix things. `undefined` when it can open the review. */
export function ctaBlocker(input: CtaInput): string | undefined {
  if (!input.hasPrimary) return "Add your primary account (A) first.";
  if (input.ticketIssue !== null) return input.ticketIssue;
  if (input.comparison === null) return "Waiting for live account data.";
  if (input.selected === null) return "Choose where this trade lives: account A or account B.";
  if (input.executionLocked) return input.executionHeadline;
  const route = input.comparison.routes[input.selected];
  if (route.identity === null) return "Add a second wallet first.";
  if (route.canPlace) return undefined;
  const letter = ROUTE_LETTER[input.selected];
  const signerIssue = route.issues.find((issue) => issue.blocking && issue.category === "signer");
  const fundingIssue = route.issues.find((issue) => issue.blocking && issue.category === "funding");
  if (signerIssue !== undefined && SIGNER_FIRST.has(route.signer.status)) {
    const who = route.signer.status === "watch-only" ? `Account ${letter} is watch-only` : "No wallet is connected";
    const connect = `Connect ${shortAddress(route.identity.address)}`;
    return fundingIssue === undefined
      ? `${who}. ${connect} to sign.`
      : `${who} and is short of funds: ${fundingIssue.message} ${connect} and fund it.`;
  }
  if (input.quoteFailure !== undefined && input.quoteFailure !== null && route.quote === null) {
    return `Preview failed: ${input.quoteFailure}`;
  }
  const blocking = route.issues.find((issue) => issue.blocking);
  return blocking === undefined ? "This account cannot take this order right now." : blocking.message;
}

/** Until an account is chosen the button names the action only; the disabled reason carries the instruction. */
export function ctaLabel(comparison: Comparison | null, selected: RouteKind | null): string {
  if (comparison === null || selected === null) return "Place order";
  return placeButtonLabel(comparison, selected);
}

function WalletCheck({ route }: { route: RouteProjection | null }): ReactNode {
  if (route === null || route.identity === null) {
    return (
      <StatusPill size="sm" icon={CircleQuestionMark}>
        No account chosen yet
      </StatusPill>
    );
  }
  const letter = ROUTE_LETTER[route.kind];
  const { signer } = route;
  switch (signer.status) {
    case "ready":
      return (
        <StatusPill tone="positive" icon={Check} size="sm">
          Connected wallet is account {letter}
        </StatusPill>
      );
    case "mismatch":
      return (
        <StatusPill tone="warning" icon={TriangleAlert} size="sm">
          Connected wallet is {shortAddress(signer.connected)}, not {letter}
        </StatusPill>
      );
    case "wrong-chain":
      return (
        <StatusPill tone="warning" icon={TriangleAlert} size="sm">
          Wallet is not on Hideki {HIDEKI_CHAIN_ID}
        </StatusPill>
      );
    case "watch-only":
      return (
        <StatusPill size="sm" icon={Eye}>
          Account {letter} is watch-only
        </StatusPill>
      );
    case "not-connected":
      return (
        <StatusPill size="sm" icon={CircleQuestionMark}>
          No wallet connected
        </StatusPill>
      );
  }
}

/** The sign bar's one-line wallet state on small screens: who signs and whether it can. */
export function walletLine(route: RouteProjection | null, walletAddress: string | null): { text: string; tone: "neutral" | "positive" | "warning" } {
  const connected = walletAddress === null ? "Not connected" : shortAddress(walletAddress);
  if (route === null || route.identity === null) return { text: connected, tone: "neutral" };
  const letter = ROUTE_LETTER[route.kind];
  switch (route.signer.status) {
    case "ready":
      return { text: `${letter} ${connected}, ready`, tone: "positive" };
    case "mismatch":
      return { text: `${connected}, not ${letter}`, tone: "warning" };
    case "wrong-chain":
      return { text: `${connected}, wrong network`, tone: "warning" };
    case "watch-only":
      return { text: `${letter} is watch-only`, tone: "neutral" };
    case "not-connected":
      return { text: "Not connected", tone: "neutral" };
  }
}

const LINE_TONE = { neutral: "text-ink-2", positive: "text-positive", warning: "text-warning" } as const;

/** How old the chain read behind the bar is, worded so it never reads "read Unavailable ago". */
function chainReadPhrase(chainAgeMs: number | null): { short: string; long: string } {
  if (chainAgeMs === null) return { short: "not read yet", long: "chain not read yet" };
  const age = formatAge(chainAgeMs);
  return { short: age, long: `read ${age} ago` };
}

export function SignBar({
  comparison,
  selected,
  blocker,
  onPlace,
  walletAddress,
  chainAgeMs,
  ctaRef,
}: {
  comparison: Comparison | null;
  selected: RouteKind | null;
  blocker: string | undefined;
  onPlace: () => void;
  walletAddress: string | null;
  chainAgeMs: number | null;
  /** The primary action, so a dialog it opens can hand focus back. */
  ctaRef?: Ref<HTMLButtonElement>;
}): ReactNode {
  const route = comparison !== null && selected !== null ? comparison.routes[selected] : null;
  const letter = selected === null ? null : ROUTE_LETTER[selected];
  const line = walletLine(route, walletAddress);
  const chainRead = chainReadPhrase(chainAgeMs);

  return (
    // The outer strip stays paper and lets clicks through, so the band floats with real margin around it.
    <section
      aria-label="Sign"
      className="pointer-events-none sticky bottom-0 z-sticky bg-linear-to-t from-canvas via-canvas/80 to-transparent px-2 pt-6 pb-2 md:px-8 md:pb-4"
      data-testid="sign-bar"
    >
      <div
        data-surface="band"
        className="pointer-events-auto mx-auto flex max-w-page flex-col gap-2 rounded-xl bg-canvas px-4 py-3 text-ink shadow-float md:flex-row md:items-center md:gap-6 md:rounded-2xl md:py-3 md:pr-3 md:pl-6"
      >
        <p className="flex items-center justify-between gap-3 type-data text-caption text-ink-3 md:hidden" data-testid="sign-bar-status">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="font-semibold text-ink">04</span>
            Hideki {HIDEKI_CHAIN_ID} · {chainRead.short}
          </span>
          <span className={`inline-flex min-w-0 items-center gap-1.5 truncate ${LINE_TONE[line.tone]}`}>
            <span className="sr-only">Signing wallet:</span>
            {line.text}
          </span>
        </p>
        <div className="hidden min-w-0 md:flex md:flex-col md:items-start md:gap-2">
          <Eyebrow index={4}>Sign</Eyebrow>
          <WalletCheck route={route} />
        </div>
        {/* The first thing to give way when the bar is tight: it truncates before any control wraps. */}
        <p className="hidden min-w-0 flex-1 truncate type-data text-caption text-ink-3 lg:block">
          Hideki {HIDEKI_CHAIN_ID} · {chainRead.long} · paper funds only
        </p>
        <div className="flex items-start gap-2 md:ml-auto md:items-center">
          <Sheet>
            <SheetTrigger asChild>
              <IconButton label="See exact calculations" icon={<Calculator aria-hidden="true" />} size="md" variant="secondary" className="md:hidden" />
            </SheetTrigger>
            <CalculationsSheet comparison={comparison} />
          </Sheet>
          <div className="hidden md:block">
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="lg"
                  aria-label="See exact calculations"
                  leading={<Calculator aria-hidden="true" className="size-4" />}
                  className="whitespace-nowrap"
                >
                  <span className="xl:hidden">Calculations</span>
                  <span className="max-xl:hidden">See exact calculations</span>
                </Button>
              </SheetTrigger>
              <CalculationsSheet comparison={comparison} />
            </Sheet>
          </div>
          <Button
            ref={ctaRef}
            size="lg"
            variant="accent"
            block
            leading={letter === null ? undefined : <AccountLetter account={letter} size="md" />}
            disabledReason={blocker}
            onClick={onPlace}
            data-testid="place-trade-cta"
            className="max-md:min-h-11 max-md:min-w-0 max-md:flex-1 max-md:px-4 max-md:text-body md:w-auto"
            wrapperClassName="min-w-0 flex-1 md:w-auto md:max-w-md md:flex-none md:items-end xl:max-w-2xl xl:flex-row-reverse xl:items-center xl:gap-4 max-md:[&>span:last-child]:line-clamp-2 max-md:[&>span:last-child>svg]:hidden"
          >
            {ctaLabel(comparison, selected)}
          </Button>
        </div>
      </div>
    </section>
  );
}
