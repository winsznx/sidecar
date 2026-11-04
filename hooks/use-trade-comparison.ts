"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { useMemo } from "react";

import { classifyError } from "@/lib/dreamdex/errors";
import type { AccountSnapshot, MarketMeta, OrderIntent, RouteQuote } from "@/lib/dreamdex/types";
import { sameIntent } from "@/lib/orders/intent";
import { buildComparison } from "@/lib/risk/preview";
import type { Comparison, RouteKind } from "@/lib/risk/types";
import type { AccountBook, ConnectedWallet } from "@/lib/wallets/identity";

import { useAccountSnapshot, useRouteQuote } from "./use-sidecar-queries";

export interface TradeComparison {
  primarySnapshot: UseQueryResult<AccountSnapshot>;
  separateSnapshot: UseQueryResult<AccountSnapshot>;
  primaryQuote: UseQueryResult<RouteQuote>;
  separateQuote: UseQueryResult<RouteQuote>;
  /** `null` until there is a primary account and a valid order to compare. */
  comparison: Comparison | null;
  /**
   * Why each route's preview read failed, in plain language. The comparison itself only sees
   * a missing quote, which it treats as pending; this keeps a failure from reading as "checking".
   */
  quoteFailures: Record<RouteKind, string | null>;
}

/** The failure of a preview read that has no usable result for this order. */
export function quoteFailure(query: Pick<UseQueryResult<RouteQuote>, "isError" | "error" | "data">, intent: OrderIntent | null): string | null {
  if (!query.isError) return null;
  if (query.data !== undefined && intent !== null && sameIntent(query.data.intent, intent)) return null;
  return classifyError(query.error).message;
}

/** A quote only counts for the order it was taken for; anything else is treated as not there yet. */
function quoteFor(query: UseQueryResult<RouteQuote>, intent: OrderIntent | null): RouteQuote | null {
  const quote = query.data ?? null;
  if (quote === null || intent === null) return null;
  return sameIntent(quote.intent, intent) ? quote : null;
}

/**
 * Both accounts' live state and the protocol's preview of the same order from each, folded
 * into the one comparison object that drives the cards, the copy and the sign button.
 */
export function useTradeComparison(input: {
  markets: readonly MarketMeta[] | undefined;
  market: MarketMeta | null;
  book: AccountBook;
  intent: OrderIntent | null;
  quotedIntent: OrderIntent | null;
  wallet: ConnectedWallet | null;
  nowMs: number;
}): TradeComparison {
  const { markets, market, book, intent, quotedIntent, wallet, nowMs } = input;
  const marginBank = market?.marginBank ?? null;
  const primaryAddress = book.primary?.address ?? null;
  const separateAddress = book.separate?.address ?? null;

  const primarySnapshot = useAccountSnapshot(primaryAddress, marginBank, markets);
  const separateSnapshot = useAccountSnapshot(separateAddress, marginBank, markets);
  const primaryQuote = useRouteQuote({ account: primaryAddress, intent: quotedIntent, market });
  const separateQuote = useRouteQuote({ account: separateAddress, intent: quotedIntent, market });

  const primaryQuoteData = quoteFor(primaryQuote, intent);
  const separateQuoteData = quoteFor(separateQuote, intent);
  const primarySnapshotData = primarySnapshot.data ?? null;
  const separateSnapshotData = separateSnapshot.data ?? null;
  const walletAddress = wallet?.address ?? null;
  const walletChainId = wallet?.chainId ?? null;

  const comparison = useMemo((): Comparison | null => {
    if (market === null || intent === null || book.primary === null || nowMs === 0) return null;
    return buildComparison({
      market,
      intent,
      primary: { identity: book.primary, snapshot: primarySnapshotData, quote: primaryQuoteData },
      separate:
        book.separate === null
          ? null
          : { identity: book.separate, snapshot: separateSnapshotData, quote: separateQuoteData },
      wallet: { address: walletAddress, chainId: walletChainId },
      nowMs,
    });
  }, [
    market,
    intent,
    book.primary,
    book.separate,
    primarySnapshotData,
    primaryQuoteData,
    separateSnapshotData,
    separateQuoteData,
    walletAddress,
    walletChainId,
    nowMs,
  ]);

  const quoteFailures = {
    shared: quoteFailure(primaryQuote, intent),
    separate: quoteFailure(separateQuote, intent),
  };

  return { primarySnapshot, separateSnapshot, primaryQuote, separateQuote, comparison, quoteFailures };
}
