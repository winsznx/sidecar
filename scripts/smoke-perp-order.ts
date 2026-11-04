import { existsSync } from "node:fs";
import { parseArgs } from "node:util";

import { createTestClient, createWalletClient, formatEther, formatUnits, getAddress, http, isAddress, parseUnits, type Address, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { createPerpsAdapter, type PerpsAdapter } from "../lib/dreamdex/adapter";
import { bindSigner, createMarkets } from "../lib/dreamdex/client";
import {
  isLoopbackUrl,
  MIN_GAS_BALANCE_FOR_ORDER_WEI,
  readPublicEnvOverrides,
  resolveNetworkConfig,
  resolveReceiptTimeoutMs,
  sidecarChain,
  usesLocalEndpoint,
  type NetworkConfig,
} from "../lib/dreamdex/config";
import { classifyError } from "../lib/dreamdex/errors";
import { toJsonSafe } from "../lib/dreamdex/normalize";
import { createTimingRecorder } from "../lib/dreamdex/timing";
import type { AccountSnapshot, MarketMeta, OrderIntent, OrderSide, RouteQuote, TimeInForce, VerifiedDeposit, VerifiedOrder } from "../lib/dreamdex/types";

const USAGE = `Usage: npm run smoke:order -- [options]

Builds and previews one perp order. Nothing is sent unless --execute is passed.

  --market BTC          base symbol (default BTC)
  --side long|short     default long
  --size 0.00013        base units in human form (default: market minimum)
  --price 70000         limit price in human form (default: priced from the book, see --tif)
  --tif GTC|IOC|FOK|POST_ONLY
                        default GTC. Default prices: GTC/POST_ONLY rest 5% away from the mark;
                        IOC/FOK cross the best opposite level by 0.5%
  --execute             send the order, wait for the receipt and reconcile it
  --deposit 25          first move exactly this much collateral (human units) from the signer's
                        wallet into the signer's own MarginBank account (exact approval, never
                        unlimited), then quote and send the order. Previewed unless --execute
  --counterpart 0x...   the other account, checked for not funding this order
  --account 0x...       preview as this address without a key (cannot --execute). With
                        SIDECAR_SMOKE_PRIVATE_KEY also set, it must match the key's address
  --impersonate 0x...   local fork only: send as this address through anvil impersonation
  --rpc URL --ws URL --indexer URL --explorer URL   network overrides
  --timeout MS          receipt wait in ms (default NEXT_PUBLIC_SIDECAR_RECEIPT_TIMEOUT_MS or 60000)
  --json                print the result as JSON

Signing key: SIDECAR_SMOKE_PRIVATE_KEY from the environment or .env.local. It is never printed.`;

const EXIT = { ok: 0, error: 1, refused: 2, unknownOutcome: 3, reverted: 4 } as const;

function isPrivateKeyHex(value: string): value is `0x${string}` {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

function alignDown(value: bigint, step: bigint): bigint {
  return (value / step) * step;
}

function alignUp(value: bigint, step: bigint): bigint {
  return ((value + step - 1n) / step) * step;
}

function parseOnGrid(input: string, decimals: number, step: bigint, what: string): bigint {
  const raw = parseUnits(input, decimals);
  if (raw <= 0n) throw new Error(`${what} must be greater than zero.`);
  if (raw % step !== 0n) throw new Error(`${what} ${input} is not on the grid (step ${formatUnits(step, decimals)}).`);
  return raw;
}

interface Signer {
  walletClient: WalletClient;
  address: Address;
  canSend: boolean;
  mode: "private-key" | "impersonated" | "preview-only";
}

async function resolveSigner(network: NetworkConfig, values: { account?: string; impersonate?: string }): Promise<Signer> {
  const chain = sidecarChain(network);
  const transport = http(network.rpcUrl);
  if (values.impersonate) {
    if (!isAddress(values.impersonate, { strict: false })) throw new Error(`--impersonate is not an address: ${values.impersonate}`);
    if (!isLoopbackUrl(network.rpcUrl)) throw new Error("--impersonate is only allowed against a local fork RPC (127.0.0.1 or localhost).");
    const address = getAddress(values.impersonate);
    await createTestClient({ chain, mode: "anvil", transport }).impersonateAccount({ address });
    return { walletClient: createWalletClient({ account: address, chain, transport }), address, canSend: true, mode: "impersonated" };
  }
  const key = process.env.SIDECAR_SMOKE_PRIVATE_KEY?.trim();
  if (key) {
    if (!isPrivateKeyHex(key)) throw new Error("SIDECAR_SMOKE_PRIVATE_KEY is set but is not a 32-byte 0x-prefixed hex key.");
    const account = privateKeyToAccount(key);
    if (values.account !== undefined && (!isAddress(values.account, { strict: false }) || getAddress(values.account) !== account.address)) {
      throw new Error(`--account ${values.account} is not the address of SIDECAR_SMOKE_PRIVATE_KEY (${account.address}); unset one of them.`);
    }
    return { walletClient: createWalletClient({ account, chain, transport }), address: account.address, canSend: true, mode: "private-key" };
  }
  if (values.account) {
    if (!isAddress(values.account, { strict: false })) throw new Error(`--account is not an address: ${values.account}`);
    const address = getAddress(values.account);
    // A JSON-RPC account lets the SDK build calldata for this address; it can never sign here.
    return { walletClient: createWalletClient({ account: address, chain, transport }), address, canSend: false, mode: "preview-only" };
  }
  throw new Error("Set SIDECAR_SMOKE_PRIVATE_KEY (a throwaway testnet key in .env.local) or pass --account 0x... to preview.");
}

async function defaultPrice(adapter: PerpsAdapter, market: MarketMeta, side: OrderSide, tif: TimeInForce): Promise<bigint> {
  const [health, top] = await Promise.all([adapter.getMarketHealth(market.pool), adapter.getBookTop(market)]);
  const tick = market.tickSize;
  if (tif === "IOC" || tif === "FOK") {
    const level = side === "long" ? top.bestAsk : top.bestBid;
    if (level === null) throw new Error(`The ${side === "long" ? "ask" : "bid"} side of the book is empty; pass --price.`);
    return side === "long" ? alignUp((level * 1005n) / 1000n, tick) : alignDown((level * 995n) / 1000n, tick);
  }
  if (!health.snapshot.ok) throw new Error(`No live mark to price a resting order from (${health.snapshot.reason}); pass --price.`);
  const mark = health.snapshot.value.markPrice;
  if (side === "long") {
    const away = alignDown((mark * 95n) / 100n, tick);
    return top.bestAsk !== null && away >= top.bestAsk ? alignDown(top.bestAsk - tick, tick) : away;
  }
  const away = alignUp((mark * 105n) / 100n, tick);
  return top.bestBid !== null && away <= top.bestBid ? alignUp(top.bestBid + tick, tick) : away;
}

function preflightProblems(quote: RouteQuote, snapshot: AccountSnapshot, intent: OrderIntent): string[] {
  const problems: string[] = [];
  if (!quote.priceable) problems.push("The market is not priceable right now.");
  if (quote.margin === null) problems.push("No margin preview, so acceptance cannot be checked.");
  else {
    if (!quote.margin.sufficient) problems.push("The margin preview says the pool would reject this order.");
    if (quote.margin.mainWalletPull > 0n) problems.push(`A linked main wallet (${quote.margin.fundingPayer}) would fund part of this order.`);
  }
  if (quote.maxSize === null) problems.push("No max-size preview.");
  else if (!quote.maxSize.placeable || intent.quantity > quote.maxSize.maxQuantity) {
    problems.push(`Max placeable size is ${quote.maxSize.maxQuantity} raw units (limited by ${quote.maxSize.limitedBy ?? "unknown"}).`);
  }
  if (snapshot.gasBalance === null) problems.push("The STT balance could not be read.");
  else if (snapshot.gasBalance < MIN_GAS_BALANCE_FOR_ORDER_WEI) {
    problems.push(`The wallet holds ${formatEther(snapshot.gasBalance)} STT; the node requires ${formatEther(MIN_GAS_BALANCE_FOR_ORDER_WEI)} STT up front.`);
  }
  problems.push(...quote.errors);
  return problems;
}

function describeSnapshot(label: string, snap: AccountSnapshot, market: MarketMeta): string {
  const margin = snap.margin;
  const position = snap.positions.find((p) => p.pool.toLowerCase() === market.pool.toLowerCase());
  return [
    `${label} @ block ${snap.block} (${snap.readStatus})`,
    margin ? `  margin: equity ${formatEther(margin.equity)} unlocked ${formatEther(margin.unlockedCollateral)} locked ${formatEther(margin.lockedCollateral)} USDso, ${margin.status}` : "  margin: unavailable",
    `  ${market.displaySymbol} position: ${position ? `${position.side} ${formatUnits(position.size < 0n ? -position.size : position.size, market.baseDecimals)} @ ${formatUnits(position.entryPrice, market.quoteDecimals)}` : "none"}`,
    `  open orders: ${snap.openOrders.status === "ok" ? snap.openOrders.orders.length : "unavailable"}, STT ${snap.gasBalance === null ? "unavailable" : formatEther(snap.gasBalance)}`,
  ].join("\n");
}

function printDeposit(verified: VerifiedDeposit, market: MarketMeta, local: boolean): void {
  const fmt = (raw: bigint | null): string => (raw === null ? "unknown" : formatUnits(raw, market.quoteDecimals));
  console.log(`\nDeposit: ${verified.outcome}${verified.revertReason ? ` (${verified.revertReason})` : ""}`);
  console.log(`  requested ${fmt(verified.requestedAmount)}, credited ${fmt(verified.creditedAmount)}, transferred ${fmt(verified.transferredAmount)} ${market.quoteSymbol}`);
  console.log(`  receipt ${verified.receiptStatus}, block ${verified.block}, gas used ${verified.gasUsed}, fee ${verified.feePaid === null ? "unknown" : formatEther(verified.feePaid)} STT`);
  console.log(`  explorer: ${verified.explorerUrl}${local ? " (local fork: this hash exists only on the fork)" : ""}`);
  for (const check of verified.checks) console.log(`  ${check.status.toUpperCase().padEnd(7)} ${check.label}: ${check.detail}`);
}

async function runDeposit(
  adapter: PerpsAdapter,
  signer: Signer,
  market: MarketMeta,
  amount: bigint,
  execute: boolean,
  timeoutMs: number,
  phase: (name: string, detail?: string) => void,
  local: boolean,
): Promise<number | null> {
  const built = await adapter.buildMarginDeposit({ account: signer.address, amount, market });
  const fmt = (raw: bigint): string => formatUnits(raw, market.quoteDecimals);
  console.log(`\nDeposit ${fmt(amount)} ${market.quoteSymbol} from ${built.account}'s wallet into its own MarginBank account (${built.marginBank})`);
  console.log(`  wallet @ block ${built.block}: balance ${fmt(built.walletBalance)}, allowance to the bank ${fmt(built.allowance)}`);
  console.log(`  ${built.approval ? `approval: approve(${built.marginBank}, ${built.amount}) on ${built.collateralToken}` : "approval: not needed, the allowance covers it"}`);
  console.log(`  deposit: ${built.deposit.description}`);
  if (!execute) return null;
  phase("DEPOSIT_AWAITING_WALLET");
  const sent = await adapter.sendMarginDeposit({
    walletClient: signer.walletClient,
    account: signer.address,
    built,
    approvalTimeoutMs: timeoutMs,
    onSubmitted: (step, hash) => phase(step === "approval" ? "APPROVAL_SUBMITTED" : "DEPOSIT_SUBMITTED", hash),
  });
  if (sent.approval) phase("APPROVAL_RECEIPT", `${sent.approval.wait.status} after ${Math.round(sent.approval.wait.waitedMs)} ms, before the deposit was sent`);
  if (sent.status === "approval-not-confirmed") {
    console.log(`The approval did not confirm (${sent.approval.wait.status}); the deposit was not sent. Look up ${sent.approval.hash} before retrying.`);
    return sent.approval.wait.status === "reverted" ? EXIT.reverted : EXIT.unknownOutcome;
  }
  const wait = await adapter.waitForReceipt(sent.depositHash, { timeoutMs });
  if (wait.status !== "success" && wait.status !== "reverted") {
    phase("DEPOSIT_UNKNOWN_OUTCOME", wait.status);
    console.log(`Do not resend. Look up ${sent.depositHash} first.`);
    return EXIT.unknownOutcome;
  }
  phase(wait.status === "success" ? "DEPOSIT_MINED_SUCCESS" : "DEPOSIT_MINED_REVERTED", `block ${wait.block}, gas ${wait.gasUsed}, waited ${Math.round(wait.waitedMs)} ms`);
  const verified = await adapter.reconcileDeposit(sent.depositHash, { account: signer.address, marginBank: built.marginBank, collateralToken: built.collateralToken });
  printDeposit(verified, market, local);
  if (verified.outcome === "REVERTED") return EXIT.reverted;
  if (verified.outcome !== "CREDITED") return EXIT.error;
  return null;
}

function printVerified(verified: VerifiedOrder, market: MarketMeta, local: boolean): void {
  console.log(`\nOutcome: ${verified.outcome}${verified.revertReason ? ` (${verified.revertReason})` : ""}`);
  console.log(`  receipt ${verified.receiptStatus}, block ${verified.block}, gas used ${verified.gasUsed}, fee ${verified.feePaid === null || verified.feePaid === undefined ? "unknown" : formatEther(verified.feePaid)} STT`);
  console.log(`  filled ${formatUnits(verified.filledQuantity, market.baseDecimals)} ${market.baseSymbol} in ${verified.fills.length} fill(s); resting order id ${verified.orderId ?? "none"}`);
  console.log(`  explorer: ${verified.explorerUrl}${local ? " (local fork: this hash exists only on the fork)" : ""}`);
  console.log("Truth checks:");
  for (const check of verified.checks) console.log(`  ${check.status.toUpperCase().padEnd(7)} ${check.label}: ${check.detail}`);
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      market: { type: "string", default: "BTC" },
      side: { type: "string", default: "long" },
      size: { type: "string" },
      price: { type: "string" },
      tif: { type: "string", default: "GTC" },
      execute: { type: "boolean", default: false },
      counterpart: { type: "string" },
      account: { type: "string" },
      impersonate: { type: "string" },
      rpc: { type: "string" },
      ws: { type: "string" },
      indexer: { type: "string" },
      explorer: { type: "string" },
      deposit: { type: "string" },
      timeout: { type: "string" },
      json: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    console.log(USAGE);
    return EXIT.ok;
  }
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");

  const side = values.side;
  if (side !== "long" && side !== "short") throw new Error(`--side must be long or short, got ${side}`);
  const tif = values.tif.toUpperCase();
  if (tif !== "GTC" && tif !== "IOC" && tif !== "FOK" && tif !== "POST_ONLY") throw new Error(`--tif must be GTC, IOC, FOK or POST_ONLY, got ${values.tif}`);
  if (values.counterpart !== undefined && !isAddress(values.counterpart, { strict: false })) throw new Error(`--counterpart is not an address: ${values.counterpart}`);
  // Resolved here, after .env.local is loaded, so its NEXT_PUBLIC_SIDECAR_RECEIPT_TIMEOUT_MS applies.
  const timeoutMs = values.timeout === undefined ? resolveReceiptTimeoutMs(process.env.NEXT_PUBLIC_SIDECAR_RECEIPT_TIMEOUT_MS) : Number(values.timeout);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error(`--timeout must be a positive integer of milliseconds.`);

  const network = resolveNetworkConfig({
    ...readPublicEnvOverrides(),
    rpcUrl: values.rpc,
    wsUrl: values.ws,
    indexerUrl: values.indexer,
    explorerUrl: values.explorer,
  });
  const local = usesLocalEndpoint(network);
  const timing = createTimingRecorder();
  const markets = createMarkets(network);
  const adapter = createPerpsAdapter(markets, { network, timing });
  const started = performance.now();
  const phase = (name: string, detail = ""): void => {
    console.log(`[+${Math.round(performance.now() - started)} ms] ${name}${detail ? ` ${detail}` : ""}`);
  };

  try {
    const signer = await resolveSigner(network, values);
    console.log(`Network ${network.rpcUrl}${local ? " (local fork)" : ""}; signer ${signer.address} (${signer.mode})`);
    if (values.execute && !signer.canSend) throw new Error("--execute needs SIDECAR_SMOKE_PRIVATE_KEY or --impersonate; --account is preview-only.");

    phase("QUOTING");
    const chain = await adapter.getChainStatus();
    if (!chain.matches) throw new Error(`RPC reports chain ${chain.chainId}, not ${chain.expectedChainId}.`);
    const listing = await adapter.getMarketListing();
    const market = listing.markets.find((m) => m.baseSymbol.toUpperCase() === values.market.toUpperCase());
    if (!market) throw new Error(`No listed market for ${values.market}. Listed: ${listing.markets.map((m) => m.baseSymbol).join(", ")}`);

    const quantity = values.size ? parseOnGrid(values.size, market.baseDecimals, market.lotSize, "Size") : market.minQuantity;
    if (quantity < market.minQuantity) throw new Error(`Size is below the market minimum ${formatUnits(market.minQuantity, market.baseDecimals)}.`);
    const price = values.price ? parseOnGrid(values.price, market.quoteDecimals, market.tickSize, "Price") : await defaultPrice(adapter, market, side, tif);
    const intent: OrderIntent = { pool: market.pool, side, quantity, price, timeInForce: tif };

    bindSigner(markets, signer.walletClient);
    if (values.deposit !== undefined) {
      const amount = parseUnits(values.deposit, market.quoteDecimals);
      if (amount <= 0n) throw new Error("--deposit must be greater than zero.");
      const stop = await runDeposit(adapter, signer, market, amount, values.execute, timeoutMs, phase, local);
      if (stop !== null) return stop;
    }
    const [before, quote] = await Promise.all([
      adapter.getAccountSnapshot(signer.address, market.marginBank, listing.markets),
      adapter.quoteRoute(signer.address, intent, market),
    ]);
    const built = await adapter.buildOrder(intent, market, { expectedSigner: signer.address });

    console.log(`\nOrder: ${side} ${formatUnits(quantity, market.baseDecimals)} ${market.displaySymbol} @ ${formatUnits(price, market.quoteDecimals)} ${market.quoteSymbol} ${tif}`);
    console.log(describeSnapshot("Before", before, market));
    console.log(`Preview @ block ${quote.block} (autoPull ${quote.autoPull}):`);
    if (quote.margin) {
      console.log(
        `  lock ${formatEther(quote.margin.lockAmount)} USDso (IM ${formatEther(quote.margin.initialMarginPortion)}, adverse gap ${formatEther(quote.margin.adverseGapPortion)}), ` +
          `wallet top-up ${formatEther(quote.margin.topUpRequired)}, sufficient ${quote.margin.sufficient}`,
      );
    }
    if (quote.maxSize) console.log(`  max size ${formatUnits(quote.maxSize.maxQuantity, market.baseDecimals)} (limited by ${quote.maxSize.limitedBy}), placeable ${quote.maxSize.placeable}`);
    if (quote.projection?.projectedLiquidation) {
      const liq = quote.projection.projectedLiquidation;
      console.log(`  projected liquidation (estimate): ${liq.kind === "price" ? formatUnits(liq.price, market.quoteDecimals) : liq.kind}`);
    }
    for (const error of quote.errors) console.log(`  note: ${error}`);
    console.log(`Built: to ${built.to}, ${(built.data.length - 2) / 2} bytes calldata, gas ceiling ${built.gas}, order type ${built.orderType}`);

    const problems = preflightProblems(quote, before, intent);
    if (!values.execute) {
      phase("READY", problems.length ? `(preflight would refuse: ${problems.join(" ")})` : "(preflight passes)");
      console.log("\nPreview only. Nothing was sent. Re-run with --execute to send this order.");
      if (values.json) console.log(JSON.stringify(toJsonSafe({ intent, quote, built, before, problems }), null, 2));
      return EXIT.ok;
    }
    if (problems.length) {
      console.log(`\nRefusing to send:\n  ${problems.join("\n  ")}`);
      return EXIT.refused;
    }

    phase("AWAITING_WALLET_CONFIRMATION");
    const hash = await adapter.sendOrder({ walletClient: signer.walletClient, account: signer.address, built });
    phase("SUBMITTED", hash);
    const wait = await adapter.waitForReceipt(hash, { timeoutMs });
    if (wait.status === "timeout" || wait.status === "error" || wait.status === "replaced") {
      phase("UNKNOWN_OUTCOME", wait.status === "replaced" ? `replaced by ${wait.replacement}` : wait.status);
      console.log("Do not resend. Look the hash up first, for example: npm run evidence:capture -- --tx " + hash);
      return EXIT.unknownOutcome;
    }
    phase(wait.status === "success" ? "MINED_SUCCESS" : "MINED_REVERTED", `block ${wait.block}, gas ${wait.gasUsed}, waited ${Math.round(wait.waitedMs)} ms`);

    const verified = await adapter.reconcileOrder(hash, {
      markets: listing.markets,
      intent,
      expectedAccount: signer.address,
      counterpartAccount: values.counterpart ? getAddress(values.counterpart) : undefined,
    });
    phase(verified.outcome);
    printVerified(verified, market, local);
    const after = await adapter.getAccountSnapshot(signer.address, market.marginBank, listing.markets);
    phase("ACCOUNT_RECONCILED");
    console.log(describeSnapshot("After", after, market));
    if (values.json) console.log(JSON.stringify(toJsonSafe({ intent, quote, built, before, verified, after, latency: timing.summary() }), null, 2));
    return verified.receiptStatus === "reverted" ? EXIT.reverted : EXIT.ok;
  } finally {
    await markets.close();
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    const classified = classifyError(error);
    console.error(`smoke:order failed: ${classified.title}. ${classified.message}`);
    if (error instanceof Error && classified.code === "UNKNOWN") console.error(error.message);
    process.exitCode = EXIT.error;
  },
);
