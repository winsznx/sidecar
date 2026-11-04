import { getAddress, isHash, toHex, type Address, type Hash } from "viem";

import { createPerpsAdapter, type PerpsAdapter } from "@/lib/dreamdex/adapter";
import { createMarkets, getPublicClient } from "@/lib/dreamdex/client";
import { NETWORK } from "@/lib/dreamdex/config";
import { decodePlaceOrderCalldata } from "@/lib/dreamdex/normalize";
import { HIDEKI_CHAIN_ID, type MarketMeta, type OrderIntent } from "@/lib/dreamdex/types";
import { toInputString } from "@/lib/format/units";
import { snapDownToGrid } from "@/lib/orders/validation";
import { buildComparison } from "@/lib/risk/preview";
import type { RouteKind } from "@/lib/risk/types";
import { createAccountIdentity, type AccountIdentity, type AccountRole } from "@/lib/wallets/identity";

// Everything here is a live, read-only chain or indexer read on Hideki. Nothing is signed or sent.

const HOLDER_SEARCH_LIMIT = 24;
const SCENARIO_MARKETS = ["BTC", "ETH"] as const;
const FILL_SEARCH_LIMIT = 100;

export interface TicketInput {
  market: MarketMeta;
  intent: OrderIntent;
  /** The limit price as the ticket's text field takes it. */
  priceText: string;
  /** The size as the ticket's text field takes it. */
  quantityText: string;
}

export interface LiveScenario {
  ticket: TicketInput;
  /** A real holder whose shared route can take the ticket's order, as the app's own comparison decides. */
  funded: Address;
  /** A second real holder that can take the same order as the separate account. `null` when none was found. */
  secondFunded: Address | null;
  searched: number;
}

let scenarioPromise: Promise<LiveScenario> | null = null;

type Sdk = ReturnType<typeof createMarkets>;

function withAdapter<T>(run: (adapter: PerpsAdapter, sdk: Sdk) => Promise<T>): Promise<T> {
  const sdk = createMarkets(NETWORK);
  const adapter = createPerpsAdapter(sdk);
  return run(adapter, sdk).finally(() => sdk.close());
}

/** A fresh random address: no history, no STT, no margin. */
export function freshAddress(): Address {
  return getAddress(toHex(crypto.getRandomValues(new Uint8Array(20))));
}

function identity(address: Address, role: AccountRole): AccountIdentity {
  const created = createAccountIdentity({ address, role, nowMs: Date.now() });
  if (!created.ok) throw new Error(`Could not build an identity for ${address}: ${created.issues.map((issue) => issue.message).join(" ")}`);
  return created.identity;
}

/** A minimum-size long resting 5% under the live mark, on the market's grid. */
async function restingTicket(adapter: PerpsAdapter, market: MarketMeta): Promise<TicketInput | null> {
  const health = await adapter.getMarketHealth(market.pool);
  if (!health.snapshot.ok) return null;
  const price = snapDownToGrid((health.snapshot.value.markPrice * 95n) / 100n, market.tickSize);
  if (price <= 0n) return null;
  const intent: OrderIntent = { pool: market.pool, side: "long", quantity: market.minQuantity, price, timeInForce: "GTC" };
  return {
    market,
    intent,
    priceText: toInputString(price, market.quoteDecimals),
    quantityText: toInputString(market.minQuantity, market.baseDecimals),
  };
}

/** Whether `account` can take the ticket's order on `kind`, decided by the same comparison the trade screen runs. */
async function canPlace(adapter: PerpsAdapter, markets: readonly MarketMeta[], ticket: TicketInput, account: Address, kind: RouteKind): Promise<boolean> {
  const [snapshot, quote] = await Promise.all([
    adapter.getAccountSnapshot(account, ticket.market.marginBank, markets),
    adapter.quoteRoute(account, ticket.intent, ticket.market, { autoPull: true }),
  ]);
  const self = { identity: identity(account, kind === "shared" ? "primary" : "separate"), snapshot, quote };
  const other = { identity: identity(freshAddress(), kind === "shared" ? "separate" : "primary"), snapshot: null, quote: null };
  const comparison = buildComparison({
    market: ticket.market,
    intent: ticket.intent,
    primary: kind === "shared" ? self : other,
    separate: kind === "shared" ? other : self,
    wallet: { address: account, chainId: HIDEKI_CHAIN_ID },
    nowMs: Date.now(),
  });
  return comparison.routes[kind].canPlace;
}

async function discoverScenario(): Promise<LiveScenario> {
  return withAdapter(async (adapter, sdk) => {
    const markets = await adapter.listMarkets();
    let searched = 0;
    for (const symbol of SCENARIO_MARKETS) {
      const market = markets.find((candidate) => candidate.baseSymbol === symbol);
      if (market === undefined) continue;
      const ticket = await restingTicket(adapter, market);
      if (ticket === null) continue;
      const sides = await Promise.all(
        [true, false].map((isLong) => sdk.client.getPerpSideHolders({ marginBank: market.marginBank, pool: market.pool, isLong })),
      );
      const holders = [...new Set(sides.flatMap((side) => side.holders).map((holder) => getAddress(holder)))].slice(0, HOLDER_SEARCH_LIMIT);
      let funded: Address | null = null;
      for (const holder of holders) {
        searched += 1;
        if (funded === null) {
          if (await canPlace(adapter, markets, ticket, holder, "shared")) funded = holder;
          continue;
        }
        if (await canPlace(adapter, markets, ticket, holder, "separate")) return { ticket, funded, secondFunded: holder, searched };
      }
      if (funded !== null) return { ticket, funded, secondFunded: null, searched };
    }
    throw new Error(`No real BTC or ETH holder among ${searched} searched can take a minimum-size order with its own margin and gas.`);
  });
}

/**
 * A real funded holder and an order it can place, found at test time. Cached per worker:
 * the search reads several accounts and every spec needs the same answer.
 */
export function liveScenario(): Promise<LiveScenario> {
  scenarioPromise ??= discoverScenario().catch((error: unknown) => {
    scenarioPromise = null;
    throw error;
  });
  return scenarioPromise;
}

/**
 * A recent public perp fill whose transaction is a direct placeOrder call on the pool, so its
 * calldata decodes as the order that asked for it. Fills from routed or batched calls are
 * skipped: their receipt carries the fill but not a decodable placement. `null` when none is found.
 */
export async function findPublicFillHash(): Promise<{ hash: Hash; sender: Address; searched: number } | null> {
  return withAdapter(async (adapter, sdk) => {
    const markets = await adapter.listMarkets();
    const chain = getPublicClient(sdk);
    let searched = 0;
    // Direct placements are rare among recent fills (most arrive through routers or batch
    // calls), so every listed market is searched, BTC and ETH first.
    const preferred = new Set<string>(SCENARIO_MARKETS);
    const rank = (market: MarketMeta): number => (preferred.has(market.baseSymbol) ? 0 : 1);
    const ordered = [...markets].sort((a, b) => rank(a) - rank(b));
    for (const market of ordered) {
      const fills = await sdk.client.getFills(market.pool, { limit: FILL_SEARCH_LIMIT });
      const hashes = [...new Set(fills.map((fill) => fill.txHash.toLowerCase()))].filter((hash): hash is Hash => isHash(hash));
      searched += hashes.length;
      const txs = await Promise.all(hashes.map((hash) => chain.getTransaction({ hash })));
      const direct = txs.filter(
        (tx) => tx.to !== null && tx.to.toLowerCase() === market.pool.toLowerCase() && decodePlaceOrderCalldata(tx.input) !== null,
      );
      for (const tx of direct) {
        const order = await adapter.reconcileOrder(tx.hash, { markets });
        if (order.requested !== null && (order.outcome === "FILLED" || order.outcome === "PARTIALLY_FILLED")) {
          return { hash: tx.hash, sender: order.from, searched };
        }
      }
    }
    return null;
  });
}
