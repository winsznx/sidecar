import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { createPublicClient, formatEther, formatUnits, getAddress, http, isAddress, type Address } from "viem";

import { createPerpsAdapter, type PerpsAdapter } from "../lib/dreamdex/adapter";
import { createMarkets } from "../lib/dreamdex/client";
import {
  EXPECTED_SDK_VERSION,
  MIN_GAS_BALANCE_FOR_ORDER_WEI,
  readPublicEnvOverrides,
  resolveNetworkConfig,
  sidecarChain,
  type NetworkConfig,
} from "../lib/dreamdex/config";
import { classifyError } from "../lib/dreamdex/errors";
import { toJsonSafe } from "../lib/dreamdex/normalize";
import { createTimingRecorder } from "../lib/dreamdex/timing";
import { HIDEKI_CHAIN_ID, type MarketListing, type MarketMeta } from "../lib/dreamdex/types";

const USAGE = `Usage: npm run doctor -- [--account 0x...] [--json] [--markets BTC,ETH] [--rpc URL] [--ws URL] [--indexer URL]

Read-only health check of the Hideki perps stack. Exits non-zero when a critical check fails.`;

type CheckStatus = "pass" | "warn" | "fail" | "skip";

interface Check {
  id: string;
  label: string;
  critical: boolean;
  status: CheckStatus;
  detail: string;
  ms: number;
  data?: unknown;
}

interface CheckResult {
  status?: CheckStatus;
  detail: string;
  data?: unknown;
}

function readInstalledSdkVersion(): string | null {
  try {
    const raw: unknown = JSON.parse(readFileSync(join(process.cwd(), "node_modules/@somnia-chain/markets-sdk/package.json"), "utf8"));
    return typeof raw === "object" && raw !== null && "version" in raw && typeof raw.version === "string" ? raw.version : null;
  } catch {
    return null;
  }
}

function human(raw: bigint, decimals: number): string {
  return formatUnits(raw, decimals);
}

async function runCheck(checks: Check[], id: string, label: string, critical: boolean, run: () => Promise<CheckResult>): Promise<void> {
  const started = performance.now();
  try {
    const result = await run();
    checks.push({ id, label, critical, status: result.status ?? "pass", detail: result.detail, data: result.data, ms: performance.now() - started });
  } catch (error) {
    const classified = classifyError(error);
    const raw = error instanceof Error ? error.message.split("\n")[0] : String(error);
    checks.push({ id, label, critical, status: "fail", detail: `${classified.message} (${raw})`, ms: performance.now() - started });
  }
}

function marketParams(market: MarketMeta): Record<string, string | number | boolean | null> {
  return {
    pool: market.pool,
    marginBank: market.marginBank,
    collateral: `${market.quoteSymbol} ${market.quoteToken}`,
    baseDecimals: market.baseDecimals,
    quoteDecimals: market.quoteDecimals,
    tickSize: `${human(market.tickSize, market.quoteDecimals)} ${market.quoteSymbol}`,
    lotSize: `${human(market.lotSize, market.baseDecimals)} ${market.baseSymbol}`,
    minQuantity: `${human(market.minQuantity, market.baseDecimals)} ${market.baseSymbol}`,
    initialMarginBpsFloor: market.initialMarginBps,
    maxLeverageX: market.maxLeverageX,
    tradeable: market.tradeable,
    restricted: market.restricted ?? null,
    indexedMark: market.indexedMarkPrice === null ? null : human(market.indexedMarkPrice, market.quoteDecimals),
  };
}

async function checkMarket(checks: Check[], adapter: PerpsAdapter, market: MarketMeta): Promise<void> {
  const tag = market.baseSymbol.toLowerCase();
  await runCheck(checks, `${tag}-params`, `${market.displaySymbol} parameters`, false, async () => ({
    detail: `pool ${market.pool}, tick ${human(market.tickSize, market.quoteDecimals)}, lot ${human(market.lotSize, market.baseDecimals)}, min ${human(market.minQuantity, market.baseDecimals)} ${market.baseSymbol}, IMF floor ${market.initialMarginBps} bps`,
    data: marketParams(market),
  }));
  await runCheck(checks, `${tag}-health`, `${market.displaySymbol} health snapshot`, true, async () => {
    const health = await adapter.getMarketHealth(market.pool);
    const data = toJsonSafe(health);
    if (!health.snapshot.ok) return { status: "fail", detail: health.snapshot.reason, data };
    const snap = health.snapshot.value;
    const feedLive = health.feed.ok && health.feed.value.live;
    const risk = health.risk.ok ? health.risk.value : null;
    return {
      status: feedLive ? "pass" : "fail",
      detail:
        `mark ${human(snap.markPrice, market.quoteDecimals)} ${market.quoteSymbol}, effective IMF ${snap.effectiveImfBps} bps, ` +
        `MM ${snap.maintenanceMarginBps} bps, close-out ${snap.closeOutMarginBps} bps, feed ${feedLive ? "live" : "NOT live"}` +
        (risk ? `, max position ${human(risk.maxPositionSize, market.baseDecimals)} ${market.baseSymbol}, taker fee ${risk.takerFeeBpsTimes1k} bps x1000` : ""),
      data,
    };
  });
  await runCheck(checks, `${tag}-book`, `${market.displaySymbol} top of book`, false, async () => {
    const top = await adapter.getBookTop(market);
    const fmt = (v: bigint | null): string => (v === null ? "empty" : human(v, market.quoteDecimals));
    return {
      status: top.bestBid === null || top.bestAsk === null ? "warn" : "pass",
      detail: `best bid ${fmt(top.bestBid)}, best ask ${fmt(top.bestAsk)} at block ${top.block}`,
      data: toJsonSafe(top),
    };
  });
}

async function checkAccount(checks: Check[], adapter: PerpsAdapter, account: Address, listing: MarketListing): Promise<void> {
  const bank = listing.markets[0]?.marginBank;
  if (!bank) {
    checks.push({ id: "account", label: "Account snapshot", critical: false, status: "skip", detail: "No markets listed, so no MarginBank to read.", ms: 0 });
    return;
  }
  await runCheck(checks, "account", `Account snapshot ${account}`, false, async () => {
    const snap = await adapter.getAccountSnapshot(account, bank, listing.markets);
    const margin = snap.margin;
    const parts = [
      `read ${snap.readStatus} at block ${snap.block}`,
      margin ? `status ${margin.status}, equity ${formatEther(margin.equity)}, unlocked ${formatEther(margin.unlockedCollateral)}, locked ${formatEther(margin.lockedCollateral)} USDso` : "margin unavailable",
      `${snap.positions.length} position(s)`,
      snap.openOrders.status === "ok" ? `${snap.openOrders.orders.length} open order(s) (${snap.openOrders.source.kind})` : "open orders unavailable",
      snap.gasBalance === null ? "STT unavailable" : `${formatEther(snap.gasBalance)} STT`,
      snap.voucher ? `voucher floor ${formatEther(snap.voucher.floor)} (voucher programme ${snap.voucher.programme ?? "unknown"})` : "voucher unavailable",
    ];
    const lowGas = snap.gasBalance !== null && snap.gasBalance < MIN_GAS_BALANCE_FOR_ORDER_WEI;
    if (lowGas) parts.push(`below the ${formatEther(MIN_GAS_BALANCE_FOR_ORDER_WEI)} STT the node requires to accept one order`);
    return {
      status: snap.readStatus === "verified" && !lowGas ? "pass" : "warn",
      detail: parts.join("; ") + (snap.issues.length ? `. Issues: ${snap.issues.join(" | ")}` : ""),
      data: toJsonSafe(snap),
    };
  });
}

async function waitForNewHead(adapter: PerpsAdapter, markets: ReturnType<typeof createMarkets>, timeoutMs: number): Promise<bigint> {
  const start = (await adapter.getChainStatus()).headBlock;
  return new Promise<bigint>((resolve, reject) => {
    const timer = setTimeout(() => {
      unwatch();
      reject(new Error(`No new head arrived over the WebSocket within ${timeoutMs} ms.`));
    }, timeoutMs);
    // Over a WebSocket transport viem subscribes to new heads instead of polling.
    const unwatch = markets.client.getViemClient().watchBlockNumber({
      onBlockNumber: (block) => {
        if (block > start) {
          clearTimeout(timer);
          unwatch();
          resolve(block);
        }
      },
      onError: (error) => {
        clearTimeout(timer);
        unwatch();
        reject(error);
      },
    });
  });
}

function print(checks: Check[], network: NetworkConfig, latency: ReturnType<PerpsAdapter["timing"]["summary"]>): void {
  console.log(`Sidecar doctor: ${network.rpcUrl} (ws ${network.wsUrl})`);
  console.log(`indexer ${network.indexerUrl}\n`);
  for (const check of checks) {
    const mark = check.status.toUpperCase().padEnd(4);
    const crit = check.critical ? "*" : " ";
    console.log(`${mark}${crit} ${check.label.padEnd(36)} ${check.detail} (${Math.round(check.ms)} ms)`);
  }
  console.log("\n* critical. Latency per SDK/viem call (ms):");
  console.log("operation".padEnd(30), "n".padStart(3), "fail".padStart(5), "p50".padStart(7), "p95".padStart(7), "max".padStart(7));
  for (const row of latency) {
    console.log(
      row.operation.padEnd(30),
      String(row.count).padStart(3),
      String(row.failures).padStart(5),
      row.p50Ms.toFixed(0).padStart(7),
      row.p95Ms.toFixed(0).padStart(7),
      row.maxMs.toFixed(0).padStart(7),
    );
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      account: { type: "string" },
      json: { type: "boolean", default: false },
      markets: { type: "string", default: "BTC,ETH" },
      rpc: { type: "string" },
      ws: { type: "string" },
      indexer: { type: "string" },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    console.log(USAGE);
    return;
  }
  if (values.account !== undefined && !isAddress(values.account, { strict: false })) {
    console.error(`--account is not an address: ${values.account}`);
    process.exitCode = 2;
    return;
  }

  const network = resolveNetworkConfig({ ...readPublicEnvOverrides(), rpcUrl: values.rpc, wsUrl: values.ws, indexerUrl: values.indexer });
  const timing = createTimingRecorder();
  const markets = createMarkets(network);
  const adapter = createPerpsAdapter(markets, { network, timing });
  const checks: Check[] = [];
  const wanted = values.markets.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  const found: { listing: MarketListing | null } = { listing: null };

  try {
    await runCheck(checks, "sdk-version", "SDK version", true, async () => {
      const installed = readInstalledSdkVersion();
      return {
        status: installed === EXPECTED_SDK_VERSION ? "pass" : "fail",
        detail: `@somnia-chain/markets-sdk ${installed ?? "not found"} installed, ${EXPECTED_SDK_VERSION} pinned`,
      };
    });

    await runCheck(checks, "rpc-http", "HTTP RPC chain id", true, async () => {
      const client = createPublicClient({ chain: sidecarChain(network), transport: http(network.rpcUrl) });
      const [chainId, head] = await timing.time("http.eth_chainId+blockNumber", () => Promise.all([client.getChainId(), client.getBlockNumber()]));
      return { status: chainId === HIDEKI_CHAIN_ID ? "pass" : "fail", detail: `chain id ${chainId}, head ${head}` };
    });

    await runCheck(checks, "ws-rpc", "WebSocket RPC (SDK transport)", true, async () => {
      const status = await adapter.getChainStatus();
      return { status: status.matches ? "pass" : "fail", detail: `chain id ${status.chainId}, head ${status.headBlock}`, data: toJsonSafe(status) };
    });

    await runCheck(checks, "ws-subscription", "WebSocket new-head subscription", false, async () => {
      const block = await timing.time("ws.newHeads", () => waitForNewHead(adapter, markets, 5_000));
      return { detail: `received head ${block}` };
    });

    await runCheck(checks, "markets", "Market discovery", true, async () => {
      const listing = await adapter.getMarketListing();
      found.listing = listing;
      const tradeable = listing.markets.filter((m) => m.tradeable === true).length;
      const gates = listing.gates.status === "ok" ? `${tradeable} tradeable by factory gates` : `gates unavailable: ${listing.gates.reason}`;
      return {
        status: listing.markets.length === 0 ? "fail" : listing.gates.status === "ok" && listing.source.kind === "indexer" ? "pass" : "warn",
        detail: `${listing.markets.length} perp markets from ${listing.source.kind}; ${gates}`,
        data: listing.markets.map((m) => m.displaySymbol),
      };
    });

    const current = found.listing;
    const bank = current?.markets[0]?.marginBank ?? null;
    if (bank) {
      await runCheck(checks, "system-config", "MarginBank system config", true, async () => {
        const config = await adapter.getSystemConfig(bank);
        const feeRecipientSet = !/^0x0{40}$/i.test(config.feeRecipient);
        return {
          status: !config.fullyWired ? "fail" : feeRecipientSet ? "pass" : "warn",
          detail: `bank ${config.marginBank}, collateral ${config.collateralToken}, factory ${config.perpPoolFactory}, fullyWired ${config.fullyWired}, max leverage ${config.maxLeverageLimit}x`,
          data: toJsonSafe(config),
        };
      });
    }

    if (current) {
      const demo = wanted.map((symbol) => current.markets.find((m) => m.baseSymbol.toUpperCase() === symbol) ?? null);
      await runCheck(checks, "demo-markets", `Markets ${wanted.join(", ")} listed`, true, async () => {
        const missing = wanted.filter((_, i) => demo[i] === null);
        return { status: missing.length ? "fail" : "pass", detail: missing.length ? `missing ${missing.join(", ")}` : "all present" };
      });
      for (const market of demo) if (market) await checkMarket(checks, adapter, market);
      if (values.account) await checkAccount(checks, adapter, getAddress(values.account), current);
    }
  } finally {
    await markets.close();
  }

  const criticalFailed = checks.some((c) => c.critical && c.status === "fail");
  const latency = timing.summary();
  if (values.json) {
    console.log(
      JSON.stringify(
        toJsonSafe({ ok: !criticalFailed, generatedAt: new Date().toISOString(), network, sdkVersion: readInstalledSdkVersion(), checks, latency }),
        null,
        2,
      ),
    );
  } else {
    print(checks, network, latency);
    console.log(criticalFailed ? "\nDoctor: FAILED (a critical check failed)." : "\nDoctor: OK.");
  }
  process.exitCode = criticalFailed ? 1 : 0;
}

main().catch((error: unknown) => {
  console.error("Doctor crashed:", error);
  process.exitCode = 1;
});
