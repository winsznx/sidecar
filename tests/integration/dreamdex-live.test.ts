import { SOMNIA_HIDEKI_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import { getAddress, isAddress, toHex, type Address } from "viem";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPerpsAdapter } from "@/lib/dreamdex/adapter";
import { createMarkets } from "@/lib/dreamdex/client";
import { NETWORK } from "@/lib/dreamdex/config";
import { classifyError } from "@/lib/dreamdex/errors";
import type { MarketListing, MarketMeta, OrderIntent } from "@/lib/dreamdex/types";

// Live and read-only: every call below is a chain or indexer read on Hideki. Nothing is signed or sent.
const markets = createMarkets(NETWORK);
const adapter = createPerpsAdapter(markets);

function envAddress(name: string): Address | null {
  const value = process.env[name]?.trim();
  if (!value) return null;
  if (!isAddress(value, { strict: false })) throw new Error(`${name} is not an address: ${value}`);
  return getAddress(value);
}

function freshAddress(): Address {
  return getAddress(toHex(crypto.getRandomValues(new Uint8Array(20))));
}

function requireMarket(listing: MarketListing, symbol: string): MarketMeta {
  const market = listing.markets.find((m) => m.baseSymbol === symbol);
  if (!market) throw new Error(`${symbol} is not listed`);
  return market;
}

let listing: MarketListing;
let btc: MarketMeta;
let eth: MarketMeta;
let accountA: Address;
let accountB: Address;
let accountAIsDiscoveredHolder = false;
let accountBIsFresh = false;

/** A resting BTC bid 5% under the live mark, on the tick grid. */
async function restingBtcBid(quantity: bigint): Promise<OrderIntent> {
  const health = await adapter.getMarketHealth(btc.pool);
  if (!health.snapshot.ok) throw new Error(`BTC is not priceable: ${health.snapshot.reason}`);
  const price = ((health.snapshot.value.markPrice * 95n) / 100n / btc.tickSize) * btc.tickSize;
  return { pool: btc.pool, side: "long", quantity, price, timeInForce: "GTC" };
}

beforeAll(async () => {
  listing = await adapter.getMarketListing();
  btc = requireMarket(listing, "BTC");
  eth = requireMarket(listing, "ETH");
  const envA = envAddress("SIDECAR_TEST_ACCOUNT_A");
  const envB = envAddress("SIDECAR_TEST_ACCOUNT_B");
  if (envA) accountA = envA;
  else {
    const { holders } = await markets.client.getPerpSideHolders({ marginBank: eth.marginBank, pool: eth.pool, isLong: true });
    const first = holders[0];
    if (!first) throw new Error("No ETH long holder found to use as account A");
    accountA = getAddress(first);
    accountAIsDiscoveredHolder = true;
  }
  accountB = envB ?? freshAddress();
  accountBIsFresh = envB === null;
});

afterAll(async () => {
  await markets.close();
});

describe("I01 market discovery on 50383", () => {
  it("I01 talks to chain 50383", async () => {
    // #given / #when
    const status = await adapter.getChainStatus();
    // #then
    expect([status.chainId, status.matches]).toEqual([50383, true]);
  });

  it("I01 lists at least one market with its factory gate read", () => {
    // #given the listing from beforeAll
    // #when / #then
    expect([listing.markets.length > 0, listing.gates.status, listing.markets.every((m) => typeof m.tradeable === "boolean")]).toEqual([true, "ok", true]);
  });

  it("I01 agrees with the chain on BTC's decimals", async () => {
    // #given
    const health = await adapter.getMarketHealth(btc.pool);
    // #when
    const oneBase = health.snapshot.ok ? health.snapshot.value.oneBase : null;
    // #then
    expect(oneBase).toBe(10n ** BigInt(btc.baseDecimals));
  });

  it("I01 quotes every market in the MarginBank's collateral, which is not the address bundle's collateral", async () => {
    // #given
    const config = await adapter.getSystemConfig(btc.marginBank);
    // #when
    const quoteTokens = new Set(listing.markets.map((m) => m.quoteToken.toLowerCase()));
    // #then
    expect({
      fullyWired: config.fullyWired,
      quoteTokens: [...quoteTokens],
      bundleCollateralDiffers: SOMNIA_HIDEKI_TESTNET_ADDRESSES.collateral?.toLowerCase() !== config.collateralToken.toLowerCase(),
    }).toEqual({ fullyWired: true, quoteTokens: [config.collateralToken.toLowerCase()], bundleCollateralDiffers: true });
  });
});

describe("I02 two-account state", () => {
  it("I02 reads account A's margin account and positions from chain", async () => {
    // #given / #when
    const snapshot = await adapter.getAccountSnapshot(accountA, btc.marginBank, listing.markets);
    // #then
    expect({
      notError: snapshot.readStatus !== "error",
      hasMargin: snapshot.margin !== null,
      marginSource: snapshot.sources?.margin?.kind,
      holdsEth: accountAIsDiscoveredHolder ? snapshot.positions.some((p) => p.pool === eth.pool && p.side === "long") : true,
    }).toEqual({ notError: true, hasMargin: true, marginSource: "chain", holdsEth: true });
  });

  it("I02 reads account B separately, with a fresh account showing real zeros from chain", async () => {
    // #given / #when
    const snapshot = await adapter.getAccountSnapshot(accountB, btc.marginBank, listing.markets);
    // #then
    if (!accountBIsFresh) {
      expect(snapshot.margin).not.toBeNull();
      return;
    }
    expect({
      account: snapshot.account,
      equity: snapshot.margin?.equity,
      unlocked: snapshot.margin?.unlockedCollateral,
      positions: snapshot.positions.length,
      openOrders: snapshot.openOrders.status === "ok" ? snapshot.openOrders.orders.length : "unavailable",
      gas: snapshot.gasBalance,
      voucherClaimed: snapshot.voucher?.claimed,
    }).toEqual({ account: accountB, equity: 0n, unlocked: 0n, positions: 0, openOrders: 0, gas: 0n, voucherClaimed: false });
  });
});

describe("I03 live order-size preflight", () => {
  it("I03 returns a priceable max size with its binding gate for account A", async () => {
    // #given
    const intent = await restingBtcBid(btc.minQuantity);
    // #when
    const quote = await adapter.quoteRoute(accountA, intent, btc);
    // #then
    expect({ priceable: quote.priceable, hasMax: quote.maxSize !== null, limitedBy: typeof quote.maxSize?.limitedBy }).toEqual({
      priceable: true,
      hasMax: true,
      limitedBy: "string",
    });
  });

  it("I03 reports an unfunded account B as unplaceable, limited by its funding", async () => {
    // #given
    const intent = await restingBtcBid(btc.minQuantity);
    // #when
    const [withPull, withoutPull] = await Promise.all([
      adapter.quoteRoute(accountB, intent, btc),
      adapter.quoteRoute(accountB, intent, btc, { autoPull: false }),
    ]);
    // #then
    if (!accountBIsFresh) {
      expect(withPull.maxSize).not.toBeNull();
      return;
    }
    expect({
      maxQuantity: withPull.maxSize?.maxQuantity,
      placeable: withPull.maxSize?.placeable,
      limitedByWithPull: withPull.maxSize?.limitedBy,
      limitedByWithoutPull: withoutPull.maxSize?.limitedBy,
      sufficient: withPull.margin?.sufficient,
    }).toEqual({ maxQuantity: 0n, placeable: false, limitedByWithPull: "walletBalance", limitedByWithoutPull: "collateral", sufficient: false });
  });
});

describe("I09 fresh comparison inputs", () => {
  it("I09 recomputes the lock from new reads when the size changes", async () => {
    // #given
    const small = await restingBtcBid(btc.minQuantity);
    const large = { ...small, quantity: btc.minQuantity * 10n };
    // #when
    const first = await adapter.quoteRoute(accountA, small, btc);
    const second = await adapter.quoteRoute(accountA, large, btc);
    // #then
    expect({
      lockGrew: (second.margin?.lockAmount ?? 0n) > (first.margin?.lockAmount ?? 0n),
      laterOrSameBlock: second.block >= first.block,
      quotedSize: second.intent.quantity,
    }).toEqual({ lockGrew: true, laterOrSameBlock: true, quotedSize: btc.minQuantity * 10n });
  });
});

describe("I11 voucher market restriction", () => {
  const VOUCHER_SEARCH_LIMIT = 40;

  /** The configured account A, then real BTC and ETH holders, until one still carries house money. */
  async function findVoucherAccount(): Promise<{ account: Address; searched: number } | { account: null; searched: number }> {
    const sides = await Promise.all(
      [btc, eth].flatMap((m) => [true, false].map((isLong) => markets.client.getPerpSideHolders({ marginBank: m.marginBank, pool: m.pool, isLong }))),
    );
    const candidates = [...new Set([accountA, ...sides.flatMap((side) => side.holders).map((h) => getAddress(h))])].slice(0, VOUCHER_SEARCH_LIMIT);
    for (const [index, candidate] of candidates.entries()) {
      const voucher = await markets.client.getPerpVoucher(btc.marginBank, candidate);
      if (voucher !== null && voucher.floor > 0n) return { account: candidate, searched: index + 1 };
    }
    return { account: null, searched: candidates.length };
  }

  it("I11 blocks a voucher account from increasing a position outside the allowlist", async (ctx) => {
    // #given
    const found = await findVoucherAccount();
    if (found.account === null) {
      ctx.skip(`I11 skipped: none of ${found.searched} real accounts (account A plus BTC and ETH holders) holds a voucher floor, so there is no voucher restriction to observe.`);
      return;
    }
    const holder = found.account;
    // One market at a time: 21 parallel leverage reads overrun the shared socket's request timeout.
    let blocked: MarketMeta | undefined;
    let lastBlock: bigint | null = null;
    for (const m of listing.markets) {
      const leverage = await markets.client.getPerpLeverage({ marginBank: m.marginBank, pool: m.pool, account: holder });
      lastBlock = leverage.asOfBlock;
      if (!leverage.voucherMarketAllowed) {
        blocked = m;
        break;
      }
    }
    if (!blocked) {
      ctx.skip(`I11 skipped: all ${listing.markets.length} listed markets are on the voucher allowlist for ${holder} (last read at block ${lastBlock ?? "unknown"}).`);
      return;
    }
    const health = await adapter.getMarketHealth(blocked.pool);
    if (!health.snapshot.ok) {
      ctx.skip(`I11 skipped: ${blocked.displaySymbol} is not priceable, so the voucher gate cannot be previewed.`);
      return;
    }
    const price = ((health.snapshot.value.markPrice * 95n) / 100n / blocked.tickSize) * blocked.tickSize;
    // #when
    const quote = await adapter.quoteRoute(holder, { pool: blocked.pool, side: "long", quantity: blocked.minQuantity, price, timeInForce: "GTC" }, blocked);
    // #then
    expect(quote.margin?.voucherBlocked === true || quote.maxSize?.limitedBy === "voucherBlocked").toBe(true);
  });
});

describe("I12 unavailable reads stay unavailable", () => {
  const bogus = getAddress("0x000000000000000000000000000000000000bEEF");

  it("I12 reports a non-market's health as an error with no values", async () => {
    // #given / #when
    const health = await adapter.getMarketHealth(bogus);
    // #then
    expect({ status: health.status, snapshot: health.snapshot.ok, feed: health.feed.ok, errors: health.errors.length > 0 }).toEqual({
      status: "error",
      snapshot: false,
      feed: false,
      errors: true,
    });
  });

  it("I12 refuses to quote a non-market instead of returning zero margin", async () => {
    // #given
    const fake: MarketMeta = { ...btc, pool: bogus, displaySymbol: "BOGUS-PERP" };
    const intent: OrderIntent = { pool: bogus, side: "long", quantity: btc.minQuantity, price: btc.tickSize * 1000n, timeInForce: "GTC" };
    // #when
    const quoting = adapter.quoteRoute(accountA, intent, fake);
    // #then
    await expect(quoting.catch((error: unknown) => classifyError(error).code)).resolves.toBe("CONTRACT_NOT_FOUND");
  });

  it("I12 leaves margin null on a MarginBank that does not exist", async () => {
    // #given / #when
    const snapshot = await adapter.getAccountSnapshot(accountA, bogus, listing.markets);
    // #then
    expect({ margin: snapshot.margin, readStatus: snapshot.readStatus, explained: snapshot.issues.length > 0 }).toEqual({
      margin: null,
      readStatus: "error",
      explained: true,
    });
  });
});
