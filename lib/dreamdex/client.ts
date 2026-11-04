import { SOMNIA_HIDEKI_TESTNET_ADDRESSES, SomniaMarkets } from "@somnia-chain/markets-sdk";
import { getAddress, type Address, type PublicClient, type WalletClient } from "viem";

import { NETWORK, sidecarChain, type NetworkConfig } from "./config";
import { SidecarAdapterError } from "./errors";
import { HIDEKI_CHAIN_ID } from "./types";

/**
 * A read-only SDK root for one network. Construction opens nothing: the SDK dials its
 * WebSocket on the first chain read. Signers are bound later with `bindSigner`.
 */
export function createMarkets(network: NetworkConfig = NETWORK): SomniaMarkets {
  return new SomniaMarkets({
    chain: sidecarChain(network),
    wsRpcUrl: network.wsUrl,
    indexerUrl: network.indexerUrl,
    addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES,
  });
}

let browserMarkets: SomniaMarkets | null = null;

/**
 * The browser's shared SDK root, created on first use. Never built during module import or
 * on the server, where a render would otherwise open a chain socket per request.
 */
export function getBrowserMarkets(): SomniaMarkets {
  if (typeof window === "undefined") {
    throw new Error("getBrowserMarkets() runs in the browser only. Use createMarkets() in scripts and tests.");
  }
  browserMarkets ??= createMarkets();
  return browserMarkets;
}

/** Close the browser root's sockets and forget it, so the next call starts fresh. */
export async function resetBrowserMarkets(): Promise<void> {
  const current = browserMarkets;
  browserMarkets = null;
  if (current) await current.close();
}

/**
 * Bind a wallet as the SDK's signer and return the address it now trades as. The SDK
 * itself accepts a wallet on any chain, so the chain is checked here, before binding.
 */
export function bindSigner(markets: SomniaMarkets, walletClient: WalletClient): Address {
  const account = walletClient.account?.address;
  if (!account) throw new SidecarAdapterError("SIGNER_MISSING", "The wallet client has no account to sign with.");
  const walletChainId = walletClient.chain?.id ?? null;
  if (walletChainId !== HIDEKI_CHAIN_ID) {
    throw new SidecarAdapterError("WRONG_CHAIN", `The wallet is on chain ${walletChainId ?? "unknown"}.`, {
      expectedChainId: HIDEKI_CHAIN_ID,
      actualChainId: walletChainId,
    });
  }
  markets.setSigner({ walletClient });
  const bound = markets.walletAddress;
  if (!bound || bound.toLowerCase() !== account.toLowerCase()) {
    throw new SidecarAdapterError("SIGNER_MISMATCH", "The SDK did not bind the wallet's account.", {
      expectedAccount: getAddress(account),
      actualAccount: bound ?? null,
    });
  }
  return getAddress(bound);
}

/** Return the SDK to unauthenticated reads. */
export function unbindSigner(markets: SomniaMarkets): void {
  markets.setSigner({});
}

/** The SDK's own viem client, sharing its WebSocket rather than opening a second one. */
export function getPublicClient(markets: SomniaMarkets): PublicClient {
  return markets.client.getViemClient();
}
