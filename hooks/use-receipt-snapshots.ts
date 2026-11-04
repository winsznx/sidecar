"use client";

import { useQueries } from "@tanstack/react-query";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { Address, Hash } from "viem";

import { parseCapturedProof, proofStorageKey, type CapturedProofResult } from "@/components/evidence/captured-proof";
import { classifyError } from "@/lib/dreamdex/errors";
import type { AccountAtBlock, MarketMeta } from "@/lib/dreamdex/types";

import { getBrowserAdapter } from "./use-perps-adapter";
import { sidecarKeys } from "./use-sidecar-queries";

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    console.warn("Sidecar could not read this browser's saved proof records.", error);
    return null;
  }
}

function subscribeToStorage(key: string, onChange: () => void): () => void {
  const onStorage = (event: StorageEvent): void => {
    if (event.key === null || event.key === key) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

/**
 * The proof event the trade screen saved for this transaction in this browser, if any. The raw
 * string is the external snapshot so parsing runs only when storage changes.
 */
export function useCapturedProof(hash: Hash): CapturedProofResult {
  const key = proofStorageKey(hash);
  const subscribe = useCallback((onChange: () => void) => subscribeToStorage(key, onChange), [key]);
  const raw = useSyncExternalStore(
    subscribe,
    () => readStorage(key),
    () => null,
  );
  return useMemo(() => parseCapturedProof(raw, hash), [raw, hash]);
}

export interface AccountAtBlocksInput {
  account: Address;
  market: MarketMeta;
  markets: readonly MarketMeta[];
  /** The block the transaction mined in. Before is read at its parent. */
  block: bigint;
  enabled: boolean;
}

export type BlockRead = { state: "loading" } | { state: "error"; reason: string } | { state: "ok"; read: AccountAtBlock };

/** One account read at the parent block and at the transaction's own block. Past blocks never change, so these are not refetched. */
export function useAccountAtBlocks(input: AccountAtBlocksInput): { before: BlockRead; after: BlockRead } {
  const { account, market, markets, block, enabled } = input;
  const pools = useMemo(
    () => markets.filter((m) => m.marginBank.toLowerCase() === market.marginBank.toLowerCase()).map((m) => m.pool),
    [markets, market.marginBank],
  );
  const results = useQueries({
    queries: [block - 1n, block].map((at) => ({
      queryKey: [...sidecarKeys.all, "account-at-block", market.marginBank, account, at] as const,
      queryFn: () => getBrowserAdapter().readAccountAtBlock(account, market.marginBank, at, { pools, collateralToken: market.quoteToken }),
      enabled,
      staleTime: Number.POSITIVE_INFINITY,
      refetchOnWindowFocus: false,
    })),
  });
  const toRead = (index: number): BlockRead => {
    const result = results[index];
    if (result === undefined || result.status === "pending") return { state: "loading" };
    if (result.status === "error") return { state: "error", reason: classifyError(result.error).message };
    return { state: "ok", read: result.data };
  };
  return { before: toRead(0), after: toRead(1) };
}
