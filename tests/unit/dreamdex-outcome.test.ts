import { marginBankEventsAbi, orderBookEventsAbi } from "@somnia-chain/markets-sdk";
import { encodeAbiParameters, encodeEventTopics, getAddress, type Address, type Hex, type TransactionReceipt } from "viem";
import { describe, expect, it } from "vitest";

import { buildTruthChecks, mapFeedStatus, requestedFromCalldata, type TruthCheckInput } from "@/lib/dreamdex/adapter";
import { classifyPlacementOutcome, decodePlacementReceipt } from "@/lib/dreamdex/normalize";
import type { MarginEventRecord, PlacementRecord, TruthCheck } from "@/lib/dreamdex/types";

interface RawLog {
  address: Address;
  topics: [Hex, ...Hex[]];
  data: Hex;
}

const ZERO_HASH: Hex = `0x${"0".repeat(64)}`;
const BANK = getAddress("0x478769e1177c0773c43a593dccc4ad15f15f1394");
const ETH_POOL = getAddress("0xd6cb1dd58580b84d76068ac21594219ce03aeddf");
const BTC_POOL = getAddress("0x4181dd08e73bbcdd1ba3e615a18f6abd941b94c0");
const SENDER = getAddress("0xa1d0cb85c869e534fe1e0c22af3b238301157b5d");
const MAKER = getAddress("0x6c2986a550dc4212b49a1710d8466553e3761ce4");
const OTHER = getAddress("0x5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a");

function receiptOf(logs: RawLog[], status: "success" | "reverted" = "success", to: Address = BTC_POOL): TransactionReceipt {
  const position = { blockHash: ZERO_HASH, blockNumber: 1n, transactionHash: ZERO_HASH, transactionIndex: 0 };
  return {
    ...position,
    contractAddress: null,
    cumulativeGasUsed: 0n,
    effectiveGasPrice: 6_000_000_000n,
    from: SENDER,
    gasUsed: 0n,
    logs: logs.map((log, logIndex) => ({ ...position, ...log, logIndex, removed: false })),
    logsBloom: "0x",
    status,
    to,
    type: "eip1559",
  };
}

function topics(encoded: readonly (Hex | Hex[] | null)[]): [Hex, ...Hex[]] {
  const [selector, ...rest] = encoded;
  if (typeof selector !== "string") throw new Error("event selector missing");
  return [selector, ...rest.filter((topic): topic is Hex => typeof topic === "string")];
}

function orderPlaced(pool: Address, order: { orderId: bigint; isBid: boolean; owner: Address; price: bigint; fullQuantity: bigint; quantityRemaining: bigint }): RawLog {
  return {
    address: pool,
    topics: topics(encodeEventTopics({ abi: orderBookEventsAbi, eventName: "OrderPlaced", args: { orderId: order.orderId } })),
    data: encodeAbiParameters(
      [
        {
          type: "tuple",
          components: [
            { name: "orderId", type: "uint128" },
            { name: "isBid", type: "bool" },
            { name: "owner", type: "address" },
            { name: "userData", type: "uint64" },
            { name: "price", type: "uint256" },
            { name: "fullQuantity", type: "uint256" },
            { name: "quantityRemaining", type: "uint256" },
            { name: "expireTimestampNs", type: "uint64" },
          ],
        },
      ],
      [{ ...order, userData: 0n, expireTimestampNs: 0n }],
    ),
  };
}

function orderIdEvent(pool: Address, eventName: "OrderRested" | "OrderCancelled" | "OrderCancelledSelfMatch", orderId: bigint): RawLog {
  return { address: pool, topics: topics(encodeEventTopics({ abi: orderBookEventsAbi, eventName, args: { orderId } })), data: "0x" };
}

function orderFilled(pool: Address, fill: { takerOrderId: bigint; makerOrderId: bigint; quantityFilled: bigint; takerRemainingQuantity: bigint; fillPrice: bigint }): RawLog {
  return {
    address: pool,
    topics: topics(
      encodeEventTopics({ abi: orderBookEventsAbi, eventName: "OrderFilled", args: { takerOrderId: fill.takerOrderId, makerOrderId: fill.makerOrderId } }),
    ),
    data: encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
      [fill.quantityFilled, fill.takerRemainingQuantity, 0n, fill.fillPrice],
    ),
  };
}

function collateral(eventName: "CollateralLocked" | "CollateralUnlocked" | "DepositedFor", account: Address, pool: Address, amount: bigint): RawLog {
  return {
    address: BANK,
    topics: topics(encodeEventTopics({ abi: marginBankEventsAbi, eventName, args: { account, perpPool: pool } })),
    data: encodeAbiParameters([{ type: "uint256" }], [amount]),
  };
}

function positionUpdated(account: Address, pool: Address, newSize: bigint): RawLog {
  return {
    address: BANK,
    topics: topics(encodeEventTopics({ abi: marginBankEventsAbi, eventName: "PositionUpdated", args: { account, perpPool: pool } })),
    data: encodeAbiParameters([{ type: "int128" }, { type: "uint128" }, { type: "int256" }, { type: "int256" }], [newSize, 1n, 0n, 0n]),
  };
}

/**
 * Recorded from Hideki (chain 50383), tx 0x166bedcaa3b3820f1ca30b95f237bbf142fde9960658405d0ce8c257cabf2829:
 * an ETH-PERP IOC buy of 0.004 that filled completely. It emits OrderPlaced with nothing remaining and no OrderRested.
 */
const RECORDED_IOC_FILL: RawLog[] = [
  {
    address: "0x478769e1177c0773c43a593dccc4ad15f15f1394",
    topics: [
      "0x9d952b9056b1ad31790d622a7f5ecf49004b370b41add0e429ac1e9f4b8a3335",
      "0x000000000000000000000000a1d0cb85c869e534fe1e0c22af3b238301157b5d",
      "0x000000000000000000000000d6cb1dd58580b84d76068ac21594219ce03aeddf",
    ],
    data: "0x0000000000000000000000000000000000000000000000000790d542b7f3c4d0",
  },
  {
    address: "0x478769e1177c0773c43a593dccc4ad15f15f1394",
    topics: [
      "0x5c87c81b4945a78d177e7c3dfbc9a6eaa971757d39f3b93c514446b47b5a2e1a",
      "0x000000000000000000000000a1d0cb85c869e534fe1e0c22af3b238301157b5d",
      "0x000000000000000000000000d6cb1dd58580b84d76068ac21594219ce03aeddf",
    ],
    data: "0x0000000000000000000000000000000000000000000000000790d542b7f3c4d0",
  },
  {
    address: "0x478769e1177c0773c43a593dccc4ad15f15f1394",
    topics: [
      "0x5c87c81b4945a78d177e7c3dfbc9a6eaa971757d39f3b93c514446b47b5a2e1a",
      "0x0000000000000000000000006c2986a550dc4212b49a1710d8466553e3761ce4",
      "0x000000000000000000000000d6cb1dd58580b84d76068ac21594219ce03aeddf",
    ],
    data: "0x00000000000000000000000000000000000000000000000006448145ee9ec000",
  },
  {
    address: "0x478769e1177c0773c43a593dccc4ad15f15f1394",
    topics: [
      "0xf7816a375f0ca01053ed213b57908bff79f578810301d50971a5f685529b82de",
      "0x000000000000000000000000a1d0cb85c869e534fe1e0c22af3b238301157b5d",
      "0x000000000000000000000000d6cb1dd58580b84d76068ac21594219ce03aeddf",
    ],
    data: "0x000000000000000000000000000000000000000000000000000e35fa931a000000000000000000000000000000000000000000000000007a69fcdddc8c9600000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001011c0eb54e1962444e09e23aede92e4",
  },
  {
    address: "0x478769e1177c0773c43a593dccc4ad15f15f1394",
    topics: [
      "0xf7816a375f0ca01053ed213b57908bff79f578810301d50971a5f685529b82de",
      "0x0000000000000000000000006c2986a550dc4212b49a1710d8466553e3761ce4",
      "0x000000000000000000000000d6cb1dd58580b84d76068ac21594219ce03aeddf",
    ],
    data: "0xfffffffffffffffffffffffffffffffffffffffffffffffe8e6cbf720c01400000000000000000000000000000000000000000000000007a67f4369fe2374ca60000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001011c0eb54e1962444e09e23aede92e4",
  },
  {
    address: "0xd6cb1dd58580b84d76068ac21594219ce03aeddf",
    topics: ["0x9bdc2f215c3fcb9fc57c7c2b23f8c67f16ad99f52f662cb7422db7544703f502"],
    data: "0x000000000000000000000000000000000000000000000034c98556f11d378000",
  },
  {
    address: "0xd6cb1dd58580b84d76068ac21594219ce03aeddf",
    topics: [
      "0xc87f4223e9e7c4e4f39f9b34fc9d64d78cdb95d9035b3748cbde59521261a399",
      "0x00000000000000000000000000000000000000000000047b0000000000adc971",
      "0x00000000000000000000000000000000000000000000047c0000000000adc960",
    ],
    data: "0x000000000000000000000000000000000000000000000000000e35fa931a00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000997a2bce4c00000000000000000000000000000000000000000000000007a69fcdddc8c960000",
  },
  {
    address: "0xd6cb1dd58580b84d76068ac21594219ce03aeddf",
    topics: ["0xd90f62f61ee2f606b132cfdfd883ddd079228b6fd6bffd9d7cf848daf824639d", "0x00000000000000000000000000000000000000000000047b0000000000adc971"],
    data: "0x00000000000000000000000000000000000000000000047b0000000000adc9710000000000000000000000000000000000000000000000000000000000000001000000000000000000000000a1d0cb85c869e534fe1e0c22af3b238301157b5d000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000007b8e1d7d55768f0000000000000000000000000000000000000000000000000000000e35fa931a0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000018e3bdd985447b40",
  },
];

describe("decodePlacementReceipt on a recorded Hideki receipt", () => {
  const decoded = decodePlacementReceipt(receiptOf(RECORDED_IOC_FILL, "success", ETH_POOL), ETH_POOL, BANK);

  it("reads the placement from OrderPlaced even though the IOC filled completely", () => {
    // #given the recorded receipt above
    // #when decoded
    // #then
    expect(decoded.placement).toEqual({
      orderId: 0x47b0000000000adc971n,
      owner: SENDER,
      side: "long",
      price: 2279190000000000000000n,
      fullQuantity: 4000000000000000n,
      quantityRemaining: 0n,
      rested: false,
      cancelled: false,
    });
  });

  it("attributes the single fill to the placed order", () => {
    // #given / #when as above
    // #then
    expect(decoded.fills).toEqual([{ takerOrderId: 0x47b0000000000adc971n, makerOrderId: 0x47c0000000000adc960n, quantity: 4000000000000000n, price: 2258140000000000000000n }]);
  });

  it("records the sender's lock and both accounts' position updates", () => {
    // #given / #when as above
    // #then
    expect(decoded.marginEvents.map((e) => `${e.kind}:${"account" in e ? e.account : ""}`)).toEqual([
      `CollateralLocked:${SENDER}`,
      `CollateralUnlocked:${SENDER}`,
      `CollateralUnlocked:${MAKER}`,
      `PositionUpdated:${SENDER}`,
      `PositionUpdated:${MAKER}`,
    ]);
  });

  it("classifies the recorded receipt as FILLED", () => {
    // #given
    const input = { receiptStatus: "success" as const, requestedQuantity: 4000000000000000n, placement: decoded.placement, fills: decoded.fills };
    // #when
    const result = classifyPlacementOutcome(input);
    // #then
    expect(result).toEqual({ outcome: "FILLED", filledQuantity: 4000000000000000n, note: null });
  });
});

describe("classifyPlacementOutcome on constructed receipts", () => {
  const order = { orderId: 77n, isBid: true, owner: SENDER, price: 70_000n * 10n ** 18n, fullQuantity: 26_000n };

  it("calls a resting GTC RESTING and keeps its id", () => {
    // #given
    const receipt = receiptOf([collateral("CollateralLocked", SENDER, BTC_POOL, 1n), orderPlaced(BTC_POOL, { ...order, quantityRemaining: 26_000n }), orderIdEvent(BTC_POOL, "OrderRested", 77n)]);
    const decoded = decodePlacementReceipt(receipt, BTC_POOL, BANK);
    // #when
    const result = classifyPlacementOutcome({ receiptStatus: "success", requestedQuantity: 26_000n, placement: decoded.placement, fills: decoded.fills });
    // #then
    expect([result.outcome, decoded.placement?.rested]).toEqual(["RESTING", true]);
  });

  it("calls a GTC that filled part and rested the rest PARTIALLY_FILLED", () => {
    // #given
    const receipt = receiptOf([
      collateral("CollateralLocked", SENDER, BTC_POOL, 2n),
      collateral("CollateralUnlocked", SENDER, BTC_POOL, 1n),
      positionUpdated(SENDER, BTC_POOL, 13_000n),
      orderFilled(BTC_POOL, { takerOrderId: 77n, makerOrderId: 5n, quantityFilled: 13_000n, takerRemainingQuantity: 13_000n, fillPrice: order.price }),
      orderPlaced(BTC_POOL, { ...order, quantityRemaining: 13_000n }),
      orderIdEvent(BTC_POOL, "OrderRested", 77n),
    ]);
    const decoded = decodePlacementReceipt(receipt, BTC_POOL, BANK);
    // #when
    const result = classifyPlacementOutcome({ receiptStatus: "success", requestedQuantity: 26_000n, placement: decoded.placement, fills: decoded.fills });
    // #then
    expect([result.outcome, result.filledQuantity, decoded.placement?.rested]).toEqual(["PARTIALLY_FILLED", 13_000n, true]);
  });

  it("calls an IOC whose remainder was cancelled PARTIALLY_FILLED, not FILLED", () => {
    // #given
    const receipt = receiptOf([
      orderFilled(BTC_POOL, { takerOrderId: 77n, makerOrderId: 5n, quantityFilled: 13_000n, takerRemainingQuantity: 13_000n, fillPrice: order.price }),
      orderPlaced(BTC_POOL, { ...order, quantityRemaining: 13_000n }),
      orderIdEvent(BTC_POOL, "OrderCancelled", 77n),
    ]);
    const decoded = decodePlacementReceipt(receipt, BTC_POOL, BANK);
    // #when
    const result = classifyPlacementOutcome({ receiptStatus: "success", requestedQuantity: 26_000n, placement: decoded.placement, fills: decoded.fills });
    // #then
    expect([result.outcome, decoded.placement?.cancelled, decoded.placement?.rested]).toEqual(["PARTIALLY_FILLED", true, false]);
  });

  it("calls a placement that neither filled nor rested NO_FILL", () => {
    // #given
    const receipt = receiptOf([orderPlaced(BTC_POOL, { ...order, quantityRemaining: 26_000n }), orderIdEvent(BTC_POOL, "OrderCancelledSelfMatch", 77n)]);
    const decoded = decodePlacementReceipt(receipt, BTC_POOL, BANK);
    // #when
    const result = classifyPlacementOutcome({ receiptStatus: "success", requestedQuantity: 26_000n, placement: decoded.placement, fills: decoded.fills });
    // #then
    expect(result.outcome).toBe("NO_FILL");
  });

  it("calls a reverted receipt REVERTED with nothing filled", () => {
    // #given
    const decoded = decodePlacementReceipt(receiptOf([], "reverted"), BTC_POOL, BANK);
    // #when
    const result = classifyPlacementOutcome({ receiptStatus: "reverted", requestedQuantity: 26_000n, placement: decoded.placement, fills: decoded.fills });
    // #then
    expect([result.outcome, result.filledQuantity]).toEqual(["REVERTED", 0n]);
  });

  it("refuses to call a successful receipt anything but UNKNOWN when OrderPlaced is missing", () => {
    // #given
    const receipt = receiptOf([orderFilled(BTC_POOL, { takerOrderId: 77n, makerOrderId: 5n, quantityFilled: 26_000n, takerRemainingQuantity: 0n, fillPrice: order.price })]);
    const decoded = decodePlacementReceipt(receipt, BTC_POOL, BANK);
    // #when
    const result = classifyPlacementOutcome({ receiptStatus: "success", requestedQuantity: 26_000n, placement: decoded.placement, fills: decoded.fills });
    // #then
    expect(result.outcome).toBe("UNKNOWN");
  });

  it("refuses FILLED when the decoded fills do not cover what the pool says matched", () => {
    // #given
    const placement: PlacementRecord = { orderId: 77n, owner: SENDER, side: "long", price: order.price, fullQuantity: 26_000n, quantityRemaining: 0n, rested: false, cancelled: false };
    const fills = [{ takerOrderId: 77n, makerOrderId: 5n, quantity: 13_000n, price: order.price }];
    // #when
    const result = classifyPlacementOutcome({ receiptStatus: "success", requestedQuantity: 26_000n, placement, fills });
    // #then
    expect(result.outcome).toBe("UNKNOWN");
  });

  it("refuses FILLED when the pool recorded a different quantity than the calldata", () => {
    // #given
    const placement: PlacementRecord = { orderId: 77n, owner: SENDER, side: "long", price: order.price, fullQuantity: 13_000n, quantityRemaining: 0n, rested: false, cancelled: false };
    const fills = [{ takerOrderId: 77n, makerOrderId: 5n, quantity: 13_000n, price: order.price }];
    // #when
    const result = classifyPlacementOutcome({ receiptStatus: "success", requestedQuantity: 26_000n, placement, fills });
    // #then
    expect(result.outcome).toBe("UNKNOWN");
  });

  it("ignores another pool's order events in the same receipt", () => {
    // #given
    const receipt = receiptOf([orderPlaced(ETH_POOL, { ...order, orderId: 9n, quantityRemaining: 0n }), orderPlaced(BTC_POOL, { ...order, quantityRemaining: 26_000n }), orderIdEvent(BTC_POOL, "OrderRested", 77n)]);
    // #when
    const decoded = decodePlacementReceipt(receipt, BTC_POOL, BANK);
    // #then
    expect(decoded.placement?.orderId).toBe(77n);
  });
});

describe("buildTruthChecks", () => {
  const placement: PlacementRecord = { orderId: 77n, owner: SENDER, side: "long", price: 70_000n * 10n ** 18n, fullQuantity: 13_000n, quantityRemaining: 0n, rested: false, cancelled: false };
  const filledEvents: MarginEventRecord[] = [
    { kind: "CollateralLocked", account: SENDER, pool: BTC_POOL, amount: 1n },
    { kind: "PositionUpdated", account: SENDER, pool: BTC_POOL, newSize: 13_000n, avgEntryPrice: 1n, realizedPnl: 0n },
    { kind: "CollateralUnlocked", account: MAKER, pool: BTC_POOL, amount: 1n },
    { kind: "PositionUpdated", account: MAKER, pool: BTC_POOL, newSize: -13_000n, avgEntryPrice: 1n, realizedPnl: 0n },
  ];
  const base: TruthCheckInput = {
    rpcChainId: 50383,
    txChainId: 50383,
    from: SENDER,
    to: BTC_POOL,
    market: null,
    expectedAccount: SENDER,
    expectedBank: BANK,
    poolBank: BANK,
    receiptStatus: "success",
    block: 1n,
    revertReason: null,
    calldata: null,
    intent: null,
    placement,
    filledQuantity: 13_000n,
    outcomeNote: null,
    outcome: "FILLED",
    marginEvents: filledEvents,
    counterpart: OTHER,
  };
  const statusOf = (checks: TruthCheck[], id: string): TruthCheck["status"] | undefined => checks.find((c) => c.id === id)?.status;

  it("passes sender, bank, receipt, attribution and isolation for a clean fill", () => {
    // #given / #when
    const checks = buildTruthChecks(base);
    // #then
    expect(["chain-id", "sender", "margin-bank", "receipt-success", "placement-decoded", "position-attribution", "collateral-attribution", "counterpart-isolation"].map((id) => statusOf(checks, id))).toEqual(
      ["pass", "pass", "pass", "pass", "pass", "pass", "pass", "pass"],
    );
  });

  it("fails the sender check when another wallet sent the order", () => {
    // #given
    const input = { ...base, expectedAccount: OTHER, counterpart: null };
    // #when / #then
    expect(statusOf(buildTruthChecks(input), "sender")).toBe("fail");
  });

  it("fails isolation when the counterpart's collateral was locked in this transaction", () => {
    // #given
    const input = { ...base, marginEvents: [...filledEvents, { kind: "CollateralLocked" as const, account: OTHER, pool: BTC_POOL, amount: 5n }] };
    // #when
    const checks = buildTruthChecks(input);
    // #then
    expect([statusOf(checks, "counterpart-isolation"), statusOf(checks, "collateral-attribution")]).toEqual(["fail", "fail"]);
  });

  it("marks isolation unknown when the counterpart only appears as a filled maker", () => {
    // #given
    const input = { ...base, counterpart: MAKER };
    // #when / #then
    expect(statusOf(buildTruthChecks(input), "counterpart-isolation")).toBe("unknown");
  });

  it("fails collateral attribution when a linked main wallet funded the order", () => {
    // #given
    const input = { ...base, marginEvents: [...filledEvents, { kind: "MainFundedChild" as const, child: SENDER, payer: OTHER, amount: 5n }] };
    // #when / #then
    expect(statusOf(buildTruthChecks(input), "collateral-attribution")).toBe("fail");
  });

  it("fails the chain check for a transaction signed for another chain", () => {
    // #given
    const input = { ...base, txChainId: 50312 };
    // #when / #then
    expect(statusOf(buildTruthChecks(input), "chain-id")).toBe("fail");
  });

  it("fails the MarginBank check when the pool settles elsewhere", () => {
    // #given
    const input = { ...base, poolBank: OTHER };
    // #when / #then
    expect(statusOf(buildTruthChecks(input), "margin-bank")).toBe("fail");
  });

  it("fails position attribution when fills decoded but the sender's position did not move", () => {
    // #given
    const input = { ...base, marginEvents: filledEvents.filter((e) => !(e.kind === "PositionUpdated" && e.account === SENDER)) };
    // #when / #then
    expect(statusOf(buildTruthChecks(input), "position-attribution")).toBe("fail");
  });

  const revertedInput = { ...base, receiptStatus: "reverted" as const, revertReason: "ImmediateOrCancelNoFill", placement: null, filledQuantity: 0n, outcome: "REVERTED" as const, marginEvents: [] };

  it("reports the revert reason in the failed receipt check", () => {
    // #given / #when
    const checks = buildTruthChecks(revertedInput);
    // #then
    expect([statusOf(checks, "receipt-success"), checks.find((c) => c.id === "receipt-success")?.detail]).toEqual(["fail", "Reverted: ImmediateOrCancelNoFill."]);
  });

  it("never shows placement or position checks as passed on a revert", () => {
    // #given / #when
    const checks = buildTruthChecks(revertedInput);
    // #then
    expect([statusOf(checks, "placement-decoded"), statusOf(checks, "position-attribution")]).toEqual(["unknown", "unknown"]);
  });
});

describe("requestedFromCalldata", () => {
  it("reads side, size, price and time in force from the signed call", () => {
    // #given
    const call = {
      isBid: false,
      userData: 0n,
      price: 70_000n,
      quantity: 13_000n,
      expireTimestampNs: 0n,
      orderType: 2,
      selfMatchingOption: 0,
      builder: OTHER,
      builderFeeBpsTimes1k: 0n,
    };
    // #when / #then
    expect(requestedFromCalldata(call)).toEqual({ side: "short", quantity: 13_000n, price: 70_000n, timeInForce: "IOC" });
  });

  it("is null when the calldata is not a placement, instead of falling back to a local intent", () => {
    // #given / #when / #then
    expect(requestedFromCalldata(null)).toBeNull();
  });
});

describe("mapFeedStatus", () => {
  const source = { kind: "chain" as const, block: 1n, readAt: "2026-11-01T00:00:00.000Z", via: "getPerpFeedStatus", pinned: false };

  it("exposes the mark as liveMarkPrice when the pool vouches for it", () => {
    // #given / #when
    const reading = mapFeedStatus({ markPriceOk: true, markPrice: 77_400n, openInterest: 1n }, source);
    // #then
    expect(reading.ok && [reading.value.live, reading.value.liveMarkPrice]).toEqual([true, 77_400n]);
  });

  it("withholds a zero mark instead of presenting it as a price", () => {
    // #given / #when
    const reading = mapFeedStatus({ markPriceOk: true, markPrice: 0n, openInterest: 1n }, source);
    // #then
    expect(reading.ok && [reading.value.live, reading.value.liveMarkPrice]).toEqual([false, null]);
  });

  it("withholds a non-zero mark the pool marks as not ok", () => {
    // #given / #when
    const reading = mapFeedStatus({ markPriceOk: false, markPrice: 77_400n, openInterest: 1n }, source);
    // #then
    expect(reading.ok && reading.value.liveMarkPrice).toBeNull();
  });
});
