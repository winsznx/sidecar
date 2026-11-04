import type { Hash } from "viem";
import { describe, expect, it } from "vitest";

import type { ExecutionPhase, ReceiptWait } from "@/lib/dreamdex/types";
import {
  canSubmit,
  eventForReceiptWait,
  executionReducer,
  INITIAL_EXECUTION_STATE,
  isLocked,
  isQuoteValidFor,
  isTerminal,
  phaseCopy,
  quoteValidity,
  transition,
  type ExecutionEvent,
  type ExecutionState,
} from "@/lib/orders/lifecycle";
import { NOW_MS, PRIMARY_ADDRESS, SEPARATE_ADDRESS } from "@/tests/fixtures/accounts.fixture";
import { ETH_POOL } from "@/tests/fixtures/markets.fixture";
import { BTC_ORDER, patchQuote, SEPARATE_QUOTE } from "@/tests/fixtures/quotes.fixture";
import { TX_HASH } from "@/tests/fixtures/receipts.fixture";

const OTHER_HASH: Hash = "0x9999999999999999999999999999999999999999999999999999999999999999";
const HIDEKI_SIGNER = { address: SEPARATE_ADDRESS, chainId: 50383 };

const requestQuote: ExecutionEvent = { type: "QUOTE_REQUESTED", intent: BTC_ORDER, account: SEPARATE_ADDRESS };
const quoteReady: ExecutionEvent = { type: "QUOTE_READY", quote: SEPARATE_QUOTE };
const sign: ExecutionEvent = {
  type: "SIGN_REQUESTED",
  intent: BTC_ORDER,
  account: SEPARATE_ADDRESS,
  signer: HIDEKI_SIGNER,
  nowMs: NOW_MS,
};

function run(events: ExecutionEvent[], from: ExecutionState = INITIAL_EXECUTION_STATE): ExecutionState {
  return events.reduce(executionReducer, from);
}

const READY = run([requestQuote, quoteReady]);
const AWAITING = run([sign], READY);
const SUBMITTED = run([{ type: "TX_SUBMITTED", hash: TX_HASH }], AWAITING);
const UNKNOWN = run([{ type: "OUTCOME_UNKNOWN", hash: TX_HASH }], SUBMITTED);
const MINED = run([{ type: "RECEIPT_SUCCESS", hash: TX_HASH }], SUBMITTED);
const REVERTED = run([{ type: "RECEIPT_REVERTED", hash: TX_HASH, reason: "ImmediateOrCancelNoFill" }], SUBMITTED);

describe("execution lifecycle", () => {
  it("walks a resting order from editing to a reconciled account", () => {
    // #given a fresh ticket
    const events: ExecutionEvent[] = [
      { type: "EDIT", intent: BTC_ORDER },
      requestQuote,
      quoteReady,
      sign,
      { type: "TX_SUBMITTED", hash: TX_HASH },
      { type: "RECEIPT_SUCCESS", hash: TX_HASH },
      { type: "PLACEMENT_DECODED", outcome: "RESTING", orderId: 7_001n, filledQuantity: 0n },
      { type: "RECONCILED", block: 300_500n },
    ];
    // #when each event is applied in order
    const phases: ExecutionPhase[] = [];
    events.reduce((state, event) => {
      const next = transition(state, event);
      phases.push(next.state.phase);
      return next.state;
    }, INITIAL_EXECUTION_STATE);
    // #then it passes through every honest stage, ending reconciled
    expect(phases).toEqual([
      "EDITING",
      "QUOTING",
      "READY",
      "AWAITING_WALLET_CONFIRMATION",
      "SUBMITTED",
      "MINED_SUCCESS",
      "RESTING",
      "ACCOUNT_RECONCILED",
    ]);
  });

  it("refuses a second signature request while the wallet prompt is open", () => {
    // #given a ticket waiting on the wallet
    // #when the trader clicks sign again
    const result = transition(AWAITING, sign);
    // #then the request is refused and nothing changes
    expect(result).toEqual({ state: AWAITING, accepted: false, reason: expect.stringContaining("already waiting") });
  });

  it("refuses another signature while the transaction is on its way to the chain", () => {
    // #given a submitted transaction
    // #when sign is requested again
    const result = transition(SUBMITTED, sign);
    // #then it is refused
    expect(result.accepted).toBe(false);
  });

  it("refuses to sign, edit or reset while the outcome is unknown", () => {
    // #given a send whose outcome is unknown
    // #when the trader tries to send again or start over
    const attempts = [sign, { type: "EDIT" } as const, { type: "RESET" } as const].map((event) => transition(UNKNOWN, event));
    // #then every attempt is refused until the chain check finishes
    expect(attempts.map((attempt) => [attempt.accepted, attempt.state.phase])).toEqual([
      [false, "UNKNOWN_OUTCOME"],
      [false, "UNKNOWN_OUTCOME"],
      [false, "UNKNOWN_OUTCOME"],
    ]);
  });

  it("never moves back to signing after a revert without a new preview", () => {
    // #given a reverted placement
    // #when signing is requested straight away
    const result = transition(REVERTED, sign);
    // #then it is refused: only an explicit re-quote can lead to another send
    expect([result.accepted, result.state.phase]).toEqual([false, "MINED_REVERTED"]);
  });

  it("allows a new send after a revert only through an explicit re-quote", () => {
    // #given a reverted placement
    // #when the trader re-quotes and signs again
    const state = run([requestQuote, quoteReady, sign], REVERTED);
    // #then the new attempt is waiting on the wallet
    expect(state.phase).toBe("AWAITING_WALLET_CONFIRMATION");
  });

  it("keeps the prepared order and its preview when the wallet rejects", () => {
    // #given a ticket waiting on the wallet
    // #when the trader dismisses the prompt
    const state = run([{ type: "WALLET_REJECTED" }], AWAITING);
    // #then the ticket is intact and can be signed again on request
    expect({ phase: state.phase, intent: state.intent, quote: state.quote, canSubmit: canSubmit(state) }).toEqual({
      phase: "WALLET_REJECTED",
      intent: BTC_ORDER,
      quote: SEPARATE_QUOTE,
      canSubmit: true,
    });
  });

  it("lets the trader retry a rejected signature explicitly", () => {
    // #given a rejected signature
    const rejected = run([{ type: "WALLET_REJECTED" }], AWAITING);
    // #when the trader signs again
    const state = run([sign], rejected);
    // #then a second attempt is counted
    expect([state.phase, state.submitAttempts]).toEqual(["AWAITING_WALLET_CONFIRMATION", 2]);
  });

  it("keeps the prepared order through a revert and an unknown outcome", () => {
    // #given a revert and an unknown outcome
    // #when their intents are read back
    const intents = [REVERTED.intent, UNKNOWN.intent];
    // #then the ticket survived both
    expect(intents).toEqual([BTC_ORDER, BTC_ORDER]);
  });

  it("does not treat a confirmed transaction as a fill", () => {
    // #given a mined placement
    // #when its copy is read
    const copy = phaseCopy(MINED);
    // #then it says the fill is still being checked
    expect(copy).toEqual({
      headline: "Confirmed on chain. Checking what the order did.",
      detail: "A confirmed transaction does not mean the order filled.",
      tone: "progress",
    });
  });

  it("downgrades a FILLED label that the decoded fills do not support", () => {
    // #given a mined placement
    // #when the decoder claims FILLED with less, or nothing, actually filled
    const partial = run([{ type: "PLACEMENT_DECODED", outcome: "FILLED", orderId: null, filledQuantity: 5_000n }], MINED);
    const empty = run([{ type: "PLACEMENT_DECODED", outcome: "FILLED", orderId: null, filledQuantity: 0n }], MINED);
    // #then the phase follows the evidence, never the label
    expect([partial.phase, empty.phase]).toEqual(["PARTIALLY_FILLED", "ORDER_ACCEPTED"]);
  });

  it("T12 reaches FILLED only when decoded fills cover the whole order", () => {
    // #given a mined placement
    // #when fills covering the full quantity are decoded
    const state = run(
      [{ type: "PLACEMENT_DECODED", outcome: "FILLED", orderId: null, filledQuantity: BTC_ORDER.quantity }],
      MINED,
    );
    // #then it is filled
    expect([state.phase, phaseCopy(state).headline]).toEqual(["FILLED", "Filled"]);
  });

  it("calls a mined order that neither filled nor rested a no fill", () => {
    // #given a mined placement
    // #when the decoder finds no fills and no resting order
    const state = run([{ type: "PLACEMENT_DECODED", outcome: "NO_FILL", orderId: null, filledQuantity: 0n }], MINED);
    // #then the copy says No fill, not completed
    expect([state.phase, phaseCopy(state).headline]).toEqual(["CANCELLED", "No fill"]);
  });

  it("turns a decoded revert into a rejected order with its reason", () => {
    // #given a reverted placement
    // #when the revert is decoded by replay
    const state = run(
      [{ type: "PLACEMENT_DECODED", outcome: "REVERTED", orderId: null, filledQuantity: 0n, revertReason: "InsufficientCollateral" }],
      REVERTED,
    );
    // #then the order is rejected and says why
    expect([state.phase, phaseCopy(state).detail]).toEqual(["ORDER_REJECTED", "Reason: InsufficientCollateral"]);
  });

  it("ignores a preview that arrives for an order the trader has since changed", () => {
    // #given a quote request that was superseded by a larger size
    const resized = { ...BTC_ORDER, quantity: 14_000n };
    const state = run([requestQuote, { type: "QUOTE_REQUESTED", intent: resized, account: SEPARATE_ADDRESS }]);
    // #when the preview for the old size arrives
    const result = transition(state, quoteReady);
    // #then it is refused and the ticket keeps waiting for the right one
    expect([result.accepted, result.state.phase]).toEqual([false, "QUOTING"]);
  });

  it("does not become ready when the preview itself says the market cannot be priced", () => {
    // #given a quote request
    const quoting = run([requestQuote]);
    // #when an unpriceable preview arrives
    const state = run([{ type: "QUOTE_READY", quote: patchQuote(SEPARATE_QUOTE, { priceable: false }) }], quoting);
    // #then the ticket goes back to editing with the reason
    expect([state.phase, state.notice]).toEqual([
      "EDITING",
      "Preview unavailable: the protocol cannot currently price this market.",
    ]);
  });

  it("refuses to sign from a wallet other than the route's account", () => {
    // #given a ready ticket for the second wallet
    // #when the primary wallet is the one connected
    const result = transition(READY, { ...sign, signer: { address: PRIMARY_ADDRESS, chainId: 50383 } });
    // #then signing is refused with the address to switch to
    expect([result.accepted, result.reason]).toEqual([false, "Wallet mismatch: switch to 0x0DE1…b1E0 before signing."]);
  });

  it("refuses to sign on the wrong chain", () => {
    // #given a ready ticket
    // #when the wallet is on another chain
    const result = transition(READY, { ...sign, signer: { address: SEPARATE_ADDRESS, chainId: 1 } });
    // #then signing is refused with the network to switch to
    expect([result.accepted, result.reason]).toEqual([false, "Switch to Hideki (50383) to sign."]);
  });

  it("sends the ticket back to editing when the preview expired before signing", () => {
    // #given a ready ticket
    // #when sign is pressed a minute after the preview
    const state = run([{ ...sign, nowMs: NOW_MS + 60_000 }], READY);
    // #then the stale preview is dropped and the trader is asked to refresh
    expect([state.phase, state.quote, state.notice]).toEqual([
      "EDITING",
      null,
      "The preview is 1m old. Refresh it before signing.",
    ]);
  });

  it("sends the ticket back to editing when the order changed after the preview", () => {
    // #given a ready ticket
    // #when the form now holds a different price
    const changed = { ...BTC_ORDER, price: BTC_ORDER.price + 100_000_000_000_000_000n };
    const state = run([{ ...sign, intent: changed }], READY);
    // #then nothing is sent and the new order needs its own preview
    expect([state.phase, state.intent, state.quote]).toEqual(["EDITING", changed, null]);
  });

  it("refuses a receipt for a different transaction", () => {
    // #given a submitted transaction
    // #when a receipt for another hash arrives
    const result = transition(SUBMITTED, { type: "RECEIPT_SUCCESS", hash: OTHER_HASH });
    // #then it is ignored
    expect([result.accepted, result.state.phase]).toEqual([false, "SUBMITTED"]);
  });

  it("accepts a receipt directly from the wallet prompt when no hash was surfaced first", () => {
    // #given a write that resolves only after mining
    // #when its receipt arrives without a separate submitted step
    const state = run([{ type: "RECEIPT_SUCCESS", hash: TX_HASH }], AWAITING);
    // #then the hash comes from the receipt, never a made-up intermediate one
    expect([state.phase, state.txHash]).toEqual(["MINED_SUCCESS", TX_HASH]);
  });

  it("starts over only from a settled or idle state", () => {
    // #given a reconciled order
    const reconciled = run(
      [
        { type: "PLACEMENT_DECODED", outcome: "RESTING", orderId: 7_001n, filledQuantity: 0n },
        { type: "RECONCILED", block: 300_500n },
      ],
      MINED,
    );
    // #when the trader resets
    const state = run([{ type: "RESET" }], reconciled);
    // #then the ticket is blank again
    expect(state).toEqual(INITIAL_EXECUTION_STATE);
  });
});

describe("receipt waits", () => {
  it("maps only receipts to outcomes and everything else to unknown", () => {
    // #given each way a wait can end
    const waits: ReceiptWait[] = [
      { status: "success", hash: TX_HASH, block: 1n, gasUsed: 1n, waitedMs: 10 },
      { status: "reverted", hash: TX_HASH, block: 1n, gasUsed: 1n, waitedMs: 10 },
      { status: "timeout", hash: TX_HASH, waitedMs: 30_000 },
      { status: "replaced", hash: TX_HASH, replacement: OTHER_HASH, reason: "repriced", waitedMs: 10 },
      { status: "error", hash: TX_HASH, reason: "socket closed", waitedMs: 10 },
    ];
    // #when each becomes a lifecycle event
    const events = waits.map((wait) => {
      const event = eventForReceiptWait(wait);
      if (event.type === "OUTCOME_UNKNOWN") return [event.type, event.hash];
      if (event.type === "TX_REPLACED") return [event.type, event.from, event.to];
      return [event.type];
    });
    // #then nothing but a receipt counts as an outcome, and a replacement names both hashes
    expect(events).toEqual([
      ["RECEIPT_SUCCESS"],
      ["RECEIPT_REVERTED"],
      ["OUTCOME_UNKNOWN", TX_HASH],
      ["TX_REPLACED", TX_HASH, OTHER_HASH],
      ["OUTCOME_UNKNOWN", TX_HASH],
    ]);
  });

  it("follows a replacement reported after the wait already timed out", () => {
    // #given a send whose receipt wait timed out
    const timedOut = run([eventForReceiptWait({ status: "timeout", hash: TX_HASH, waitedMs: 60_000 })], SUBMITTED);
    // #when the wallet then reports a speed-up and the replacement mines
    const replaced = transition(
      timedOut,
      eventForReceiptWait({ status: "replaced", hash: TX_HASH, replacement: OTHER_HASH, reason: "repriced", waitedMs: 61_000 }),
    );
    const mined = transition(replaced.state, { type: "RECEIPT_SUCCESS", hash: OTHER_HASH });
    // #then both steps are accepted and the order continues on the replacement
    expect([replaced.accepted, mined.accepted, mined.state.phase, mined.state.txHash]).toEqual([
      true,
      true,
      "MINED_SUCCESS",
      OTHER_HASH,
    ]);
  });

  it("refuses a replacement of a transaction this order never sent", () => {
    // #given a send whose outcome is unknown
    // #when a replacement of some other hash is reported
    const result = transition(UNKNOWN, { type: "TX_REPLACED", from: OTHER_HASH, to: OTHER_HASH });
    // #then it is refused and nothing new is tracked
    expect([result.accepted, result.state.trackedHashes]).toEqual([false, [TX_HASH]]);
  });

  it("records a hash the wallet returns after its prompt outlived the deadline", () => {
    // #given a wallet prompt that hung past the deadline, so no hash is known
    const hung = run([{ type: "OUTCOME_UNKNOWN", hash: null }], AWAITING);
    // #when a receipt for some hash arrives, then the wallet returns the real hash and its receipt arrives
    const stray = transition(hung, { type: "RECEIPT_SUCCESS", hash: OTHER_HASH });
    const submitted = transition(hung, { type: "TX_SUBMITTED", hash: TX_HASH });
    const mined = transition(submitted.state, { type: "RECEIPT_SUCCESS", hash: TX_HASH });
    // #then the unmatched receipt is refused and the returned hash is followed
    expect([stray.accepted, submitted.accepted, submitted.state.txHash, mined.state.phase]).toEqual([
      false,
      true,
      TX_HASH,
      "MINED_SUCCESS",
    ]);
  });
});

describe("leaving an unknown outcome", () => {
  it("refuses to reconcile an unknown outcome, so a pending order cannot be sent twice", () => {
    // #given a send whose outcome is unknown
    // #when the account is re-read and a new preview is requested
    const reconciled = transition(UNKNOWN, { type: "RECONCILED", block: 300_500n });
    const requote = transition(reconciled.state, requestQuote);
    // #then both are refused and the tracked hash is kept
    expect([reconciled.accepted, requote.accepted, requote.state.phase, requote.state.txHash]).toEqual([
      false,
      false,
      "UNKNOWN_OUTCOME",
      TX_HASH,
    ]);
  });

  it("unlocks a new send only when a chain check proves the transaction cannot mine", () => {
    // #given a send whose outcome is unknown
    // #when the chain check finds its nonce used by another transaction, then the trader re-quotes and signs
    const dropped = transition(UNKNOWN, { type: "TX_DROPPED", hash: TX_HASH, evidence: "nonce-consumed-by-other-tx" });
    const resend = run([requestQuote, quoteReady, sign], dropped.state);
    // #then the ticket was unlocked, kept the order, and the new attempt is a fresh signature
    expect([dropped.accepted, dropped.state.phase, dropped.state.intent, resend.phase]).toEqual([
      true,
      "EDITING",
      BTC_ORDER,
      "AWAITING_WALLET_CONFIRMATION",
    ]);
  });

  it("refuses a drop for another hash or a not-found check while a replacement is tracked", () => {
    // #given a send the wallet replaced
    const replaced = run([{ type: "TX_REPLACED", from: TX_HASH, to: OTHER_HASH }], UNKNOWN);
    // #when a drop is claimed for an untracked hash, or the original alone is not found
    const results = [
      transition(UNKNOWN, { type: "TX_DROPPED", hash: OTHER_HASH, evidence: "not-found-after-N-blocks" }),
      transition(replaced, { type: "TX_DROPPED", hash: TX_HASH, evidence: "not-found-after-N-blocks" }),
    ];
    // #then neither unlocks the ticket
    expect(results.map((result) => [result.accepted, result.state.phase])).toEqual([
      [false, "UNKNOWN_OUTCOME"],
      [false, "UNKNOWN_OUTCOME"],
    ]);
  });

  it("refuses a drop outside an unknown outcome", () => {
    // #given a transaction still waiting for the chain
    // #when a drop is claimed
    const result = transition(SUBMITTED, { type: "TX_DROPPED", hash: TX_HASH, evidence: "not-found-after-N-blocks" });
    // #then only a receipt or an unknown outcome can follow
    expect([result.accepted, result.state.phase]).toEqual([false, "SUBMITTED"]);
  });
});

describe("decoding a mined placement", () => {
  it("unfreezes a mined ticket whose receipt cannot be decoded, without claiming a fill", () => {
    // #given a mined placement
    // #when decoding fails
    const state = run([{ type: "DECODE_FAILED", reason: "no OrderPlaced log" }], MINED);
    // #then the order is confirmed with its fill unverified, and the ticket can start over
    expect([state.phase, phaseCopy(state), isLocked(state), transition(state, { type: "RESET" }).accepted]).toEqual([
      "ORDER_ACCEPTED",
      {
        headline: "Order confirmed. Fill status not verified.",
        detail: "The receipt could not be decoded: no OrderPlaced log",
        tone: "neutral",
      },
      false,
      true,
    ]);
  });

  it("follows a wallet replacement without resending", () => {
    // #given a submitted transaction the wallet replaced
    const replaced = run(
      [eventForReceiptWait({ status: "replaced", hash: TX_HASH, replacement: OTHER_HASH, reason: "repriced", waitedMs: 5 })],
      SUBMITTED,
    );
    // #when the replacement's receipt arrives
    const state = run([{ type: "RECEIPT_SUCCESS", hash: OTHER_HASH }], replaced);
    // #then the order continues on the replacement hash
    expect([state.phase, state.txHash]).toEqual(["MINED_SUCCESS", OTHER_HASH]);
  });
});

describe("phase copy", () => {
  it("words each in-flight and settled phase honestly", () => {
    // #given one state per phase that a trader waits on
    const resting = run([{ type: "PLACEMENT_DECODED", outcome: "RESTING", orderId: 7_001n, filledQuantity: 0n }], MINED);
    // #when their headlines are read
    const headlines = [AWAITING, SUBMITTED, UNKNOWN, resting].map((state) => phaseCopy(state).headline);
    // #then each says exactly what is known
    expect(headlines).toEqual([
      "Waiting for wallet confirmation",
      "Submitted, waiting for the chain",
      "Outcome unknown: checking the chain. Do not resend.",
      "Order confirmed, not filled. It is resting on the book.",
    ]);
  });

  it("tells a partially filled IOC that the rest was cancelled", () => {
    // #given an IOC order
    const ioc = { ...BTC_ORDER, timeInForce: "IOC" as const };
    const mined = run(
      [
        { type: "QUOTE_REQUESTED", intent: ioc, account: SEPARATE_ADDRESS },
        { type: "QUOTE_READY", quote: patchQuote(SEPARATE_QUOTE, { intent: ioc }) },
        { ...sign, intent: ioc },
        { type: "RECEIPT_SUCCESS", hash: TX_HASH },
      ],
    );
    // #when part of it fills
    const state = run([{ type: "PLACEMENT_DECODED", outcome: "PARTIALLY_FILLED", orderId: null, filledQuantity: 5_000n }], mined);
    // #then the copy says the remainder did not rest
    expect(phaseCopy(state).detail).toBe("Part of the order filled. The rest was cancelled.");
  });
});

describe("state predicates", () => {
  it("separates submittable, locked and terminal states", () => {
    // #given states across the lifecycle
    const states = [READY, AWAITING, UNKNOWN, MINED, run([{ type: "WALLET_REJECTED" }], AWAITING)];
    // #when classified
    const flags = states.map((state) => [canSubmit(state), isLocked(state), isTerminal(state)]);
    // #then only idle states with a preview can submit, and in-flight ones are locked
    expect(flags).toEqual([
      [true, false, false],
      [false, true, false],
      [false, true, false],
      [false, true, false],
      [true, false, true],
    ]);
  });
});

describe("T10 quote validity", () => {
  it("accepts a fresh preview for exactly this order and account", () => {
    // #given the second wallet's preview
    // #when checked a moment later
    const valid = isQuoteValidFor(SEPARATE_QUOTE, BTC_ORDER, SEPARATE_ADDRESS, NOW_MS, 15_000);
    // #then it is valid
    expect(valid).toBe(true);
  });

  it("is invalidated by a change of account, market, side, size, price, time in force or age", () => {
    // #given the second wallet's preview
    // #when anything it was computed for changes
    const reasons = [
      quoteValidity(SEPARATE_QUOTE, BTC_ORDER, PRIMARY_ADDRESS, NOW_MS),
      quoteValidity(SEPARATE_QUOTE, { ...BTC_ORDER, pool: ETH_POOL }, SEPARATE_ADDRESS, NOW_MS),
      quoteValidity(SEPARATE_QUOTE, { ...BTC_ORDER, side: "short" }, SEPARATE_ADDRESS, NOW_MS),
      quoteValidity(SEPARATE_QUOTE, { ...BTC_ORDER, quantity: 14_000n }, SEPARATE_ADDRESS, NOW_MS),
      quoteValidity(SEPARATE_QUOTE, { ...BTC_ORDER, price: BTC_ORDER.price + 1n }, SEPARATE_ADDRESS, NOW_MS),
      quoteValidity(SEPARATE_QUOTE, { ...BTC_ORDER, timeInForce: "IOC" }, SEPARATE_ADDRESS, NOW_MS),
      quoteValidity(SEPARATE_QUOTE, BTC_ORDER, SEPARATE_ADDRESS, NOW_MS + 20_000, 15_000),
      quoteValidity(null, BTC_ORDER, SEPARATE_ADDRESS, NOW_MS),
    ].map((validity) => (validity.valid ? "valid" : validity.reason));
    // #then each change names its own reason
    expect(reasons).toEqual(["account", "market", "side", "size", "price", "time-in-force", "age", "missing"]);
  });

  it("refuses a preview timestamped in the future beyond clock skew", () => {
    // #given the preview, read one second before NOW_MS
    // #when checked by a clock that puts the read 0.5 s and 3 s in the future
    const reasons = [NOW_MS - 500, NOW_MS - 4_000].map((nowMs) => {
      const validity = quoteValidity(SEPARATE_QUOTE, BTC_ORDER, SEPARATE_ADDRESS, nowMs);
      return validity.valid ? "valid" : validity.reason;
    });
    // #then small skew is tolerated and a future timestamp is not treated as fresh
    expect(reasons).toEqual(["valid", "timestamp"]);
  });
});
