import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { WalletClient } from "viem";
import { hashFn } from "wagmi/query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PerpsAdapter } from "@/lib/dreamdex/adapter";
import type { BuiltOrder, ReceiptWait } from "@/lib/dreamdex/types";
import { NOW_MS, PRIMARY_ADDRESS, SEPARATE_ADDRESS, SEPARATE_SNAPSHOT } from "@/tests/fixtures/accounts.fixture";
import { BTC_PERP } from "@/tests/fixtures/markets.fixture";
import { BTC_ORDER, SEPARATE_QUOTE } from "@/tests/fixtures/quotes.fixture";
import { TX_HASH, fill, verifiedOrderFixture } from "@/tests/fixtures/receipts.fixture";

const adapter = {
  quoteRoute: vi.fn(),
  buildOrder: vi.fn(),
  sendOrder: vi.fn(),
  waitForReceipt: vi.fn(),
  reconcileOrder: vi.fn(),
  getAccountSnapshot: vi.fn(),
};

const publicClient = {
  getTransactionCount: vi.fn(),
  getTransaction: vi.fn(),
  getBlockNumber: vi.fn(),
};

vi.mock("@/hooks/use-perps-adapter", () => ({
  getBrowserAdapter: (): Partial<PerpsAdapter> => adapter,
}));

vi.mock("@/lib/dreamdex/client", () => ({
  bindSigner: vi.fn(),
  getBrowserMarkets: vi.fn(() => ({})),
  getPublicClient: vi.fn(() => publicClient),
}));

const { UNKNOWN_RECHECK_DELAY_MS, useExecution } = await import("@/hooks/use-execution");
const { ATTEMPT_STORAGE_KEY, clearAttempt, serializeAttempt } = await import("@/hooks/use-trade-attempt");
const { ExecutionStatus, executionAnnouncement } = await import("@/components/trade/execution-status");

const BUILT: BuiltOrder = {
  chainId: 50383,
  to: BTC_PERP.pool,
  data: "0x",
  value: 0n,
  gas: 10_000_000n,
  description: "Simulated build for a unit test",
  orderType: 0,
  intent: BTC_ORDER,
  builtAt: new Date(NOW_MS).toISOString(),
};

const WALLET = { account: { address: SEPARATE_ADDRESS }, chain: { id: 50383 } } as unknown as WalletClient;
const SUCCESS: ReceiptWait = { status: "success", hash: TX_HASH, block: 300_420n, gasUsed: 1n, waitedMs: 5 };
const TIMEOUT: ReceiptWait = { status: "timeout", hash: TX_HASH, waitedMs: 60_000 };

function wrapper({ children }: { children: ReactNode }): ReactNode {
  const client = new QueryClient({ defaultOptions: { queries: { queryKeyHashFn: hashFn, retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderExecution() {
  return renderHook(() => useExecution({ market: BTC_PERP, markets: [BTC_PERP], counterpart: () => PRIMARY_ADDRESS }), { wrapper });
}

async function placed(wait: ReceiptWait) {
  adapter.sendOrder.mockResolvedValue(TX_HASH);
  adapter.waitForReceipt.mockResolvedValueOnce(wait);
  const hook = renderExecution();
  await act(async () => {
    await hook.result.current.prepare({ intent: BTC_ORDER, account: SEPARATE_ADDRESS });
  });
  await act(async () => {
    await hook.result.current.confirm({ intent: BTC_ORDER, account: SEPARATE_ADDRESS, walletClient: WALLET });
  });
  return hook;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW_MS);
  for (const fn of [...Object.values(adapter), ...Object.values(publicClient)]) fn.mockReset();
  adapter.quoteRoute.mockResolvedValue(SEPARATE_QUOTE);
  adapter.buildOrder.mockResolvedValue(BUILT);
  adapter.getAccountSnapshot.mockResolvedValue(SEPARATE_SNAPSHOT);
  publicClient.getTransactionCount.mockResolvedValue(12);
  window.localStorage.clear();
  clearAttempt();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("receipt truth checks gate every fill state", () => {
  it("does not call an order filled when the sender check fails", async () => {
    adapter.reconcileOrder.mockResolvedValue(
      verifiedOrderFixture({
        outcome: "FILLED",
        orderId: null,
        fills: [fill(BTC_ORDER.quantity)],
        filledQuantity: BTC_ORDER.quantity,
        checks: [
          { id: "chain-id", label: "Chain 50383", status: "pass", detail: "Chain 50383." },
          { id: "sender", label: "Sent by the selected account", status: "fail", detail: "Sent by another address." },
        ],
      }),
    );
    adapter.waitForReceipt.mockResolvedValue(SUCCESS);
    const { result } = await placed(SUCCESS);

    expect(result.current.state.settledPhase).toBe("ORDER_ACCEPTED");
    expect(result.current.verificationFailures).toEqual(["Sent by the selected account"]);
    expect(result.current.copy.headline).toBe("Order confirmed. Fill status not verified.");
    expect(result.current.copy.detail).toMatch(/These truth checks failed: Sent by the selected account/);
    expect(result.current.copy.tone).not.toBe("success");

    render(<ExecutionStatus execution={result.current} market={BTC_PERP} />);
    expect(screen.queryByText("Filled")).toBeNull();
    expect(screen.getByText("Decoded fills, not verified")).toBeInTheDocument();
  });

  it("still reaches FILLED when every check passes", async () => {
    adapter.reconcileOrder.mockResolvedValue(
      verifiedOrderFixture({
        outcome: "FILLED",
        orderId: null,
        fills: [fill(BTC_ORDER.quantity)],
        filledQuantity: BTC_ORDER.quantity,
        checks: [{ id: "sender", label: "Sent by the selected account", status: "pass", detail: "ok" }],
      }),
    );
    const { result } = await placed(SUCCESS);
    expect(result.current.state.settledPhase).toBe("FILLED");
    expect(result.current.verificationFailures).toEqual([]);
  });

  it("labels a fully filled order's id without claiming it rests", async () => {
    adapter.reconcileOrder.mockResolvedValue(
      verifiedOrderFixture({ outcome: "FILLED", orderId: 7_001n, fills: [fill(BTC_ORDER.quantity)], filledQuantity: BTC_ORDER.quantity }),
    );
    const { result } = await placed(SUCCESS);
    render(<ExecutionStatus execution={result.current} market={BTC_PERP} />);
    expect(screen.getByText("Order id")).toBeInTheDocument();
    expect(screen.queryByText("Resting order id")).toBeNull();
  });
});

describe("an unknown outcome survives a reload and keeps being looked up", () => {
  it("saves the hash, the order and the pre-sign nonce while the outcome is unknown", async () => {
    const { result } = await placed(TIMEOUT);
    expect(result.current.state.phase).toBe("UNKNOWN_OUTCOME");
    const raw = window.localStorage.getItem(ATTEMPT_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const stored = JSON.parse(raw ?? "{}") as Record<string, unknown>;
    expect(stored.trackedHashes).toEqual([TX_HASH]);
    expect(stored.account).toBe(SEPARATE_ADDRESS);
    expect(stored.nonce).toBe(12);
    expect(raw).not.toMatch(/signature|privateKey|mnemonic/i);
  });

  it("restores a saved attempt as a locked unknown outcome on the same hash", () => {
    window.localStorage.setItem(
      ATTEMPT_STORAGE_KEY,
      serializeAttempt({ account: SEPARATE_ADDRESS, intent: BTC_ORDER, trackedHashes: [TX_HASH], nonce: 12, savedAtMs: NOW_MS - 5_000 }),
    );
    const { result } = renderExecution();
    expect(result.current.state.phase).toBe("UNKNOWN_OUTCOME");
    expect(result.current.state.txHash).toBe(TX_HASH);
    expect(result.current.locked).toBe(true);
    expect(result.current.orphan).toBeNull();
    expect(executionAnnouncement(result.current).assertive).toMatch(/Outcome unknown/);
  });

  it("refuses a new preview while a restored attempt is unresolved", async () => {
    window.localStorage.setItem(
      ATTEMPT_STORAGE_KEY,
      serializeAttempt({ account: SEPARATE_ADDRESS, intent: BTC_ORDER, trackedHashes: [TX_HASH], nonce: 12, savedAtMs: NOW_MS - 5_000 }),
    );
    const { result } = renderExecution();
    await act(async () => {
      await result.current.prepare({ intent: BTC_ORDER, account: SEPARATE_ADDRESS });
    });
    expect(result.current.state.phase).toBe("UNKNOWN_OUTCOME");
    expect(adapter.quoteRoute).not.toHaveBeenCalled();
  });

  it("shows an attempt that returned no hash as a warning the trader dismisses", () => {
    window.localStorage.setItem(
      ATTEMPT_STORAGE_KEY,
      serializeAttempt({ account: SEPARATE_ADDRESS, intent: BTC_ORDER, trackedHashes: [], nonce: null, savedAtMs: NOW_MS - 5_000 }),
    );
    const { result } = renderExecution();
    expect(result.current.locked).toBe(false);
    expect(result.current.orphan?.account).toBe(SEPARATE_ADDRESS);
    act(() => result.current.dismissOrphan());
    expect(result.current.orphan).toBeNull();
    expect(window.localStorage.getItem(ATTEMPT_STORAGE_KEY)).toBeNull();
  });

  it("looks the same hash up again in the background and never resends", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(NOW_MS);
    publicClient.getTransaction.mockResolvedValue({ hash: TX_HASH });
    const { result } = await placed(TIMEOUT);
    expect(result.current.state.phase).toBe("UNKNOWN_OUTCOME");

    adapter.waitForReceipt.mockResolvedValueOnce({ status: "reverted", hash: TX_HASH, block: 300_421n, gasUsed: 1n, waitedMs: 3 } satisfies ReceiptWait);
    adapter.reconcileOrder.mockResolvedValue(verifiedOrderFixture({ receiptStatus: "reverted", outcome: "REVERTED", orderId: null, revertReason: "ImmediateOrCancelNoFill" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UNKNOWN_RECHECK_DELAY_MS);
    });

    expect(adapter.sendOrder).toHaveBeenCalledTimes(1);
    expect(adapter.waitForReceipt).toHaveBeenNthCalledWith(2, TX_HASH);
    expect(result.current.state.settledPhase).toBe("ORDER_REJECTED");
    expect(window.localStorage.getItem(ATTEMPT_STORAGE_KEY)).toBeNull();
  });
});
