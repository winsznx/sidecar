import { describe, expect, it } from "vitest";

import {
  alertFailures,
  checkDetailText,
  explainRevert,
  intentFromOrder,
  parseAccountParam,
  parseTxHashParam,
  positionFromReceipt,
  receiptTitle,
  receiptVerdict,
} from "@/components/evidence/receipt-model";
import type { TruthCheck, VerifiedOrder } from "@/lib/dreamdex/types";
import { receiptHeadline } from "@/lib/evidence/proof-event";
import { intentHash } from "@/lib/orders/intent";

import { PRIMARY_ADDRESS, SEPARATE_ADDRESS } from "../fixtures/accounts.fixture";
import { BTC_POOL } from "../fixtures/markets.fixture";
import { fill, TX_HASH, verifiedOrderFixture } from "../fixtures/receipts.fixture";

const CORE = ["chain-id", "pool-listed", "margin-bank", "receipt-success", "placement-decoded", "position-attribution", "collateral-attribution"];

function checks(statuses: Record<string, TruthCheck["status"]>): TruthCheck[] {
  return Object.entries(statuses).map(([id, status]) => ({ id, label: `Check ${id}`, status, detail: `${id} detail` }));
}

function allCore(status: TruthCheck["status"]): Record<string, TruthCheck["status"]> {
  return Object.fromEntries(CORE.map((id) => [id, status]));
}

const CONTEXT_UNKNOWN = { sender: "unknown", "calldata-intent": "unknown", "counterpart-isolation": "unknown" } as const;

function filledOrder(overrides: Partial<VerifiedOrder> = {}): VerifiedOrder {
  const base = verifiedOrderFixture();
  const quantity = base.requested?.quantity ?? 0n;
  return verifiedOrderFixture({ outcome: "FILLED", orderId: null, fills: [fill(quantity)], filledQuantity: quantity, ...overrides });
}

function verdictFor(order: VerifiedOrder, context = { expectedAccount: null, counterpart: null } as Parameters<typeof receiptVerdict>[2]) {
  return receiptVerdict(order, receiptHeadline(order), context);
}

describe("parseTxHashParam", () => {
  it("accepts a 64-character hash and lower-cases it", () => {
    // #given
    const raw = TX_HASH.toUpperCase().replace("0X", "0x");
    // #when
    const result = parseTxHashParam(raw);
    // #then
    expect(result).toEqual({ ok: true, hash: TX_HASH.toLowerCase() });
  });

  it.each([
    ["", "The link has no transaction hash."],
    ["1234", "A transaction hash starts with 0x."],
    ["0x1234zz", "A transaction hash uses only the digits 0 to 9 and the letters a to f."],
    ["0x1234", "A transaction hash has 64 hex characters after 0x. This one has 4."],
  ])("rejects %j with a plain reason", (raw, reason) => {
    // #given a malformed segment
    // #when
    const result = parseTxHashParam(raw);
    // #then
    expect(result).toEqual({ ok: false, reason });
  });
});

describe("parseAccountParam", () => {
  it("ignores anything that is not an address instead of guessing", () => {
    // #given
    const inputs = [null, "", "0x123", "not-an-address"];
    // #when
    const results = inputs.map(parseAccountParam);
    // #then
    expect(results).toEqual([null, null, null, null]);
  });
});

describe("receiptVerdict", () => {
  it("never verifies a public fill read without a selected account, and names the sender as not compared", () => {
    // #given a public fill read without a selected account
    const order = filledOrder({ checks: checks({ ...allCore("pass"), ...CONTEXT_UNKNOWN }) });
    // #when
    const verdict = verdictFor(order);
    // #then
    expect({ stamp: verdict.stamp, qualifier: verdict.qualifier, passed: verdict.requiredPassed, total: verdict.requiredTotal }).toEqual({
      stamp: "receipt-only",
      qualifier: "Sender not compared",
      passed: 7,
      total: 7,
    });
  });

  it("withholds VERIFIED while any shown check was not compared", () => {
    // #given sender and other account passed, but nothing saved the prepared order
    const order = filledOrder({ checks: checks({ ...allCore("pass"), sender: "pass", "counterpart-isolation": "pass", "calldata-intent": "unknown" }) });
    // #when
    const verdict = verdictFor(order, { expectedAccount: SEPARATE_ADDRESS, counterpart: PRIMARY_ADDRESS });
    // #then
    expect({ stamp: verdict.stamp, qualifier: verdict.qualifier }).toEqual({ stamp: "receipt-only", qualifier: "Prepared order not compared" });
  });

  it("requires the sender check once a selected account is known", () => {
    // #given the selected account is known but the sender check could not decide
    const order = filledOrder({ checks: checks({ ...allCore("pass"), ...CONTEXT_UNKNOWN }) });
    // #when
    const verdict = verdictFor(order, { expectedAccount: SEPARATE_ADDRESS, counterpart: null });
    // #then
    expect(verdict.stamp).toBe("not-verified");
  });

  it("never verifies when any check failed, even one that is not required", () => {
    // #given
    const order = filledOrder({ checks: checks({ ...allCore("pass"), ...CONTEXT_UNKNOWN, "calldata-intent": "fail" }) });
    // #when
    const verdict = verdictFor(order);
    // #then
    expect(verdict.stamp).toBe("not-verified");
  });

  it("treats an unknown on a reverted order as not applicable, not as a warning", () => {
    // #given
    const order = verifiedOrderFixture({
      receiptStatus: "reverted",
      outcome: "REVERTED",
      orderId: null,
      revertReason: "MaxPositionSizeExceeded",
      checks: checks({ ...allCore("unknown"), "chain-id": "pass", "receipt-success": "fail" }),
    });
    // #when
    const verdict = verdictFor(order);
    // #then
    expect({
      stamp: verdict.stamp,
      tones: [...new Set(verdict.rows.filter((row) => row.check.status === "unknown").map((row) => row.tone))],
    }).toEqual({ stamp: "not-verified", tones: ["not-applicable"] });
  });

  it("does not verify a successful receipt whose outcome could not be decoded", () => {
    // #given fills that do not add up
    const order = filledOrder({ filledQuantity: 1n, checks: checks(allCore("pass")) });
    // #when
    const verdict = verdictFor(order);
    // #then
    expect(verdict.stamp).toBe("not-verified");
  });

  it("treats a check it does not recognise as required", () => {
    // #given
    const order = filledOrder({ checks: checks({ ...allCore("pass"), "future-check": "unknown" }) });
    // #when
    const verdict = verdictFor(order);
    // #then
    expect(verdict.rows.find((row) => row.check.id === "future-check")?.tone).toBe("unresolved");
  });

  it("requires the other-account check once a counterpart is known", () => {
    // #given
    const order = filledOrder({ checks: checks({ ...allCore("pass"), sender: "pass", "counterpart-isolation": "pass" }) });
    // #when
    const verdict = verdictFor(order, { expectedAccount: SEPARATE_ADDRESS, counterpart: PRIMARY_ADDRESS });
    // #then
    expect({ stamp: verdict.stamp, total: verdict.requiredTotal }).toEqual({ stamp: "verified", total: 9 });
  });
});

describe("calldata compared with the saved intent", () => {
  const order = filledOrder({
    checks: checks({ ...allCore("pass"), sender: "pass", "counterpart-isolation": "pass", "calldata-intent": "unknown" }),
    calldata: {
      isBid: true,
      userData: 0n,
      price: 1n,
      quantity: 1n,
      expireTimestampNs: 0n,
      orderType: 2,
      selfMatchingOption: 0,
      builder: SEPARATE_ADDRESS,
      builderFeeBpsTimes1k: 0n,
    },
  });
  const intent = intentFromOrder(order);
  if (intent === null) throw new Error("The fixture order must decode to an intent.");

  it("verifies when the signed calldata hashes to the order this browser prepared", () => {
    // #given the saved hash of the same order
    const hash = intentHash(intent, SEPARATE_ADDRESS, 50383);
    // #when
    const verdict = verdictFor(order, { expectedAccount: SEPARATE_ADDRESS, counterpart: PRIMARY_ADDRESS, capturedIntent: { hash, account: SEPARATE_ADDRESS } });
    // #then
    expect({ stamp: verdict.stamp, calldata: verdict.rows.find((row) => row.check.id === "calldata-intent")?.tone, total: verdict.requiredTotal }).toEqual({
      stamp: "verified",
      calldata: "pass",
      total: 10,
    });
  });

  it("fails when the signed order differs from the one prepared", () => {
    // #given the saved hash of a different size
    const hash = intentHash({ ...intent, quantity: intent.quantity + 1_000n }, SEPARATE_ADDRESS, 50383);
    // #when
    const verdict = verdictFor(order, { expectedAccount: SEPARATE_ADDRESS, counterpart: PRIMARY_ADDRESS, capturedIntent: { hash, account: SEPARATE_ADDRESS } });
    // #then
    expect({ stamp: verdict.stamp, calldata: verdict.rows.find((row) => row.check.id === "calldata-intent")?.tone }).toEqual({
      stamp: "not-verified",
      calldata: "fail",
    });
  });
});

describe("collateral attribution with nothing locked", () => {
  it("relabels the pass so it claims only that no other account's collateral was locked", () => {
    // #given a fill whose receipt locked no collateral
    const order = filledOrder({ marginEvents: [], checks: checks({ ...allCore("pass") }) });
    // #when
    const row = verdictFor(order).rows.find((r) => r.check.id === "collateral-attribution");
    // #then
    expect({ label: row?.check.label, tone: row?.tone }).toEqual({ label: "No other account's collateral was locked", tone: "pass" });
  });

  it("reads as not applicable on a revert", () => {
    // #given
    const order = verifiedOrderFixture({ receiptStatus: "reverted", outcome: "REVERTED", orderId: null, checks: checks({ ...allCore("pass"), "receipt-success": "fail" }) });
    // #when
    const row = verdictFor(order).rows.find((r) => r.check.id === "collateral-attribution");
    // #then
    expect(row?.tone).toBe("not-applicable");
  });
});

describe("receipt presentation helpers", () => {
  it("does not raise an alert for a calldata failure the page already explains", () => {
    // #given a call that is not a perp placement
    const order = filledOrder({ calldata: null, checks: checks({ ...allCore("pass"), "calldata-intent": "fail", "pool-listed": "fail" }) });
    // #when
    const alerts = alertFailures(verdictFor(order), order).map((row) => row.check.id);
    // #then
    expect(alerts).toEqual(["pool-listed"]);
  });

  it("groups block numbers and shortens addresses in check details", () => {
    // #given
    const check: TruthCheck = {
      id: "margin-bank",
      label: "MarginBank",
      status: "pass",
      detail: `The pool reports MarginBank ${PRIMARY_ADDRESS} at block 38370667; expected ${PRIMARY_ADDRESS}.`,
    };
    // #when
    const text = checkDetailText(check, filledOrder());
    // #then
    expect(text).toBe("The pool reports MarginBank 0xf075…dcd0 at block 38,370,667; expected 0xf075…dcd0.");
  });

  it("explains a decoded revert in plain words and keeps the error name", () => {
    // #given
    const order = verifiedOrderFixture({ receiptStatus: "reverted", outcome: "REVERTED", revertReason: "MaxPositionSizeExceeded" });
    // #when
    const explained = explainRevert(order);
    // #then
    expect(explained).toMatchObject({ name: "MaxPositionSizeExceeded", nextStep: "Reduce the size." });
  });

  it("names market and side in the title", () => {
    // #given
    const order = filledOrder();
    // #when
    const title = receiptTitle(order, receiptHeadline(order));
    // #then
    expect(title).toBe(`BTC-PERP ${order.requested?.side} filled`);
  });

  it("reads the sender's position after the transaction from its own PositionUpdated event", () => {
    // #given
    const order = filledOrder({
      marginEvents: [
        { kind: "PositionUpdated", account: PRIMARY_ADDRESS, pool: BTC_POOL, newSize: 5n, avgEntryPrice: 1n, realizedPnl: 0n },
        { kind: "PositionUpdated", account: SEPARATE_ADDRESS, pool: BTC_POOL, newSize: -26_000n, avgEntryPrice: 7n, realizedPnl: 0n },
      ],
    });
    // #when
    const position = positionFromReceipt(order);
    // #then
    expect(position).toEqual({ size: -26_000n, entryPrice: 7n });
  });
});
