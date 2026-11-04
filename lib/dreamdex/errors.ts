import {
  ContractRevertError,
  decodeRevert,
  IndexerError,
  IndexerUnavailableError,
  InvalidInputError,
  NotConfiguredError,
  NotSupportedError,
  RpcError,
  SignerRequiredError,
  TransactionOutcomeUnknownError,
} from "@somnia-chain/markets-sdk";
import { isHash, type Address, type Hash } from "viem";

import { NormalizeError } from "./normalize";
import { HIDEKI_CHAIN_ID } from "./types";

export type RevertCode =
  | "INSUFFICIENT_COLLATERAL"
  | "INSUFFICIENT_MARGIN"
  | "LEVERAGE_LIMIT"
  | "WALLET_COLLATERAL_SHORT"
  | "IOC_NO_FILL"
  | "FOK_NOT_FILLABLE"
  | "POST_ONLY_WOULD_CROSS"
  | "SELF_MATCH"
  | "MAX_POSITION_SIZE"
  | "OPEN_INTEREST_CAP"
  | "QUANTITY_BELOW_MINIMUM"
  | "QUANTITY_OFF_GRID"
  | "PRICE_OFF_GRID"
  | "PRICE_OUT_OF_BOUNDS"
  | "MARKET_RESTRICTED"
  | "MARKET_NOT_ACTIVE"
  | "ISOLATED_MARKET_BLOCKED"
  | "VOUCHER_MARKET_NOT_ALLOWED"
  | "VOUCHER_LEVERAGE_CAP_NOT_SET"
  | "VOUCHER_LEVERAGE_LOCKED"
  | "MARK_UNAVAILABLE"
  | "POOL_NOT_REGISTERED"
  | "TOO_MANY_RESTING_ORDERS"
  | "ORDER_EXPIRY"
  | "BUILDER_FEE"
  | "TAKER_BAD_DEBT"
  | "CONTRACT_REVERT";

export type SidecarErrorCode =
  | RevertCode
  | "WALLET_REJECTED"
  | "WRONG_CHAIN"
  | "SIGNER_MISSING"
  | "SIGNER_MISMATCH"
  | "INVALID_ORDER"
  | "INVALID_DEPOSIT"
  | "INSUFFICIENT_GAS"
  | "NONCE_CONFLICT"
  | "OUTCOME_UNKNOWN"
  | "TX_NOT_FOUND"
  | "CONTRACT_NOT_FOUND"
  | "RPC_UNAVAILABLE"
  | "INDEXER_UNAVAILABLE"
  | "TIMEOUT"
  | "CANCELLED"
  | "INVALID_INPUT"
  | "NOT_CONFIGURED"
  | "UNEXPECTED_SHAPE"
  | "UNKNOWN";

interface SidecarErrorBase {
  /** Short heading. */
  title: string;
  /** What happened, in plain language. */
  message: string;
  /** The supported next step. */
  nextStep: string;
  /** Whether repeating the same action unchanged could succeed later. */
  retryable: boolean;
  /** Class name of the underlying error, for logs. */
  sourceName: string | null;
}

export type SidecarError =
  | (SidecarErrorBase & { code: RevertCode; revertName: string | null })
  | (SidecarErrorBase & { code: "WRONG_CHAIN"; expectedChainId: number; actualChainId: number | null })
  | (SidecarErrorBase & { code: "SIGNER_MISMATCH"; expected: Address | null; actual: Address | null })
  /** The transaction may be on chain. Look `hash` up before allowing another send. */
  | (SidecarErrorBase & { code: "OUTCOME_UNKNOWN"; hash: Hash | null })
  | (SidecarErrorBase & { code: "TX_NOT_FOUND"; hash: Hash | null })
  | (SidecarErrorBase & { code: "INDEXER_UNAVAILABLE"; retryAfterMs: number | null })
  | (SidecarErrorBase & {
      code: Exclude<
        SidecarErrorCode,
        RevertCode | "WRONG_CHAIN" | "SIGNER_MISMATCH" | "OUTCOME_UNKNOWN" | "TX_NOT_FOUND" | "INDEXER_UNAVAILABLE"
      >;
    });

export type AdapterFailureCode =
  | "WRONG_CHAIN"
  | "SIGNER_MISSING"
  | "SIGNER_MISMATCH"
  | "INVALID_ORDER"
  | "INVALID_DEPOSIT"
  | "TX_NOT_FOUND"
  | "OUTCOME_UNKNOWN";

/** A precondition the adapter itself refused. Thrown before anything reaches the chain. */
export class SidecarAdapterError extends Error {
  readonly code: AdapterFailureCode;
  readonly expectedChainId: number | null;
  readonly actualChainId: number | null;
  readonly expectedAccount: Address | null;
  readonly actualAccount: Address | null;
  readonly hash: Hash | null;

  constructor(
    code: AdapterFailureCode,
    message: string,
    details: {
      expectedChainId?: number;
      actualChainId?: number | null;
      expectedAccount?: Address | null;
      actualAccount?: Address | null;
      hash?: Hash | null;
    } = {},
  ) {
    super(message);
    this.name = "SidecarAdapterError";
    this.code = code;
    this.expectedChainId = details.expectedChainId ?? null;
    this.actualChainId = details.actualChainId ?? null;
    this.expectedAccount = details.expectedAccount ?? null;
    this.actualAccount = details.actualAccount ?? null;
    this.hash = details.hash ?? null;
  }
}

interface RevertCopy {
  code: RevertCode;
  title: string;
  message: string;
  nextStep: string;
  retryable: boolean;
}

const REVERT_GROUPS: ReadonlyArray<{ names: readonly string[]; copy: RevertCopy }> = [
  {
    names: ["InsufficientCollateral"],
    copy: {
      code: "INSUFFICIENT_COLLATERAL",
      title: "Not enough free collateral",
      message: "This account does not have enough unlocked USDso in the MarginBank to lock margin for the order.",
      nextStep: "Fund this account's margin balance or reduce the size, then requote.",
      retryable: false,
    },
  },
  {
    names: ["InsufficientMargin", "InsufficientMarginForOrder", "InsufficientMarginAtCreation"],
    copy: {
      code: "INSUFFICIENT_MARGIN",
      title: "Below initial margin",
      message: "After locking margin for this order, the account's equity would fall below its initial margin requirement.",
      nextStep: "Reduce the size, add collateral, or reduce another position in this account, then requote.",
      retryable: false,
    },
  },
  {
    names: ["InvalidLeverage"],
    copy: {
      code: "LEVERAGE_LIMIT",
      title: "Leverage limit",
      message: "The account's leverage setting does not allow this order.",
      nextStep: "Reduce the size or review the account's leverage setting, then requote.",
      retryable: false,
    },
  },
  {
    names: ["ERC20InsufficientBalance", "ERC20InsufficientAllowance", "InsufficientBalance"],
    copy: {
      code: "WALLET_COLLATERAL_SHORT",
      title: "Wallet top-up failed",
      message: "The pool tried to top up margin from this wallet's USDso, and the wallet balance or its MarginBank allowance was too low.",
      nextStep: "Deposit margin into the MarginBank first, or fund and approve the wallet, then requote.",
      retryable: false,
    },
  },
  {
    names: ["ImmediateOrCancelNoFill"],
    copy: {
      code: "IOC_NO_FILL",
      title: "No fill",
      message: "The immediate-or-cancel order found nothing to match at its price, so the transaction reverted and no order was placed.",
      nextStep: "Review the book, then retry with a crossing price or place a resting limit order.",
      retryable: false,
    },
  },
  {
    names: ["FillOrKillNotFillable"],
    copy: {
      code: "FOK_NOT_FILLABLE",
      title: "Could not fill in full",
      message: "The fill-or-kill order could not fill its whole quantity at once, so nothing was placed.",
      nextStep: "Reduce the size or adjust the price, then retry.",
      retryable: false,
    },
  },
  {
    names: ["PostOnlyWouldCross"],
    copy: {
      code: "POST_ONLY_WOULD_CROSS",
      title: "Post-only would cross",
      message: "The post-only order would have matched immediately, so the pool rejected it.",
      nextStep: "Move the price away from the opposite side of the book by at least one tick.",
      retryable: false,
    },
  },
  {
    names: ["SelfMatchCancelTaker"],
    copy: {
      code: "SELF_MATCH",
      title: "Matched your own order",
      message: "The order would have matched a resting order from the same account.",
      nextStep: "Cancel or reprice the resting order first.",
      retryable: false,
    },
  },
  {
    names: ["MaxPositionSizeExceeded"],
    copy: {
      code: "MAX_POSITION_SIZE",
      title: "Position cap reached",
      message: "The order would take this account's position past the market's per-account position cap.",
      nextStep: "Reduce the size.",
      retryable: false,
    },
  },
  {
    names: ["OpenInterestCapExceeded"],
    copy: {
      code: "OPEN_INTEREST_CAP",
      title: "Market open interest cap",
      message: "The fill would push the market past its total open-interest cap.",
      nextStep: "Reduce the size or try again later.",
      retryable: true,
    },
  },
  {
    names: ["QuantityBelowMinimum", "PositionBelowMinQuantity"],
    copy: {
      code: "QUANTITY_BELOW_MINIMUM",
      title: "Below minimum size",
      message: "The quantity is below the market's minimum order size.",
      nextStep: "Increase the size to at least the market minimum.",
      retryable: false,
    },
  },
  {
    names: ["QuantityNotAlignedToLotSize", "InvalidQuantity"],
    copy: {
      code: "QUANTITY_OFF_GRID",
      title: "Size off the lot grid",
      message: "The quantity is not a whole multiple of the market's lot size.",
      nextStep: "Round the size to the market's lot increment.",
      retryable: false,
    },
  },
  {
    names: ["PriceNotAlignedToTickSize", "InvalidPrice"],
    copy: {
      code: "PRICE_OFF_GRID",
      title: "Price off the tick grid",
      message: "The price is not a whole multiple of the market's tick size.",
      nextStep: "Round the price to the market's tick increment.",
      retryable: false,
    },
  },
  {
    names: ["PriceOutOfBounds", "PriceTooLarge", "PriceOverflow", "FillPriceOutsideBand", "CircuitBreakerTriggered", "InvalidLimitPrice"],
    copy: {
      code: "PRICE_OUT_OF_BOUNDS",
      title: "Price outside the allowed band",
      message: "The price is outside the band the market accepts right now.",
      nextStep: "Use a price closer to the current mark.",
      retryable: false,
    },
  },
  {
    names: ["MarketRestricted"],
    copy: {
      code: "MARKET_RESTRICTED",
      title: "Market is close-only",
      message: "This market only accepts orders that reduce or close a position.",
      nextStep: "Choose another market, or reduce an existing position here.",
      retryable: false,
    },
  },
  {
    names: ["TradingNotActive"],
    copy: {
      code: "MARKET_NOT_ACTIVE",
      title: "Trading not active",
      message: "The market is not accepting orders right now.",
      nextStep: "Choose another market or try again later.",
      retryable: true,
    },
  },
  {
    names: ["IsolatedMarketBlocked", "IsolatedSpansMultipleMarkets"],
    copy: {
      code: "ISOLATED_MARKET_BLOCKED",
      title: "Account confined to another market",
      message: "This account is in single-market mode and already trades a different market.",
      nextStep: "Use the market this account already trades, or a different account.",
      retryable: false,
    },
  },
  {
    names: ["VoucherMarketNotAllowed"],
    copy: {
      code: "VOUCHER_MARKET_NOT_ALLOWED",
      title: "Not allowed with paper funds",
      message: "This account holds voucher funds, and voucher funds cannot open or increase positions in this market.",
      nextStep: "Choose a market on the voucher allowlist, or use an account funded with its own USDso.",
      retryable: false,
    },
  },
  {
    names: ["VoucherLeverageCapNotSet"],
    copy: {
      code: "VOUCHER_LEVERAGE_CAP_NOT_SET",
      title: "Voucher trading paused",
      message: "The protocol's leverage cap for voucher accounts is unset, so voucher accounts cannot increase positions.",
      nextStep: "Use an account funded with its own USDso, or try again later.",
      retryable: true,
    },
  },
  {
    names: ["VoucherAccountLeverageLocked"],
    copy: {
      code: "VOUCHER_LEVERAGE_LOCKED",
      title: "Leverage locked",
      message: "A voucher account cannot change its own leverage setting.",
      nextStep: "Leave the leverage setting unchanged for this account.",
      retryable: false,
    },
  },
  {
    names: ["MarkPriceUnavailable", "OraclePriceStale", "StalePrice", "BothFeedsUnavailable", "SymbolStalePrice", "FeedsDiverged"],
    copy: {
      code: "MARK_UNAVAILABLE",
      title: "Market cannot be priced",
      message: "The protocol cannot currently price this market, so it will not accept an order that opens exposure.",
      nextStep: "Wait for the price feed to recover, then requote.",
      retryable: true,
    },
  },
  {
    names: ["PerpPoolNotRegistered", "InvalidPerpPool", "PerpPoolWrongMarginBank", "InvalidPool"],
    copy: {
      code: "POOL_NOT_REGISTERED",
      title: "Market not active on this MarginBank",
      message: "The MarginBank does not have this market registered, so it rejects orders on it.",
      nextStep: "Choose a market from the current list.",
      retryable: false,
    },
  },
  {
    names: ["TooManyRestingOrders"],
    copy: {
      code: "TOO_MANY_RESTING_ORDERS",
      title: "Too many resting orders",
      message: "This account already has the maximum number of resting orders on this market.",
      nextStep: "Cancel a resting order first.",
      retryable: false,
    },
  },
  {
    names: ["OrderAlreadyExpired", "ExpiredOrderMustBeCancelled"],
    copy: {
      code: "ORDER_EXPIRY",
      title: "Expiry problem",
      message: "The order's expiry is in the past, or an expired order is blocking the book.",
      nextStep: "Refresh and try again.",
      retryable: true,
    },
  },
  {
    names: ["BuilderFeeExceedsApproval", "BuilderNotApproved", "BuilderFeeExceedsCap", "InvalidBuilder"],
    copy: {
      code: "BUILDER_FEE",
      title: "Builder fee rejected",
      message: "The order carried a builder fee the account has not approved.",
      nextStep: "Place the order without a builder fee.",
      retryable: false,
    },
  },
  {
    names: ["TakerFillWouldMintBadDebt"],
    copy: {
      code: "TAKER_BAD_DEBT",
      title: "Fill would leave bad debt",
      message: "The fill would leave this account with negative equity, so the pool refused it.",
      nextStep: "Reduce the size or add collateral.",
      retryable: false,
    },
  },
];

const REVERT_COPY_BY_NAME: ReadonlyMap<string, RevertCopy> = new Map(
  REVERT_GROUPS.flatMap(({ names, copy }) => names.map((name) => [name, copy] as const)),
);

function genericRevertCopy(name: string | null): RevertCopy {
  return {
    code: "CONTRACT_REVERT",
    title: "Rejected by the contract",
    message: name ? `The contract rejected the call with ${name}.` : "The contract rejected the call and gave no decodable reason.",
    nextStep: "Check the order inputs and the account's state, then requote.",
    retryable: false,
  };
}

/** The plain-language copy for one decoded contract error name. */
export function describeRevert(name: string | null | undefined): RevertCopy {
  return (name ? REVERT_COPY_BY_NAME.get(name) : undefined) ?? genericRevertCopy(name ?? null);
}

function* causeChain(error: unknown): Generator<unknown> {
  const seen = new Set<unknown>();
  let current: unknown = error;
  for (let depth = 0; depth < 12 && current !== undefined && current !== null && !seen.has(current); depth++) {
    yield current;
    seen.add(current);
    current = typeof current === "object" && "cause" in current ? current.cause : undefined;
  }
}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null && key in value ? (value as Record<string, unknown>)[key] : undefined;
}

function nameOf(value: unknown): string | null {
  const name = field(value, "name");
  return typeof name === "string" ? name : null;
}

function messageOf(value: unknown): string {
  const message = field(value, "message");
  return typeof message === "string" ? message : "";
}

function anyInChain(error: unknown, test: (link: unknown) => boolean): boolean {
  for (const link of causeChain(error)) if (test(link)) return true;
  return false;
}

function findInChain(error: unknown, test: (link: unknown) => boolean): unknown {
  for (const link of causeChain(error)) if (test(link)) return link;
  return undefined;
}

const REJECTION_PATTERN = /user (rejected|denied)|rejected the request|request rejected/i;

function isUserRejection(link: unknown): boolean {
  const code = field(link, "code");
  return (
    nameOf(link) === "UserRejectedRequestError" || code === 4001 || code === "ACTION_REJECTED" || REJECTION_PATTERN.test(messageOf(link))
  );
}

const REVERT_ERROR_NAMES = new Set(["ContractFunctionRevertedError", "ExecutionRevertedError", "RawContractError"]);
const TRANSPORT_ERROR_NAMES = new Set(["HttpRequestError", "WebSocketRequestError", "SocketClosedError", "RpcRequestError"]);
const NONCE_ERROR_NAMES = new Set(["NonceTooLowError", "NonceTooHighError", "NonceMaxValueError"]);

function base(title: string, message: string, nextStep: string, retryable: boolean, error: unknown): SidecarErrorBase {
  return { title, message, nextStep, retryable, sourceName: nameOf(error) };
}

function fromRevertName(name: string | null, error: unknown): SidecarError {
  const copy = describeRevert(name);
  return { code: copy.code, revertName: name, ...base(copy.title, copy.message, copy.nextStep, copy.retryable, error) };
}

const HASH_IN_TEXT = /0x[0-9a-fA-F]{64}/;

/** viem's receipt-timeout error carries the hash only in its message. */
function hashOf(value: unknown): Hash | null {
  const hash = field(value, "hash");
  if (typeof hash === "string" && isHash(hash)) return hash;
  const match = HASH_IN_TEXT.exec(messageOf(value))?.[0];
  return match !== undefined && isHash(match) ? match : null;
}

function fromAdapterError(error: SidecarAdapterError): SidecarError {
  switch (error.code) {
    case "WRONG_CHAIN":
      return {
        code: "WRONG_CHAIN",
        expectedChainId: error.expectedChainId ?? HIDEKI_CHAIN_ID,
        actualChainId: error.actualChainId,
        ...base(
          "Wrong network",
          `The wallet is on chain ${error.actualChainId ?? "unknown"}, not Somnia Hideki (${HIDEKI_CHAIN_ID}). Nothing was sent.`,
          `Switch the wallet to Hideki (${HIDEKI_CHAIN_ID}), then requote.`,
          false,
          error,
        ),
      };
    case "SIGNER_MISMATCH":
      return {
        code: "SIGNER_MISMATCH",
        expected: error.expectedAccount,
        actual: error.actualAccount,
        ...base(
          "Wallet mismatch",
          `The connected wallet is ${error.actualAccount ?? "unknown"}, but this order is for ${error.expectedAccount ?? "another account"}. Nothing was sent.`,
          "Switch to the selected account in the wallet, then requote.",
          false,
          error,
        ),
      };
    case "SIGNER_MISSING":
      return { code: "SIGNER_MISSING", ...base("No wallet connected", error.message, "Connect the wallet for this account.", false, error) };
    case "INVALID_ORDER":
      return { code: "INVALID_ORDER", ...base("Order not valid", error.message, "Correct the order inputs.", false, error) };
    case "INVALID_DEPOSIT":
      return { code: "INVALID_DEPOSIT", ...base("Deposit not valid", error.message, "Rebuild the deposit from fresh wallet reads.", false, error) };
    case "TX_NOT_FOUND":
      return {
        code: "TX_NOT_FOUND",
        hash: error.hash,
        ...base("Transaction not found", error.message, "Check the hash and network, or wait for it to mine.", true, error),
      };
    case "OUTCOME_UNKNOWN":
      return {
        code: "OUTCOME_UNKNOWN",
        hash: error.hash,
        ...base(
          "Outcome unknown",
          error.message,
          "Look up the transaction before sending again. Do not resend automatically.",
          false,
          error,
        ),
      };
  }
}

/**
 * Map anything thrown by the SDK, viem, a wallet or the adapter to one stable code with
 * plain-language copy. Checks run most specific first: a lost receipt must never read as a
 * retryable RPC failure, and a wallet rejection wrapped in a send error is still a rejection.
 */
export function classifyError(error: unknown): SidecarError {
  if (error instanceof AggregateError && error.errors.length > 0) {
    const first: unknown = error.errors[0];
    return classifyError(first);
  }
  if (error instanceof SidecarAdapterError) return fromAdapterError(error);

  if (error instanceof TransactionOutcomeUnknownError) {
    return {
      code: "OUTCOME_UNKNOWN",
      hash: error.hash ?? null,
      ...base(
        "Outcome unknown",
        "The transaction was signed and may have reached the network, but its receipt was not observed.",
        "Look up the transaction before sending again. Do not resend automatically.",
        false,
        error,
      ),
    };
  }

  if (anyInChain(error, isUserRejection)) {
    return {
      code: "WALLET_REJECTED",
      ...base("Signature rejected", "The wallet request was rejected, so nothing was sent.", "Retry when you are ready to sign.", true, error),
    };
  }

  if (error instanceof ContractRevertError) return fromRevertName(error.errorName ?? null, error);
  if (anyInChain(error, (link) => REVERT_ERROR_NAMES.has(nameOf(link) ?? ""))) {
    return fromRevertName(decodeRevert(error).errorName ?? null, error);
  }

  if (error instanceof SignerRequiredError || anyInChain(error, (link) => nameOf(link) === "AccountNotFoundError")) {
    return {
      code: "SIGNER_MISSING",
      ...base("No wallet connected", "This action needs a connected wallet for the selected account.", "Connect the wallet for this account.", false, error),
    };
  }

  if (anyInChain(error, (link) => nameOf(link) === "ChainMismatchError")) {
    return {
      code: "WRONG_CHAIN",
      expectedChainId: HIDEKI_CHAIN_ID,
      actualChainId: null,
      ...base(
        "Wrong network",
        `The wallet is not on Somnia Hideki (${HIDEKI_CHAIN_ID}). Nothing was sent.`,
        `Switch the wallet to Hideki (${HIDEKI_CHAIN_ID}), then requote.`,
        false,
        error,
      ),
    };
  }

  if (anyInChain(error, (link) => nameOf(link) === "InsufficientFundsError" || /insufficient funds/i.test(messageOf(link)))) {
    return {
      code: "INSUFFICIENT_GAS",
      ...base(
        "Not enough STT for gas",
        "The wallet does not hold enough STT to cover the transaction's gas ceiling, so the node refused it.",
        "Fund this wallet with STT, then retry.",
        false,
        error,
      ),
    };
  }

  if (anyInChain(error, (link) => NONCE_ERROR_NAMES.has(nameOf(link) ?? "") || /nonce too (low|high)/i.test(messageOf(link)))) {
    return {
      code: "NONCE_CONFLICT",
      ...base(
        "Nonce conflict",
        "The wallet's transaction count is out of step with the network.",
        "Check for a pending transaction from this wallet before sending again.",
        false,
        error,
      ),
    };
  }

  const receiptTimeout = findInChain(error, (link) => nameOf(link) === "WaitForTransactionReceiptTimeoutError");
  if (receiptTimeout !== undefined) {
    return {
      code: "OUTCOME_UNKNOWN",
      hash: hashOf(receiptTimeout),
      ...base(
        "Outcome unknown",
        "No receipt arrived before the deadline. The transaction may still mine.",
        "Look up the transaction before sending again. Do not resend automatically.",
        false,
        error,
      ),
    };
  }

  if (error instanceof IndexerUnavailableError) {
    return {
      code: "INDEXER_UNAVAILABLE",
      retryAfterMs: error.reason === "breaker-open" ? error.retryAfterMs : null,
      ...base("History unavailable", "The indexer is not answering, so indexed history cannot be shown.", "Retry shortly. Chain reads are unaffected.", true, error),
    };
  }
  if (error instanceof IndexerError) {
    return {
      code: "INDEXER_UNAVAILABLE",
      retryAfterMs: null,
      ...base("History unavailable", "The indexer request did not complete.", "Retry shortly. Chain reads are unaffected.", true, error),
    };
  }

  if (anyInChain(error, (link) => nameOf(link) === "AbortError")) {
    return { code: "CANCELLED", ...base("Cancelled", "The request was cancelled.", "Start it again if you still need it.", true, error) };
  }

  if (anyInChain(error, (link) => nameOf(link) === "ContractFunctionZeroDataError")) {
    return {
      code: "CONTRACT_NOT_FOUND",
      ...base(
        "No market at this address",
        "No contract answered the call at this address, so it is not a live perp market on this network.",
        "Choose a market from the current list.",
        false,
        error,
      ),
    };
  }

  if (anyInChain(error, (link) => nameOf(link) === "TimeoutError" || /timed? ?out/i.test(messageOf(link)))) {
    return { code: "TIMEOUT", ...base("Request timed out", "The network did not answer in time.", "Retry. If it keeps failing, the RPC may be degraded.", true, error) };
  }

  if (error instanceof RpcError || anyInChain(error, (link) => TRANSPORT_ERROR_NAMES.has(nameOf(link) ?? ""))) {
    return {
      code: "RPC_UNAVAILABLE",
      ...base("Network unavailable", "The chain RPC request did not complete.", "Retry shortly. Trading stays disabled until reads recover.", true, error),
    };
  }

  if (error instanceof InvalidInputError || anyInChain(error, (link) => nameOf(link) === "InvalidAddressError")) {
    return { code: "INVALID_INPUT", ...base("Invalid input", messageOf(error) || "The request was malformed.", "Correct the input.", false, error) };
  }
  if (error instanceof NotConfiguredError || error instanceof NotSupportedError) {
    return { code: "NOT_CONFIGURED", ...base("Not available", "This feature is not configured for the current network.", "Check the network configuration.", false, error) };
  }
  if (error instanceof NormalizeError) {
    return {
      code: "UNEXPECTED_SHAPE",
      ...base("Unexpected data", "A protocol read returned data in a shape Sidecar does not recognise.", "Retry. If it persists, the SDK and contracts may have drifted.", false, error),
    };
  }

  return { code: "UNKNOWN", ...base("Something went wrong", "An unexpected error occurred.", "Retry, and check the console for details.", false, error) };
}
