"use client";

import { deriveStartChecks, type SnapshotState, type StartCheckInput, type StartChecks } from "@/components/start/start-steps";
import { MIN_GAS_BALANCE_FOR_ORDER_WEI } from "@/lib/dreamdex/config";
import { classifyError } from "@/lib/dreamdex/errors";
import type { MarketMeta } from "@/lib/dreamdex/types";

import { useAccountSnapshot, useMarkets } from "./use-sidecar-queries";
import { useWalletState, type WalletState } from "./use-wallet-state";

export interface StartChecklist {
  wallet: WalletState;
  /** The listed market whose MarginBank and collateral the checks read against. */
  market: MarketMeta | null;
  checks: StartChecks;
}

/**
 * The connected wallet's readiness on Hideki: chain, gas, USDso and margin, read live with the
 * same account snapshot the trade screen uses. It only reads; nothing here signs or sends.
 */
export function useStartChecklist(): StartChecklist {
  const wallet = useWalletState();
  const markets = useMarkets();
  const market = markets.data?.[0] ?? null;
  const snapshotQuery = useAccountSnapshot(wallet.address, market?.marginBank ?? null, markets.data);

  let marketInput: StartCheckInput["market"];
  if (markets.isError) marketInput = { state: "error", reason: `Market list unavailable, so the MarginBank is unknown. ${classifyError(markets.error).nextStep}` };
  else if (markets.data === undefined) marketInput = { state: "reading" };
  else if (market === null) marketInput = { state: "error", reason: "No market is listed on Hideki right now, so there is no MarginBank to read." };
  else marketInput = { state: "ok", market };

  let snapshot: SnapshotState;
  if (snapshotQuery.data !== undefined) snapshot = { state: "ok", snapshot: snapshotQuery.data };
  else if (snapshotQuery.isError) snapshot = { state: "error", reason: classifyError(snapshotQuery.error).message };
  else if (snapshotQuery.fetchStatus === "idle") snapshot = { state: "idle" };
  else snapshot = { state: "reading" };

  const checks = deriveStartChecks({
    address: wallet.address,
    chainId: wallet.chainId,
    onHideki: wallet.onHideki,
    market: marketInput,
    snapshot,
    minGasWei: MIN_GAS_BALANCE_FOR_ORDER_WEI,
  });
  return { wallet, market, checks };
}
