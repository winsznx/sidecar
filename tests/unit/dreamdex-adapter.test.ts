import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains";
import { createWalletClient, custom, getAddress, type Address, type Hash, type WalletClient } from "viem";
import { afterEach, describe, expect, it } from "vitest";

import { assertOrderOnGrid, createPerpsAdapter } from "@/lib/dreamdex/adapter";
import { bindSigner, createMarkets } from "@/lib/dreamdex/client";
import { resolveNetworkConfig, sidecarChain } from "@/lib/dreamdex/config";
import { SidecarAdapterError } from "@/lib/dreamdex/errors";
import { decodePlaceOrderCalldata } from "@/lib/dreamdex/normalize";
import type { MarketMeta, OrderIntent } from "@/lib/dreamdex/types";

// Offline: the SDK root is constructed against an unreachable local endpoint and only pure build paths run.
const NETWORK = resolveNetworkConfig({ rpcUrl: "http://127.0.0.1:1", wsUrl: "ws://127.0.0.1:1" });
const SENDER = getAddress("0xa1d0cb85c869e534fe1e0c22af3b238301157b5d");
const OTHER = getAddress("0xdf271a2b6de82cabed87ca117c29058fce4af0cc");
const SENT_HASH: Hash = "0x1111111111111111111111111111111111111111111111111111111111111111";

const BTC: MarketMeta = {
  pool: getAddress("0x4181dd08e73bbcdd1ba3e615a18f6abd941b94c0"),
  marginBank: getAddress("0x478769e1177c0773c43a593dccc4ad15f15f1394"),
  quoteToken: getAddress("0xed7993a74dae1e6656b704a424dcd8711aaf4f72"),
  stopRegistry: null,
  baseSymbol: "BTC",
  quoteSymbol: "USDso",
  displaySymbol: "BTC-PERP",
  baseDecimals: 8,
  quoteDecimals: 18,
  tickSize: 100000000000000000n,
  lotSize: 1000n,
  minQuantity: 13000n,
  initialMarginBps: 500,
  maxLeverageX: 20,
  indexedMarkPrice: null,
  indexedMarkUpdatedAt: null,
  fundingRate8h: null,
  openInterest: null,
  tradeable: true,
};

const INTENT: OrderIntent = { pool: BTC.pool, side: "long", quantity: 13000n, price: 73743500000000000000000n, timeInForce: "IOC" };

interface FakeWallet {
  client: WalletClient;
  requests: { method: string; params: unknown }[];
}

/** A wallet whose provider reports `walletChainId` and returns SENT_HASH for any send. */
function fakeWallet(account: Address, walletChainId = 50383, chain = sidecarChain(NETWORK)): FakeWallet {
  const requests: { method: string; params: unknown }[] = [];
  const client = createWalletClient({
    account,
    chain,
    transport: custom({
      async request({ method, params }: { method: string; params?: unknown }) {
        requests.push({ method, params });
        if (method === "eth_chainId") return `0x${walletChainId.toString(16)}`;
        if (method === "eth_sendTransaction") return SENT_HASH;
        throw new Error(`unexpected wallet request ${method}`);
      },
    }),
  });
  return { client, requests };
}

const roots: ReturnType<typeof createMarkets>[] = [];
function setup(): { markets: ReturnType<typeof createMarkets>; adapter: ReturnType<typeof createPerpsAdapter> } {
  const markets = createMarkets(NETWORK);
  roots.push(markets);
  return { markets, adapter: createPerpsAdapter(markets, { network: NETWORK }) };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => root.close()));
});

describe("assertOrderOnGrid", () => {
  it.each<[string, Partial<OrderIntent>]>([
    ["a quantity off the lot grid", { quantity: 13500n }],
    ["a quantity below the minimum", { quantity: 12000n }],
    ["a price off the tick grid", { price: 73743550000000000000000n }],
    ["a zero price", { price: 0n }],
    ["another market's pool", { pool: OTHER }],
  ])("rejects %s before anything is built", (_, change) => {
    // #given
    const intent = { ...INTENT, ...change };
    // #when / #then
    expect(() => assertOrderOnGrid(intent, BTC)).toThrow(SidecarAdapterError);
  });
});

describe("bindSigner", () => {
  it("refuses a wallet connected to another chain", () => {
    // #given
    const { markets } = setup();
    const wallet = fakeWallet(SENDER, 50312, { ...hidekiTestnet, id: 50312 });
    // #when / #then
    expect(() => bindSigner(markets, wallet.client)).toThrow(expect.objectContaining({ code: "WRONG_CHAIN" }));
  });

  it("returns the address the SDK now trades as", () => {
    // #given
    const { markets } = setup();
    // #when
    const bound = bindSigner(markets, fakeWallet(SENDER).client);
    // #then
    expect(bound).toBe(SENDER);
  });
});

describe("buildOrder", () => {
  it("encodes the intent, the IOC order type and the SDK gas ceiling", async () => {
    // #given
    const { markets, adapter } = setup();
    bindSigner(markets, fakeWallet(SENDER).client);
    // #when
    const built = await adapter.buildOrder(INTENT, BTC, { expectedSigner: SENDER });
    // #then
    expect({ to: built.to, gas: built.gas, value: built.value, orderType: built.orderType, decoded: decodePlaceOrderCalldata(built.data) }).toMatchObject({
      to: BTC.pool,
      gas: 10_000_000n,
      value: 0n,
      orderType: 2,
      decoded: { isBid: true, quantity: 13000n, price: 73743500000000000000000n, orderType: 2 },
    });
  });

  it("refuses to build without a bound wallet", async () => {
    // #given
    const { adapter } = setup();
    // #when / #then
    await expect(adapter.buildOrder(INTENT, BTC)).rejects.toMatchObject({ code: "SIGNER_MISSING" });
  });

  it("refuses to build when the bound wallet is not the selected account", async () => {
    // #given
    const { markets, adapter } = setup();
    bindSigner(markets, fakeWallet(OTHER).client);
    // #when / #then
    await expect(adapter.buildOrder(INTENT, BTC, { expectedSigner: SENDER })).rejects.toMatchObject({ code: "SIGNER_MISMATCH" });
  });
});

describe("sendOrder", () => {
  async function built(): Promise<{ adapter: ReturnType<typeof createPerpsAdapter>; order: Awaited<ReturnType<ReturnType<typeof createPerpsAdapter>["buildOrder"]>> }> {
    const { markets, adapter } = setup();
    bindSigner(markets, fakeWallet(SENDER).client);
    return { adapter, order: await adapter.buildOrder(INTENT, BTC) };
  }

  it("returns the wallet's hash as soon as the wallet returns it", async () => {
    // #given
    const { adapter, order } = await built();
    const wallet = fakeWallet(SENDER);
    // #when
    const hash = await adapter.sendOrder({ walletClient: wallet.client, account: SENDER, built: order });
    // #then
    expect(hash).toBe(SENT_HASH);
  });

  it("sends the built calldata with the SDK's gas ceiling and fee envelope", async () => {
    // #given
    const { adapter, order } = await built();
    const wallet = fakeWallet(SENDER);
    // #when
    await adapter.sendOrder({ walletClient: wallet.client, account: SENDER, built: order });
    // #then
    const sent = wallet.requests.find((r) => r.method === "eth_sendTransaction");
    expect(sent?.params).toEqual([
      expect.objectContaining({ from: SENDER, to: BTC.pool, data: order.data, gas: "0x989680", maxFeePerGas: "0xdf8475800", maxPriorityFeePerGas: "0x0" }),
    ]);
  });

  it("refuses to sign when the wallet reports another chain, and sends nothing", async () => {
    // #given
    const { adapter, order } = await built();
    const wallet = fakeWallet(SENDER, 50312);
    // #when
    const sending = adapter.sendOrder({ walletClient: wallet.client, account: SENDER, built: order });
    // #then
    await expect(sending).rejects.toMatchObject({ code: "WRONG_CHAIN", actualChainId: 50312 });
    expect(wallet.requests.some((r) => r.method === "eth_sendTransaction")).toBe(false);
  });

  it("refuses to send from a wallet that is not the selected account", async () => {
    // #given
    const { adapter, order } = await built();
    const wallet = fakeWallet(OTHER);
    // #when / #then
    await expect(adapter.sendOrder({ walletClient: wallet.client, account: SENDER, built: order })).rejects.toMatchObject({ code: "SIGNER_MISMATCH" });
  });

  it("refuses a prepared transaction whose calldata no longer matches its intent", async () => {
    // #given
    const { adapter, order } = await built();
    const tampered = { ...order, intent: { ...order.intent, quantity: 26000n } };
    // #when / #then
    await expect(adapter.sendOrder({ walletClient: fakeWallet(SENDER).client, account: SENDER, built: tampered })).rejects.toMatchObject({ code: "INVALID_ORDER" });
  });
});
