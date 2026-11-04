import { describe, expect, it } from "vitest";

import {
  buildProofEvent,
  receiptHeadline,
  sanitizeEvidence,
  serializeProofEvent,
  toJsonSafe,
} from "@/lib/evidence/proof-event";
import { intentHash } from "@/lib/orders/intent";
import {
  NOW_MS,
  PRIMARY_ADDRESS,
  SEPARATE_ADDRESS,
  SEPARATE_SNAPSHOT,
} from "@/tests/fixtures/accounts.fixture";
import { BTC_ORDER } from "@/tests/fixtures/quotes.fixture";
import { fill, TX_HASH, verifiedOrderFixture } from "@/tests/fixtures/receipts.fixture";

describe("T12 receiptHeadline", () => {
  it("cannot say filled when the outcome label claims it but no fills were decoded", () => {
    // #given a success receipt labelled FILLED with no decoded fills and no resting order
    const order = verifiedOrderFixture({ outcome: "FILLED", fills: [], filledQuantity: 0n, orderId: null });
    // #when the headline is formed
    const { status } = receiptHeadline(order);
    // #then it refuses to call it filled
    expect(status).toBe("outcome unknown");
  });

  it("says partially filled when decoded fills cover only part of the order", () => {
    // #given 0.00005 of 0.00013 BTC filled with the rest resting
    const order = verifiedOrderFixture({ outcome: "PARTIALLY_FILLED", fills: [fill(5_000n)], filledQuantity: 5_000n });
    // #when the headline is formed
    const headline = receiptHeadline(order);
    // #then it reports the split
    expect([headline.status, headline.detail]).toEqual([
      "partially filled",
      "0.00005 BTC of 0.00013 BTC filled. The rest is resting on the book as order 7001.",
    ]);
  });

  it("says filled only when decoded fills cover the requested quantity", () => {
    // #given two fills that together cover the order
    const order = verifiedOrderFixture({
      outcome: "FILLED",
      orderId: null,
      fills: [fill(8_000n), fill(5_000n, 6_901n)],
      filledQuantity: 13_000n,
    });
    // #when the headline is formed
    const headline = receiptHeadline(order);
    // #then it is filled
    expect([headline.status, headline.headline]).toEqual(["filled", "Filled"]);
  });

  it("cannot say filled when the requested size is unknown", () => {
    // #given fills decoded but no record of what was asked for
    const order = verifiedOrderFixture({ outcome: "FILLED", requested: null, fills: [fill(13_000n)], filledQuantity: 13_000n });
    // #when the headline is formed
    const { status } = receiptHeadline(order);
    // #then coverage cannot be shown, so it is unknown
    expect(status).toBe("outcome unknown");
  });

  it("calls a confirmed, unfilled order resting", () => {
    // #given a resting order with no fills
    const order = verifiedOrderFixture();
    // #when the headline is formed
    const headline = receiptHeadline(order);
    // #then the wording matches what the book did
    expect([headline.status, headline.headline]).toEqual([
      "resting",
      "Order confirmed, not filled. It is resting on the book.",
    ]);
  });

  it("calls a reverted transaction reverted, with its reason", () => {
    // #given a reverted IOC that found no liquidity
    const order = verifiedOrderFixture({
      receiptStatus: "reverted",
      outcome: "REVERTED",
      orderId: null,
      revertReason: "ImmediateOrCancelNoFill",
    });
    // #when the headline is formed
    const headline = receiptHeadline(order);
    // #then it is reverted and says why
    expect([headline.status, headline.detail]).toEqual(["reverted", "Reason: ImmediateOrCancelNoFill"]);
  });

  it("says no fill when nothing filled and nothing rested", () => {
    // #given a success receipt with no fills and no resting order
    const order = verifiedOrderFixture({ outcome: "NO_FILL", orderId: null });
    // #when the headline is formed
    const { status } = receiptHeadline(order);
    // #then it is a no fill, not a completed order
    expect(status).toBe("no fill");
  });

  it("treats fills that do not add up as unknown", () => {
    // #given fills summing to less than the reported fill quantity
    const order = verifiedOrderFixture({ outcome: "FILLED", fills: [fill(5_000n)], filledQuantity: 13_000n });
    // #when the headline is formed
    const { status } = receiptHeadline(order);
    // #then the inconsistency is not resolved in the hopeful direction
    expect(status).toBe("outcome unknown");
  });

  it("refuses to describe a receipt from another chain", () => {
    // #given a receipt from Shannon
    const order = verifiedOrderFixture({ chainId: 50312, outcome: "FILLED", fills: [fill(13_000n)], filledQuantity: 13_000n });
    // #when the headline is formed
    const { status } = receiptHeadline(order);
    // #then it is unknown for this proof
    expect(status).toBe("outcome unknown");
  });

  it("carries failed truth checks as warnings", () => {
    // #given a receipt whose sender check failed
    const order = verifiedOrderFixture({
      checks: [{ id: "sender", label: "Sender is the selected account", status: "fail", detail: "Sent from 0xf075…dcd0." }],
    });
    // #when the headline is formed
    const { warnings } = receiptHeadline(order);
    // #then the failure is shown next to it
    expect(warnings).toEqual(["Check failed: Sender is the selected account. Sent from 0xf075…dcd0."]);
  });
});

describe("buildProofEvent", () => {
  it("records the run with the local intent hash and string-encoded chain figures", () => {
    // #given a resting order placed from the second wallet
    // #when the proof event is built
    const result = buildProofEvent({
      runId: "run-1",
      observedAtMs: NOW_MS,
      selectedAccount: SEPARATE_ADDRESS,
      counterpartAccount: PRIMARY_ADDRESS,
      intent: BTC_ORDER,
      verified: verifiedOrderFixture(),
      before: SEPARATE_SNAPSHOT,
      previewStatus: "estimate",
    });
    // #then every identifier is present and the intent hash is the local one, separate from the tx hash
    expect(result).toEqual({
      ok: true,
      event: expect.objectContaining({
        runId: "run-1",
        observedAtUtc: "2026-11-01T12:00:00.000Z",
        networkChainId: 50383,
        selectedAccount: SEPARATE_ADDRESS,
        counterpartAccount: PRIMARY_ADDRESS,
        marketPool: BTC_ORDER.pool,
        orderIntentHash: intentHash(BTC_ORDER, SEPARATE_ADDRESS, 50383),
        txHash: TX_HASH,
        onchainOrderId: "7001",
        receiptStatus: "success",
        orderStatus: "resting",
        fillQuantityRaw: "0",
        beforeBlock: SEPARATE_SNAPSHOT.block.toString(),
        previewStatus: "estimate",
      }),
    });
  });

  it("notes a sender that is not the selected account", () => {
    // #given a receipt sent from the primary while the second wallet was selected
    // #when the proof event is built
    const result = buildProofEvent({
      runId: "run-2",
      observedAtMs: NOW_MS,
      selectedAccount: SEPARATE_ADDRESS,
      counterpartAccount: PRIMARY_ADDRESS,
      intent: BTC_ORDER,
      verified: verifiedOrderFixture({ from: PRIMARY_ADDRESS }),
      previewStatus: "estimate",
    });
    // #then the mismatch is written into the record
    expect(result.ok ? result.event.notes : null).toBe(
      "Sender mismatch: the transaction came from 0xf075…dcd0, not the selected 0x0DE1…b1E0.",
    );
  });

  it("refuses a receipt from any chain other than Hideki", () => {
    // #given a receipt from another chain
    // #when the proof event is built
    const result = buildProofEvent({
      runId: "run-3",
      observedAtMs: NOW_MS,
      selectedAccount: SEPARATE_ADDRESS,
      counterpartAccount: PRIMARY_ADDRESS,
      intent: BTC_ORDER,
      verified: verifiedOrderFixture({ chainId: 50312 }),
      previewStatus: "unavailable",
    });
    // #then no record claims to be on Hideki
    expect(result).toEqual({ ok: false, reason: "The receipt is from chain 50312, not Hideki (50383)." });
  });
});

describe("evidence serialisation", () => {
  it("serialises bigints as decimal strings", () => {
    // #given nested bigints, a date and a map
    const value = { block: 12_345_678_901_234_567_890n, nested: [1n, { at: new Date(NOW_MS) }], map: new Map([["k", 2n]]) };
    // #when converted to JSON-safe data
    const json = toJsonSafe(value);
    // #then nothing is lost to number precision
    expect(json).toEqual({
      block: "12345678901234567890",
      nested: ["1", { at: "2026-11-01T12:00:00.000Z" }],
      map: { k: "2" },
    });
  });

  it("strips keys, signatures, auth headers and URL credentials but keeps public chain data", () => {
    // #given a raw capture mixing public data with secrets
    const signature = `0x${"ab".repeat(65)}`;
    const capture = {
      txHash: TX_HASH,
      from: SEPARATE_ADDRESS,
      privateKey: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
      tx: { r: "0x01", s: "0x02", v: 27n, input: "0xdeadbeef" },
      response: { headers: { authorization: "Bearer abc" }, body: "ok" },
      sig: signature,
      blob: signature,
      rpc: "https://user:pass@rpc.example/v1?apikey=secret&chain=50383",
      phrase: "test test test test test test test test test test test junk",
    };
    // #when sanitised
    const { value, redacted } = sanitizeEvidence(capture);
    // #then only public data survives, and each removal is listed
    expect({ value, redacted }).toEqual({
      value: {
        txHash: TX_HASH,
        from: SEPARATE_ADDRESS,
        tx: { input: "0xdeadbeef" },
        response: { body: "ok" },
        blob: "[redacted]",
        rpc: "https://rpc.example/v1?apikey=redacted&chain=50383",
        phrase: "[redacted]",
      },
      redacted: ["privateKey", "tx.r", "tx.s", "tx.v", "response.headers", "sig", "blob", "rpc", "phrase"],
    });
  });

  it("drops binary buffers and cuts cycles", () => {
    // #given a buffer that could hold key material and a self-reference
    const capture: Record<string, unknown> = { key: new Uint8Array([1, 2, 3]) };
    capture.self = capture;
    // #when sanitised
    const { value } = sanitizeEvidence(capture);
    // #then neither leaks nor loops
    expect(value).toEqual({ key: null, self: "[circular]" });
  });

  it("writes a proof event as sanitised, bigint-safe JSON", () => {
    // #given a built proof event
    const built = buildProofEvent({
      runId: "run-4",
      observedAtMs: NOW_MS,
      selectedAccount: SEPARATE_ADDRESS,
      counterpartAccount: PRIMARY_ADDRESS,
      intent: BTC_ORDER,
      verified: verifiedOrderFixture(),
      after: SEPARATE_SNAPSHOT,
      previewStatus: "estimate",
    });
    // #when it is serialised and read back
    const parsed: unknown = built.ok ? JSON.parse(serializeProofEvent(built.event)) : null;
    // #then the after-state is present with raw units as strings
    expect(parsed).toEqual(
      expect.objectContaining({
        afterBlock: SEPARATE_SNAPSHOT.block.toString(),
        afterAccountState: expect.objectContaining({
          margin: expect.objectContaining({ unlockedCollateral: "5000000000000000000" }),
        }),
      }),
    );
  });
});
