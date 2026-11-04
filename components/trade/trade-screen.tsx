"use client";

import { ArrowDown, RefreshCw } from "lucide-react";
import { useCallback, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Address } from "viem";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Panel } from "@/components/ui/panel";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { useAccountBook } from "@/hooks/use-account-book";
import { useExecution } from "@/hooks/use-execution";
import { useMarginDeposit } from "@/hooks/use-margin-deposit";
import { useChainStatus, useMarkets } from "@/hooks/use-sidecar-queries";
import { useTradeClock } from "@/hooks/use-trade-clock";
import { useTradeComparison } from "@/hooks/use-trade-comparison";
import { useBookTop, useMarketHealth } from "@/hooks/use-trade-market";
import { useTradeTicket } from "@/hooks/use-trade-ticket";
import { useWalletState } from "@/hooks/use-wallet-state";
import { chainAgeMs } from "@/lib/dreamdex/chain-age";
import { classifyError } from "@/lib/dreamdex/errors";
import { HIDEKI_CHAIN_ID, type AccountSnapshot, type RouteQuote } from "@/lib/dreamdex/types";
import { formatAge, shortAddress } from "@/lib/format/units";
import { sameIntent } from "@/lib/orders/intent";
import type { RouteKind } from "@/lib/risk/types";
import { sameAddress } from "@/lib/wallets/identity";

import { AccountSetup, AccountSetupSkeleton } from "./account-setup";
import { DepositDialog } from "./deposit-dialog";
import { ExecutionStatus, executionAnnouncement, hasExecutionStatus } from "./execution-status";
import { FundingGuidance, needsFunding } from "./funding-guidance";
import { OrderTicket, type MaxFill } from "./order-ticket";
import { AccountPositions, PositionsSkeletonPanel } from "./positions-panel";
import { ReviewDialog } from "./review-dialog";
import { RouteComparison } from "./route-comparison";
import { ScenarioPanel } from "./scenario-panel";
import { ctaBlocker, SignBar } from "./sign-bar";
import { TopBar, TopBarSkeleton } from "./top-bar";
import { ROUTE_LETTER } from "./trade-copy";

const KINDS: readonly RouteKind[] = ["shared", "separate"];

// Below `xl` the two columns dissolve (`contents`) so the panels stack in the order a trader
// reads them: positions A, ticket, comparison, then everything about B and the scenario.
const COLUMN = "flex min-w-0 flex-col gap-6 max-xl:contents xl:gap-8";
const PAGE = "mx-auto flex w-full max-w-page flex-1 flex-col gap-6 px-4 pt-5 pb-8 md:px-8 md:pt-8";
const GRID = "flex flex-col gap-6 xl:grid xl:grid-cols-[9fr_11fr] xl:items-start xl:gap-x-12";

const ORDER = {
  positionsA: "max-xl:order-1",
  ticket: "max-xl:order-2",
  jump: "max-xl:order-3 xl:hidden",
  comparison: "max-xl:order-4",
  funding: "max-xl:order-5",
  status: "max-xl:order-6",
  positionsB: "max-xl:order-7",
  scenario: "max-xl:order-8",
} as const;

function TicketSkeleton({ className }: { className?: string }): ReactNode {
  return (
    <Panel title="Order ticket" titleAs="h3" aria-busy="true" className={className}>
      <span className="sr-only">Loading the market list</span>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-8 w-full" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
        <SkeletonText lines={4} />
      </div>
    </Panel>
  );
}

/** Static first paint while the URL and the wallet resolve in the browser. Shaped like the loaded screen. */
export function TradeScreenFallback(): ReactNode {
  return (
    <div className="flex min-h-dvh flex-col" aria-busy="true">
      <TopBarSkeleton />
      <div className={PAGE}>
        <AccountSetupSkeleton />
        <div className={GRID}>
          <div className="flex min-w-0 flex-col gap-6 xl:gap-8">
            <PositionsSkeletonPanel index={1} />
            <TicketSkeleton />
          </div>
          <div className="flex min-w-0 flex-col gap-6">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="mx-auto h-20 w-full max-w-md" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton shape="block" className="h-[36rem] w-full" />
              <Skeleton shape="block" className="h-[36rem] w-full" />
            </div>
          </div>
        </div>
      </div>
      <span className="sr-only">Loading the trade screen</span>
    </div>
  );
}

const noSubscription = (): (() => void) => () => undefined;

/**
 * False during server render and hydration, true after. The screen reads the saved accounts
 * from this browser, which the server cannot see, so until then it paints the same shell
 * as the fallback instead of an empty-book layout that collapses a moment later.
 */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

interface DepositTarget {
  account: Address;
  suggested: bigint | null;
}

export function TradeScreen(): ReactNode {
  const nowMs = useTradeClock();
  const wallet = useWalletState();
  const { book, warnings, save } = useAccountBook();
  const marketsQuery = useMarkets();
  const markets = marketsQuery.data;
  const chain = useChainStatus();
  const ticket = useTradeTicket(markets);
  const { market, intent } = ticket;
  const health = useMarketHealth(market);
  const bookTop = useBookTop(market);
  const { primarySnapshot, separateSnapshot, primaryQuote, separateQuote, comparison, quoteFailures } = useTradeComparison({
    markets,
    market,
    book,
    intent,
    quotedIntent: ticket.quotedIntent,
    wallet: wallet.connected,
    nowMs,
  });

  const [chosen, setChosen] = useState<RouteKind | null>(null);
  const selected = chosen === "separate" && book.separate === null ? null : chosen;
  const [reviewOpen, setReviewOpen] = useState(false);
  const ctaRef = useRef<HTMLButtonElement>(null);

  const deposit = useMarginDeposit();
  const [depositTarget, setDepositTarget] = useState<DepositTarget | null>(null);
  const depositOpenerRef = useRef<HTMLElement | null>(null);

  const primaryAddress = book.primary?.address ?? null;
  const separateAddress = book.separate?.address ?? null;
  const counterpart = useCallback(
    (account: Address): Address | null => (sameAddress(account, primaryAddress) ? separateAddress : primaryAddress),
    [primaryAddress, separateAddress],
  );
  const execution = useExecution({ market, markets, counterpart });

  const quoteFor = (kind: RouteKind): RouteQuote | null => {
    const data = (kind === "shared" ? primaryQuote : separateQuote).data ?? null;
    return data !== null && intent !== null && sameIntent(data.intent, intent) ? data : null;
  };
  const snapshotFor = (account: Address): AccountSnapshot | null => {
    if (sameAddress(account, primaryAddress)) return primarySnapshot.data ?? null;
    if (sameAddress(account, separateAddress)) return separateSnapshot.data ?? null;
    return null;
  };
  const sizingRoute = comparison === null ? null : comparison.routes[selected ?? "shared"];
  const maxFill: MaxFill | null =
    sizingRoute !== null && sizingRoute.sizing.ok
      ? { letter: ROUTE_LETTER[sizingRoute.kind], quantity: sizingRoute.sizing.value.maxQuantity, source: sizingRoute.sizing.source }
      : null;

  const firstTicketIssue =
    ticket.validation === null
      ? "Waiting for the market list."
      : ticket.validation.ok
        ? null
        : (Object.values(ticket.visibleIssues)[0]?.message ?? "Enter a limit price and size.");
  const blocker = ctaBlocker({
    hasPrimary: book.primary !== null,
    ticketIssue: firstTicketIssue,
    comparison,
    selected,
    executionLocked: execution.locked,
    executionHeadline: execution.copy.headline,
    quoteFailure: selected === null ? null : quoteFailures[selected],
  });

  const placeholderReason =
    book.primary === null
      ? "Add your primary account to compare."
      : market === null
        ? "Waiting for the market list."
        : intent === null
          ? "Enter a valid limit price and size to compare both accounts."
          : "Reading both accounts.";

  const selectedRoute = comparison !== null && selected !== null ? comparison.routes[selected] : null;
  const mismatch = selectedRoute !== null && selectedRoute.signer.status === "mismatch" ? selectedRoute.signer : null;
  const wrongNetwork = wallet.address !== null && !wallet.onHideki;

  function openReview(): void {
    if (blocker !== undefined || selectedRoute === null || selectedRoute.account === null || intent === null) return;
    setReviewOpen(true);
    void execution.prepare({ intent, account: selectedRoute.account });
  }

  function refreshReview(): void {
    if (selectedRoute === null || selectedRoute.account === null || intent === null) return;
    void execution.prepare({ intent, account: selectedRoute.account });
  }

  function confirmOrder(): void {
    if (selectedRoute === null || selectedRoute.account === null || intent === null || wallet.walletClient === null) return;
    void execution.confirm({ intent, account: selectedRoute.account, walletClient: wallet.walletClient });
  }

  function retryQuote(kind: RouteKind): void {
    void (kind === "shared" ? primaryQuote : separateQuote).refetch();
  }

  function openDeposit(account: Address, suggested: bigint | null): void {
    depositOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // A deposit that may still be on its way is the only one the dialog may show.
    const target = deposit.unresolved && deposit.account !== null ? deposit.account : account;
    setDepositTarget({ account: target, suggested });
  }

  function closeDeposit(): void {
    setDepositTarget(null);
    deposit.reset();
  }

  const fundingRoutes =
    comparison === null ? [] : KINDS.map((kind) => comparison.routes[kind]).filter((route) => needsFunding(route) && (selected === null || route.kind === selected));
  const scenarioKind: RouteKind = selected ?? "shared";
  const scenarioIdentity = scenarioKind === "shared" ? book.primary : book.separate;
  const scenarioSnapshot = (scenarioKind === "shared" ? primarySnapshot : separateSnapshot).data ?? null;

  const hydrated = useHydrated();
  const announcement = executionAnnouncement(execution);
  const politeAnnouncement = [
    announcement.polite,
    wrongNetwork ? `Wrong network: switch to Hideki (${HIDEKI_CHAIN_ID}) to sign.` : "",
    mismatch !== null ? `${mismatch.message}` : "",
  ]
    .filter((line) => line !== "")
    .join(" ");

  if (!hydrated) return <TradeScreenFallback />;

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar chain={chain} nowMs={nowMs} wallet={wallet} book={book} />

      {/* Always mounted, so screen readers announce changes instead of skipping text that arrives with its region. */}
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-testid="live-polite">
        {politeAnnouncement}
      </p>
      <p role="alert" aria-live="assertive" aria-atomic="true" className="sr-only" data-testid="live-assertive">
        {announcement.assertive}
      </p>

      <main className={PAGE}>
        <h1 className="sr-only">Trade: choose where the margin lives</h1>
        {wrongNetwork ? (
          <InlineAlert
            tone="warning"
            title="Wrong network"
            action={
              <Button size="sm" variant="secondary" loading={wallet.switching} loadingLabel="Switching" onClick={wallet.switchToHideki}>
                Switch to Hideki ({HIDEKI_CHAIN_ID})
              </Button>
            }
          >
            Your wallet is on {wallet.chainId === null ? "an unknown network" : `chain ${wallet.chainId}`}. Sidecar signs only on Somnia Hideki (
            {HIDEKI_CHAIN_ID}), so signing is off until you switch.
            {wallet.switchError !== null ? <span className="mt-1 block text-danger">{wallet.switchError}</span> : null}
          </InlineAlert>
        ) : null}
        {wallet.connectError !== null && wallet.address === null ? (
          <InlineAlert tone="warning" title="The wallet did not connect" announce="polite">
            {wallet.connectError}
          </InlineAlert>
        ) : null}
        {ticket.unknownMarketParam !== null ? (
          <InlineAlert tone="neutral" title="Market not listed">
            Sidecar does not list a market called “{ticket.unknownMarketParam}”, so it opened {market?.displaySymbol ?? "the first listed market"}{" "}
            instead.
          </InlineAlert>
        ) : null}
        {execution.orphan !== null ? (
          <InlineAlert
            tone="warning"
            title="An earlier order may have been sent"
            action={
              <Button size="sm" variant="secondary" onClick={execution.dismissOrphan}>
                I checked my wallet
              </Button>
            }
          >
            Before this page reloaded, {shortAddress(execution.orphan.account)} asked its wallet to sign an order
            {nowMs === 0 ? "" : ` ${formatAge(nowMs - execution.orphan.savedAtMs)} ago`}
            {execution.orphan.trackedHashes.length > 0 ? `, transaction ${shortAddress(execution.orphan.trackedHashes.at(-1) ?? null)}` : " and no transaction hash came back"}.
            Check your wallet&apos;s activity for it before placing another order.
          </InlineAlert>
        ) : null}
        {deposit.unresolved && depositTarget === null ? (
          <InlineAlert
            tone="warning"
            title="A margin deposit is not resolved yet"
            action={
              <Button size="sm" variant="secondary" onClick={() => deposit.account !== null && openDeposit(deposit.account, null)}>
                Show the deposit
              </Button>
            }
          >
            Do not deposit again until Sidecar has looked it up.
          </InlineAlert>
        ) : null}

        <AccountSetup book={book} save={save} warnings={warnings} wallet={wallet} />

        {marketsQuery.isError && markets === undefined ? (
          <InlineAlert
            tone="danger"
            title="Read-only degraded: the market list is unavailable"
            action={
              <Button size="sm" variant="secondary" leading={<RefreshCw aria-hidden="true" className="size-3.5" />} onClick={() => void marketsQuery.refetch()}>
                Retry
              </Button>
            }
          >
            {classifyError(marketsQuery.error).message} Trading stays off until the market list loads.
          </InlineAlert>
        ) : null}

        <div className={GRID}>
          <section aria-labelledby="positions-order-heading" className={COLUMN}>
            <h2 id="positions-order-heading" className="sr-only">
              Your positions and the new order
            </h2>
            {book.primary === null ? (
              <div className={`${ORDER.positionsA} flex flex-col gap-3`}>
                <Eyebrow index={1}>Your positions</Eyebrow>
                <EmptyState title="No account to show yet">
                  Connect the wallet that holds your positions, or watch its address, in Accounts above. Sidecar shows nothing it has not read.
                </EmptyState>
              </div>
            ) : markets === undefined ? (
              <div className={ORDER.positionsA}>
                <PositionsSkeletonPanel index={1} />
              </div>
            ) : (
              <div className={ORDER.positionsA}>
                <AccountPositions letter="A" identity={book.primary} query={primarySnapshot} markets={markets} collateral={market} nowMs={nowMs} index={1} />
              </div>
            )}
            {market !== null && markets !== undefined ? (
              <div className={ORDER.ticket}>
                <OrderTicket
                  ticket={ticket}
                  markets={markets}
                  market={market}
                  marketsReadAt={marketsQuery.dataUpdatedAt > 0 ? new Date(marketsQuery.dataUpdatedAt).toISOString() : null}
                  health={health}
                  book={bookTop}
                  maxFill={maxFill}
                  locked={execution.locked}
                />
              </div>
            ) : marketsQuery.isError ? null : (
              <TicketSkeleton className={ORDER.ticket} />
            )}
            {book.separate !== null && markets !== undefined ? (
              <div className={ORDER.positionsB}>
                <AccountPositions letter="B" identity={book.separate} query={separateSnapshot} markets={markets} collateral={market} nowMs={nowMs} compact />
              </div>
            ) : null}
          </section>

          <a
            href="#comparison"
            className={`${ORDER.jump} inline-flex w-fit items-center gap-1.5 rounded-xs text-small text-ink-2 underline decoration-line-strong underline-offset-4 focus-ring hover:text-ink pointer-coarse:min-h-10`}
          >
            <ArrowDown aria-hidden="true" className="size-3.5" />
            Jump to the comparison
          </a>

          <div className={COLUMN}>
            <RouteComparison
              comparison={comparison}
              placeholderReason={placeholderReason}
              selected={selected}
              onSelect={setChosen}
              nowMs={nowMs}
              quoteFailures={quoteFailures}
              onRetryQuote={retryQuote}
              className={ORDER.comparison}
            />
            {mismatch !== null ? (
              <InlineAlert tone="warning" title="Switch accounts in your wallet app" className={ORDER.funding}>
                {mismatch.message} Your wallet is connected as {shortAddress(mismatch.connected)}. Select {shortAddress(mismatch.expected)} in your
                wallet app. Sidecar re-checks on its own.
              </InlineAlert>
            ) : null}
            {market !== null
              ? fundingRoutes.map((route) => (
                  <div key={route.kind} className={ORDER.funding}>
                    <FundingGuidance
                      route={route}
                      market={market}
                      snapshot={(route.kind === "shared" ? primarySnapshot : separateSnapshot).data ?? null}
                      wallet={wallet}
                      deposit={deposit}
                      onFund={openDeposit}
                    />
                  </div>
                ))
              : null}
            {hasExecutionStatus(execution) && !reviewOpen ? (
              <div className={ORDER.status}>
                <ExecutionStatus execution={execution} market={market} />
              </div>
            ) : null}
            {market !== null ? (
              <div className={ORDER.scenario}>
                <ScenarioPanel
                  market={market}
                  health={health.data}
                  identity={scenarioIdentity}
                  letter={ROUTE_LETTER[scenarioKind]}
                  snapshot={scenarioSnapshot}
                  quote={quoteFor(scenarioKind)}
                  intent={intent}
                  nowMs={nowMs}
                />
              </div>
            ) : null}
          </div>
        </div>
      </main>

      <SignBar
        comparison={comparison}
        selected={selected}
        blocker={blocker}
        onPlace={openReview}
        walletAddress={wallet.address}
        chainAgeMs={chainAgeMs(chain.data, nowMs)}
        ctaRef={ctaRef}
      />

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        {reviewOpen && comparison !== null && selected !== null ? (
          <ReviewDialog
            comparison={comparison}
            kind={selected}
            execution={execution}
            hasWalletClient={wallet.walletClient !== null}
            onConfirm={confirmOrder}
            onRefresh={refreshReview}
            nowMs={nowMs}
            returnFocusTo={ctaRef}
          />
        ) : null}
      </Dialog>

      <Dialog open={depositTarget !== null} onOpenChange={(next) => (next ? undefined : closeDeposit())}>
        {depositTarget !== null && market !== null ? (
          <DepositDialog
            account={depositTarget.account}
            market={market}
            walletBalance={snapshotFor(depositTarget.account)?.walletCollateral?.balance ?? null}
            suggested={depositTarget.suggested}
            walletClient={sameAddress(wallet.address, depositTarget.account) ? wallet.walletClient : null}
            deposit={deposit}
            returnFocusTo={depositOpenerRef}
          />
        ) : null}
      </Dialog>
    </div>
  );
}
