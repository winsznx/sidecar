import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LiveMarketList } from "@/components/landing/live-market-list";
import type { MarketListing } from "@/lib/dreamdex/types";

import { ETH_POOL, marketFixture } from "../fixtures/markets.fixture";

const listing = vi.hoisted(() => ({ read: (): Promise<MarketListing> => new Promise(() => undefined) }));

vi.mock("@/hooks/use-perps-adapter", () => ({
  getBrowserAdapter: () => ({ getMarketListing: () => listing.read() }),
}));

const READ_AT = "2026-11-03T12:00:00.000Z";
const BTC = marketFixture();
const ETH = marketFixture({
  pool: ETH_POOL,
  baseSymbol: "ETH",
  displaySymbol: "ETH-PERP",
  baseDecimals: 18,
  lotSize: 10n ** 14n,
  minQuantity: 4n * 10n ** 15n,
  tickSize: 10n ** 16n,
  indexedMarkPrice: null,
  restricted: true,
});

function renderList(): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }): ReactNode => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return render(<LiveMarketList />, { wrapper });
}

afterEach(() => {
  cleanup();
  listing.read = () => new Promise(() => undefined);
});

describe("LiveMarketList", () => {
  it("is busy with placeholders and no count while the first read is in flight", () => {
    // #given a read that has not answered
    // #when
    renderList();

    // #then
    const group = screen.getByRole("group", { name: "Listed markets" });
    expect(group).toHaveAttribute("aria-busy", "true");
    expect(group).not.toHaveTextContent(/\d+ open for trading/);
  });

  it("counts and lists every market from the read, with the indexed mark under an INDEXED badge", async () => {
    // #given
    listing.read = async () => ({ markets: [BTC, ETH], source: { kind: "indexer", readAt: READ_AT, via: "listPerpMarkets" }, gates: { status: "ok", readAt: READ_AT, via: "listPerpPoolStatuses" } });

    // #when
    renderList();

    // #then
    const group = screen.getByRole("group", { name: "Listed markets" });
    expect(await within(group).findByText("open for trading", { exact: false })).toHaveTextContent("2 open for trading");
    expect(group.querySelector("[data-provenance]")).toHaveAttribute("data-provenance", "indexer");
    const btc = within(group).getByText("BTC-PERP").closest("li");
    if (!(btc instanceof HTMLElement)) throw new Error("No BTC tile.");
    expect(btc).toHaveTextContent("Mark77,412.3");
    expect(btc).toHaveTextContent("Min size0.00013");
    expect(btc).toHaveTextContent("Tick0.1");
    const eth = within(group).getByText("ETH-PERP").closest("li");
    if (!(eth instanceof HTMLElement)) throw new Error("No ETH tile.");
    expect(eth).toHaveTextContent("Unavailable");
    expect(eth).toHaveTextContent("Close only");
  });

  it("leaves the mark out when the list came from the chain fallback", async () => {
    listing.read = async () => ({ markets: [BTC], source: { kind: "chain", block: 41_000_000n, readAt: READ_AT, via: "listPerpPoolStatuses", pinned: false }, gates: { status: "ok", readAt: READ_AT, via: "listPerpPoolStatuses" } });
    renderList();
    const group = screen.getByRole("group", { name: "Listed markets" });
    expect(await within(group).findByText("open for trading", { exact: false })).toHaveTextContent("1 open for trading");
    expect(group).not.toHaveTextContent("Mark");
    expect(group.querySelector("[data-provenance]")).toHaveAttribute("data-provenance", "chain");
  });

  it("shows Unavailable with the cause, and never a zero count, when the read fails", async () => {
    // #given
    listing.read = () => Promise.reject(new Error("fetch failed"));

    // #when
    renderList();

    // #then
    const group = screen.getByRole("group", { name: "Listed markets" });
    expect(await within(group).findByText("Markets unavailable")).toBeInTheDocument();
    expect(group).toHaveTextContent(/The market list could not be read\./);
    expect(group).not.toHaveTextContent(/\b0 open for trading/);
  });

  it("folds markets that are listed but not open for trading under the tiles, and counts both", async () => {
    // #given one open market and one the gates mark as not tradeable
    const paused = marketFixture({ pool: "0x00000000000000000000000000000000000000aa", displaySymbol: "TEST-PERP", baseSymbol: "TEST", tradeable: false });
    listing.read = async () => ({ markets: [BTC, paused], source: { kind: "indexer", readAt: READ_AT, via: "listPerpMarkets" }, gates: { status: "ok", readAt: READ_AT, via: "listPerpPoolStatuses" } });

    // #when
    renderList();

    // #then the count names both, only the open market gets a tile, and the other stays readable
    const group = screen.getByRole("group", { name: "Listed markets" });
    expect(await within(group).findByText("1 more listed but not open for trading")).toBeInTheDocument();
    expect(group).toHaveTextContent("1 open for trading of 2 listed");
    expect(within(group).getAllByRole("listitem")).toHaveLength(1);
    expect(group).toHaveTextContent("TEST-PERP");
  });
});
