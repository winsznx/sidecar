import {
  ContractRevertError,
  contractErrorsAbi,
  IndexerError,
  IndexerUnavailableError,
  InvalidInputError,
  RpcError,
  SignerRequiredError,
  TransactionOutcomeUnknownError,
} from "@somnia-chain/markets-sdk";
import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains";
import {
  ChainMismatchError,
  ContractFunctionRevertedError,
  InsufficientFundsError,
  UserRejectedRequestError,
  WaitForTransactionReceiptTimeoutError,
  type Hash,
} from "viem";
import { describe, expect, it } from "vitest";

import { classifyError, describeRevert, SidecarAdapterError, type SidecarError } from "@/lib/dreamdex/errors";
import { NormalizeError } from "@/lib/dreamdex/normalize";

const HASH: Hash = "0xa71faaf75c1fa13abab1f1047b1049ae86477310761fbbafaf01a6bd0fd17259";

function withCause(message: string, cause: unknown): Error {
  return new Error(message, { cause });
}

describe("classifyError: wallet and signer", () => {
  it("recognises viem's UserRejectedRequestError", () => {
    // #given
    const error = new UserRejectedRequestError(new Error("User rejected the request."));
    // #when / #then
    expect(classifyError(error).code).toBe("WALLET_REJECTED");
  });

  it("recognises a bare EIP-1193 4001 buried in a cause chain", () => {
    // #given
    const error = withCause("sendTransaction failed", { code: 4001, message: "denied" });
    // #when / #then
    expect(classifyError(error).code).toBe("WALLET_REJECTED");
  });

  it("maps the SDK's SignerRequiredError to SIGNER_MISSING", () => {
    // #given
    const error = new SignerRequiredError("buildPlacePerpOrder");
    // #when / #then
    expect(classifyError(error).code).toBe("SIGNER_MISSING");
  });

  it("maps viem's ChainMismatchError to WRONG_CHAIN", () => {
    // #given
    const error = new ChainMismatchError({ chain: hidekiTestnet, currentChainId: 50312 });
    // #when / #then
    expect(classifyError(error).code).toBe("WRONG_CHAIN");
  });

  it("keeps the adapter's own chain details", () => {
    // #given
    const error = new SidecarAdapterError("WRONG_CHAIN", "wrong chain", { expectedChainId: 50383, actualChainId: 50312 });
    // #when
    const classified = classifyError(error);
    // #then
    expect(classified).toMatchObject({ code: "WRONG_CHAIN", expectedChainId: 50383, actualChainId: 50312 });
  });

  it("keeps both addresses on a signer mismatch", () => {
    // #given
    const expected = "0xA1d0CB85c869e534Fe1e0c22af3b238301157b5d";
    const actual = "0xdf271A2B6De82cabED87cA117C29058fcE4Af0CC";
    const error = new SidecarAdapterError("SIGNER_MISMATCH", "mismatch", { expectedAccount: expected, actualAccount: actual });
    // #when / #then
    expect(classifyError(error)).toMatchObject({ code: "SIGNER_MISMATCH", expected, actual, retryable: false });
  });
});

describe("classifyError: contract reverts", () => {
  it.each([
    ["InsufficientCollateral", "INSUFFICIENT_COLLATERAL"],
    ["InsufficientMarginForOrder", "INSUFFICIENT_MARGIN"],
    ["ImmediateOrCancelNoFill", "IOC_NO_FILL"],
    ["FillOrKillNotFillable", "FOK_NOT_FILLABLE"],
    ["PostOnlyWouldCross", "POST_ONLY_WOULD_CROSS"],
    ["MaxPositionSizeExceeded", "MAX_POSITION_SIZE"],
    ["OpenInterestCapExceeded", "OPEN_INTEREST_CAP"],
    ["MarketRestricted", "MARKET_RESTRICTED"],
    ["IsolatedMarketBlocked", "ISOLATED_MARKET_BLOCKED"],
    ["VoucherMarketNotAllowed", "VOUCHER_MARKET_NOT_ALLOWED"],
    ["VoucherLeverageCapNotSet", "VOUCHER_LEVERAGE_CAP_NOT_SET"],
    ["QuantityBelowMinimum", "QUANTITY_BELOW_MINIMUM"],
    ["QuantityNotAlignedToLotSize", "QUANTITY_OFF_GRID"],
    ["PriceNotAlignedToTickSize", "PRICE_OFF_GRID"],
    ["MarkPriceUnavailable", "MARK_UNAVAILABLE"],
    ["PerpPoolNotRegistered", "POOL_NOT_REGISTERED"],
    ["ERC20InsufficientAllowance", "WALLET_COLLATERAL_SHORT"],
  ])("maps %s to %s", (errorName, code) => {
    // #given
    const error = new ContractRevertError({ errorName });
    // #when
    const classified = classifyError(error);
    // #then
    expect([classified.code, "revertName" in classified ? classified.revertName : undefined]).toEqual([code, errorName]);
  });

  it("names an unmapped revert instead of hiding it", () => {
    // #given
    const error = new ContractRevertError({ errorName: "AdlSelfSettle" });
    // #when
    const classified = classifyError(error);
    // #then
    expect([classified.code, classified.message]).toEqual(["CONTRACT_REVERT", "The contract rejected the call with AdlSelfSettle."]);
  });

  it("decodes a raw viem revert carrying the ImmediateOrCancelNoFill selector", () => {
    // #given
    const error = withCause("eth_call reverted", new ContractFunctionRevertedError({ abi: contractErrorsAbi, data: "0xd48c4403", functionName: "placeOrder" }));
    // #when / #then
    expect(classifyError(error).code).toBe("IOC_NO_FILL");
  });

  it("uses only checked names in the error catalogue", () => {
    // #given
    const declared = new Set<string>(contractErrorsAbi.filter((item) => item.type === "error").map((item) => item.name));
    const catalogue = ["InsufficientCollateral", "ImmediateOrCancelNoFill", "MaxPositionSizeExceeded", "MarketRestricted", "IsolatedMarketBlocked", "VoucherMarketNotAllowed"];
    // #when / #then
    expect(catalogue.filter((name) => !declared.has(name))).toEqual([]);
  });
});

describe("classifyError: outcome and transport", () => {
  it("keeps the hash of a transaction whose outcome is unknown", () => {
    // #given
    const error = new TransactionOutcomeUnknownError({ chainId: 50383, operation: "waitForTransactionReceipt", hash: HASH });
    // #when
    const classified = classifyError(error);
    // #then
    expect(classified).toMatchObject({ code: "OUTCOME_UNKNOWN", hash: HASH, retryable: false });
  });

  it("checks for an unknown outcome before treating it as a plain RPC failure", () => {
    // #given
    const error = new TransactionOutcomeUnknownError({ chainId: 50383, operation: "eth_sendRawTransactionSync" });
    // #when / #then
    expect(error instanceof RpcError && classifyError(error).code === "OUTCOME_UNKNOWN").toBe(true);
  });

  it("reads the hash out of viem's receipt timeout", () => {
    // #given
    const error = new WaitForTransactionReceiptTimeoutError({ hash: HASH });
    // #when / #then
    expect(classifyError(error)).toMatchObject({ code: "OUTCOME_UNKNOWN", hash: HASH });
  });

  it("maps a node's insufficient-funds refusal to INSUFFICIENT_GAS", () => {
    // #given
    const error = withCause("send failed", new InsufficientFundsError());
    // #when / #then
    expect(classifyError(error).code).toBe("INSUFFICIENT_GAS");
  });

  it("maps the SDK's RpcError to a retryable RPC_UNAVAILABLE", () => {
    // #given
    const error = new RpcError("readContract", "socket closed");
    // #when / #then
    expect(classifyError(error)).toMatchObject({ code: "RPC_UNAVAILABLE", retryable: true });
  });

  it("maps a call that returned no data to CONTRACT_NOT_FOUND", () => {
    // #given
    const error = new RpcError("readContract", 'The contract function "tryGetHealthSnapshot" returned no data ("0x").', {
      cause: { name: "ContractFunctionZeroDataError", message: "returned no data" },
    });
    // #when / #then
    expect(classifyError(error).code).toBe("CONTRACT_NOT_FOUND");
  });

  it("keeps the breaker's retry hint for an indexer refusal", () => {
    // #given
    const error = new IndexerUnavailableError("listPerpMarkets", "breaker-open", "breaker open", 4_000, 5);
    // #when / #then
    expect(classifyError(error)).toMatchObject({ code: "INDEXER_UNAVAILABLE", retryAfterMs: 4_000 });
  });

  it("maps any other indexer failure to INDEXER_UNAVAILABLE", () => {
    // #given
    const error = new IndexerError("getOpenOrders", "HTTP 502");
    // #when / #then
    expect(classifyError(error).code).toBe("INDEXER_UNAVAILABLE");
  });

  it("classifies an AggregateError by its first error", () => {
    // #given
    const error = new AggregateError([new ContractRevertError({ errorName: "MarketRestricted" }), new Error("second")], "Every order preview failed.");
    // #when / #then
    expect(classifyError(error).code).toBe("MARKET_RESTRICTED");
  });
});

describe("classifyError: inputs and the unknown", () => {
  it.each<[string, unknown, SidecarError["code"]]>([
    ["an SDK InvalidInputError", new InvalidInputError("price must be > 0"), "INVALID_INPUT"],
    ["a NormalizeError", new NormalizeError("tickSize", "1.5"), "UNEXPECTED_SHAPE"],
    ["an AbortError", Object.assign(new Error("aborted"), { name: "AbortError" }), "CANCELLED"],
    ["a thrown string", "boom", "UNKNOWN"],
    ["undefined", undefined, "UNKNOWN"],
  ])("maps %s", (_, error, code) => {
    // #given the error above
    // #when / #then
    expect(classifyError(error).code).toBe(code);
  });
});

describe("describeRevert copy", () => {
  it("never uses em dashes or promises protection", () => {
    // #given
    const names = ["InsufficientCollateral", "ImmediateOrCancelNoFill", "VoucherMarketNotAllowed", "MarketRestricted", "Nonexistent"];
    // #when
    const text = names.map((name) => describeRevert(name)).flatMap((copy) => [copy.title, copy.message, copy.nextStep]).join(" ");
    // #then
    expect(/—|prevents liquidation|guarantee|keeps your portfolio safe/i.test(text)).toBe(false);
  });
});
