import type { Address } from "viem";
import { describe, expect, it } from "vitest";

import type { AccountSnapshot, Reading, RouteQuote } from "@/lib/dreamdex/types";
import { MIN_GAS_BALANCE_FOR_ORDER_WEI } from "@/lib/dreamdex/config";
import { buildComparison, DEFAULT_MIN_GAS_WEI } from "@/lib/risk/preview";
import { NO_MAINTENANCE_REASON } from "@/lib/risk/snapshot";
import type { Comparison, ComparisonInput, EligibilityCode, RouteProjection } from "@/lib/risk/types";
import {
  EMPTY_SEPARATE_SNAPSHOT,
  ETH_LONG,
  marginFixture,
  NOW_MS,
  OTHER_ADDRESS,
  PRIMARY_ADDRESS,
  PRIMARY_IDENTITY,
  PRIMARY_MARGIN,
  PRIMARY_SNAPSHOT,
  SEPARATE_ADDRESS,
  SEPARATE_IDENTITY,
  SEPARATE_SNAPSHOT,
  snapshotFixture,
} from "@/tests/fixtures/accounts.fixture";
import { BTC_PERP, marketFixture, usdso } from "@/tests/fixtures/markets.fixture";
import {
  BTC_LOCK,
  BTC_MARK,
  BTC_ORDER,
  patchQuote,
  PRIMARY_QUOTE,
  QUOTE_BLOCK,
  SEPARATE_QUOTE,
} from "@/tests/fixtures/quotes.fixture";

const LOWERCASE_PRIMARY: Address = "0xf07510313917852bc9d6ddaa811a158d7242dcd0";

function compare(overrides: Partial<ComparisonInput> = {}): Comparison {
  return buildComparison({
    market: BTC_PERP,
    intent: BTC_ORDER,
    primary: { identity: PRIMARY_IDENTITY, snapshot: PRIMARY_SNAPSHOT, quote: PRIMARY_QUOTE },
    separate: { identity: SEPARATE_IDENTITY, snapshot: SEPARATE_SNAPSHOT, quote: SEPARATE_QUOTE },
    wallet: { address: SEPARATE_ADDRESS, chainId: 50383 },
    nowMs: NOW_MS,
    ...overrides,
  });
}

function withSeparate(snapshot: AccountSnapshot | null, quote: RouteQuote | null): Partial<ComparisonInput> {
  return { separate: { identity: SEPARATE_IDENTITY, snapshot, quote } };
}

function figureReadings(route: RouteProjection): Reading<unknown>[] {
  const figures = route.figures;
  return [
    figures.equity.before,
    figures.equity.after,
    figures.maintenance.before,
    figures.maintenance.after,
    figures.buffer.before,
    figures.buffer.after,
    figures.freeCollateral.before,
    figures.freeCollateral.after,
    figures.orderMargin,
    figures.orderMarginBreakdown,
    figures.initialMarginRateBps,
    figures.liquidationPrice.before,
    figures.liquidationPrice.after,
  ];
}

function codes(route: RouteProjection): EligibilityCode[] {
  return route.issues.map((issue) => issue.code);
}

function issue(route: RouteProjection, code: EligibilityCode): RouteProjection["issues"][number] | undefined {
  return route.issues.find((candidate) => candidate.code === code);
}

function keysDeep(value: unknown, seen = new Set<unknown>()): string[] {
  if (typeof value !== "object" || value === null || seen.has(value)) return [];
  seen.add(value);
  return Object.entries(value).flatMap(([key, child]) => [key, ...keysDeep(child, seen)]);
}

describe("shared versus separate", () => {
  it("says the shared route shares collateral with the existing ETH position", () => {
    // #given account A holding an ETH long
    // #when the BTC order is compared
    const { shared } = compare().routes;
    // #then the shared route names ETH as sharing its collateral
    expect([shared.sharesCollateralWithExisting, shared.sharedPositions?.map((position) => position.symbol)]).toEqual([
      true,
      ["ETH"],
    ]);
  });

  it("says the separate route shares nothing with the primary's positions", () => {
    // #given a flat, separately funded second wallet
    // #when the BTC order is compared
    const { separate } = compare().routes;
    // #then nothing in that account shares collateral with the order
    expect([separate.sharesCollateralWithExisting, separate.sharedPositions]).toEqual([false, []]);
  });

  it("keeps the primary's figures exactly as read on the separate route", () => {
    // #given account A as read from the chain
    // #when the separate route is projected
    const untouched = compare().routes.separate.untouched;
    // #then A's figures are unchanged chain reads and its ETH carries the no-shared-margin note
    expect({
      account: untouched?.identity.address,
      equity: untouched?.equity,
      maintenance: untouched?.maintenance,
      freeCollateral: untouched?.freeCollateral,
      notes: untouched?.positions?.map((position) => position.note),
    }).toEqual({
      account: PRIMARY_ADDRESS,
      equity: { ok: true, value: PRIMARY_MARGIN.equity, source: expect.objectContaining({ kind: "chain" }) },
      maintenance: { ok: true, value: PRIMARY_MARGIN.mmReq, source: expect.objectContaining({ kind: "chain" }) },
      freeCollateral: {
        ok: true,
        value: PRIMARY_MARGIN.unlockedCollateral,
        source: expect.objectContaining({ kind: "chain" }),
      },
      notes: ["No shared margin with BTC account"],
    });
  });

  it("never recommends or picks a route", () => {
    // #given a full comparison
    // #when every key in it is listed
    const keys = keysDeep(compare());
    // #then none of them ranks or recommends a route
    expect(keys.filter((key) => /recommend|preferred|best|default/i.test(key))).toEqual([]);
  });

  it("lets the connected second wallet place and asks the primary route to switch wallet", () => {
    // #given the second wallet connected on Hideki
    // #when both routes are evaluated
    const { shared, separate } = compare().routes;
    // #then only the separate route can sign now; the shared one is eligible but needs a wallet switch
    expect({
      separate: [separate.eligible, separate.canPlace, codes(separate)],
      shared: [shared.eligible, shared.canPlace, codes(shared)],
    }).toEqual({
      separate: [true, true, []],
      shared: [true, false, ["WALLET_MISMATCH"]],
    });
  });

  it("shows the capital trade-off as data", () => {
    // #given A has free collateral that could fund the order
    // #when the trade-off is read
    const { tradeoff } = compare();
    // #then it shows A's unused collateral beside the margin B must post itself
    expect({
      primaryCouldFundOrder: tradeoff.primaryCouldFundOrder,
      primaryFree: tradeoff.primaryFreeCollateral.ok ? tradeoff.primaryFreeCollateral.value : null,
      separateMustPost: tradeoff.separateOrderMargin.ok ? tradeoff.separateOrderMargin.value : null,
    }).toEqual({ primaryCouldFundOrder: true, primaryFree: PRIMARY_MARGIN.unlockedCollateral, separateMustPost: BTC_LOCK });
  });

  it("projects the separate account's own figures from its SDK projection", () => {
    // #given B's preview
    // #when the separate route is projected
    const figures = compare().routes.separate.figures;
    // #then the after-figures are the projection's, labelled with the preview's block
    expect([figures.equity.after, figures.maintenance.after]).toEqual([
      {
        ok: true,
        value: SEPARATE_QUOTE.projection?.projectedEquity,
        source: expect.objectContaining({ kind: "sdk", via: "previewPerpLiquidationPrice", block: QUOTE_BLOCK }),
      },
      {
        ok: true,
        value: SEPARATE_QUOTE.projection?.projectedMmReq,
        source: expect.objectContaining({ kind: "sdk", via: "previewPerpLiquidationPrice", block: QUOTE_BLOCK }),
      },
    ]);
  });
});

describe("T05 requirements from the live quote", () => {
  it("uses the quote's effective initial margin rate and lock, never the indexed floor", () => {
    // #given an indexed floor of 1% and a live OI-scaled rate of 7.5%
    const market = marketFixture({ initialMarginBps: 100 });
    const liveLock = (BTC_ORDER.quantity * BTC_ORDER.price * 750n + 10n ** 8n * 10_000n - 1n) / (10n ** 8n * 10_000n);
    const quote = patchQuote(SEPARATE_QUOTE, {
      effectiveImfBps: 750n,
      margin: { lockAmount: liveLock, initialMarginPortion: liveLock },
    });
    // #when the separate route is projected
    const { figures } = compare({ market, ...withSeparate(SEPARATE_SNAPSHOT, quote) }).routes.separate;
    // #then the requirement is the quote's, at 7.5%
    expect([
      figures.initialMarginRateBps.ok ? figures.initialMarginRateBps.value : null,
      figures.orderMargin.ok ? figures.orderMargin.value : null,
    ]).toEqual([750n, liveLock]);
  });

  it("derives no figure from the market's static initial margin rate", () => {
    // #given an indexed floor of 1% and a live OI-scaled rate of 7.5%
    const market = marketFixture({ initialMarginBps: 100 });
    const oneBaseTimesBps = 10n ** 8n * 10_000n;
    const staticLock = (BTC_ORDER.quantity * BTC_ORDER.price * 100n + oneBaseTimesBps - 1n) / oneBaseTimesBps;
    const staticLockFloor = (BTC_ORDER.quantity * BTC_ORDER.price * 100n) / oneBaseTimesBps;
    const quote = patchQuote(SEPARATE_QUOTE, { effectiveImfBps: 750n });
    // #when both routes are projected
    const { routes } = compare({ market, ...withSeparate(SEPARATE_SNAPSHOT, quote) });
    // #then no projected figure equals the static rate or a lock computed from it
    const figures = [...bigintsIn(routes.shared.figures), ...bigintsIn(routes.separate.figures)];
    expect(figures.filter((value) => value === 100n || value === staticLock || value === staticLockFloor)).toEqual([]);
  });

  it("labels the order's margin as an SDK calculation at the margin preview's block", () => {
    // #given a quote whose margin preview was pinned to its own block
    const quote = patchQuote(SEPARATE_QUOTE, { blocks: { maxSize: QUOTE_BLOCK, margin: QUOTE_BLOCK + 2n, projection: QUOTE_BLOCK } });
    // #when the separate route is projected
    const { orderMargin } = compare(withSeparate(SEPARATE_SNAPSHOT, quote)).routes.separate.figures;
    // #then the source names the read and its block
    expect(orderMargin).toEqual({
      ok: true,
      value: BTC_LOCK,
      source: expect.objectContaining({ kind: "sdk", via: "previewPerpOrderMargin", block: QUOTE_BLOCK + 2n }),
    });
  });
});

describe("T04 unknown or stale prices", () => {
  const unpriceableQuote = patchQuote(SEPARATE_QUOTE, {
    priceable: false,
    markPrice: null,
    effectiveImfBps: null,
    margin: null,
    maxSize: null,
    projection: null,
    errors: ["Preview unavailable: the protocol cannot currently price this market."],
  });

  it("suppresses every figure when the order's market cannot be priced", () => {
    // #given a preview reporting the market unpriceable
    // #when the separate route is projected
    const route = compare(withSeparate(SEPARATE_SNAPSHOT, unpriceableQuote)).routes.separate;
    // #then no figure is shown, none as zero
    expect(figureReadings(route).filter((reading) => reading.ok)).toEqual([]);
  });

  it("names the price feed as the reason and disables the route", () => {
    // #given a preview reporting the market unpriceable
    // #when the separate route is projected
    const route = compare(withSeparate(SEPARATE_SNAPSHOT, unpriceableQuote)).routes.separate;
    // #then the one data issue is the price feed, and the route cannot place
    expect({
      dataIssues: route.issues.filter((candidate) => candidate.category === "data").map((candidate) => candidate.message),
      canPlace: route.canPlace,
    }).toEqual({
      dataIssues: ["Preview unavailable: the protocol cannot currently price this market."],
      canPlace: false,
    });
  });

  it("suppresses figures for an account holding a position nobody can price", () => {
    // #given A's ETH position on a dead feed
    const snapshot = snapshotFixture({
      account: PRIMARY_ADDRESS,
      margin: null,
      readStatus: "unpriceable",
      positions: [{ ...ETH_LONG, priceable: false, markPrice: null, notional: null, unrealizedPnl: null }],
    });
    // #when the shared route is projected
    const route = compare({ primary: { identity: PRIMARY_IDENTITY, snapshot, quote: PRIMARY_QUOTE } }).routes.shared;
    // #then it is unpriceable, shows nothing, and cannot place
    expect([
      codes(route).includes("UNPRICEABLE"),
      figureReadings(route).some((reading) => reading.ok),
      route.canPlace,
    ]).toEqual([true, false, false]);
  });

  it("drops a stale preview's figures instead of showing them as current", () => {
    // #given previews read 21 seconds ago against a 15 second limit
    // #when the comparison is built
    const route = compare({ nowMs: NOW_MS + 20_000 }).routes.separate;
    // #then the preview is stale, its figures are withheld, and the account as read still shows
    expect({
      stale: codes(route).includes("STALE_QUOTE"),
      lockShown: route.figures.orderMargin.ok,
      equityBeforeShown: route.figures.equity.before.ok,
      canPlace: route.canPlace,
    }).toEqual({ stale: true, lockShown: false, equityBeforeShown: true, canPlace: false });
  });

  it("reads a floored zero liquidation solve as unreachable, never as a price of zero", () => {
    // #given A's projection, where BTC alone cannot reach maintenance at any positive price
    // #when the shared route's liquidation estimate is read
    const after = compare().routes.shared.figures.liquidationPrice.after;
    // #then it is unreachable, not zero
    expect(after.ok ? after.value.estimate : null).toEqual({ kind: "unreachable" });
  });

  it("reports a reachable liquidation estimate below the mark for a thinly funded long", () => {
    // #given B's projection on 5 USDso
    // #when the separate route's liquidation estimate is read
    const after = compare().routes.separate.figures.liquidationPrice.after;
    // #then it is a price below the mark that has not been passed yet
    expect(
      after.ok && after.value.estimate.kind === "price"
        ? [after.value.estimate.price < BTC_MARK, after.value.atOrPastMark]
        : null,
    ).toEqual([true, false]);
  });

  it("prefers the adapter's own interpretation of the solve", () => {
    // #given a quote whose projection is already interpreted as breached
    const quote = patchQuote(SEPARATE_QUOTE, { projection: { projectedLiquidation: { kind: "breached" } } });
    // #when the separate route's liquidation estimate is read
    const after = compare(withSeparate(SEPARATE_SNAPSHOT, quote)).routes.separate.figures.liquidationPrice.after;
    // #then the interpretation is used and flagged as at or below maintenance
    expect(after.ok ? [after.value.estimate.kind, after.value.atOrPastMark] : null).toEqual(["breached", true]);
  });
});

describe("T06 ineligible routes", () => {
  it("blocks an underfunded second wallet with the exact shortfall", () => {
    // #given B holding 0.10 USDso against a 0.50317995 USDso lock
    const available = usdso(0n, 10n);
    const snapshot = snapshotFixture({
      account: SEPARATE_ADDRESS,
      margin: marginFixture({ unlockedCollateral: available, equity: available }),
    });
    const quote = patchQuote(SEPARATE_QUOTE, {
      margin: { unlockedCollateral: available, equity: available, hasCollateralForLock: false, sufficient: false },
      maxSize: { maxQuantity: 0n, placeable: false, limitedBy: "collateral" },
    });
    // #when the separate route is projected
    const route = compare(withSeparate(snapshot, quote)).routes.separate;
    const collateral = issue(route, "INSUFFICIENT_COLLATERAL");
    // #then it is disabled with the shortfall to the wei and in words
    expect({
      eligible: route.eligible,
      shortfall: collateral?.shortfall,
      message: collateral?.message,
    }).toEqual({
      eligible: false,
      shortfall: { asset: "collateral", amount: BTC_LOCK - available, decimals: 18, symbol: "USDso" },
      message:
        "Not enough USDso in this account: the order locks 0.51 USDso and 0.10 USDso is available. Short by 0.41 USDso.",
    });
  });

  it("defaults the gas floor to the balance the node requires before admitting a perp order", () => {
    // #given the default comparison policy
    // #when its gas floor is read
    const floor = compare().policy.minGasWei;
    // #then it is the SDK gas limit times maxFeePerGas, not the far smaller amount an order spends
    expect([floor, DEFAULT_MIN_GAS_WEI]).toEqual([MIN_GAS_BALANCE_FOR_ORDER_WEI, MIN_GAS_BALANCE_FOR_ORDER_WEI]);
  });

  it("names the exact STT deficit against the node's up-front gas requirement", () => {
    // #given B with 0.01 STT: enough for the gas an order spends, short of the 0.6 STT the node requires up front
    const snapshot = { ...SEPARATE_SNAPSHOT, gasBalance: 10_000_000_000_000_000n };
    // #when the separate route is projected
    const route = compare(withSeparate(snapshot, SEPARATE_QUOTE)).routes.separate;
    const gas = issue(route, "NO_GAS");
    // #then the deficit is exact, the route is disabled and the copy names the admission amount
    expect({
      eligible: route.eligible,
      canPlace: route.canPlace,
      shortfall: gas?.shortfall?.amount,
      shortBy: gas?.message.includes("Short by 0.59 STT"),
      requires: gas?.message.includes("requires 0.6 STT up front"),
    }).toEqual({
      eligible: false,
      canPlace: false,
      shortfall: 590_000_000_000_000_000n,
      shortBy: true,
      requires: true,
    });
  });

  it("blocks voucher credit from opening a market outside its allowlist", () => {
    // #given a voucher account the margin bank will not let open BTC
    const quote = patchQuote(SEPARATE_QUOTE, {
      margin: { voucherBlocked: true, sufficient: false },
      maxSize: { maxQuantity: 0n, placeable: false, limitedBy: "voucherBlocked" },
    });
    // #when the separate route is projected
    const route = compare(withSeparate(SEPARATE_SNAPSHOT, quote)).routes.separate;
    // #then exactly one voucher reason is shown and the route is disabled
    expect({
      eligible: route.eligible,
      voucherMessages: route.issues.filter((candidate) => candidate.code === "VOUCHER_BLOCKED").map((candidate) => candidate.message),
    }).toEqual({
      eligible: false,
      voucherMessages: [
        "Paper USDso can't open BTC-PERP. This wallet trades on voucher credit, which only opens allowlisted markets.",
      ],
    });
  });

  it("gives each remaining protocol gate its own reason", () => {
    // #given one blocked preview per gate
    const cases: Array<[EligibilityCode, RouteQuote]> = [
      ["RESTRICTED", patchQuote(SEPARATE_QUOTE, { margin: { restrictedBlocked: true, sufficient: false } })],
      ["ISOLATED", patchQuote(SEPARATE_QUOTE, { margin: { isolationBlocked: true, sufficient: false } })],
      ["INITIAL_MARGIN", patchQuote(SEPARATE_QUOTE, { margin: { meetsInitialMargin: false, sufficient: false } })],
      [
        "MAX_POSITION",
        patchQuote(SEPARATE_QUOTE, { maxSize: { maxQuantity: 10_000n, limitedBy: "maxPositionSize", placeable: false } }),
      ],
      ["MAIN_FUNDING_BLOCKED", patchQuote(SEPARATE_QUOTE, { margin: { mainFundingBlocked: true, sufficient: false } })],
      ["SIZE_LIMIT", patchQuote(SEPARATE_QUOTE, { maxSize: { maxQuantity: 10_000n, limitedBy: null } })],
    ];
    // #when each is projected
    const results = cases.map(([, quote]) => {
      const route = compare(withSeparate(SEPARATE_SNAPSHOT, quote)).routes.separate;
      return [route.eligible, route.issues.filter((candidate) => candidate.blocking).map((candidate) => candidate.code)];
    });
    // #then each is disabled for its own reason
    expect(results).toEqual(cases.map(([code]) => [false, [code]]));
  });

  it("does not block on an earlier funding claim when this wallet funds the order alone", () => {
    // #given a main-funding block that the preview says does not stop this order
    const quote = patchQuote(SEPARATE_QUOTE, { margin: { mainFundingBlocked: true, sufficient: true } });
    // #when the separate route is projected
    const route = compare(withSeparate(SEPARATE_SNAPSHOT, quote)).routes.separate;
    // #then it is a note, not a blocker
    expect([route.canPlace, issue(route, "MAIN_FUNDING_BLOCKED")?.blocking]).toEqual([true, false]);
  });

  it("keeps a blocking report when the same cause was first reported as a note", () => {
    // #given a funding claim noted as harmless, but a size cap caused by that same claim
    const quote = patchQuote(SEPARATE_QUOTE, {
      margin: { mainFundingBlocked: true, sufficient: true },
      maxSize: { maxQuantity: 10_000n, placeable: true, limitedBy: "mainFundingBlocked" },
    });
    // #when the separate route is projected
    const route = compare(withSeparate(SEPARATE_SNAPSHOT, quote)).routes.separate;
    // #then the blocker survives de-duplication and the oversized order is refused
    expect([route.eligible, issue(route, "MAIN_FUNDING_BLOCKED")?.blocking]).toEqual([false, true]);
  });

  it("trusts the pool's own minimum over the indexed market row", () => {
    // #given a pool that now requires 0.00014 BTC
    const quote = patchQuote(SEPARATE_QUOTE, { maxSize: { minQuantity: 14_000n } });
    // #when the minimum-size order is projected
    const route = compare(withSeparate(SEPARATE_SNAPSHOT, quote)).routes.separate;
    // #then the order is refused for the pool's minimum
    expect(issue(route, "BELOW_MIN")?.message).toBe("Minimum size on the pool is 0.00014 BTC.");
  });
});

describe("T07 empty accounts", () => {
  it("shows no positions and no synthetic exposure for an empty second wallet", () => {
    // #given a second wallet with nothing in it
    const route = compare(withSeparate(EMPTY_SEPARATE_SNAPSHOT, SEPARATE_QUOTE)).routes.separate;
    // #when its account-as-read figures are inspected
    const { maintenance, buffer } = route.figures;
    // #then it has no positions, a real zero requirement, and no buffer to speak of
    expect({
      positions: route.sharedPositions,
      maintenanceBefore: maintenance.before.ok ? maintenance.before.value : "unavailable",
      bufferBefore: buffer.before.ok ? buffer.before.value : buffer.before.reason,
    }).toEqual({ positions: [], maintenanceBefore: 0n, bufferBefore: NO_MAINTENANCE_REASON });
  });

  it("does not invent shared exposure for a primary account with no positions", () => {
    // #given a primary account with collateral and no positions
    const snapshot = snapshotFixture({
      account: PRIMARY_ADDRESS,
      margin: marginFixture({ unlockedCollateral: usdso(100n), equity: usdso(100n) }),
    });
    // #when the shared route is projected
    const route = compare({ primary: { identity: PRIMARY_IDENTITY, snapshot, quote: PRIMARY_QUOTE } }).routes.shared;
    // #then there is nothing to share collateral with
    expect([route.sharesCollateralWithExisting, route.sharedPositions]).toEqual([false, []]);
  });
});

describe("T10 route switch invalidation", () => {
  it("invalidates both previews when the size changes", () => {
    // #given previews for 0.00013 BTC
    // #when the ticket now asks for 0.00014 BTC
    const { shared, separate } = compare({ intent: { ...BTC_ORDER, quantity: 14_000n } }).routes;
    // #then both previews are stale and their figures are withheld
    expect([shared, separate].map((route) => [codes(route).includes("STALE_QUOTE"), route.figures.orderMargin.ok])).toEqual([
      [true, false],
      [true, false],
    ]);
  });

  it("refuses a preview computed for the other account", () => {
    // #given the primary's preview handed to the second wallet
    // #when the separate route is projected
    const route = compare(withSeparate(SEPARATE_SNAPSHOT, PRIMARY_QUOTE)).routes.separate;
    // #then it is treated as stale for this account
    expect(issue(route, "STALE_QUOTE")?.message).toBe("The preview was for a different account. Refresh it.");
  });
});

describe("T11 degraded reads", () => {
  it("disables trading when the margin read failed", () => {
    // #given a failed margin read
    const snapshot = snapshotFixture({ account: SEPARATE_ADDRESS, margin: null, readStatus: "error", issues: ["Margin account unavailable: timeout"] });
    // #when the separate route is projected
    const route = compare(withSeparate(snapshot, SEPARATE_QUOTE)).routes.separate;
    // #then it cannot place and says why
    expect([route.canPlace, issue(route, "READ_FAILED")?.blocking]).toEqual([false, true]);
  });

  it("disables trading when one of the previews failed", () => {
    // #given a quote with a failed read on a priceable market
    const quote = patchQuote(SEPARATE_QUOTE, { errors: ["Max order size unavailable: timeout"] });
    // #when the separate route is projected
    const route = compare(withSeparate(SEPARATE_SNAPSHOT, quote)).routes.separate;
    // #then it cannot place
    expect([route.canPlace, issue(route, "READ_FAILED")?.message]).toEqual([
      false,
      "Part of the order preview could not be read. Max order size unavailable: timeout",
    ]);
  });

  it("disables trading while no preview exists", () => {
    // #given no preview yet
    // #when the separate route is projected
    const route = compare(withSeparate(SEPARATE_SNAPSHOT, null)).routes.separate;
    // #then it waits for one
    expect([route.canPlace, issue(route, "READ_FAILED")?.message]).toEqual([
      false,
      "The order preview for this account is not available yet.",
    ]);
  });

  it("disables trading when the gas balance could not be read", () => {
    // #given a failed STT balance read
    const snapshot = { ...SEPARATE_SNAPSHOT, gasBalance: null, readStatus: "partial" as const };
    // #when the separate route is projected
    const route = compare(withSeparate(snapshot, SEPARATE_QUOTE)).routes.separate;
    // #then it cannot place
    expect(route.canPlace).toBe(false);
  });

  it("keeps trading available on a partial read whose essential reads arrived", () => {
    // #given open orders served by the indexer instead of the chain
    const snapshot = {
      ...SEPARATE_SNAPSHOT,
      readStatus: "partial" as const,
      issues: ["Open orders came from the indexer, which can lag the chain."],
    };
    // #when the separate route is projected
    const route = compare(withSeparate(snapshot, SEPARATE_QUOTE)).routes.separate;
    // #then the gap is noted without blocking
    expect([route.canPlace, issue(route, "READ_FAILED")?.blocking]).toEqual([true, false]);
  });

  it("refuses account data that belongs to another address", () => {
    // #given a snapshot for a third address
    const snapshot = { ...SEPARATE_SNAPSHOT, account: OTHER_ADDRESS };
    // #when the separate route is projected
    const route = compare(withSeparate(snapshot, SEPARATE_QUOTE)).routes.separate;
    // #then the figures are not attributed to the second wallet
    expect([route.canPlace, route.figures.equity.before.ok, route.sharedPositions]).toEqual([false, false, null]);
  });

  it("treats old account data as stale", () => {
    // #given an account read a minute ago
    const snapshot = { ...SEPARATE_SNAPSHOT, readAt: new Date(NOW_MS - 60_000).toISOString() };
    // #when the separate route is projected
    const route = compare(withSeparate(snapshot, SEPARATE_QUOTE)).routes.separate;
    // #then its as-read figures are withheld and the route waits for a refresh
    expect([issue(route, "STALE_ACCOUNT")?.message, route.figures.equity.before.ok, route.canPlace]).toEqual([
      "Account data is 1m old.",
      false,
      false,
    ]);
  });
});

describe("T03 account identity", () => {
  it("refuses to present the primary address as the separate account", () => {
    // #given the primary address entered again, in lowercase, as the second wallet
    const comparison = compare({
      separate: {
        identity: { ...SEPARATE_IDENTITY, address: LOWERCASE_PRIMARY },
        snapshot: PRIMARY_SNAPSHOT,
        quote: PRIMARY_QUOTE,
      },
      wallet: { address: PRIMARY_ADDRESS, chainId: 50383 },
    });
    const route = comparison.routes.separate;
    // #when the separate route is inspected
    // #then it is the same account: it shares collateral, shows no independent figures and cannot place
    expect({
      sameAccount: codes(route).includes("SAME_ACCOUNT"),
      shares: route.sharesCollateralWithExisting,
      anyFigure: figureReadings(route).some((reading) => reading.ok),
      eligible: route.eligible,
      untouched: route.untouched,
    }).toEqual({ sameAccount: true, shares: true, anyFigure: false, eligible: false, untouched: null });
  });

  it("shows a missing second wallet as its own state", () => {
    // #given no second wallet
    // #when the comparison is built
    const route = compare({ separate: null }).routes.separate;
    // #then the route exists, explains itself and holds nothing
    expect({
      account: route.account,
      codes: codes(route),
      anyFigure: figureReadings(route).some((reading) => reading.ok),
      canPlace: route.canPlace,
    }).toEqual({ account: null, codes: ["NO_ACCOUNT"], anyFigure: false, canPlace: false });
  });
});

describe("signer checks", () => {
  it("flags the wrong chain on the route whose wallet is connected", () => {
    // #given the second wallet connected on Ethereum mainnet
    // #when the separate route is projected
    const route = compare({ wallet: { address: SEPARATE_ADDRESS, chainId: 1 } }).routes.separate;
    // #then the account is eligible but cannot sign until the chain is switched
    expect([route.eligible, route.canPlace, codes(route)]).toEqual([true, false, ["WRONG_CHAIN"]]);
  });

  it("reports both a wrong account and a wrong chain", () => {
    // #given the primary wallet connected on another chain
    // #when the separate route is projected
    const route = compare({ wallet: { address: PRIMARY_ADDRESS, chainId: 1 } }).routes.separate;
    // #then both fixes are listed
    expect(codes(route)).toEqual(["WALLET_MISMATCH", "WRONG_CHAIN"]);
  });

  it("asks to connect on both routes when nothing is connected", () => {
    // #given no wallet
    // #when the comparison is built
    const { shared, separate } = compare({ wallet: { address: null, chainId: null } }).routes;
    // #then both ask for a connection
    expect([codes(shared), codes(separate)]).toEqual([["NOT_CONNECTED"], ["NOT_CONNECTED"]]);
  });

  it("never offers to sign for a watch-only second wallet", () => {
    // #given a watch-only second wallet that is also the connected address
    const comparison = compare({
      separate: { identity: { ...SEPARATE_IDENTITY, watchOnly: true }, snapshot: SEPARATE_SNAPSHOT, quote: SEPARATE_QUOTE },
    });
    // #when the separate route is projected
    const route = comparison.routes.separate;
    // #then it stays read-only
    expect([route.canPlace, codes(route)]).toEqual([false, ["WATCH_ONLY"]]);
  });
});

describe("wallet funding disclosure", () => {
  it("discloses when another wallet pays part of the order", () => {
    // #given a linked main wallet, here the primary, paying 0.3 USDso of a 0.5 USDso top-up
    const quote = patchQuote(SEPARATE_QUOTE, {
      margin: {
        topUpRequired: usdso(0n, 50n),
        ownWalletPull: usdso(0n, 20n),
        mainWalletPull: usdso(0n, 30n),
        fundingPayer: PRIMARY_ADDRESS,
      },
    });
    // #when the separate route is projected
    const funding = compare(withSeparate(SEPARATE_SNAPSHOT, quote)).routes.separate.funding;
    // #then the other wallet's payment is flagged and attributed
    expect(funding.ok ? [funding.value.anotherWalletPays, funding.value.payerIsPrimary, funding.value.mainWalletPull] : null).toEqual([
      true,
      true,
      usdso(0n, 30n),
    ]);
  });

  it("says when wallet top-ups were not previewed at all", () => {
    // #given a quote built without auto-pull modelling
    const quote = patchQuote(SEPARATE_QUOTE, { autoPull: false });
    // #when the separate route is projected
    const funding = compare(withSeparate(SEPARATE_SNAPSHOT, quote)).routes.separate.funding;
    // #then the zeros are marked as unchecked rather than as nothing moving
    expect(funding.ok ? funding.value.autoPullModelled : null).toBe(false);
  });
});

function bigintsIn(value: unknown): bigint[] {
  if (typeof value === "bigint") return [value];
  if (Array.isArray(value)) return value.flatMap(bigintsIn);
  if (typeof value === "object" && value !== null) return Object.values(value).flatMap(bigintsIn);
  return [];
}
