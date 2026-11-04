"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import type { MarketMeta, OrderIntent, OrderSide, TimeInForce } from "@/lib/dreamdex/types";
import { sameIntent } from "@/lib/orders/intent";
import {
  validateOrderInput,
  type OrderInputDraft,
  type OrderInputField,
  type OrderInputIssue,
  type OrderValidationResult,
} from "@/lib/orders/validation";

export const DEFAULT_MARKET_SYMBOL = "BTC";
const QUOTE_DEBOUNCE_MS = 350;

export interface TicketDraft {
  side: OrderSide;
  timeInForce: TimeInForce;
  priceText: string;
  quantityText: string;
}

const EMPTY_DRAFT: TicketDraft = { side: "long", timeInForce: "GTC", priceText: "", quantityText: "" };

/** Matches "BTC", "btc" or "BTC-PERP" against the listed markets. */
export function findMarket(markets: readonly MarketMeta[], symbol: string | null): MarketMeta | null {
  if (symbol === null || symbol.trim() === "") return null;
  const wanted = symbol.trim().toLowerCase();
  return (
    markets.find(
      (market) => market.baseSymbol.toLowerCase() === wanted || market.displaySymbol.toLowerCase() === wanted,
    ) ?? null
  );
}

export function defaultMarket(markets: readonly MarketMeta[]): MarketMeta | null {
  return findMarket(markets, DEFAULT_MARKET_SYMBOL) ?? markets[0] ?? null;
}

export interface TradeTicket {
  market: MarketMeta | null;
  /** The URL asked for a market Sidecar does not list. */
  unknownMarketParam: string | null;
  selectMarket: (market: MarketMeta) => void;
  draft: TicketDraft;
  setSide: (side: OrderSide) => void;
  setTimeInForce: (timeInForce: TimeInForce) => void;
  setPriceText: (text: string) => void;
  setQuantityText: (text: string) => void;
  validation: OrderValidationResult | null;
  /** Issues worth showing now: an empty field is not an error until the trader types into it. */
  visibleIssues: Partial<Record<OrderInputField, OrderInputIssue>>;
  intent: OrderIntent | null;
  /** The intent once typing has paused, which is what gets quoted. */
  quotedIntent: OrderIntent | null;
}

function toInputDraft(draft: TicketDraft): OrderInputDraft {
  return { side: draft.side, timeInForce: draft.timeInForce, priceText: draft.priceText, quantityText: draft.quantityText };
}

function fieldText(draft: TicketDraft, field: OrderInputField): string | null {
  if (field === "price") return draft.priceText;
  if (field === "quantity") return draft.quantityText;
  return null;
}

/**
 * The order ticket's text, validated against the selected market's live grid. The market
 * lives in the URL (`/trade?market=BTC`) so a link opens the same ticket. Text is kept per
 * market: switching markets starts a clean ticket, because prices and sizes sit on
 * different grids.
 */
export function useTradeTicket(markets: readonly MarketMeta[] | undefined): TradeTicket {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const marketParam = searchParams.get("market");

  const listed = markets ?? [];
  const requested = findMarket(listed, marketParam);
  const market = requested ?? defaultMarket(listed);
  const unknownMarketParam = markets !== undefined && marketParam !== null && requested === null ? marketParam : null;

  const [stored, setStored] = useState<{ pool: string | null; draft: TicketDraft }>({ pool: null, draft: EMPTY_DRAFT });
  const draft = market !== null && stored.pool === market.pool ? stored.draft : { ...EMPTY_DRAFT, side: stored.draft.side };

  const update = useCallback(
    (patch: Partial<TicketDraft>): void => {
      if (market === null) return;
      setStored((previous) => {
        const base = previous.pool === market.pool ? previous.draft : { ...EMPTY_DRAFT, side: previous.draft.side };
        return { pool: market.pool, draft: { ...base, ...patch } };
      });
    },
    [market],
  );

  const selectMarket = useCallback(
    (next: MarketMeta): void => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("market", next.baseSymbol);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const validation = market === null ? null : validateOrderInput(toInputDraft(draft), market);

  const visibleIssues: Partial<Record<OrderInputField, OrderInputIssue>> = {};
  if (validation !== null && !validation.ok) {
    for (const issue of validation.issues) {
      const text = fieldText(draft, issue.field);
      if (text !== null && text.trim() === "") continue;
      visibleIssues[issue.field] ??= issue;
    }
  }

  const intent = validation?.ok ? validation.intent : null;
  const quotedIntent = useDebouncedIntent(intent);

  return {
    market,
    unknownMarketParam,
    selectMarket,
    draft,
    setSide: (side) => update({ side }),
    setTimeInForce: (timeInForce) => update({ timeInForce }),
    setPriceText: (priceText) => update({ priceText }),
    setQuantityText: (quantityText) => update({ quantityText }),
    validation,
    visibleIssues,
    intent,
    quotedIntent: quotedIntent !== null && intent !== null && sameIntent(quotedIntent, intent) ? quotedIntent : null,
  };
}

function intentSignature(intent: OrderIntent | null): string {
  if (intent === null) return "";
  return [intent.pool.toLowerCase(), intent.side, intent.quantity.toString(), intent.price.toString(), intent.timeInForce].join("|");
}

/** Holds the intent back until typing pauses, so each keystroke does not fire a protocol preview. */
function useDebouncedIntent(intent: OrderIntent | null): OrderIntent | null {
  const [settled, setSettled] = useState<OrderIntent | null>(null);
  const signature = intentSignature(intent);
  const settledSignature = intentSignature(settled);

  useEffect(() => {
    if (signature === settledSignature) return;
    const timer = setTimeout(() => setSettled(intent), QUOTE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // The signature is the intent's identity; the object itself is rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, settledSignature]);

  return settled;
}
