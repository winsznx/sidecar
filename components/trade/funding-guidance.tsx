"use client";

import { ChevronDown, Coins } from "lucide-react";
import type { ReactNode } from "react";

import { TokenLabel } from "@/components/icons/token-label";
import { Button } from "@/components/ui/button";
import type { MarginDepositController } from "@/hooks/use-margin-deposit";
import type { WalletState } from "@/hooks/use-wallet-state";
import type { AccountSnapshot, MarketMeta } from "@/lib/dreamdex/types";
import { formatStt, formatUsdso, shortAddress } from "@/lib/format/units";
import type { RouteProjection } from "@/lib/risk/types";
import { sameAddress } from "@/lib/wallets/identity";

import { FAUCET_ALLOWANCE, FAUCET_COMMAND, ROUTE_LETTER } from "./trade-copy";

/** The route is held back by money, not by the order or the data: collateral or gas. */
export function needsFunding(route: RouteProjection): boolean {
  return route.identity !== null && route.issues.some((issue) => issue.blocking && issue.category === "funding");
}

export function FundingGuidance({
  route,
  market,
  snapshot,
  wallet,
  deposit,
  onFund,
}: {
  route: RouteProjection;
  market: MarketMeta;
  snapshot: AccountSnapshot | null;
  wallet: WalletState;
  /** Owned by the screen, so a deposit survives this block disappearing once the account is funded. */
  deposit: MarginDepositController;
  /** Opens the deposit dialog for this account, suggesting the shortfall. */
  onFund: (account: AccountSnapshot["account"], suggested: bigint | null) => void;
}): ReactNode {
  if (route.identity === null) return null;

  const address = route.identity.address;
  const letter = ROUTE_LETTER[route.kind];
  const symbol = market.quoteSymbol;
  const collateralShort = route.issues.find((issue) => issue.shortfall?.asset === "collateral")?.shortfall ?? null;
  const gasShort = route.issues.find((issue) => issue.shortfall?.asset === "gas")?.shortfall ?? null;
  const walletBalance = snapshot?.walletCollateral?.balance ?? null;
  const isConnected = sameAddress(wallet.address, address) && wallet.onHideki;
  const canDeposit = isConnected && route.identity.watchOnly !== true && walletBalance !== null && walletBalance > 0n;
  const pendingHere = deposit.unresolved && sameAddress(deposit.account, address);

  return (
    <section
      aria-label={`Funding account ${letter}`}
      data-testid={`funding-guidance-${route.kind}`}
      className="flex flex-col gap-3 rounded-lg border border-line bg-raised p-4 shadow-card"
    >
      <h3 className="flex items-center gap-2 text-body font-semibold text-ink">
        <Coins aria-hidden="true" className="size-4 text-ink-3" />
        Fund account {letter} ({shortAddress(address)})
      </h3>
      <ul className="flex flex-col gap-1 text-small text-ink-2">
        {collateralShort !== null ? (
          <li>
            Missing for this order:{" "}
            <TokenLabel symbol={collateralShort.symbol}>
              {formatUsdso(collateralShort.amount, collateralShort.decimals, { withSymbol: true, symbol: collateralShort.symbol, rounding: "ceil" })}
            </TokenLabel>
            .
          </li>
        ) : null}
        {route.figures.orderMargin.ok ? (
          <li>
            This order locks{" "}
            <TokenLabel symbol={symbol}>
              {formatUsdso(route.figures.orderMargin.value, market.quoteDecimals, { withSymbol: true, symbol, rounding: "ceil" })}
            </TokenLabel>{" "}
            in this account&apos;s margin.
          </li>
        ) : null}
        {gasShort !== null ? (
          <li>
            Missing for gas:{" "}
            <TokenLabel symbol="STT">
              {formatStt(gasShort.amount, { withSymbol: true, rounding: "ceil" })}
            </TokenLabel>
            .
          </li>
        ) : null}
        <li>
          <TokenLabel symbol={symbol}>{symbol}</TokenLabel> in this wallet, outside its margin account:{" "}
          {walletBalance === null ? "could not be read" : formatUsdso(walletBalance, market.quoteDecimals, { withSymbol: true, symbol })}.
        </li>
      </ul>
      <details className="group rounded-sm border border-dashed border-line-strong px-3 py-2">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xs text-small font-medium text-ink-2 focus-ring hover:text-ink pointer-coarse:min-h-10 [&::-webkit-details-marker]:hidden">
          How to get test funds
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-ink-3 transition-transform duration-fast group-open:rotate-180" />
        </summary>
        <div className="flex flex-col gap-1.5 pt-2 text-small text-ink-2">
          <p>
            Test funds come from the faucet in the dreamDEX builder group on Telegram. Send this message there ({FAUCET_ALLOWANCE}). The funds land in
            this wallet, not in its margin account.
          </p>
          <p className="type-data rounded-sm border border-line bg-sunken px-3 py-2 text-caption break-all text-ink select-all">
            {FAUCET_COMMAND} {address}
          </p>
          {route.kind === "separate" ? (
            <p>
              You can also send STT or {symbol} to this wallet yourself, with a normal transfer from your own wallet app. Sidecar never moves funds
              between your accounts.
            </p>
          ) : null}
        </div>
      </details>
      {pendingHere ? (
        <Button size="sm" variant="secondary" tone={route.kind === "shared" ? "a" : "b"} onClick={() => onFund(address, collateralShort?.amount ?? null)}>
          Show the deposit in progress
        </Button>
      ) : canDeposit && !deposit.unresolved ? (
        <Button size="sm" variant="secondary" tone={route.kind === "shared" ? "a" : "b"} onClick={() => onFund(address, collateralShort?.amount ?? null)}>
          Fund this account&apos;s margin
        </Button>
      ) : (
        <p className="text-caption text-ink-3">
          {isConnected
            ? `Once ${symbol} is in this wallet, Sidecar can deposit it into this wallet's own margin account.`
            : `To deposit from this wallet into its own margin account, switch to ${shortAddress(address)} in your wallet app.`}
        </p>
      )}
    </section>
  );
}
