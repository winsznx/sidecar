import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Hash, WalletClient } from "viem";
import { hashFn } from "wagmi/query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PerpsAdapter } from "@/lib/dreamdex/adapter";
import type { BuiltOrder, ReceiptWait } from "@/lib/dreamdex/types";
import { NOW_MS, PRIMARY_ADDRESS, SEPARATE_ADDRESS, SEPARATE_SNAPSHOT } from "@/tests/fixtures/accounts.fixture";
import { BTC_PERP } from "@/tests/fixtures/markets.fixture";
import { BTC_ORDER, SEPARATE_QUOTE } from "@/tests/fixtures/quotes.fixture";
import { TX_HASH, verifiedOrderFixture } from "@/tests/fixtures/receipts.fixture";

const adapter = {
  quoteRoute: vi.fn(),
  buildOrder: vi.fn(),
  sendOrder: vi.fn(),
  waitForReceipt: vi.fn(),
  reconcileOrder: vi.fn(),
  getAccountSnapshot: vi.fn(),
};

vi.mock("@/hooks/use-perps-adapter", () => ({
  getBrowserAdapter: (): Partial<PerpsAdapter> => adapter,
}));

vi.mock("@/lib/dreamdex/client", () => ({
  bindSigner: vi.fn(),
  getBrowserMarkets: vi.fn(() => ({})),
}));

const { useExecution } = await import("@/hooks/use-execution");
const { proofStorageKey } = await import("@/components/evidence/captured-proof");

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

function wrapper({ children }: { children: ReactNode }): ReactNode {
  const client = new QueryClient({ defaultOptions: { queries: { queryKeyHashFn: hashFn, retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderExecution() {
  return renderHook(
    () => useExecution({ market: BTC_PERP, markets: [BTC_PERP], counterpart: () => PRIMARY_ADDRESS }),
    { wrapper },
  );
}

async function prepared() {
  const hook = renderExecution();
  await act(async () => {
    await hook.result.current.prepare({ intent: BTC_ORDER, account: SEPARATE_ADDRESS });
  });
  expect(hook.result.current.state.phase).toBe("READY");
  return hook;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW_MS);
  for (const fn of Object.values(adapter)) fn.mockReset();
  adapter.quoteRoute.mockResolvedValue(SEPARATE_QUOTE);
  adapter.buildOrder.mockResolvedValue(BUILT);
  adapter.getAccountSnapshot.mockResolvedValue(SEPARATE_SNAPSHOT);
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("useExecution", () => {
  it("returns to a signable state with the order kept when the wallet rejects", async () => {
    adapter.sendOrder.mockRejectedValue(Object.assign(new Error("User rejected the request."), { code: 4001 }));
    const { result } = await prepared();

    await act(async () => {
      await result.current.confirm({ intent: BTC_ORDER, account: SEPARATE_ADDRESS, walletClient: WALLET });
    });

    expect(result.current.state.phase).toBe("WALLET_REJECTED");
    expect(result.current.state.intent).toEqual(BTC_ORDER);
    expect(result.current.state.txHash).toBeNull();
    expect(adapter.waitForReceipt).not.toHaveBeenCalled();
  });

  it("follows the returned hash, decodes the placement, re-reads the account and stores a proof record", async () => {
    adapter.sendOrder.mockResolvedValue(TX_HASH);
    adapter.waitForReceipt.mockResolvedValue({ status: "success", hash: TX_HASH, block: 300_420n, gasUsed: 1n, waitedMs: 5 } satisfies ReceiptWait);
    adapter.reconcileOrder.mockResolvedValue(verifiedOrderFixture());
    const { result } = await prepared();

    await act(async () => {
      await result.current.confirm({ intent: BTC_ORDER, account: SEPARATE_ADDRESS, walletClient: WALLET });
    });

    expect(result.current.state.phase).toBe("ACCOUNT_RECONCILED");
    expect(result.current.state.settledPhase).toBe("RESTING");
    expect(adapter.reconcileOrder).toHaveBeenCalledWith(
      TX_HASH,
      expect.objectContaining({ expectedAccount: SEPARATE_ADDRESS, counterpartAccount: PRIMARY_ADDRESS }),
    );
    const stored = window.localStorage.getItem(proofStorageKey(TX_HASH));
    expect(stored).not.toBeNull();
    const record = JSON.parse(stored ?? "{}") as Record<string, unknown>;
    expect(record.txHash).toBe(TX_HASH);
    expect(record.selectedAccount).toBe(SEPARATE_ADDRESS);
    expect(record.counterpartAccount).toBe(PRIMARY_ADDRESS);
    expect(record.orderStatus).toBe("resting");
    expect(stored).not.toMatch(/signature|privateKey|mnemonic/i);
  });

  it("never resends after a timeout: Check again polls the same hash", async () => {
    const hash: Hash = TX_HASH;
    adapter.sendOrder.mockResolvedValue(hash);
    adapter.waitForReceipt.mockResolvedValueOnce({ status: "timeout", hash, waitedMs: 60_000 } satisfies ReceiptWait);
    const { result } = await prepared();

    await act(async () => {
      await result.current.confirm({ intent: BTC_ORDER, account: SEPARATE_ADDRESS, walletClient: WALLET });
    });
    expect(result.current.state.phase).toBe("UNKNOWN_OUTCOME");
    expect(result.current.locked).toBe(true);

    adapter.waitForReceipt.mockResolvedValueOnce({ status: "reverted", hash, block: 300_421n, gasUsed: 1n, waitedMs: 3 } satisfies ReceiptWait);
    adapter.reconcileOrder.mockResolvedValue(verifiedOrderFixture({ receiptStatus: "reverted", outcome: "REVERTED", orderId: null, revertReason: "ImmediateOrCancelNoFill" }));
    await act(async () => {
      await result.current.checkAgain();
    });

    expect(adapter.sendOrder).toHaveBeenCalledTimes(1);
    expect(adapter.waitForReceipt).toHaveBeenCalledTimes(2);
    expect(adapter.waitForReceipt).toHaveBeenNthCalledWith(2, hash);
    expect(result.current.state.settledPhase).toBe("ORDER_REJECTED");
    expect(result.current.state.revertReason).toBe("ImmediateOrCancelNoFill");
  });

  it("reports nothing sent when the wallet is on another chain at send time", async () => {
    const { SidecarAdapterError } = await import("@/lib/dreamdex/errors");
    adapter.sendOrder.mockRejectedValue(new SidecarAdapterError("WRONG_CHAIN", "The wallet is on chain 1.", { expectedChainId: 50383, actualChainId: 1 }));
    const { result } = await prepared();

    await act(async () => {
      await result.current.confirm({ intent: BTC_ORDER, account: SEPARATE_ADDRESS, walletClient: WALLET });
    });

    expect(result.current.locked).toBe(false);
    expect(result.current.nothingSent?.title).toBe("Wrong network");
    expect(result.current.state.txHash).toBeNull();
  });

  it("refuses to sign a preview older than the signing window", async () => {
    const { result } = await prepared();
    vi.setSystemTime(NOW_MS + 60_000);

    await act(async () => {
      await result.current.confirm({ intent: BTC_ORDER, account: SEPARATE_ADDRESS, walletClient: WALLET });
    });

    await waitFor(() => expect(result.current.state.phase).toBe("EDITING"));
    expect(result.current.state.notice).toMatch(/old/);
    expect(adapter.sendOrder).not.toHaveBeenCalled();
  });
});
