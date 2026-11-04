"use client";

import type { ReactNode } from "react";

import { AccountBadge } from "@/components/ui/account-badge";
import { Eyebrow } from "@/components/ui/eyebrow";
import { InlineAlert } from "@/components/ui/inline-alert";
import { SheetContent } from "@/components/ui/sheet";
import { Unavailable } from "@/components/ui/unavailable";
import { formatBlockNumber, formatPrice, formatQuantity, shortAddress } from "@/lib/format/units";
import { ROUTE_TITLES, whyTheseNumbers } from "@/lib/risk/explanations";
import type { Comparison, RouteKind } from "@/lib/risk/types";

import { CALCULATION_LABELS, ROUTE_LETTER } from "./trade-copy";

function RouteTable({ comparison, kind }: { comparison: Comparison; kind: RouteKind }): ReactNode {
  const route = comparison.routes[kind];
  const rows = whyTheseNumbers(comparison, kind);
  const captionId = `calc-${kind}`;
  return (
    <section aria-labelledby={captionId} className="flex flex-col gap-2">
      <h3 id={captionId} className="text-body font-semibold text-ink">
        {ROUTE_TITLES[kind]}
      </h3>
      {route.identity === null ? (
        <Unavailable reason="No second wallet added yet." />
      ) : (
        <>
          <AccountBadge
            account={ROUTE_LETTER[kind]}
            label={route.identity.label}
            address={route.identity.address}
            shortAddress={shortAddress(route.identity.address)}
            size="sm"
          />
          <table className="w-full border-collapse text-small">
            <caption className="sr-only">Figures and sources for {ROUTE_TITLES[kind]}</caption>
            <thead>
              <tr className="border-b border-line text-left text-caption text-ink-3">
                <th scope="col" className="w-[38%] py-1.5 pr-2 font-medium">Figure</th>
                <th scope="col" className="px-2 py-1.5 text-right font-medium">Value</th>
                <th scope="col" className="py-1.5 pl-2 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.field} className="border-b border-line align-top">
                  <th scope="row" className="py-2 pr-2 text-left font-normal text-ink-2">{CALCULATION_LABELS[row.field] ?? row.field}</th>
                  <td className="px-2 py-2 text-right font-medium whitespace-nowrap text-ink tabular">
                    {row.available ? row.value : <Unavailable variant="inline" reason={row.detail} />}
                  </td>
                  <td className="py-2 pl-2 text-caption text-ink-3">
                    <span className="block text-ink-2">{row.sourceLabel}</span>
                    <span className="block break-words">{row.detail}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

export function CalculationsSheet({ comparison }: { comparison: Comparison | null }): ReactNode {
  return (
    <SheetContent
      eyebrow={<Eyebrow>Exact calculations</Eyebrow>}
      title="How the comparison was built"
      description="Every figure behind both cards, with the read or calculation it came from and the block."
    >
      {comparison === null ? (
        <InlineAlert title="Nothing to explain yet">Add your primary account and enter a valid order to see the figures.</InlineAlert>
      ) : (
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-1 text-small text-ink-2" aria-label="Order inputs">
            <p>
              Order: {comparison.intent.side === "long" ? "Long" : "Short"}{" "}
              {formatQuantity(comparison.intent.quantity, comparison.market, { withSymbol: true })} at{" "}
              {formatPrice(comparison.intent.price, comparison.market, { withSymbol: true })}, {comparison.intent.timeInForce}.
            </p>
            <p>
              Market {comparison.market.displaySymbol}, pool <span className="type-data">{shortAddress(comparison.market.pool)}</span>, margin bank{" "}
              <span className="type-data">{shortAddress(comparison.market.marginBank)}</span>. Price and size grid from the indexed market list;
              the pool&apos;s own lot and minimum from the size preview win where they differ.
            </p>
            <p>
              Previews are taken with the pool topping margin up from the sender&apos;s own wallet, the way the order will be sent. They assume the
              whole order fills at its limit price.
            </p>
          </section>
          {(["shared", "separate"] as const).map((kind) => (
            <div key={kind} className="flex flex-col gap-1">
              <RouteTable comparison={comparison} kind={kind} />
              {comparison.routes[kind].quote !== null ? (
                <p className="text-caption text-ink-3">
                  Preview read at block {formatBlockNumber(comparison.routes[kind].quote?.block ?? null)}.
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </SheetContent>
  );
}
