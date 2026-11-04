import type { SystemConfig } from "@/lib/dreamdex/adapter";
import { classifyError } from "@/lib/dreamdex/errors";
import { HIDEKI_CHAIN_ID, type ChainStatus, type MarketHealth, type MarketListing, type MarketMeta, type Source } from "@/lib/dreamdex/types";
import { formatBlockNumber } from "@/lib/format/units";

/** One query's state, reduced to what the checks need. */
export type Settled<T> =
  | { state: "loading" }
  | { state: "error"; error: unknown }
  | { state: "ok"; value: T; readAt: string };

export type LiveCheckStatus = "pass" | "fail" | "unknown" | "loading";

export interface LiveCheckRow {
  id: string;
  label: string;
  status: LiveCheckStatus;
  /** Preformatted value, or `null` when it could not be read. */
  value: string | null;
  source: Source | null;
  /** Plain reason when the value is unavailable or the check failed. */
  reason: string | null;
}

export interface LiveCheckInputs {
  chain: Settled<ChainStatus>;
  listing: Settled<MarketListing>;
  config: Settled<SystemConfig>;
  btc: Settled<MarketHealth>;
  eth: Settled<MarketHealth>;
}

export function findMarket(markets: readonly MarketMeta[], baseSymbol: string): MarketMeta | null {
  return markets.find((market) => market.baseSymbol.toUpperCase() === baseSymbol) ?? null;
}

function failure(error: unknown): string {
  return classifyError(error).message;
}

/** The newest head seen this run, used to place unpinned reads. */
function headSource(chain: Settled<ChainStatus>, readAt: string, via: string): Source | null {
  return chain.state === "ok" ? { kind: "chain", block: chain.value.headBlock, readAt, via, pinned: false } : null;
}

function healthRow(id: string, symbol: string, health: Settled<MarketHealth>, listing: Settled<MarketListing>): LiveCheckRow {
  const label = `${symbol}-PERP can be priced`;
  if (listing.state === "error") {
    return { id, label, status: "unknown", value: null, source: null, reason: "Needs the market list to find this pool." };
  }
  if (listing.state === "ok" && findMarket(listing.value.markets, symbol) === null) {
    return { id, label, status: "fail", value: null, source: null, reason: `${symbol} is not in the market list.` };
  }
  if (health.state === "loading") return { id, label, status: "loading", value: null, source: null, reason: null };
  if (health.state === "error") return { id, label, status: "unknown", value: null, source: null, reason: failure(health.error) };
  const reading = health.value.snapshot;
  if (health.value.status === "priceable" && reading.ok) {
    return { id, label, status: "pass", value: "Priceable", source: reading.source, reason: null };
  }
  if (health.value.status === "unpriceable") {
    return {
      id,
      label,
      status: "fail",
      value: "Not priceable",
      source: reading.source ?? null,
      reason: "The protocol declined to price this market at this block.",
    };
  }
  return {
    id,
    label,
    status: "unknown",
    value: null,
    source: null,
    reason: reading.ok ? (health.value.errors[0] ?? "The health read failed.") : reading.reason,
  };
}

/** The proof page's live checks, each from a read made in this browser. Nothing is assumed when a read fails. */
export function deriveLiveChecks(inputs: LiveCheckInputs): LiveCheckRow[] {
  const { chain, listing, config } = inputs;
  const rows: LiveCheckRow[] = [];

  if (chain.state === "ok") {
    const source: Source = { kind: "chain", block: chain.value.headBlock, readAt: chain.value.readAt, via: "eth_chainId", pinned: false };
    rows.push({
      id: "chain-id",
      label: `RPC reports chain ${HIDEKI_CHAIN_ID}`,
      status: chain.value.matches ? "pass" : "fail",
      value: String(chain.value.chainId),
      source,
      reason: chain.value.matches ? null : `The RPC reports chain ${chain.value.chainId}, not Hideki (${HIDEKI_CHAIN_ID}).`,
    });
    rows.push({
      id: "head-block",
      label: "Head block",
      status: "pass",
      value: formatBlockNumber(chain.value.headBlock),
      source: { kind: "chain", block: chain.value.headBlock, readAt: chain.value.readAt, via: "eth_blockNumber" },
      reason: null,
    });
  } else {
    const status = chain.state === "loading" ? "loading" : "unknown";
    const reason = chain.state === "error" ? failure(chain.error) : null;
    rows.push({ id: "chain-id", label: `RPC reports chain ${HIDEKI_CHAIN_ID}`, status, value: null, source: null, reason });
    rows.push({ id: "head-block", label: "Head block", status, value: null, source: null, reason });
  }

  if (config.state === "ok") {
    rows.push({
      id: "margin-bank",
      label: "MarginBank is fully wired",
      status: config.value.fullyWired ? "pass" : "fail",
      value: config.value.fullyWired ? "Yes" : "No",
      source: headSource(chain, config.readAt, "getPerpSystemConfig"),
      reason: config.value.fullyWired ? null : "The MarginBank reports that its system contracts are not fully wired.",
    });
  } else {
    rows.push({
      id: "margin-bank",
      label: "MarginBank is fully wired",
      status: config.state === "loading" && listing.state !== "error" ? "loading" : "unknown",
      value: null,
      source: null,
      reason: config.state === "error" ? failure(config.error) : listing.state === "error" ? "Needs the market list to find the MarginBank." : null,
    });
  }

  if (listing.state === "ok") {
    const count = listing.value.markets.length;
    rows.push({
      id: "market-count",
      label: "Perp markets listed",
      status: count > 0 ? "pass" : "fail",
      value: String(count),
      source: listing.value.source,
      reason: count > 0 ? null : "No perp markets were listed.",
    });
  } else {
    rows.push({
      id: "market-count",
      label: "Perp markets listed",
      status: listing.state === "loading" ? "loading" : "unknown",
      value: null,
      source: null,
      reason: listing.state === "error" ? failure(listing.error) : null,
    });
  }

  rows.push(healthRow("btc-priceable", "BTC", inputs.btc, listing));
  rows.push(healthRow("eth-priceable", "ETH", inputs.eth, listing));
  return rows;
}

export function liveChecksSummary(rows: readonly LiveCheckRow[]): { passed: number; total: number; settled: boolean } {
  return {
    passed: rows.filter((row) => row.status === "pass").length,
    total: rows.length,
    settled: rows.every((row) => row.status !== "loading"),
  };
}
