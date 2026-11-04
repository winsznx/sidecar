import { DEFAULT_FEES } from "@somnia-chain/markets-sdk";
import { parseEther } from "viem";
import { describe, expect, it } from "vitest";

import {
  EXPECTED_SDK_VERSION,
  HIDEKI_DEFAULTS,
  MIN_GAS_BALANCE_FOR_ORDER_WEI,
  PERP_ORDER_FEES,
  PERP_ORDER_GAS_LIMIT,
  explorerAddressUrl,
  explorerTxUrl,
  isLoopbackUrl,
  resolveNetworkConfig,
  sidecarChain,
  usesLocalEndpoint,
} from "@/lib/dreamdex/config";

const HASH = "0xA71FAAF75C1FA13ABAB1F1047B1049AE86477310761FBBAFAF01A6BD0FD17259";

describe("resolveNetworkConfig", () => {
  it("uses the documented Hideki endpoints when nothing is overridden", () => {
    // #given / #when
    const network = resolveNetworkConfig({});
    // #then
    expect(network).toEqual({
      chainId: 50383,
      rpcUrl: "https://api.hideki2.infra.testnet.somnia.network",
      wsUrl: "wss://api.hideki2.infra.testnet.somnia.network/ws",
      indexerUrl: "https://hideki-dev.smk.somnia.host/v1/graphql",
      explorerUrl: "https://explorer.testnet.somnia.network/tokyo",
    });
  });

  it("applies overrides, ignores blanks and trims the explorer's trailing slash", () => {
    // #given
    const overrides = { rpcUrl: "http://127.0.0.1:8645", wsUrl: "ws://127.0.0.1:8645", indexerUrl: "  ", explorerUrl: "https://example.test/tokyo/" };
    // #when
    const network = resolveNetworkConfig(overrides);
    // #then
    expect(network).toMatchObject({ rpcUrl: "http://127.0.0.1:8645", wsUrl: "ws://127.0.0.1:8645", indexerUrl: HIDEKI_DEFAULTS.indexerUrl, explorerUrl: "https://example.test/tokyo" });
  });

  it("accepts a same-origin relative indexer path", () => {
    // #given / #when
    const network = resolveNetworkConfig({ indexerUrl: "/api/indexer" });
    // #then
    expect(network.indexerUrl).toBe("/api/indexer");
  });

  it.each([
    ["a non-URL RPC", { rpcUrl: "not a url" }],
    ["an http WebSocket URL", { wsUrl: "https://api.example.test/ws" }],
    ["a ws explorer URL", { explorerUrl: "wss://explorer.example.test" }],
  ])("throws on %s instead of falling back silently", (_, overrides) => {
    // #given / #when / #then
    expect(() => resolveNetworkConfig(overrides)).toThrow(/Invalid/);
  });

  it("carries overrides into the chain definition wallets and the SDK receive", () => {
    // #given
    const network = resolveNetworkConfig({ rpcUrl: "http://127.0.0.1:8645", wsUrl: "ws://127.0.0.1:8645" });
    // #when
    const chain = sidecarChain(network);
    // #then
    expect([chain.id, chain.rpcUrls.default.http[0], chain.rpcUrls.default.webSocket?.[0]]).toEqual([50383, "http://127.0.0.1:8645", "ws://127.0.0.1:8645"]);
  });
});

describe("explorer links", () => {
  it("builds the verified /tokyo/tx/<hash> page, lowercased", () => {
    // #given / #when
    const url = explorerTxUrl(HASH, HIDEKI_DEFAULTS);
    // #then
    expect(url).toBe("https://explorer.testnet.somnia.network/tokyo/tx/0xa71faaf75c1fa13abab1f1047b1049ae86477310761fbbafaf01a6bd0fd17259");
  });

  it("builds the verified /tokyo/address/<address> page, checksummed", () => {
    // #given / #when
    const url = explorerAddressUrl("0xa1d0cb85c869e534fe1e0c22af3b238301157b5d", HIDEKI_DEFAULTS);
    // #then
    expect(url).toBe("https://explorer.testnet.somnia.network/tokyo/address/0xA1d0CB85c869e534Fe1e0c22af3b238301157b5d");
  });

  it("refuses a value that is not a transaction hash", () => {
    // #given / #when / #then
    expect(() => explorerTxUrl("0x1234", HIDEKI_DEFAULTS)).toThrow(/Not a transaction hash/);
  });
});

describe("gas and fee constants", () => {
  it("match the SDK's own write defaults", () => {
    // #given / #when / #then
    expect([PERP_ORDER_GAS_LIMIT, PERP_ORDER_FEES.maxFeePerGas, PERP_ORDER_FEES.maxPriorityFeePerGas]).toEqual([
      10_000_000n,
      DEFAULT_FEES.maxFeePerGas,
      DEFAULT_FEES.maxPriorityFeePerGas,
    ]);
  });

  it("require 0.6 STT up front for one order, the gas ceiling times the fee ceiling", () => {
    // #given / #when / #then
    expect(MIN_GAS_BALANCE_FOR_ORDER_WEI).toBe(parseEther("0.6"));
  });

  it("pin the SDK version package.json pins", () => {
    // #given / #when / #then
    expect(EXPECTED_SDK_VERSION).toBe("0.32.1");
  });
});

describe("local endpoint detection", () => {
  it.each(["http://127.0.0.1:8645", "ws://localhost:8645", "http://127.1.2.3:8545", "ws://[::1]:8645", "http://0.0.0.0:8645", "http://node.localhost"])(
    "treats %s as a loopback host",
    (url) => {
      // #given / #when / #then
      expect(isLoopbackUrl(url)).toBe(true);
    },
  );

  it.each([HIDEKI_DEFAULTS.rpcUrl, HIDEKI_DEFAULTS.wsUrl, "/api/indexer", "not a url"])("does not treat %s as a loopback host", (url) => {
    // #given / #when / #then
    expect(isLoopbackUrl(url)).toBe(false);
  });

  it("calls a run local when only the WebSocket the SDK reads over points at a fork", () => {
    // #given
    const network = resolveNetworkConfig({ wsUrl: "ws://127.0.0.1:8645" });
    // #when / #then
    expect(usesLocalEndpoint(network)).toBe(true);
  });

  it("calls a run local when only the indexer points at a local node", () => {
    // #given
    const network = resolveNetworkConfig({ indexerUrl: "http://localhost:8080/v1/graphql" });
    // #when / #then
    expect(usesLocalEndpoint(network)).toBe(true);
  });

  it("calls the default endpoints remote", () => {
    // #given / #when / #then
    expect(usesLocalEndpoint(HIDEKI_DEFAULTS)).toBe(false);
  });
});
