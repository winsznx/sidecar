import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { createPublicClient, getAddress, http, isAddress, isHash, type Address, type Hash } from "viem";

import {
  entryFromRecord,
  parseProofIndex,
  PROOF_INDEX_FILE,
  recordFileName,
  serializeProofIndex,
  upsertProofIndex,
  type ProofIndex,
} from "../components/evidence/proof-index";
import { createPerpsAdapter, type PerpsAdapter } from "../lib/dreamdex/adapter";
import { createMarkets } from "../lib/dreamdex/client";
import { HIDEKI_DEFAULTS, readPublicEnvOverrides, resolveNetworkConfig, usesLocalEndpoint, type NetworkConfig } from "../lib/dreamdex/config";
import { classifyError } from "../lib/dreamdex/errors";
import { proofWriteRefusal } from "../lib/dreamdex/evidence-guard";
import { toJsonSafe } from "../lib/dreamdex/normalize";
import { createTimingRecorder } from "../lib/dreamdex/timing";
import type {
  AccountAtBlock,
  MarginEventRecord,
  MarketMeta,
  ProofAccountRecord,
  ProofAccountState,
  ProofEvidenceRecord,
  VerifiedOrder,
} from "../lib/dreamdex/types";

const PROOF_DIR = "public/proof";

const USAGE = `Usage: npm run evidence:capture -- --tx 0x<hash> [--selected 0x...] [--account-a 0x...] [--account-b 0x...] [--out-dir public/proof]

Reconciles a mined order from chain reads, writes public/proof/<hash>.json and adds it to
public/proof/index.json, the list the proof page shows.
  --selected 0x...   the account that was meant to send the order; the sender check fails if another one did.
                     Without it the sender check is reported as unknown.
  --account-a/-b     the accounts being compared; any that is not the selected account is read as a counterpart.
  --rpc --ws --indexer --explorer   network overrides. A record goes under public/proof only when every
                     endpoint is remote and the default Hideki RPC confirms the mined block's hash.`;

function readInstalledSdkVersion(): string {
  try {
    const raw: unknown = JSON.parse(readFileSync(join(process.cwd(), "node_modules/@somnia-chain/markets-sdk/package.json"), "utf8"));
    return typeof raw === "object" && raw !== null && "version" in raw && typeof raw.version === "string" ? raw.version : "unknown";
  } catch {
    return "unknown";
  }
}

function parseAddress(value: string | undefined, flag: string): Address | null {
  if (value === undefined) return null;
  if (!isAddress(value, { strict: false })) throw new Error(`${flag} is not an address: ${value}`);
  return getAddress(value);
}

function toAccountState(read: AccountAtBlock): ProofAccountState {
  return {
    block: read.block.toString(),
    equity: read.equity.ok ? read.equity.value.equity.toString() : null,
    lockedCollateral: read.equity.ok ? read.equity.value.lockedCollateral.toString() : null,
    totalEquity: read.equity.ok ? read.equity.value.totalEquity.toString() : null,
    openOrderCount: read.openOrders.ok ? read.openOrders.value.length : null,
    gasBalance: read.gasBalance.ok ? read.gasBalance.value.toString() : null,
    issues: [...read.issues, ...(read.positions.ok ? [] : [read.positions.reason])],
  };
}

/**
 * The index next to the records, or null when none exists yet. A malformed index is an error rather
 * than something to overwrite, because it may hold entries nobody else has a copy of.
 */
function readExistingIndex(outDir: string): ProofIndex | null {
  const path = join(outDir, PROOF_INDEX_FILE);
  if (!existsSync(path)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error: unknown) {
    throw new Error(`${path} is not valid JSON (${error instanceof Error ? error.message : String(error)}). Fix or move it, then capture again.`);
  }
  const parsed = parseProofIndex(raw);
  if (!parsed.ok) throw new Error(`${path} is not a proof index: ${parsed.reason} Fix or move it, then capture again.`);
  if (parsed.rejected.length > 0) {
    throw new Error(
      `${path} has entries the proof page would reject (${parsed.rejected.map((row) => `#${row.position + 1} ${row.reason}`).join("; ")}). Fix or move it, then capture again.`,
    );
  }
  return parsed.index;
}

function serializeMarginEvent(event: MarginEventRecord): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(event)) out[key] = typeof value === "bigint" ? value.toString() : String(value);
  return out;
}

async function readAccount(
  adapter: PerpsAdapter,
  role: ProofAccountRecord["role"],
  address: Address,
  verified: VerifiedOrder,
  markets: readonly MarketMeta[],
): Promise<ProofAccountRecord> {
  const market = verified.market;
  if (!market) return { role, address, before: null, after: null };
  const pools = markets.filter((m) => m.marginBank.toLowerCase() === market.marginBank.toLowerCase()).map((m) => m.pool);
  const options = { pools, collateralToken: market.quoteToken };
  const [before, after] = await Promise.all([
    adapter.readAccountAtBlock(address, market.marginBank, verified.block - 1n, options),
    adapter.readAccountAtBlock(address, market.marginBank, verified.block, options),
  ]);
  return { role, address, before: toAccountState(before), after: toAccountState(after) };
}

type CanonicalBlock = NonNullable<ProofEvidenceRecord["network"]["canonicalBlock"]>;

/** The block hash the default Hideki RPC reports for `block`, or `null` when it cannot be read. */
async function readDefaultRpcBlockHash(block: bigint): Promise<Hash | null> {
  try {
    const found = await createPublicClient({ transport: http(HIDEKI_DEFAULTS.rpcUrl) }).getBlock({ blockNumber: block });
    return found.hash;
  } catch (error: unknown) {
    console.warn(`Could not read block ${block} from the default Hideki RPC: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function buildRecord(verified: VerifiedOrder, accounts: ProofAccountRecord[], network: NetworkConfig, canonicalBlock: CanonicalBlock): ProofEvidenceRecord {
  const market = verified.market;
  return {
    schema: "sidecar.proof.v1",
    kind: "recorded-execution",
    recordedAt: new Date().toISOString(),
    network: {
      chainId: verified.chainId,
      rpcUrl: network.rpcUrl,
      wsUrl: network.wsUrl,
      indexerUrl: network.indexerUrl,
      explorerUrl: network.explorerUrl,
      sdkVersion: readInstalledSdkVersion(),
      canonicalBlock,
    },
    tx: {
      hash: verified.hash,
      explorerUrl: verified.explorerUrl,
      from: verified.from,
      to: verified.to,
      block: verified.block.toString(),
      blockTimestamp: verified.blockTimestamp ?? null,
      receiptStatus: verified.receiptStatus,
      gasUsed: verified.gasUsed.toString(),
      feePaidWei: verified.feePaid === null || verified.feePaid === undefined ? null : verified.feePaid.toString(),
    },
    market: market
      ? { pool: market.pool, displaySymbol: market.displaySymbol, marginBank: market.marginBank, baseDecimals: market.baseDecimals, quoteDecimals: market.quoteDecimals }
      : null,
    requested: verified.requested
      ? {
          side: verified.requested.side,
          quantity: verified.requested.quantity.toString(),
          price: verified.requested.price.toString(),
          timeInForce: verified.requested.timeInForce,
        }
      : null,
    outcome: verified.outcome,
    orderId: verified.placement ? verified.placement.orderId.toString() : null,
    filledQuantity: verified.filledQuantity.toString(),
    fills: verified.fills.map((fill) => ({
      makerOrderId: fill.makerOrderId.toString(),
      takerOrderId: fill.takerOrderId.toString(),
      quantity: fill.quantity.toString(),
      price: fill.price.toString(),
    })),
    revertReason: verified.revertReason,
    checks: verified.checks,
    marginEvents: (verified.marginEvents ?? []).map(serializeMarginEvent),
    accounts,
  };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      tx: { type: "string" },
      selected: { type: "string" },
      "account-a": { type: "string" },
      "account-b": { type: "string" },
      "out-dir": { type: "string", default: PROOF_DIR },
      rpc: { type: "string" },
      ws: { type: "string" },
      indexer: { type: "string" },
      explorer: { type: "string" },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help || !values.tx) {
    console.log(USAGE);
    process.exitCode = values.help ? 0 : 2;
    return;
  }
  if (!isHash(values.tx)) throw new Error(`--tx is not a transaction hash: ${values.tx}`);
  const hash: Hash = values.tx;
  const selected = parseAddress(values.selected, "--selected");
  const accountA = parseAddress(values["account-a"], "--account-a");
  const accountB = parseAddress(values["account-b"], "--account-b");

  const network = resolveNetworkConfig({
    ...readPublicEnvOverrides(),
    rpcUrl: values.rpc,
    wsUrl: values.ws,
    indexerUrl: values.indexer,
    explorerUrl: values.explorer,
  });
  const local = usesLocalEndpoint(network);
  const outDir = values["out-dir"];
  if (local) {
    const refusal = proofWriteRefusal({ outDir, proofDir: PROOF_DIR, local, canonicalBlockMatches: null });
    if (refusal) throw new Error(`Refusing to write: ${refusal} Pass --out-dir to a scratch directory.`);
  }
  const markets = createMarkets(network);
  const adapter = createPerpsAdapter(markets, { network, timing: createTimingRecorder() });
  try {
    const [listing, tx] = await Promise.all([adapter.getMarketListing(), markets.client.getViemClient().getTransaction({ hash })]);
    const sender = getAddress(tx.from);
    if (selected === null) console.warn("Note: no --selected account was given, so the sender check is reported as unknown.");
    else if (selected.toLowerCase() !== sender.toLowerCase()) console.warn(`Note: ${sender} sent this transaction, not the selected account ${selected}.`);
    const primary = selected ?? sender;
    const counterparts = [...new Set([accountA, accountB, sender].filter((a): a is Address => a !== null && a.toLowerCase() !== primary.toLowerCase()))];
    const verified = await adapter.reconcileOrder(hash, {
      markets: listing.markets,
      expectedAccount: selected ?? undefined,
      counterpartAccount: [accountA, accountB].find((a): a is Address => a !== null && a.toLowerCase() !== primary.toLowerCase()),
    });

    const defaultRpcHash = await readDefaultRpcBlockHash(verified.block);
    const readHash = tx.blockHash;
    const canonicalBlock: CanonicalBlock = {
      number: verified.block.toString(),
      hash: readHash,
      defaultRpcHash,
      matches: readHash !== null && defaultRpcHash !== null && readHash.toLowerCase() === defaultRpcHash.toLowerCase(),
    };
    const refusal = proofWriteRefusal({ outDir, proofDir: PROOF_DIR, local, canonicalBlockMatches: defaultRpcHash === null ? null : canonicalBlock.matches });
    if (refusal) throw new Error(`Refusing to write: ${refusal} Pass --out-dir to a scratch directory.`);

    // Only the proof directory's own index is the list the proof page shows; scratch runs leave no index.
    const maintainsIndex = resolve(outDir) === resolve(PROOF_DIR);
    const existingIndex = maintainsIndex ? readExistingIndex(outDir) : null;
    const accounts = await Promise.all([
      readAccount(adapter, "selected", primary, verified, listing.markets),
      ...counterparts.map((address) => readAccount(adapter, "counterpart", address, verified, listing.markets)),
    ]);
    const record = buildRecord(verified, accounts, network, canonicalBlock);

    mkdirSync(outDir, { recursive: true });
    const path = join(outDir, recordFileName(hash));
    writeFileSync(path, `${JSON.stringify(toJsonSafe(record), null, 2)}\n`);
    console.log(`Wrote ${path}`);
    if (maintainsIndex) {
      const index = upsertProofIndex(existingIndex, entryFromRecord(record, { selectedGiven: selected !== null, account: primary, accountA, accountB }), new Date());
      const indexPath = join(outDir, PROOF_INDEX_FILE);
      writeFileSync(indexPath, serializeProofIndex(index));
      console.log(`Updated ${indexPath} (${index.records.length} record${index.records.length === 1 ? "" : "s"})`);
    } else {
      console.log(`Not added to ${join(PROOF_DIR, PROOF_INDEX_FILE)}: the record was written outside the proof directory.`);
    }
    console.log(`  ${verified.outcome} on ${verified.market?.displaySymbol ?? verified.to ?? "unknown target"}, block ${verified.block}, sender ${sender}`);
    for (const check of verified.checks) console.log(`  ${check.status.toUpperCase().padEnd(7)} ${check.label}`);
  } finally {
    await markets.close();
  }
}

main().catch((error: unknown) => {
  const classified = classifyError(error);
  console.error(`evidence:capture failed: ${classified.title}. ${classified.message}`);
  if (error instanceof Error && classified.code === "UNKNOWN") console.error(error.message);
  process.exitCode = 1;
});
