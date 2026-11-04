import { marginBankEventsAbi, marginBankWriteAbi } from "@somnia-chain/markets-sdk";
import { decodeEventLog, decodeFunctionData, encodeFunctionData, erc20Abi, getAddress, maxUint256, type Address, type Hex, type TransactionReceipt } from "viem";

import type { TruthCheck, VerifiedDeposit } from "./types";

function same(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

/** Calldata for `approve(spender, amount)`. Refuses the unlimited sentinel: Sidecar only approves what one deposit pulls. */
export function encodeExactApproval(spender: Address, amount: bigint): Hex {
  if (amount <= 0n) throw new Error("An approval amount must be greater than zero.");
  if (amount >= maxUint256) throw new Error("Refusing an unlimited approval.");
  return encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [getAddress(spender), amount] });
}

export function decodeApprovalCall(data: Hex): { spender: Address; amount: bigint } | null {
  try {
    const call = decodeFunctionData({ abi: erc20Abi, data });
    if (call.functionName !== "approve") return null;
    const [spender, amount] = call.args;
    return { spender: getAddress(spender), amount };
  } catch {
    return null;
  }
}

/** The amount a MarginBank `deposit(uint256)` call moves, or null for any other call. */
export function decodeDepositCall(data: Hex): bigint | null {
  try {
    const call = decodeFunctionData({ abi: marginBankWriteAbi, data });
    return call.functionName === "deposit" ? call.args[0] : null;
  } catch {
    return null;
  }
}

/** True only for `approve(spender, amount)` with exactly that spender and amount. */
export function isExactApproval(data: Hex, spender: Address, amount: bigint): boolean {
  const call = decodeApprovalCall(data);
  return call !== null && same(call.spender, spender) && call.amount === amount && amount < maxUint256;
}

/** An approval is needed only when the current allowance is short of the deposit. */
export function approvalNeeded(allowance: bigint, amount: bigint): boolean {
  return allowance < amount;
}

export interface DepositReceiptDecoding {
  /** Every `Deposited` the bank emitted, by credited account. */
  deposited: { account: Address; amount: bigint }[];
  /** `DepositedFor` events: collateral credited to an account other than the caller's own deposit path. */
  depositedFor: { account: Address; pool: Address; amount: bigint }[];
  /** Collateral token transfers into the bank. */
  transfersToBank: { from: Address; amount: bigint }[];
}

export function decodeDepositReceipt(receipt: TransactionReceipt, marginBank: Address, collateralToken: Address | null): DepositReceiptDecoding {
  const out: DepositReceiptDecoding = { deposited: [], depositedFor: [], transfersToBank: [] };
  for (const log of receipt.logs) {
    if (same(log.address, marginBank)) {
      try {
        const event = decodeEventLog({ abi: marginBankEventsAbi, data: log.data, topics: log.topics });
        if (event.eventName === "Deposited") out.deposited.push({ account: getAddress(event.args.account), amount: event.args.amount });
        else if (event.eventName === "DepositedFor") {
          out.depositedFor.push({ account: getAddress(event.args.account), pool: getAddress(event.args.perpPool), amount: event.args.amount });
        }
      } catch {
        // A bank event outside the SDK's ABI says nothing about this deposit.
      }
    } else if (collateralToken !== null && same(log.address, collateralToken)) {
      try {
        const event = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
        if (event.eventName === "Transfer" && same(event.args.to, marginBank)) {
          out.transfersToBank.push({ from: getAddress(event.args.from), amount: event.args.value });
        }
      } catch {
        // Not a standard Transfer.
      }
    }
  }
  return out;
}

export interface DepositCheckInput {
  rpcChainId: number;
  txChainId: number | null;
  expectedChainId: number;
  from: Address;
  to: Address | null;
  expectedAccount: Address;
  marginBank: Address;
  /** The bank's own collateral token, or null when it could not be read. */
  collateralToken: Address | null;
  receiptStatus: "success" | "reverted";
  block: bigint;
  revertReason: string | null;
  requestedAmount: bigint | null;
  decoding: DepositReceiptDecoding;
}

export interface DepositVerdict {
  outcome: VerifiedDeposit["outcome"];
  creditedAmount: bigint | null;
  transferredAmount: bigint | null;
  checks: TruthCheck[];
}

/** Decide a deposit from chain data alone: who paid, who was credited, and how much. */
export function verifyDeposit(input: DepositCheckInput): DepositVerdict {
  const checks: TruthCheck[] = [];
  const add = (id: string, label: string, status: TruthCheck["status"], detail: string): void => {
    checks.push({ id, label, status, detail });
  };
  const reverted = input.receiptStatus === "reverted";
  const { deposited, depositedFor, transfersToBank } = input.decoding;

  const chainOk = input.rpcChainId === input.expectedChainId && (input.txChainId === null || input.txChainId === input.expectedChainId);
  add("chain-id", `Transaction is on chain ${input.expectedChainId}`, chainOk ? "pass" : "fail", `RPC chain id ${input.rpcChainId}; transaction chain id ${input.txChainId ?? "not encoded"}.`);

  const senderOk = same(input.from, input.expectedAccount);
  add("sender", "Sent by the depositing account", senderOk ? "pass" : "fail", `Sender ${input.from}; expected ${input.expectedAccount}.`);

  const targetOk = same(input.to, input.marginBank);
  add("target-bank", "Sent to the expected MarginBank", targetOk ? "pass" : "fail", `Target ${input.to ?? "none"}; expected ${input.marginBank}.`);

  add(
    "calldata-deposit",
    "Calldata is a deposit into the caller's own account",
    input.requestedAmount !== null ? "pass" : "fail",
    input.requestedAmount !== null ? `deposit(${input.requestedAmount}).` : "The calldata is not MarginBank deposit(uint256).",
  );

  add("receipt-success", "Receipt confirms success", reverted ? "fail" : "pass", reverted ? `Reverted: ${input.revertReason ?? "reason unknown"}.` : `Mined in block ${input.block}.`);

  const own = deposited.filter((d) => same(d.account, input.from));
  const credited = own.length === 1 ? own[0].amount : null;
  const others = [...deposited.filter((d) => !same(d.account, input.from)).map((d) => d.account), ...depositedFor.map((d) => d.account)];
  if (reverted) {
    add("credited-self", "Only the sender's margin account was credited", "unknown", "Not applicable: the transaction reverted, so nothing was credited.");
  } else if (others.length > 0) {
    add("credited-self", "Only the sender's margin account was credited", "fail", `Collateral was credited to ${others.join(", ")}.`);
  } else if (credited === null) {
    add("credited-self", "Only the sender's margin account was credited", "fail", `Expected one Deposited event for the sender, found ${own.length}.`);
  } else {
    const amountOk = input.requestedAmount !== null && credited === input.requestedAmount;
    add(
      "credited-self",
      "Only the sender's margin account was credited",
      amountOk ? "pass" : "fail",
      amountOk ? `The bank credited ${credited} to the sender.` : `The bank credited ${credited}, but the calldata requested ${input.requestedAmount ?? "nothing"}.`,
    );
  }

  const fromSender = transfersToBank.filter((t) => same(t.from, input.from));
  const fromOthers = transfersToBank.filter((t) => !same(t.from, input.from));
  const transferred = fromSender.length === 1 ? fromSender[0].amount : null;
  if (reverted) {
    add("funds-source", "The sender's own wallet paid the deposit", "unknown", "Not applicable: the transaction reverted, so no collateral moved.");
  } else if (input.collateralToken === null) {
    add("funds-source", "The sender's own wallet paid the deposit", "unknown", "The bank's collateral token could not be read, so transfers were not checked.");
  } else if (fromOthers.length > 0) {
    add("funds-source", "The sender's own wallet paid the deposit", "fail", `Collateral also moved from ${fromOthers.map((t) => t.from).join(", ")}.`);
  } else if (transferred === null || transferred !== input.requestedAmount) {
    add("funds-source", "The sender's own wallet paid the deposit", "fail", `Expected one transfer of ${input.requestedAmount ?? "?"} from the sender to the bank, found ${fromSender.length}.`);
  } else {
    add("funds-source", "The sender's own wallet paid the deposit", "pass", `${transferred} moved from the sender's wallet to the bank.`);
  }

  const outcome: VerifiedDeposit["outcome"] = reverted ? "REVERTED" : checks.every((c) => c.status === "pass") ? "CREDITED" : "UNVERIFIED";
  return { outcome, creditedAmount: reverted ? null : credited, transferredAmount: reverted ? null : transferred, checks };
}
