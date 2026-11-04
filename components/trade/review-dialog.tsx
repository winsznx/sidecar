"use client";

import { RefreshCw } from "lucide-react";
import type { ReactNode, RefObject } from "react";

import { TokenLabel } from "@/components/icons/token-label";
import { AccountBadge, AccountLetter } from "@/components/ui/account-badge";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogContent } from "@/components/ui/dialog";
import { InlineAlert } from "@/components/ui/inline-alert";
import { KeyValueList } from "@/components/ui/key-value-list";
import { SideTag } from "@/components/ui/side-tag";
import type { ExecutionController } from "@/hooks/use-execution";
import { MIN_GAS_BALANCE_FOR_ORDER_WEI, PERP_ORDER_FEES, PERP_ORDER_GAS_LIMIT } from "@/lib/dreamdex/config";
import { HIDEKI_CHAIN_ID } from "@/lib/dreamdex/types";
import { formatAge, formatBlockNumber, formatPrice, formatQuantity, formatRaw, formatSignedUsdso, formatStt, formatUsdso, shortAddress } from "@/lib/format/units";
import { canSubmit, DEFAULT_QUOTE_MAX_AGE_MS, quoteValidity, type QuoteValidity } from "@/lib/orders/lifecycle";
import { computeNotional } from "@/lib/orders/validation";
import { explainRoute, fundingDisclosureLines } from "@/lib/risk/explanations";
import type { Comparison, RouteKind } from "@/lib/risk/types";

import { ExecutionStatus, executionAnnouncement, hasExecutionStatus } from "./execution-status";
import { readingItem } from "./reading-value";
import { MARGIN_LABELS, ROUTE_LETTER, ROUTE_TONE, TIME_IN_FORCE_COPY } from "./trade-copy";

const GWEI_DECIMALS = 9;

/** How the prepared preview stands against the signing window right now. `null` before there is one. */
export function previewValidity(execution: ExecutionController, nowMs: number): QuoteValidity | null {
  const { quote, intent, account } = execution.state;
  if (!canSubmit(execution.state) || quote === null || intent === null || account === null || nowMs === 0) return null;
  return quoteValidity(quote, intent, account, nowMs);
}

export function confirmBlocker(input: {
  comparison: Comparison;
  kind: RouteKind;
  execution: ExecutionController;
  hasWalletClient: boolean;
  nowMs: number;
}): string | undefined {
  const { comparison, kind, execution, hasWalletClient, nowMs } = input;
  const route = comparison.routes[kind];
  if (execution.checking && (execution.state.phase === "QUOTING" || execution.state.phase === "EDITING")) {
    return "Getting a fresh preview for this exact order.";
  }
  if (execution.locked) return execution.copy.headline;
  if (!canSubmit(execution.state)) return execution.state.notice ?? "Refresh the preview before signing.";
  const validity = previewValidity(execution, nowMs);
  if (validity !== null && !validity.valid) return validity.message;
  const blocking = route.issues.find((issue) => issue.blocking);
  if (blocking !== undefined) return `${blocking.message} ${blocking.nextStep}`;
  if (!hasWalletClient) return "Your wallet is not ready to sign on Hideki. Reconnect it, then try again.";
  return undefined;
}

export function ReviewDialog({
  comparison,
  kind,
  execution,
  hasWalletClient,
  onConfirm,
  onRefresh,
  nowMs,
  returnFocusTo,
}: {
  comparison: Comparison;
  kind: RouteKind;
  execution: ExecutionController;
  hasWalletClient: boolean;
  onConfirm: () => void;
  onRefresh: () => void;
  nowMs: number;
  /** The control that opened the review. It has no DialogTrigger, so focus is handed back explicitly. */
  returnFocusTo: RefObject<HTMLElement | null>;
}): ReactNode {
  const { market, intent } = comparison;
  const route = comparison.routes[kind];
  const letter = ROUTE_LETTER[kind];
  const explanation = explainRoute(comparison, kind);
  const funding = fundingDisclosureLines(route, market);
  const blocker = confirmBlocker({ comparison, kind, execution, hasWalletClient, nowMs });
  const quote = execution.state.quote;
  const validity = previewValidity(execution, nowMs);
  const stale = validity !== null && !validity.valid;
  const inFlight = execution.state.phase === "AWAITING_WALLET_CONFIRMATION" || execution.state.phase === "SUBMITTED";
  const canRefresh = !execution.locked && !execution.checking && (!canSubmit(execution.state) || stale);
  const notional = computeNotional(intent.quantity, intent.price, market.baseDecimals);
  const address = route.account;
  const usd = (raw: bigint): string => formatUsdso(raw, market.quoteDecimals, { withSymbol: true, symbol: market.quoteSymbol });
  const signed = (raw: bigint): string => formatSignedUsdso(raw, market.quoteDecimals, { withSymbol: true, symbol: market.quoteSymbol });
  const announcement = executionAnnouncement(execution);

  return (
    <DialogContent
      title={`Review ${market.displaySymbol} order`}
      description="Check every line. Your wallet asks you to confirm after this, and nothing is sent before that."
      data-testid="review-dialog"
      className="sm:max-w-sheet"
      onCloseAutoFocus={(event) => {
        const target = returnFocusTo.current;
        if (target === null || !target.isConnected) return;
        event.preventDefault();
        target.focus();
      }}
      actions={
        <>
          <DialogClose asChild>
            <Button variant="ghost">{execution.locked ? "Hide" : "Cancel"}</Button>
          </DialogClose>
          {canRefresh ? (
            <Button variant="secondary" leading={<RefreshCw aria-hidden="true" className="size-3.5" />} onClick={onRefresh}>
              Refresh preview
            </Button>
          ) : null}
          {address !== null ? (
            <Button
              tone={ROUTE_TONE[kind]}
              leading={<AccountLetter account={letter} size="sm" appearance="on-fill" />}
              disabledReason={inFlight ? undefined : blocker}
              loading={inFlight}
              loadingLabel={execution.state.phase === "SUBMITTED" ? "Waiting for the chain" : "Confirm in your wallet"}
              onClick={onConfirm}
              data-testid="confirm-order"
              wrapperClassName="sm:items-end"
            >
              Sign and place in <span className="whitespace-nowrap">{shortAddress(address)}</span>
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-1">
        {/* Inside the modal: the page's live regions are hidden from assistive tech while it is open. */}
        <p role="status" className="sr-only">
          {announcement.polite}
        </p>
        <p role="alert" className="sr-only">
          {announcement.assertive}
        </p>
        {route.identity !== null ? (
          <div className="flex flex-col gap-2 rounded-md border border-line bg-sunken p-3">
            <p className="flex flex-wrap items-center gap-2 text-body font-semibold text-ink" data-testid="signing-line">
              <span className="sr-only">Signing from</span>
              <AccountBadge account={letter} label={route.identity.label} address={route.identity.address} shortAddress={shortAddress(route.identity.address)} size="sm" />
              <span>on Hideki {HIDEKI_CHAIN_ID}</span>
            </p>
            <p className="text-small text-ink-2">{explanation.headline}</p>
          </div>
        ) : null}
        <KeyValueList
          density="compact"
          items={[
            { id: "market", label: "Market", value: <TokenLabel symbol={market.baseSymbol}>{market.displaySymbol}</TokenLabel> },
            { id: "side", label: "Side", value: <SideTag side={intent.side} size="sm" /> },
            {
              id: "size",
              label: "Size",
              value: <TokenLabel symbol={market.baseSymbol}>{formatQuantity(intent.quantity, market, { withSymbol: true })}</TokenLabel>,
            },
            {
              id: "price",
              label: "Limit price",
              value: <TokenLabel symbol={market.quoteSymbol}>{formatPrice(intent.price, market, { withSymbol: true })}</TokenLabel>,
            },
            {
              id: "tif",
              label: "Order type",
              value: `${TIME_IN_FORCE_COPY[intent.timeInForce].label} (${intent.timeInForce})`,
              hint: TIME_IN_FORCE_COPY[intent.timeInForce].explanation,
            },
            {
              id: "notional",
              label: "Notional",
              value: (
                <TokenLabel symbol={market.quoteSymbol}>
                  {formatUsdso(notional, market.quoteDecimals, { withSymbol: true, symbol: market.quoteSymbol })}
                </TokenLabel>
              ),
            },
            {
              id: "gas",
              label: "Gas ceiling",
              value: `${formatRaw(PERP_ORDER_GAS_LIMIT, 0)} gas at up to ${formatRaw(PERP_ORDER_FEES.maxFeePerGas, GWEI_DECIMALS)} gwei`,
              hint: `The wallet must hold ${formatStt(MIN_GAS_BALANCE_FOR_ORDER_WEI, { withSymbol: true })} up front. Only the gas used is charged.`,
            },
          ]}
        />
        <div className="outline-estimate rounded-xs" data-testid="review-consequence">
          <p className="pt-1 text-caption font-medium text-ink-2">What it does to account {letter} if it fills</p>
          <KeyValueList
            density="compact"
            items={[
              readingItem("lock", MARGIN_LABELS.marginLocked, route.figures.orderMargin, usd),
              readingItem("room-after", MARGIN_LABELS.roomAfter, route.figures.buffer.after, signed),
              readingItem("free-after", MARGIN_LABELS.unlockedAfter, route.figures.freeCollateral.after, signed),
              readingItem("mm-after", MARGIN_LABELS.maintenanceAfter, route.figures.maintenance.after, usd),
            ]}
          />
        </div>
        {funding.length > 0 ? (
          <InlineAlert tone={route.funding.ok && route.funding.value.anotherWalletPays ? "warning" : "neutral"} title="Wallet funds this order moves">
            <ul className="flex flex-col gap-1">
              {funding.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </InlineAlert>
        ) : null}
        {execution.checking && execution.state.phase === "QUOTING" ? (
          <p role="status" className="text-small text-ink-2">
            Getting a fresh preview for this exact order from {shortAddress(address)}.
          </p>
        ) : quote !== null && validity !== null ? (
          <p className="text-small text-ink-2" data-testid="preview-age">
            {validity.valid
              ? `Preview at block ${formatBlockNumber(quote.block)}, ${formatAge(validity.ageMs)} old. Sidecar refuses to sign it after ${DEFAULT_QUOTE_MAX_AGE_MS / 1000} seconds.`
              : `${validity.message} The preview was read at block ${formatBlockNumber(quote.block)}.`}
          </p>
        ) : null}
        {hasExecutionStatus(execution) ? <ExecutionStatus execution={execution} market={market} compact /> : null}
      </div>
    </DialogContent>
  );
}
