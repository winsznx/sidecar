import type { AccountSnapshot, MarketMeta, Source } from "@/lib/dreamdex/types";

/**
 * What one checklist step can honestly say. `connect` means there is no wallet to read, which
 * is never shown as a pass; `manual` is a step Sidecar cannot observe.
 */
export type StepStatus =
  | { kind: "pass"; label: string }
  | { kind: "short"; label: string }
  | { kind: "connect" }
  | { kind: "reading" }
  | { kind: "unavailable"; reason: string }
  | { kind: "manual"; label: string };

export interface ReadFigure {
  value: bigint;
  source: Source | null;
}

export interface GasCheck {
  status: StepStatus;
  balance: ReadFigure | null;
  required: bigint;
  /** How much more STT the wallet needs, when it is short. */
  shortfall: bigint | null;
}

export interface CollateralCheck {
  status: StepStatus;
  balance: ReadFigure | null;
}

export interface MarginCheck {
  status: StepStatus;
  unlocked: ReadFigure | null;
  locked: ReadFigure | null;
}

export interface StartChecks {
  connect: StepStatus;
  network: StepStatus;
  gas: GasCheck;
  collateral: CollateralCheck;
  margin: MarginCheck;
  /** Pass count over the steps Sidecar can read; `null` with no wallet, so nothing reads as passed. */
  tally: { passed: number; total: number } | null;
}

/** The account read as the checklist needs it, independent of the query library. */
export type SnapshotState =
  | { state: "idle" }
  | { state: "reading" }
  | { state: "error"; reason: string }
  | { state: "ok"; snapshot: AccountSnapshot };

export interface StartCheckInput {
  address: string | null;
  chainId: number | null;
  onHideki: boolean;
  /** The listed market that names the MarginBank and collateral token, or why there is none. */
  market: { state: "reading" } | { state: "error"; reason: string } | { state: "ok"; market: MarketMeta };
  snapshot: SnapshotState;
  minGasWei: bigint;
}

type Blocker = { status: StepStatus } | null;

/** Why the account reads cannot run yet, shared by the three balance steps. */
function readBlocker(input: StartCheckInput): Blocker {
  if (input.address === null) return { status: { kind: "connect" } };
  if (input.market.state === "reading") return { status: { kind: "reading" } };
  if (input.market.state === "error") return { status: { kind: "unavailable", reason: input.market.reason } };
  if (input.snapshot.state === "reading" || input.snapshot.state === "idle") return { status: { kind: "reading" } };
  if (input.snapshot.state === "error") return { status: { kind: "unavailable", reason: input.snapshot.reason } };
  return null;
}

function issueFor(snapshot: AccountSnapshot, prefix: string, fallback: string): string {
  return snapshot.issues.find((issue) => issue.startsWith(prefix)) ?? fallback;
}

function gasCheck(input: StartCheckInput, snapshot: AccountSnapshot | null, blocker: Blocker): GasCheck {
  const required = input.minGasWei;
  if (blocker !== null || snapshot === null) return { status: blocker?.status ?? { kind: "reading" }, balance: null, required, shortfall: null };
  if (snapshot.gasBalance === null) {
    return {
      status: { kind: "unavailable", reason: issueFor(snapshot, "STT balance", "The STT balance could not be read.") },
      balance: null,
      required,
      shortfall: null,
    };
  }
  const balance = { value: snapshot.gasBalance, source: snapshot.sources?.gasBalance ?? null };
  if (snapshot.gasBalance >= required) return { status: { kind: "pass", label: "Enough gas" }, balance, required, shortfall: null };
  return { status: { kind: "short", label: "Short of gas" }, balance, required, shortfall: required - snapshot.gasBalance };
}

function collateralCheck(snapshot: AccountSnapshot | null, blocker: Blocker): CollateralCheck {
  if (blocker !== null || snapshot === null) return { status: blocker?.status ?? { kind: "reading" }, balance: null };
  if (snapshot.walletCollateral === null) {
    return { status: { kind: "unavailable", reason: issueFor(snapshot, "Wallet USDso", "The wallet's USDso balance could not be read.") }, balance: null };
  }
  const balance = { value: snapshot.walletCollateral.balance, source: snapshot.sources?.walletCollateral ?? null };
  return balance.value > 0n
    ? { status: { kind: "pass", label: "Has USDso" }, balance }
    : { status: { kind: "short", label: "None in wallet" }, balance };
}

function marginCheck(snapshot: AccountSnapshot | null, blocker: Blocker): MarginCheck {
  if (blocker !== null || snapshot === null) return { status: blocker?.status ?? { kind: "reading" }, unlocked: null, locked: null };
  if (snapshot.margin === null) {
    return {
      status: { kind: "unavailable", reason: issueFor(snapshot, "Margin account", "The margin account could not be read.") },
      unlocked: null,
      locked: null,
    };
  }
  const source = snapshot.sources?.margin ?? null;
  const unlocked = { value: snapshot.margin.unlockedCollateral, source };
  const locked = { value: snapshot.margin.lockedCollateral, source };
  return unlocked.value + locked.value > 0n
    ? { status: { kind: "pass", label: "Margin deposited" }, unlocked, locked }
    : { status: { kind: "short", label: "Nothing deposited" }, unlocked, locked };
}

function networkStatus(input: StartCheckInput): StepStatus {
  if (input.address === null) return { kind: "connect" };
  if (input.onHideki) return { kind: "pass", label: "On Hideki" };
  return { kind: "short", label: input.chainId === null ? "Chain unknown" : `On chain ${input.chainId}` };
}

/** Every readable step's status from live inputs. Pure, so each state is testable without a wallet. */
export function deriveStartChecks(input: StartCheckInput): StartChecks {
  const blocker = readBlocker(input);
  const snapshot = input.snapshot.state === "ok" ? input.snapshot.snapshot : null;
  const connect: StepStatus = input.address === null ? { kind: "short", label: "Not connected" } : { kind: "pass", label: "Connected" };
  const network = networkStatus(input);
  const gas = gasCheck(input, snapshot, blocker);
  const collateral = collateralCheck(snapshot, blocker);
  const margin = marginCheck(snapshot, blocker);
  const readable = [connect, network, gas.status, collateral.status, margin.status];
  const tally = input.address === null ? null : { passed: readable.filter((status) => status.kind === "pass").length, total: readable.length };
  return { connect, network, gas, collateral, margin, tally };
}
