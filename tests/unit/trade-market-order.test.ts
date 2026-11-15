import { describe, expect, it } from "vitest";

import { openMarketsFirst } from "@/components/trade/order-ticket";

import { marketFixture } from "../fixtures/markets.fixture";

describe("openMarketsFirst", () => {
  it("puts tradeable markets ahead of paused ones and keeps the listing order within each group", () => {
    // #given a newest-first listing where a paused test pool comes first
    const paused = marketFixture({ pool: "0x00000000000000000000000000000000000000aa", displaySymbol: "TEST-PERP", tradeable: false });
    const eth = marketFixture({ pool: "0x00000000000000000000000000000000000000bb", displaySymbol: "ETH-PERP" });
    const btc = marketFixture({ pool: "0x00000000000000000000000000000000000000cc", displaySymbol: "BTC-PERP" });

    // #when
    const ordered = openMarketsFirst([paused, eth, btc]);

    // #then
    expect(ordered.map((market) => market.displaySymbol)).toEqual(["ETH-PERP", "BTC-PERP", "TEST-PERP"]);
  });
});
