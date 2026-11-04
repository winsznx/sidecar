import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Hash, WalletClient } from "viem";
import { hashFn } from "wagmi/query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { findMarket, defaultMarket } from "@/hooks/use-trade-ticket";
import type { PerpsAdapter, SendMarginDepositInput } from "@/lib/dreamdex/adapter";
import type { BuiltMarginDeposit, MarginDepositSend, VerifiedDeposit } from "@/lib/dreamdex/types";
import { SEPARATE_ADDRESS } from "@/tests/fixtures/accounts.fixture";
import { BTC_PERP, ETH_PERP, MARGIN_BANK, USDSO, usdso } from "@/tests/fixtures/markets.fixture";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/trade",
  useSearchParams: () => new URLSearchParams(),
}));

const adapter = {
  buildMarginDeposit: vi.fn(),
  sendMarginDeposit: vi.fn(),
  waitForReceipt: vi.fn(),
  reconcileDeposit: vi.fn(),
};

vi.mock("@/hooks/use-perps-adapter", () => ({
  getBrowserAdapter: (): Partial<PerpsAdapter> => adapter,
}));

vi.mock("@/lib/dreamdex/client", () => ({
  bindSigner: vi.fn(),
  getBrowserMarkets: vi.fn(() => ({})),
}));

const { useMarginDeposit } = await import("@/hooks/use-margin-deposit");

const APPROVAL_HASH: Hash = `0x${"a1".repeat(32)}`;
const DEPOSIT_HASH: Hash = `0x${"d2".repeat(32)}`;
const AMOUNT = usdso(20n);
const WALLET = { account: { address: SEPARATE_ADDRESS }, chain: { id: 50383 } } as unknown as WalletClient;

const BUILT: BuiltMarginDeposit = {
  chainId: 50383,
  account: SEPARATE_ADDRESS,
  marginBank: MARGIN_BANK,
  collateralToken: USDSO,
  amount: AMOUNT,
  approval: { chainId: 50383, to: USDSO, data: "0x", value: 0n, gas: 10_000_000n, description: "Simulated exact approval" },
  deposit: { chainId: 50383, to: MARGIN_BANK, data: "0x", value: 0n, gas: 10_000_000n, description: "Simulated deposit" },
  walletBalance: usdso(100n),
  allowance: 0n,
  block: 1_000n,
  builtAt: "2026-11-01T12:00:00.000Z",
};

const CREDITED: VerifiedDeposit = {
  hash: DEPOSIT_HASH,
  chainId: 50383,
  receiptStatus: "success",
  outcome: "CREDITED",
  from: SEPARATE_ADDRESS,
  to: MARGIN_BANK,
  marginBank: MARGIN_BANK,
  collateralToken: USDSO,
  block: 1_004n,
  gasUsed: 111_090n,
  feePaid: null,
  requestedAmount: AMOUNT,
  creditedAmount: AMOUNT,
  transferredAmount: AMOUNT,
  revertReason: null,
  checks: [],
  explorerUrl: `https://explorer.testnet.somnia.network/tokyo/tx/${DEPOSIT_HASH}`,
  readAt: "2026-11-01T12:00:05.000Z",
};

function wrapper({ children }: { children: ReactNode }): ReactNode {
  const client = new QueryClient({ defaultOptions: { queries: { queryKeyHashFn: hashFn, retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  for (const fn of Object.values(adapter)) fn.mockReset();
  adapter.buildMarginDeposit.mockResolvedValue(BUILT);
});

afterEach(cleanup);

describe("useMarginDeposit", () => {
  it("prepares without sending, then shows each hash and the verified credit", async () => {
    adapter.sendMarginDeposit.mockImplementation(async (input: SendMarginDepositInput): Promise<MarginDepositSend> => {
      input.onSubmitted?.("approval", APPROVAL_HASH);
      input.onSubmitted?.("deposit", DEPOSIT_HASH);
      return {
        status: "deposit-submitted",
        approval: { hash: APPROVAL_HASH, wait: { status: "success", hash: APPROVAL_HASH, block: 1_002n, gasUsed: 1n, waitedMs: 1 } },
        depositHash: DEPOSIT_HASH,
      };
    });
    adapter.waitForReceipt.mockResolvedValue({ status: "success", hash: DEPOSIT_HASH, block: 1_004n, gasUsed: 1n, waitedMs: 1 });
    adapter.reconcileDeposit.mockResolvedValue(CREDITED);
    const { result } = renderHook(() => useMarginDeposit(), { wrapper });

    await act(async () => {
      await result.current.prepare({ account: SEPARATE_ADDRESS, amount: AMOUNT, market: BTC_PERP, walletClient: WALLET });
    });
    expect(result.current.phase).toBe("built");
    expect(adapter.sendMarginDeposit).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.send(WALLET);
    });
    expect(result.current.approvalHash).toBe(APPROVAL_HASH);
    expect(result.current.depositHash).toBe(DEPOSIT_HASH);
    expect(result.current.phase).toBe("done");
    expect(result.current.verified?.creditedAmount).toBe(AMOUNT);
    expect(adapter.reconcileDeposit).toHaveBeenCalledWith(DEPOSIT_HASH, expect.objectContaining({ account: SEPARATE_ADDRESS, marginBank: MARGIN_BANK }));
  });

  it("stops at an unconfirmed approval and never sends the deposit", async () => {
    adapter.sendMarginDeposit.mockResolvedValue({
      status: "approval-not-confirmed",
      approval: { hash: APPROVAL_HASH, wait: { status: "timeout", hash: APPROVAL_HASH, waitedMs: 60_000 } },
      depositHash: null,
    } satisfies MarginDepositSend);
    const { result } = renderHook(() => useMarginDeposit(), { wrapper });

    await act(async () => {
      await result.current.prepare({ account: SEPARATE_ADDRESS, amount: AMOUNT, market: BTC_PERP, walletClient: WALLET });
    });
    await act(async () => {
      await result.current.send(WALLET);
    });
    expect(result.current.phase).toBe("approval-not-confirmed");
    expect(result.current.depositHash).toBeNull();
    expect(adapter.waitForReceipt).not.toHaveBeenCalled();
  });

  it("treats a rejected signature as nothing sent", async () => {
    adapter.sendMarginDeposit.mockRejectedValue(Object.assign(new Error("User rejected the request."), { code: 4001 }));
    const { result } = renderHook(() => useMarginDeposit(), { wrapper });
    await act(async () => {
      await result.current.prepare({ account: SEPARATE_ADDRESS, amount: AMOUNT, market: BTC_PERP, walletClient: WALLET });
    });
    await act(async () => {
      await result.current.send(WALLET);
    });
    expect(result.current.phase).toBe("rejected");
    expect(result.current.depositHash).toBeNull();
  });
});

function rpcDown(): Error {
  return Object.assign(new Error("HTTP request failed."), { name: "HttpRequestError" });
}

describe("useMarginDeposit with an ambiguous outcome", () => {
  async function sendFailing(error: unknown, beforeThrow?: (input: SendMarginDepositInput) => void) {
    adapter.sendMarginDeposit.mockImplementation(async (input: SendMarginDepositInput): Promise<MarginDepositSend> => {
      beforeThrow?.(input);
      throw error;
    });
    const hook = renderHook(() => useMarginDeposit(), { wrapper });
    await act(async () => {
      await hook.result.current.prepare({ account: SEPARATE_ADDRESS, amount: AMOUNT, market: BTC_PERP, walletClient: WALLET });
    });
    await act(async () => {
      await hook.result.current.send(WALLET);
    });
    return hook;
  }

  it("treats an RPC failure after the deposit was handed to the wallet as unknown, not as failed", async () => {
    const { result } = await sendFailing(rpcDown(), (input) =>
      input.onSubmitted?.("deposit", DEPOSIT_HASH),
    );
    expect(result.current.phase).toBe("unknown");
    expect(result.current.unresolved).toBe(true);
    expect(result.current.depositHash).toBe(DEPOSIT_HASH);
    expect(result.current.problem?.nextStep).toMatch(/Do not deposit again/);
  });

  it("refuses to reset or prepare a second deposit while one is unresolved", async () => {
    const { result } = await sendFailing(Object.assign(new Error("The request timed out."), { name: "TimeoutError" }), (input) =>
      input.onSubmitted?.("deposit", DEPOSIT_HASH),
    );
    act(() => result.current.reset());
    expect(result.current.phase).toBe("unknown");
    expect(result.current.depositHash).toBe(DEPOSIT_HASH);

    adapter.buildMarginDeposit.mockClear();
    await act(async () => {
      await result.current.prepare({ account: SEPARATE_ADDRESS, amount: AMOUNT, market: BTC_PERP, walletClient: WALLET });
    });
    expect(adapter.buildMarginDeposit).not.toHaveBeenCalled();
    expect(result.current.phase).toBe("unknown");

    act(() => result.current.acknowledgeUnknown());
    expect(result.current.phase).toBe("unknown");
  });

  it("lets the trader clear an unknown deposit with no hash only by confirming they checked their wallet", async () => {
    const { result } = await sendFailing(rpcDown());
    expect(result.current.phase).toBe("unknown");
    expect(result.current.depositHash).toBeNull();
    act(() => result.current.reset());
    expect(result.current.phase).toBe("unknown");
    act(() => result.current.acknowledgeUnknown());
    expect(result.current.phase).toBe("idle");
  });

  it("keeps a wrong-network refusal as failed, since nothing was sent", async () => {
    const { SidecarAdapterError } = await import("@/lib/dreamdex/errors");
    const { result } = await sendFailing(new SidecarAdapterError("WRONG_CHAIN", "The wallet is on chain 1.", { expectedChainId: 50383, actualChainId: 1 }));
    expect(result.current.phase).toBe("failed");
    expect(result.current.unresolved).toBe(false);
  });
});

describe("market lookup", () => {
  it("matches base or display symbols case-insensitively and defaults to BTC", () => {
    expect(findMarket([BTC_PERP, ETH_PERP], "eth")?.pool).toBe(ETH_PERP.pool);
    expect(findMarket([BTC_PERP, ETH_PERP], "BTC-PERP")?.pool).toBe(BTC_PERP.pool);
    expect(findMarket([BTC_PERP, ETH_PERP], "DOGE")).toBeNull();
    expect(defaultMarket([ETH_PERP, BTC_PERP])?.pool).toBe(BTC_PERP.pool);
    expect(defaultMarket([])).toBeNull();
  });
});
