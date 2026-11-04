import { marginBankEventsAbi, marginBankWriteAbi } from "@somnia-chain/markets-sdk";
import {
  createWalletClient,
  custom,
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
  erc20Abi,
  getAddress,
  maxUint256,
  type Address,
  type Hash,
  type Hex,
  type TransactionReceipt,
  type WalletClient,
} from "viem";
import { afterEach, describe, expect, it } from "vitest";

import { createPerpsAdapter } from "@/lib/dreamdex/adapter";
import { bindSigner, createMarkets } from "@/lib/dreamdex/client";
import { resolveNetworkConfig, resolveReceiptTimeoutMs, sidecarChain } from "@/lib/dreamdex/config";
import {
  approvalNeeded,
  decodeApprovalCall,
  decodeDepositCall,
  decodeDepositReceipt,
  encodeExactApproval,
  isExactApproval,
  verifyDeposit,
  type DepositCheckInput,
} from "@/lib/dreamdex/deposit";
import type { BuiltMarginDeposit, MarketMeta } from "@/lib/dreamdex/types";

const NETWORK = resolveNetworkConfig({ rpcUrl: "http://127.0.0.1:1", wsUrl: "ws://127.0.0.1:1" });
const ACCOUNT = getAddress("0x590a67a71338d957733b5672d73b979373496803");
const OTHER = getAddress("0x1fd167897f837206dabd88296a50a41b16390708");
const BANK = getAddress("0x478769e1177c0773c43a593dccc4ad15f15f1394");
const TOKEN = getAddress("0xed7993a74dae1e6656b704a424dcd8711aaf4f72");
const AMOUNT = 25_000_000_000_000_000_000n;
const SENT_HASH: Hash = "0x2222222222222222222222222222222222222222222222222222222222222222";

const BTC: MarketMeta = {
  pool: getAddress("0x4181dd08e73bbcdd1ba3e615a18f6abd941b94c0"),
  marginBank: BANK,
  quoteToken: TOKEN,
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

function depositData(amount: bigint): Hex {
  return encodeFunctionData({ abi: marginBankWriteAbi, functionName: "deposit", args: [amount] });
}

const APPROVAL: NonNullable<BuiltMarginDeposit["approval"]> = {
  chainId: 50383,
  to: TOKEN,
  data: encodeExactApproval(BANK, AMOUNT),
  value: 0n,
  gas: 10_000_000n,
  description: "approve",
};

function built(overrides: Partial<BuiltMarginDeposit> = {}): BuiltMarginDeposit {
  return {
    chainId: 50383,
    account: ACCOUNT,
    marginBank: BANK,
    collateralToken: TOKEN,
    amount: AMOUNT,
    approval: APPROVAL,
    deposit: { chainId: 50383, to: BANK, data: depositData(AMOUNT), value: 0n, gas: 10_000_000n, description: "deposit" },
    walletBalance: AMOUNT,
    allowance: 0n,
    block: 1n,
    builtAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

interface FakeWallet {
  client: WalletClient;
  methods: string[];
}

function fakeWallet(account: Address, walletChainId = 50383): FakeWallet {
  const methods: string[] = [];
  const client = createWalletClient({
    account,
    chain: sidecarChain(NETWORK),
    transport: custom({
      async request({ method }: { method: string }) {
        methods.push(method);
        if (method === "eth_chainId") return `0x${walletChainId.toString(16)}`;
        if (method === "eth_sendTransaction") return SENT_HASH;
        throw new Error(`unexpected wallet request ${method}`);
      },
    }),
  });
  return { client, methods };
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

describe("exact approvals", () => {
  it("encodes approve(bank, amount) for exactly the deposit amount", () => {
    // #given / #when
    const call = decodeApprovalCall(encodeExactApproval(BANK, AMOUNT));
    // #then
    expect(call).toEqual({ spender: BANK, amount: AMOUNT });
  });

  it.each([
    ["the unlimited sentinel", maxUint256],
    ["zero", 0n],
  ])("refuses to encode %s", (_, amount) => {
    // #when / #then
    expect(() => encodeExactApproval(BANK, amount)).toThrow();
  });

  it.each<[string, Hex]>([
    ["an unlimited approval", encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [BANK, maxUint256] })],
    ["a larger approval", encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [BANK, AMOUNT + 1n] })],
    ["an approval to another spender", encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [OTHER, AMOUNT] })],
    ["a transfer", encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [BANK, AMOUNT] })],
  ])("does not accept %s as exact", (_, data) => {
    // #when / #then
    expect(isExactApproval(data, BANK, AMOUNT)).toBe(false);
  });

  it("asks for an approval only when the allowance is short", () => {
    // #when / #then
    expect([approvalNeeded(0n, AMOUNT), approvalNeeded(AMOUNT - 1n, AMOUNT), approvalNeeded(AMOUNT, AMOUNT), approvalNeeded(maxUint256, AMOUNT)]).toEqual([true, true, false, false]);
  });

  it("decodes the amount from MarginBank deposit calldata and nothing else", () => {
    // #when / #then
    expect(decodeDepositCall(depositData(AMOUNT))).toBe(AMOUNT);
    expect(decodeDepositCall(encodeExactApproval(BANK, AMOUNT))).toBeNull();
  });
});

describe("the SDK's deposit builder", () => {
  it("builds an unlimited approval by default, which is why Sidecar builds its own", async () => {
    // #given
    const { markets } = setup();
    bindSigner(markets, fakeWallet(ACCOUNT).client);
    // #when
    const sdkBuilt = await markets.trader.buildDepositMargin({ marginBank: BANK, amount: AMOUNT, collateral: TOKEN });
    const exactOnly = await markets.trader.buildDepositMargin({ marginBank: BANK, amount: AMOUNT, collateral: TOKEN, autoApprove: false });
    // #then
    expect(sdkBuilt.approval && decodeApprovalCall(sdkBuilt.approval.data)?.amount).toBe(maxUint256);
    expect(exactOnly.approval).toBeUndefined();
    expect(decodeDepositCall(exactOnly.deposit.data)).toBe(AMOUNT);
  });
});

describe("buildMarginDeposit preconditions", () => {
  it("refuses a zero amount before reading anything", async () => {
    // #given
    const { markets, adapter } = setup();
    bindSigner(markets, fakeWallet(ACCOUNT).client);
    // #when / #then
    await expect(adapter.buildMarginDeposit({ account: ACCOUNT, amount: 0n, market: BTC })).rejects.toMatchObject({ code: "INVALID_DEPOSIT" });
  });

  it("refuses when the bound wallet is not the depositing account", async () => {
    // #given
    const { markets, adapter } = setup();
    bindSigner(markets, fakeWallet(OTHER).client);
    // #when / #then
    await expect(adapter.buildMarginDeposit({ account: ACCOUNT, amount: AMOUNT, market: BTC })).rejects.toMatchObject({ code: "SIGNER_MISMATCH" });
  });
});

describe("sendMarginDeposit refuses before signing", () => {
  it.each<[string, BuiltMarginDeposit]>([
    ["an approval swapped for an unlimited one", built({ approval: { ...APPROVAL, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [BANK, maxUint256] }) } })],
    ["an approval aimed at another spender", built({ approval: { ...APPROVAL, data: encodeExactApproval(OTHER, AMOUNT) } })],
    ["an approval sent to a contract other than the collateral token", built({ approval: { ...APPROVAL, to: OTHER } })],
    ["a deposit that moves a different amount", built({ deposit: { ...built().deposit, data: depositData(AMOUNT * 2n) } })],
    ["a deposit sent somewhere other than the MarginBank", built({ deposit: { ...built().deposit, to: OTHER } })],
  ])("%s", async (_, tampered) => {
    // #given
    const { adapter } = setup();
    const wallet = fakeWallet(ACCOUNT);
    // #when
    const sending = adapter.sendMarginDeposit({ walletClient: wallet.client, account: ACCOUNT, built: tampered });
    // #then
    await expect(sending).rejects.toMatchObject({ code: "INVALID_DEPOSIT" });
    expect(wallet.methods).not.toContain("eth_sendTransaction");
  });

  it("a wallet that is not the account the deposit credits", async () => {
    // #given
    const { adapter } = setup();
    const wallet = fakeWallet(OTHER);
    // #when / #then
    await expect(adapter.sendMarginDeposit({ walletClient: wallet.client, account: OTHER, built: built() })).rejects.toMatchObject({ code: "SIGNER_MISMATCH" });
    expect(wallet.methods).not.toContain("eth_sendTransaction");
  });

  it("a wallet on another chain", async () => {
    // #given
    const { adapter } = setup();
    const wallet = fakeWallet(ACCOUNT, 31337);
    // #when / #then
    await expect(adapter.sendMarginDeposit({ walletClient: wallet.client, account: ACCOUNT, built: built() })).rejects.toMatchObject({ code: "WRONG_CHAIN" });
    expect(wallet.methods).not.toContain("eth_sendTransaction");
  });
});

type RawLog = TransactionReceipt["logs"][number];

function log(address: Address, topics: Hex[], data: Hex): RawLog {
  return {
    address,
    topics: topics as [Hex, ...Hex[]],
    data,
    blockHash: "0x00",
    blockNumber: 10n,
    logIndex: 0,
    transactionHash: SENT_HASH,
    transactionIndex: 0,
    removed: false,
  };
}

function deposited(account: Address, amount: bigint): RawLog {
  return log(BANK, encodeEventTopics({ abi: marginBankEventsAbi, eventName: "Deposited", args: { account } }) as Hex[], encodeAbiParameters([{ type: "uint256" }], [amount]));
}

function transfer(from: Address, to: Address, amount: bigint): RawLog {
  return log(TOKEN, encodeEventTopics({ abi: erc20Abi, eventName: "Transfer", args: { from, to } }) as Hex[], encodeAbiParameters([{ type: "uint256" }], [amount]));
}

function receipt(logs: RawLog[], status: "success" | "reverted" = "success"): TransactionReceipt {
  return {
    blockHash: "0x00",
    blockNumber: 10n,
    contractAddress: null,
    cumulativeGasUsed: 0n,
    effectiveGasPrice: 1n,
    from: ACCOUNT,
    gasUsed: 76_972n,
    logs,
    logsBloom: "0x00",
    status,
    to: BANK,
    transactionHash: SENT_HASH,
    transactionIndex: 0,
    type: "eip1559",
  };
}

function checkInput(logs: RawLog[], overrides: Partial<DepositCheckInput> = {}): DepositCheckInput {
  const r = receipt(logs, overrides.receiptStatus);
  return {
    rpcChainId: 50383,
    txChainId: 50383,
    expectedChainId: 50383,
    from: ACCOUNT,
    to: BANK,
    expectedAccount: ACCOUNT,
    marginBank: BANK,
    collateralToken: TOKEN,
    receiptStatus: "success",
    block: 10n,
    revertReason: null,
    requestedAmount: AMOUNT,
    decoding: decodeDepositReceipt(r, BANK, TOKEN),
    ...overrides,
  };
}

const status = (input: DepositCheckInput): Record<string, string> => Object.fromEntries(verifyDeposit(input).checks.map((c) => [c.id, c.status]));

describe("verifyDeposit", () => {
  it("credits the sender when its own wallet paid the requested amount into its own account", () => {
    // #given
    const input = checkInput([transfer(ACCOUNT, BANK, AMOUNT), deposited(ACCOUNT, AMOUNT)]);
    // #when
    const verdict = verifyDeposit(input);
    // #then
    expect(verdict).toMatchObject({ outcome: "CREDITED", creditedAmount: AMOUNT, transferredAmount: AMOUNT });
    expect(verdict.checks.every((c) => c.status === "pass")).toBe(true);
  });

  it("fails credited-self when another account was credited", () => {
    // #given
    const input = checkInput([transfer(ACCOUNT, BANK, AMOUNT), deposited(ACCOUNT, AMOUNT), deposited(OTHER, 1n)]);
    // #when / #then
    expect(verifyDeposit(input).outcome).toBe("UNVERIFIED");
    expect(status(input)["credited-self"]).toBe("fail");
  });

  it("fails funds-source when collateral also came from another wallet", () => {
    // #given
    const input = checkInput([transfer(ACCOUNT, BANK, AMOUNT), transfer(OTHER, BANK, 1n), deposited(ACCOUNT, AMOUNT)]);
    // #when / #then
    expect(status(input)["funds-source"]).toBe("fail");
  });

  it("fails when the credited amount differs from the calldata", () => {
    // #given
    const input = checkInput([transfer(ACCOUNT, BANK, AMOUNT - 1n), deposited(ACCOUNT, AMOUNT - 1n)]);
    // #when / #then
    expect(status(input)).toMatchObject({ "credited-self": "fail", "funds-source": "fail" });
  });

  it("is never CREDITED when the sender is not the expected account", () => {
    // #given
    const input = checkInput([transfer(ACCOUNT, BANK, AMOUNT), deposited(ACCOUNT, AMOUNT)], { expectedAccount: OTHER });
    // #when / #then
    expect(verifyDeposit(input).outcome).toBe("UNVERIFIED");
    expect(status(input).sender).toBe("fail");
  });

  it("leaves funds-source unknown, and the outcome unverified, when the token could not be read", () => {
    // #given
    const input = checkInput([deposited(ACCOUNT, AMOUNT)], { collateralToken: null });
    // #when / #then
    expect(status(input)["funds-source"]).toBe("unknown");
    expect(verifyDeposit(input).outcome).toBe("UNVERIFIED");
  });

  it("reports a reverted deposit as REVERTED with nothing credited", () => {
    // #given
    const input = checkInput([], { receiptStatus: "reverted", revertReason: "ERC20InsufficientAllowance" });
    // #when
    const verdict = verifyDeposit(input);
    // #then
    expect(verdict).toMatchObject({ outcome: "REVERTED", creditedAmount: null });
    expect(status(input)["receipt-success"]).toBe("fail");
  });

  it("never shows the credit or funding checks as passed on a revert", () => {
    // #given
    const input = checkInput([], { receiptStatus: "reverted", revertReason: "ERC20InsufficientAllowance" });
    // #when
    const checks = status(input);
    // #then
    expect([checks["credited-self"], checks["funds-source"]]).toEqual(["unknown", "unknown"]);
  });
});

describe("receipt timeout configuration", () => {
  it("defaults to 60 s and accepts a whole number of milliseconds", () => {
    // #when / #then
    expect([resolveReceiptTimeoutMs(undefined), resolveReceiptTimeoutMs(" "), resolveReceiptTimeoutMs("90000")]).toEqual([60_000, 60_000, 90_000]);
  });

  it.each(["0", "-5", "1.5", "soon"])("throws on %s instead of silently falling back", (raw) => {
    // #when / #then
    expect(() => resolveReceiptTimeoutMs(raw)).toThrow(/NEXT_PUBLIC_SIDECAR_RECEIPT_TIMEOUT_MS/);
  });

  it("rejects a non-positive adapter receipt timeout at construction", () => {
    // #given
    const markets = createMarkets(NETWORK);
    roots.push(markets);
    // #when / #then
    expect(() => createPerpsAdapter(markets, { network: NETWORK, receiptTimeoutMs: 0 })).toThrow(/receiptTimeoutMs/);
  });
});
