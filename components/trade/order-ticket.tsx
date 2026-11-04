"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { useId, type ReactNode } from "react";

import { TokenLabel } from "@/components/icons/token-label";
import { Eyebrow } from "@/components/ui/eyebrow";
import { InlineAlert } from "@/components/ui/inline-alert";
import { KeyValueList, type KeyValueItem } from "@/components/ui/key-value-list";
import { NumberField } from "@/components/ui/number-field";
import { Panel } from "@/components/ui/panel";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Unavailable } from "@/components/ui/unavailable";
import type { TradeTicket } from "@/hooks/use-trade-ticket";
import type { BookTopReading, MarketHealth, MarketMeta, Source, TimeInForce } from "@/lib/dreamdex/types";
import { classifyError } from "@/lib/dreamdex/errors";
import { formatPrice, formatQuantity, formatUsdso, toInputString } from "@/lib/format/units";
import { snapDownToGrid, TIMES_IN_FORCE, type OrderInputIssue } from "@/lib/orders/validation";
import { UNPRICEABLE_MESSAGE } from "@/lib/risk/explanations";

import { MarketPicker } from "./market-picker";
import { readingItem } from "./reading-value";
import { TIME_IN_FORCE_COPY } from "./trade-copy";

export interface MaxFill {
  letter: "A" | "B";
  quantity: bigint;
  source: Source;
}

const FILL_LINK =
  "inline-flex items-center rounded-xs type-data text-caption text-ink-2 underline decoration-line-strong underline-offset-2 focus-ring hover:text-ink disabled:cursor-not-allowed disabled:text-ink-4 disabled:no-underline pointer-coarse:min-h-10 pointer-coarse:px-2";

function FixButtons({
  issue,
  format,
  onPick,
  disabled,
}: {
  issue: OrderInputIssue | undefined;
  format: (raw: bigint) => string;
  onPick: (raw: bigint) => void;
  disabled: boolean;
}): ReactNode {
  if (issue === undefined || issue.nearestValid.length === 0) return null;
  return (
    <span className="mt-1 flex flex-wrap items-center gap-2">
      <span className="text-caption text-ink-3">Use</span>
      {issue.nearestValid.map((raw) => (
        <button key={raw.toString()} type="button" className={FILL_LINK} disabled={disabled} onClick={() => onPick(raw)}>
          {format(raw)}
        </button>
      ))}
    </span>
  );
}

function bookSource(book: BookTopReading): Source {
  return { kind: "chain", block: book.block, readAt: book.readAt, via: "getBookTopsOnchain" };
}

export function OrderTicket({
  ticket,
  markets,
  market,
  marketsReadAt,
  health,
  book,
  maxFill,
  locked,
}: {
  ticket: TradeTicket;
  markets: readonly MarketMeta[];
  market: MarketMeta;
  marketsReadAt: string | null;
  health: UseQueryResult<MarketHealth>;
  book: UseQueryResult<BookTopReading>;
  maxFill: MaxFill | null;
  locked: boolean;
}): ReactNode {
  const { draft, visibleIssues, validation } = ticket;
  const tifHelpId = useId();
  const healthData = health.data;
  const unpriceable = healthData?.status === "unpriceable";
  const bookData = book.data;

  const priceFormat = (raw: bigint): string => formatPrice(raw, market);
  const sizeFormat = (raw: bigint): string => formatQuantity(raw, market);
  const setPrice = (raw: bigint): void => ticket.setPriceText(toInputString(raw, market.quoteDecimals));
  const setSize = (raw: bigint): void => ticket.setQuantityText(toInputString(raw, market.baseDecimals));

  const touchPrice = draft.side === "long" ? (bookData?.bestAsk ?? null) : (bookData?.bestBid ?? null);
  const markReading = healthData?.snapshot;
  const mark = markReading?.ok ? markReading.value.markPrice : null;
  const maxQuantity = maxFill === null ? null : snapDownToGrid(maxFill.quantity, market.lotSize);
  const canFillMax = maxQuantity !== null && maxQuantity >= market.minQuantity && maxQuantity > 0n;

  const quoted = (text: string): ReactNode => <TokenLabel symbol={market.quoteSymbol}>{text}</TokenLabel>;

  const listingSource: Source = { kind: "indexer", readAt: marketsReadAt ?? new Date(0).toISOString(), via: "listPerpMarkets" };

  const rows: KeyValueItem[] = [
    markReading === undefined
      ? {
          id: "mark",
          label: "Mark price",
          value: health.isError ? <Unavailable variant="inline" reason={classifyError(health.error).message} /> : "Reading…",
        }
      : readingItem("mark", "Mark price", markReading, (snapshot) => quoted(formatPrice(snapshot.markPrice, market, { withSymbol: true }))),
    bookData === undefined
      ? {
          id: "book",
          label: draft.side === "long" ? "Best ask" : "Best bid",
          value: book.isError ? <Unavailable variant="inline" reason={classifyError(book.error).message} /> : "Reading…",
        }
      : touchPrice === null
        ? {
            id: "book",
            label: draft.side === "long" ? "Best ask" : "Best bid",
            value: <Unavailable variant="inline" label="Empty" reason="No resting orders on that side of the book." />,
          }
        : {
            id: "book",
            label: draft.side === "long" ? "Best ask" : "Best bid",
            value: quoted(formatPrice(touchPrice, market, { withSymbol: true })),
            source: bookSource(bookData),
          },
    validation?.ok
      ? {
          id: "notional",
          label: "Notional",
          hint: "Size times limit price",
          value: quoted(formatUsdso(validation.notional, market.quoteDecimals, { withSymbol: true, symbol: market.quoteSymbol })),
          source: { kind: "estimate", basis: "Exact arithmetic: size times limit price, from the ticket." },
        }
      : {
          id: "notional",
          label: "Notional",
          hint: "Size times limit price",
          value: <Unavailable variant="inline" label="Enter an order" reason="Enter a valid price and size first." />,
        },
    maxFill === null
      ? {
          id: "max",
          label: "Max size",
          value: <Unavailable variant="inline" label="Not quoted" reason="The protocol reports the largest order once a valid order is previewed for an account." />,
        }
      : {
          id: "max",
          label: `Max size in account ${maxFill.letter}`,
          value: <TokenLabel symbol={market.baseSymbol}>{formatQuantity(maxFill.quantity, market, { withSymbol: true })}</TokenLabel>,
          source: maxFill.source,
        },
    {
      id: "grid",
      label: "Price step · size step · minimum",
      value: `${formatPrice(market.tickSize, market)} · ${formatQuantity(market.lotSize, market)} · ${formatQuantity(market.minQuantity, market, { withSymbol: true })}`,
      source: listingSource,
    },
  ];

  return (
    <Panel
      eyebrow={<Eyebrow index={2}>New trade</Eyebrow>}
      title="Order ticket"
      titleAs="h3"
      actions={
        <TokenLabel symbol={market.baseSymbol} size={20} className="text-body font-semibold text-ink">
          {market.displaySymbol}
        </TokenLabel>
      }
      data-testid="order-ticket"
      aria-label="Order ticket"
    >
      <div className="flex flex-col gap-4">
        {unpriceable ? (
          <InlineAlert tone="warning" title="Risk preview unavailable" announce="polite">
            {UNPRICEABLE_MESSAGE} Orders stay off until the price feed recovers.
          </InlineAlert>
        ) : null}
        {locked ? (
          <InlineAlert tone="neutral" title="The ticket is locked">
            A transaction is in flight. The ticket unlocks once its outcome is known.
          </InlineAlert>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <MarketPicker markets={markets} market={market} onSelect={ticket.selectMarket} disabled={locked} />
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-caption font-medium text-ink-2" id={`${tifHelpId}-side`}>
              Side
            </span>
            <SegmentedControl
              labelledBy={`${tifHelpId}-side`}
              value={draft.side}
              onValueChange={ticket.setSide}
              disabled={locked}
              block
              options={[
                { value: "long", label: "Long", tone: "long" },
                { value: "short", label: "Short", tone: "short" },
              ]}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-caption font-medium text-ink-2" id={`${tifHelpId}-tif`}>
            Order type
          </span>
          <SegmentedControl<TimeInForce>
            labelledBy={`${tifHelpId}-tif`}
            value={draft.timeInForce}
            onValueChange={ticket.setTimeInForce}
            disabled={locked}
            size="sm"
            block
            className="max-sm:grid-flow-row max-sm:grid-cols-2"
            options={TIMES_IN_FORCE.map((value) => ({ value, label: TIME_IN_FORCE_COPY[value].label }))}
          />
          <p className="text-caption text-ink-3">{TIME_IN_FORCE_COPY[draft.timeInForce].explanation}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col">
            <NumberField
              label="Limit price"
              value={draft.priceText}
              onValueChange={ticket.setPriceText}
              disabled={locked}
              suffix={<TokenLabel symbol={market.quoteSymbol} />}
              hint={`Steps of ${formatPrice(market.tickSize, market)} ${market.quoteSymbol}`}
              error={visibleIssues.price?.message}
              labelAction={
                touchPrice !== null ? (
                  <button type="button" className={FILL_LINK} disabled={locked} onClick={() => setPrice(touchPrice)}>
                    Use {draft.side === "long" ? "best ask" : "best bid"}
                  </button>
                ) : mark !== null ? (
                  <button type="button" className={FILL_LINK} disabled={locked} onClick={() => setPrice(snapDownToGrid(mark, market.tickSize))}>
                    Use mark
                  </button>
                ) : undefined
              }
            />
            <FixButtons issue={visibleIssues.price} format={priceFormat} onPick={setPrice} disabled={locked} />
          </div>
          <div className="flex min-w-0 flex-col">
            <NumberField
              label="Size"
              value={draft.quantityText}
              onValueChange={ticket.setQuantityText}
              disabled={locked}
              suffix={<TokenLabel symbol={market.baseSymbol} />}
              placeholder={formatQuantity(market.minQuantity, market, { grouping: false })}
              hint={`Min ${formatQuantity(market.minQuantity, market)}, steps of ${formatQuantity(market.lotSize, market)}`}
              error={visibleIssues.quantity?.message}
              labelAction={
                canFillMax && maxFill !== null ? (
                  <button type="button" className={FILL_LINK} disabled={locked} onClick={() => setSize(maxQuantity)}>
                    Max {formatQuantity(maxQuantity, market)} in {maxFill.letter}
                  </button>
                ) : undefined
              }
            />
            <FixButtons issue={visibleIssues.quantity} format={sizeFormat} onPick={setSize} disabled={locked} />
          </div>
        </div>
        {visibleIssues.market !== undefined ? (
          <InlineAlert tone="danger" title="This market cannot take orders">
            {visibleIssues.market.message}
          </InlineAlert>
        ) : null}
        <div className="flex flex-col gap-1 border-t border-dashed border-line-strong pt-4">
          <h4 className="type-eyebrow text-ink-3">Book and limits</h4>
          {/* The limits row (always last) has a long label and a long value; on phones it stacks instead of squeezing the label into a column. */}
          <KeyValueList
            density="compact"
            leaders
            items={rows}
            className="max-sm:[&>div:last-child]:flex-wrap max-sm:[&>div:last-child]:gap-y-0.5 max-sm:[&>div:last-child>dt]:basis-full max-sm:[&>div:last-child>dt>span:last-child]:hidden max-sm:[&>div:last-child>dd]:ml-auto"
          />
        </div>
        <p className="text-caption text-ink-3">Nothing is sent while you edit. The order is signed only in step 04.</p>
      </div>
    </Panel>
  );
}
