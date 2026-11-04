"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import type { Address, Hash, WalletClient } from "viem";

import { bindSigner, getBrowserMarkets } from "@/lib/dreamdex/client";
import { classifyError, type SidecarErrorCode } from "@/lib/dreamdex/errors";
import type { BuiltMarginDeposit, MarginDepositSend, MarketMeta, ReceiptWait, VerifiedDeposit } from "@/lib/dreamdex/types";

import { NOTHING_SENT_CODES } from "./use-execution";
import { getBrowserAdapter } from "./use-perps-adapter";
import { sidecarKeys } from "./use-sidecar-queries";

export type DepositPhase =
  | "idle"
  | "building"
  | "built"
  | "awaiting-wallet"
  | "approval-pending"
  | "deposit-pending"
  | "reconciling"
  | "done"
  | "approval-not-confirmed"
  | "unknown"
  | "rejected"
  | "failed";

/** Phases where a deposit may be on its way to the chain. The flow can't be dropped or restarted. */
const UNRESOLVED_PHASES: ReadonlySet<DepositPhase> = new Set<DepositPhase>([
  "awaiting-wallet",
  "approval-pending",
  "deposit-pending",
  "reconciling",
  "unknown",
]);

export function isDepositUnresolved(phase: DepositPhase): boolean {
  return UNRESOLVED_PHASES.has(phase);
}

/** A send error that proves nothing reached the chain. Anything else may have broadcast the deposit. */
function nothingSent(code: SidecarErrorCode): boolean {
  return code === "WALLET_REJECTED" || code === "INVALID_DEPOSIT" || NOTHING_SENT_CODES.has(code);
}

const UNKNOWN_NEXT_STEP = "Check again. Do not deposit again until this one is resolved.";

export interface DepositProblem {
  title: string;
  message: string;
  nextStep: string;
}

export interface MarginDepositController {
  phase: DepositPhase;
  /** The wallet this deposit funds, once one is prepared. */
  account: Address | null;
  /** A deposit may be on its way: closing the dialog keeps it, and no new one can be prepared. */
  unresolved: boolean;
  built: BuiltMarginDeposit | null;
  approvalHash: Hash | null;
  approvalWait: ReceiptWait | null;
  depositHash: Hash | null;
  verified: VerifiedDeposit | null;
  problem: DepositProblem | null;
  /** A wallet request or a chain read is running; actions are refused meanwhile. */
  busy: boolean;
  /** Reads the wallet's balance and allowance and prepares the exact approval and deposit. Sends nothing. */
  prepare: (input: { account: Address; amount: bigint; market: MarketMeta; walletClient: WalletClient }) => Promise<void>;
  /** Asks the wallet to sign the prepared steps, in order. */
  send: (walletClient: WalletClient) => Promise<void>;
  /** Polls the SAME deposit hash again. Never sends. */
  checkAgain: () => Promise<void>;
  /** Start over. Refused while the deposit may still be on its way. */
  reset: () => void;
  /**
   * With no deposit hash there is nothing to look up. The trader checked their wallet's
   * activity and confirms nothing is pending, which is the only way out of that state.
   */
  acknowledgeUnknown: () => void;
}

function problemFrom(error: unknown): DepositProblem {
  const classified = classifyError(error);
  return { title: classified.title, message: classified.message, nextStep: classified.nextStep };
}

/**
 * An explicit, user-signed deposit from the connected wallet into that same wallet's own
 * margin account. The bank credits the caller, so this can never fund another account.
 * Each hash is shown as the wallet returns it, and the credit counts only once the receipt
 * has been checked.
 */
export function useMarginDeposit(): MarginDepositController {
  const queryClient = useQueryClient();
  const [phase, setPhaseState] = useState<DepositPhase>("idle");
  const phaseRef = useRef<DepositPhase>("idle");
  const setPhase = useCallback((next: DepositPhase): void => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);
  const [built, setBuilt] = useState<BuiltMarginDeposit | null>(null);
  const [approvalHash, setApprovalHash] = useState<Hash | null>(null);
  const [approvalWait, setApprovalWait] = useState<ReceiptWait | null>(null);
  const [depositHash, setDepositHash] = useState<Hash | null>(null);
  const [verified, setVerified] = useState<VerifiedDeposit | null>(null);
  const [problem, setProblem] = useState<DepositProblem | null>(null);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (work: () => Promise<void>): Promise<void> => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await work();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const followDeposit = useCallback(
    async (deposit: BuiltMarginDeposit, hash: Hash): Promise<void> => {
      const adapter = getBrowserAdapter();
      let current = hash;
      for (;;) {
        const wait = await adapter.waitForReceipt(current);
        if (wait.status === "replaced") {
          current = wait.replacement;
          setDepositHash(current);
          continue;
        }
        if (wait.status === "timeout" || wait.status === "error") {
          setPhase("unknown");
          setProblem({
            title: "Deposit outcome unknown",
            message: "No receipt arrived in time. The deposit may still confirm.",
            nextStep: UNKNOWN_NEXT_STEP,
          });
          return;
        }
        break;
      }
      setPhase("reconciling");
      try {
        const result = await adapter.reconcileDeposit(current, {
          account: deposit.account,
          marginBank: deposit.marginBank,
          collateralToken: deposit.collateralToken,
        });
        setVerified(result);
        setProblem(null);
        setPhase("done");
      } catch (error) {
        setProblem(problemFrom(error));
        setPhase("unknown");
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: sidecarKeys.accounts() }),
        queryClient.invalidateQueries({ queryKey: sidecarKeys.quotes() }),
      ]);
    },
    [queryClient, setPhase],
  );

  const prepare = useCallback(
    (input: { account: Address; amount: bigint; market: MarketMeta; walletClient: WalletClient }): Promise<void> =>
      run(async () => {
        if (isDepositUnresolved(phaseRef.current)) return;
        setProblem(null);
        setBuilt(null);
        setPhase("building");
        try {
          bindSigner(getBrowserMarkets(), input.walletClient);
          const next = await getBrowserAdapter().buildMarginDeposit({ account: input.account, amount: input.amount, market: input.market });
          setBuilt(next);
          setPhase("built");
        } catch (error) {
          setProblem(problemFrom(error));
          setPhase("failed");
        }
      }),
    [run, setPhase],
  );

  const send = useCallback(
    (walletClient: WalletClient): Promise<void> =>
      run(async () => {
        if (built === null || phase !== "built") return;
        setProblem(null);
        setPhase("awaiting-wallet");
        let sent: MarginDepositSend;
        try {
          sent = await getBrowserAdapter().sendMarginDeposit({
            walletClient,
            account: built.account,
            built,
            onSubmitted: (step, hash) => {
              if (step === "approval") {
                setApprovalHash(hash);
                setPhase("approval-pending");
              } else {
                setDepositHash(hash);
                setPhase("deposit-pending");
              }
            },
          });
        } catch (error) {
          const classified = classifyError(error);
          if (nothingSent(classified.code)) {
            setProblem({ title: classified.title, message: classified.message, nextStep: classified.nextStep });
            setPhase(classified.code === "WALLET_REJECTED" ? "rejected" : "failed");
          } else {
            if (classified.code === "OUTCOME_UNKNOWN" && classified.hash !== null) setDepositHash((known) => known ?? classified.hash);
            setProblem({ title: "Deposit outcome unknown", message: `${classified.message} The deposit may have been sent.`, nextStep: UNKNOWN_NEXT_STEP });
            setPhase("unknown");
          }
          return;
        }
        if (sent.approval !== null) setApprovalWait(sent.approval.wait);
        if (sent.status === "approval-not-confirmed") {
          setPhase("approval-not-confirmed");
          setProblem({
            title: "Approval not confirmed",
            message: "The approval did not confirm, so the deposit was never sent.",
            nextStep: "Prepare the deposit again. Sidecar re-reads the allowance first.",
          });
          return;
        }
        setDepositHash(sent.depositHash);
        setPhase("deposit-pending");
        await followDeposit(built, sent.depositHash);
      }),
    [built, followDeposit, phase, run, setPhase],
  );

  const checkAgain = useCallback(
    (): Promise<void> =>
      run(async () => {
        if (built === null || depositHash === null || phase !== "unknown") return;
        setPhase("deposit-pending");
        await followDeposit(built, depositHash);
      }),
    [built, depositHash, followDeposit, phase, run, setPhase],
  );

  const clear = useCallback((): void => {
    setPhase("idle");
    setBuilt(null);
    setApprovalHash(null);
    setApprovalWait(null);
    setDepositHash(null);
    setVerified(null);
    setProblem(null);
  }, [setPhase]);

  const reset = useCallback((): void => {
    if (busyRef.current || isDepositUnresolved(phaseRef.current)) return;
    clear();
  }, [clear]);

  const acknowledgeUnknown = useCallback((): void => {
    if (busyRef.current || phaseRef.current !== "unknown" || depositHash !== null) return;
    clear();
  }, [clear, depositHash]);

  return {
    phase,
    account: built?.account ?? null,
    unresolved: isDepositUnresolved(phase),
    acknowledgeUnknown,
    built, approvalHash, approvalWait, depositHash, verified, problem, busy, prepare, send, checkAgain, reset };
}
