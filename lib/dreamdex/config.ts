import { DEFAULT_FEES } from "@somnia-chain/markets-sdk";
import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains";
import { defineChain, getAddress, isHash, type Address, type Chain, type Hash } from "viem";

import { HIDEKI_CHAIN_ID, type HidekiChainId } from "./types";

/** The SDK version package.json pins. The doctor compares the installed copy against it. */
export const EXPECTED_SDK_VERSION = "0.32.1";

export interface NetworkConfig {
  chainId: HidekiChainId;
  /** HTTP JSON-RPC, used by wallets and scripts. */
  rpcUrl: string;
  /** WebSocket JSON-RPC. The SDK's only chain transport. */
  wsUrl: string;
  /** Indexer GraphQL endpoint (history only). */
  indexerUrl: string;
  /** Explorer base for the Tokyo (Hideki) view, without a trailing slash. */
  explorerUrl: string;
}

export interface NetworkOverrides {
  rpcUrl?: string;
  wsUrl?: string;
  indexerUrl?: string;
  explorerUrl?: string;
}

export const HIDEKI_DEFAULTS: NetworkConfig = {
  chainId: HIDEKI_CHAIN_ID,
  rpcUrl: "https://api.hideki2.infra.testnet.somnia.network",
  wsUrl: "wss://api.hideki2.infra.testnet.somnia.network/ws",
  indexerUrl: "https://hideki-dev.smk.somnia.host/v1/graphql",
  explorerUrl: "https://explorer.testnet.somnia.network/tokyo",
};

type UrlKind = "http" | "ws" | "http-or-relative";

function validateUrl(field: keyof NetworkOverrides, value: string, kind: UrlKind): string {
  if (kind === "http-or-relative" && value.startsWith("/")) return value;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid ${field} override "${value}": not a URL.`);
  }
  const allowed = kind === "ws" ? ["ws:", "wss:"] : ["http:", "https:"];
  if (!allowed.includes(parsed.protocol)) {
    throw new Error(`Invalid ${field} override "${value}": expected ${allowed.join(" or ")}.`);
  }
  return value;
}

/** Defaults overlaid with any non-empty overrides. A malformed override throws rather than silently falling back. */
export function resolveNetworkConfig(overrides: NetworkOverrides = {}): NetworkConfig {
  const pick = (field: keyof NetworkOverrides, kind: UrlKind): string => {
    const raw = overrides[field]?.trim();
    return raw ? validateUrl(field, raw, kind) : HIDEKI_DEFAULTS[field];
  };
  return {
    chainId: HIDEKI_CHAIN_ID,
    rpcUrl: pick("rpcUrl", "http"),
    wsUrl: pick("wsUrl", "ws"),
    indexerUrl: pick("indexerUrl", "http-or-relative"),
    explorerUrl: pick("explorerUrl", "http").replace(/\/+$/, ""),
  };
}

/** True for localhost, 127.0.0.0/8, 0.0.0.0 and ::1. A relative or unparseable URL is not a loopback host. */
export function isLoopbackUrl(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return host === "localhost" || host.endsWith(".localhost") || host === "0.0.0.0" || host === "[::1]" || host === "::1" || /^127(\.\d{1,3}){3}$/.test(host);
}

/**
 * The SDK reads chain state over the WebSocket and history from the indexer, while wallets use the HTTP RPC,
 * so any one of them pointing at a local node (an anvil fork keeps chain id 50383) makes the run local.
 */
export function usesLocalEndpoint(network: Pick<NetworkConfig, "rpcUrl" | "wsUrl" | "indexerUrl">): boolean {
  return isLoopbackUrl(network.rpcUrl) || isLoopbackUrl(network.wsUrl) || isLoopbackUrl(network.indexerUrl);
}

/** Each variable is referenced literally so Next.js can inline it into the browser bundle. */
export function readPublicEnvOverrides(): NetworkOverrides {
  return {
    rpcUrl: process.env.NEXT_PUBLIC_SIDECAR_RPC_URL,
    wsUrl: process.env.NEXT_PUBLIC_SIDECAR_WS_URL,
    indexerUrl: process.env.NEXT_PUBLIC_SIDECAR_INDEXER_URL,
    explorerUrl: process.env.NEXT_PUBLIC_SIDECAR_EXPLORER_URL,
  };
}

export const NETWORK: NetworkConfig = resolveNetworkConfig(readPublicEnvOverrides());

/** The SDK's Hideki definition with Sidecar's endpoints, so overrides reach both the SDK and wallets. */
export function sidecarChain(network: NetworkConfig = NETWORK): Chain {
  return defineChain({
    ...hidekiTestnet,
    rpcUrls: { default: { http: [network.rpcUrl], webSocket: [network.wsUrl] } },
    blockExplorers: { default: { name: "Somnia Explorer (Tokyo testnet)", url: network.explorerUrl } },
  });
}

/** The SDK's fixed gas ceiling for every write; it never estimates gas. Unused gas is not charged. */
export const PERP_ORDER_GAS_LIMIT = 10_000_000n;

/** The SDK's own fee envelope (`DEFAULT_FEES`), the same values its wallet path passes. */
export const PERP_ORDER_FEES = {
  maxFeePerGas: DEFAULT_FEES.maxFeePerGas,
  maxPriorityFeePerGas: DEFAULT_FEES.maxPriorityFeePerGas,
} as const;

/**
 * The node only admits a transaction whose sender holds gas x maxFeePerGas (0.6 STT here).
 * The amount actually spent is far lower; docs/sdk-notes.md records the measured range.
 */
export const MIN_GAS_BALANCE_FOR_ORDER_WEI: bigint = PERP_ORDER_GAS_LIMIT * PERP_ORDER_FEES.maxFeePerGas;

/** The SDK's wallet path gives up on a receipt after 60 s; Sidecar uses the same default deadline. */
export const DEFAULT_RECEIPT_TIMEOUT_MS = 60_000;

/** A positive whole number of milliseconds, or the default when unset. A malformed value throws rather than silently falling back. */
export function resolveReceiptTimeoutMs(raw: string | undefined): number {
  const value = raw?.trim();
  if (!value) return DEFAULT_RECEIPT_TIMEOUT_MS;
  const parsed = /^\d+$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid NEXT_PUBLIC_SIDECAR_RECEIPT_TIMEOUT_MS "${value}": expected a positive whole number of milliseconds.`);
  }
  return parsed;
}

/** How long to wait for a receipt before reporting UNKNOWN_OUTCOME. Override with NEXT_PUBLIC_SIDECAR_RECEIPT_TIMEOUT_MS. */
export const RECEIPT_TIMEOUT_MS: number = resolveReceiptTimeoutMs(process.env.NEXT_PUBLIC_SIDECAR_RECEIPT_TIMEOUT_MS);

/** The SDK sends every write, deposits and approvals included, with the same fixed ceiling as orders. */
export const MARGIN_DEPOSIT_GAS_LIMIT: bigint = PERP_ORDER_GAS_LIMIT;

export function explorerTxUrl(hash: Hash, network: NetworkConfig = NETWORK): string {
  if (!isHash(hash)) throw new Error(`Not a transaction hash: ${String(hash)}`);
  return `${network.explorerUrl}/tx/${hash.toLowerCase()}`;
}

export function explorerAddressUrl(address: Address, network: NetworkConfig = NETWORK): string {
  return `${network.explorerUrl}/address/${getAddress(address)}`;
}
