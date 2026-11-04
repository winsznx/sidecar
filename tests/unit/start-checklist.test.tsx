import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { deriveStartChecks, type StartCheckInput } from "@/components/start/start-steps";
import { StartScreen } from "@/components/start/start-screen";
import type { WalletState } from "@/hooks/use-wallet-state";
import { MIN_GAS_BALANCE_FOR_ORDER_WEI } from "@/lib/dreamdex/config";
import type { AccountSnapshot } from "@/lib/dreamdex/types";

import { marginFixture, PRIMARY_ADDRESS, READ_AT, READ_BLOCK, snapshotFixture } from "../fixtures/accounts.fixture";
import { BTC_PERP, usdso } from "../fixtures/markets.fixture";

const SOURCE = { kind: "chain", block: READ_BLOCK, readAt: READ_AT, via: "eth_getBalance" } as const;

function fundedSnapshot(overrides: Partial<AccountSnapshot> = {}): AccountSnapshot {
  return snapshotFixture({
    gasBalance: MIN_GAS_BALANCE_FOR_ORDER_WEI * 2n,
    walletCollateral: { balance: usdso(100n), allowanceToBank: 0n },
    margin: marginFixture({ unlockedCollateral: usdso(20n) }),
    sources: { margin: SOURCE, positions: null, voucher: null, gasBalance: SOURCE, walletCollateral: SOURCE },
    ...overrides,
  });
}

function input(overrides: Partial<StartCheckInput> = {}): StartCheckInput {
  return {
    address: PRIMARY_ADDRESS,
    chainId: 50383,
    onHideki: true,
    market: { state: "ok", market: BTC_PERP },
    snapshot: { state: "ok", snapshot: fundedSnapshot() },
    minGasWei: MIN_GAS_BALANCE_FOR_ORDER_WEI,
    ...overrides,
  };
}

describe("deriveStartChecks", () => {
  it("never passes a read step without a wallet", () => {
    // #given no wallet
    // #when
    const checks = deriveStartChecks(input({ address: null, chainId: null, onHideki: false, snapshot: { state: "idle" } }));
    // #then
    expect({
      connect: checks.connect.kind,
      network: checks.network.kind,
      gas: checks.gas.status.kind,
      collateral: checks.collateral.status.kind,
      margin: checks.margin.status.kind,
      tally: checks.tally,
    }).toEqual({ connect: "short", network: "connect", gas: "connect", collateral: "connect", margin: "connect", tally: null });
  });

  it("passes every readable step for a funded wallet on Hideki", () => {
    // #given / #when
    const checks = deriveStartChecks(input());
    // #then
    expect({ tally: checks.tally, gas: checks.gas.status.kind, shortfall: checks.gas.shortfall }).toEqual({
      tally: { passed: 5, total: 5 },
      gas: "pass",
      shortfall: null,
    });
  });

  it("reports the exact STT shortfall against the node's up-front gas requirement", () => {
    // #given a wallet holding 0.1 STT
    const held = 100_000_000_000_000_000n;
    // #when
    const checks = deriveStartChecks(input({ snapshot: { state: "ok", snapshot: fundedSnapshot({ gasBalance: held }) } }));
    // #then
    expect({ status: checks.gas.status, shortfall: checks.gas.shortfall }).toEqual({
      status: { kind: "short", label: "Short of gas" },
      shortfall: MIN_GAS_BALANCE_FOR_ORDER_WEI - held,
    });
  });

  it("shows a failed read as unavailable with its reason, never as zero", () => {
    // #given a snapshot whose STT and USDso reads failed
    const snapshot = fundedSnapshot({ gasBalance: null, walletCollateral: null, issues: ["STT balance unavailable: timeout."] });
    // #when
    const checks = deriveStartChecks(input({ snapshot: { state: "ok", snapshot } }));
    // #then
    expect({ gas: checks.gas, collateral: checks.collateral.status.kind }).toEqual({
      gas: { status: { kind: "unavailable", reason: "STT balance unavailable: timeout." }, balance: null, required: MIN_GAS_BALANCE_FOR_ORDER_WEI, shortfall: null },
      collateral: "unavailable",
    });
  });

  it("marks empty wallet USDso and an empty margin account as short", () => {
    // #given
    const snapshot = fundedSnapshot({ walletCollateral: { balance: 0n, allowanceToBank: 0n }, margin: marginFixture() });
    // #when
    const checks = deriveStartChecks(input({ snapshot: { state: "ok", snapshot } }));
    // #then
    expect({ collateral: checks.collateral.status.kind, margin: checks.margin.status.kind, tally: checks.tally }).toEqual({
      collateral: "short",
      margin: "short",
      tally: { passed: 3, total: 5 },
    });
  });

  it("names the wallet's chain when it is not Hideki", () => {
    expect(deriveStartChecks(input({ chainId: 1, onHideki: false })).network).toEqual({ kind: "short", label: "On chain 1" });
  });

  it("carries a market list failure into every balance step", () => {
    // #given
    const checks = deriveStartChecks(input({ market: { state: "error", reason: "Market list unavailable." }, snapshot: { state: "idle" } }));
    // #then
    expect([checks.gas.status, checks.collateral.status, checks.margin.status]).toEqual(
      Array(3).fill({ kind: "unavailable", reason: "Market list unavailable." }),
    );
  });
});

const checklist = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@/hooks/use-start-checklist", () => ({ useStartChecklist: () => checklist.current }));

function wallet(overrides: Partial<WalletState> = {}): WalletState {
  return {
    status: "disconnected",
    address: null,
    chainId: null,
    onHideki: false,
    connected: null,
    connectorName: null,
    options: [],
    connect: () => undefined,
    connecting: false,
    connectError: null,
    disconnect: () => undefined,
    switchToHideki: () => undefined,
    switching: false,
    switchError: null,
    walletClient: null,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  checklist.current = null;
});

describe("StartScreen", () => {
  it("asks for a wallet instead of showing any figure when none is connected", () => {
    // #given
    const disconnected = input({ address: null, chainId: null, onHideki: false, snapshot: { state: "idle" } });
    checklist.current = { wallet: wallet(), market: BTC_PERP, checks: deriveStartChecks(disconnected) };
    // #when
    render(<StartScreen />);
    // #then
    const gasStep = screen.getByTestId("start-step-4");
    expect({
      prompts: within(gasStep).getAllByText("Connect a wallet to check").length,
      badges: gasStep.querySelectorAll("[data-provenance]").length,
      command: screen.getByTestId("faucet-command").textContent,
      tally: screen.getByTestId("start-tally").textContent,
    }).toEqual({
      prompts: 2,
      badges: 0,
      command: "/faucet 0xYourAddress",
      tally: "Connect a wallet to check. Nothing below is marked as passed until it is read.",
    });
  });

  it("fills the faucet command with the connected address and badges each live figure", () => {
    // #given
    checklist.current = {
      wallet: wallet({ status: "connected", address: PRIMARY_ADDRESS, chainId: 50383, onHideki: true }),
      market: BTC_PERP,
      checks: deriveStartChecks(input()),
    };
    // #when
    render(<StartScreen />);
    // #then
    expect({
      command: screen.getByTestId("faucet-command").textContent,
      gas: within(screen.getByTestId("start-step-4")).getByText("1.2 STT").textContent,
      gasBadge: screen.getByTestId("start-step-4").querySelector("[data-provenance]")?.getAttribute("data-provenance"),
      usdso: within(screen.getByTestId("start-step-5")).getByText("100.00 USDso").textContent,
      tally: screen.getByTestId("start-tally").textContent,
      cta: screen.getByRole("link", { name: "Open the trade screen" }).getAttribute("href"),
    }).toEqual({
      command: `/faucet ${PRIMARY_ADDRESS}`,
      gas: "1.2 STT",
      gasBadge: "chain",
      usdso: "100.00 USDso",
      tally: "5 of 5 readable checks pass. Steps 3 and 7 happen outside Sidecar.",
      cta: "/trade",
    });
  });

  it("offers the network switch only to a wallet on another chain", () => {
    // #given
    checklist.current = {
      wallet: wallet({ status: "connected", address: PRIMARY_ADDRESS, chainId: 1, onHideki: false }),
      market: BTC_PERP,
      checks: deriveStartChecks(input({ chainId: 1, onHideki: false })),
    };
    // #when
    render(<StartScreen />);
    // #then
    expect(within(screen.getByTestId("start-step-2")).getByRole("button", { name: "Switch to Hideki" })).toBeInTheDocument();
  });
});
