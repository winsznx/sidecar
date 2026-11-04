"use client";

import { useQuery, type Query } from "@tanstack/react-query";
import type { Address, Hash } from "viem";

import { classifyError, type SidecarError } from "@/lib/dreamdex/errors";
import type { MarketMeta, VerifiedOrder } from "@/lib/dreamdex/types";

import { getBrowserAdapter } from "./use-perps-adapter";
import { sidecarKeys } from "./use-sidecar-queries";

/** Known to the network but not mined: look again soon. */
const PENDING_POLL_MS = 3_000;
/** Unknown to the network: it may be mistyped, or only just sent. Look again, slowly. */
const NOT_FOUND_POLL_MS = 10_000;

export const receiptKeys = {
  receipt: (hash: Hash, expectedAccount: Address | null, counterpart: Address | null) =>
    [...sidecarKeys.all, "receipt", hash, expectedAccount, counterpart] as const,
};

export type ReceiptLookup =
  | { state: "loading" }
  | { state: "pending"; checkedAt: number }
  | { state: "not-found"; checkedAt: number }
  | { state: "error"; error: SidecarError }
  | { state: "ready"; order: VerifiedOrder };

export interface ReceiptReconcile {
  lookup: ReceiptLookup;
  fetching: boolean;
  checkAgain: () => void;
}

function pollInterval(query: Query<VerifiedOrder, Error, VerifiedOrder, readonly unknown[]>): number | false {
  const error = query.state.error;
  if (error === null || query.state.status !== "error") return false;
  const code = classifyError(error).code;
  if (code === "OUTCOME_UNKNOWN") return PENDING_POLL_MS;
  if (code === "TX_NOT_FOUND") return NOT_FOUND_POLL_MS;
  return false;
}

/**
 * Reconciles one transaction from chain reads. A pending or unknown hash is looked up again on a
 * timer; nothing is ever sent. A mined receipt is final, so it is not refetched in the background.
 */
export function useReceiptReconcile(input: {
  hash: Hash;
  markets: readonly MarketMeta[] | undefined;
  expectedAccount: Address | null;
  counterpart: Address | null;
}): ReceiptReconcile {
  const { hash, markets, expectedAccount, counterpart } = input;
  const query = useQuery({
    queryKey: receiptKeys.receipt(hash, expectedAccount, counterpart),
    queryFn: () => {
      if (markets === undefined) throw new Error("Receipt reconciliation requested without the market list.");
      return getBrowserAdapter().reconcileOrder(hash, {
        markets,
        expectedAccount: expectedAccount ?? undefined,
        counterpartAccount: counterpart ?? undefined,
      });
    },
    enabled: markets !== undefined,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    refetchInterval: pollInterval,
  });

  const checkAgain = (): void => {
    void query.refetch();
  };

  if (query.status === "success") return { lookup: { state: "ready", order: query.data }, fetching: query.isFetching, checkAgain };
  if (query.status === "error") {
    const error = classifyError(query.error);
    const checkedAt = query.errorUpdatedAt;
    if (error.code === "OUTCOME_UNKNOWN") return { lookup: { state: "pending", checkedAt }, fetching: query.isFetching, checkAgain };
    if (error.code === "TX_NOT_FOUND") return { lookup: { state: "not-found", checkedAt }, fetching: query.isFetching, checkAgain };
    return { lookup: { state: "error", error }, fetching: query.isFetching, checkAgain };
  }
  return { lookup: { state: "loading" }, fetching: query.isFetching, checkAgain };
}
