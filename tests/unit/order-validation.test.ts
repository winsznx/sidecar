import { describe, expect, it } from "vitest";

import { toInputString } from "@/lib/format/units";
import {
  computeNotional,
  intentGridIssues,
  isOnGrid,
  nearestGridValues,
  snapDownToGrid,
  snapUpToGrid,
  validateOrderInput,
  type OrderInputDraft,
  type OrderValidationResult,
} from "@/lib/orders/validation";
import { BTC_PERP, marketFixture } from "@/tests/fixtures/markets.fixture";

const VALID: OrderInputDraft = { side: "long", priceText: "77412.3", quantityText: "0.00013", timeInForce: "GTC" };

function issuesOf(result: OrderValidationResult): Array<{ field: string; code: string; message: string; nearestValid: bigint[] }> {
  return result.ok ? [] : result.issues;
}

describe("T02 validateOrderInput: tick and lot enforcement", () => {
  it("turns a valid ticket into an intent on the BTC grid with its notional", () => {
    // #given the minimum BTC long at a price on the 0.1 tick
    // #when it is validated
    const result = validateOrderInput(VALID, BTC_PERP);
    // #then it becomes raw units and the exact notional
    expect(result).toEqual({
      ok: true,
      intent: {
        pool: BTC_PERP.pool,
        side: "long",
        quantity: 13_000n,
        price: 77_412_300_000_000_000_000_000n,
        timeInForce: "GTC",
      },
      notional: 10_063_599_000_000_000_000n,
    });
  });

  it("states the lot increment and the nearest valid sizes for an off-grid size", () => {
    // #given a size between two lots
    // #when it is validated
    const result = validateOrderInput({ ...VALID, quantityText: "0.000135" }, BTC_PERP);
    // #then the message names the exact increment and both neighbours
    expect(issuesOf(result)).toEqual([
      {
        field: "quantity",
        code: "OFF_LOT_GRID",
        message: "Size must be a multiple of 0.00001 BTC. Nearest valid: 0.00013 or 0.00014.",
        nearestValid: [13_000n, 14_000n],
      },
    ]);
  });

  it("points a below-minimum size at the smallest valid size", () => {
    // #given one lot below the minimum
    // #when it is validated
    const result = validateOrderInput({ ...VALID, quantityText: "0.00012" }, BTC_PERP);
    // #then the minimum is named and suggested
    expect(issuesOf(result)).toEqual([
      { field: "quantity", code: "BELOW_MIN_SIZE", message: "Minimum size is 0.00013 BTC.", nearestValid: [13_000n] },
    ]);
  });

  it("refuses more decimals than BTC has and still suggests grid sizes", () => {
    // #given nine decimal places on an eight-decimal asset
    // #when it is validated
    const result = validateOrderInput({ ...VALID, quantityText: "0.000130001" }, BTC_PERP);
    // #then it is refused and the neighbours of the typed value are offered
    expect(issuesOf(result)).toEqual([
      {
        field: "quantity",
        code: "TOO_MANY_DECIMALS",
        message: "Size must be a multiple of 0.00001 BTC. Nearest valid: 0.00013 or 0.00014.",
        nearestValid: [13_000n, 14_000n],
      },
    ]);
  });

  it("states the tick and the nearest valid prices for an off-grid price", () => {
    // #given a price between two ticks
    // #when it is validated
    const result = validateOrderInput({ ...VALID, priceText: "77412.35" }, BTC_PERP);
    // #then the message names the tick and both neighbouring prices
    expect(issuesOf(result)).toEqual([
      {
        field: "price",
        code: "OFF_TICK_GRID",
        message: "Price must be a multiple of 0.1 USDso. Nearest valid: 77,412.3 or 77,412.4.",
        nearestValid: [77_412_300_000_000_000_000_000n, 77_412_400_000_000_000_000_000n],
      },
    ]);
  });

  it("reports every problem at once and never builds an intent from them", () => {
    // #given a ticket that is wrong in every field
    // #when it is validated
    const result = validateOrderInput(
      { side: "buy", priceText: "-1", quantityText: "1e-4", timeInForce: "GTD" },
      BTC_PERP,
    );
    // #then each field has its own issue and there is no intent
    expect(result).toEqual({
      ok: false,
      issues: [
        expect.objectContaining({ field: "side", code: "INVALID_SIDE" }),
        expect.objectContaining({ field: "timeInForce", code: "INVALID_TIME_IN_FORCE" }),
        expect.objectContaining({ field: "quantity", code: "NOT_A_NUMBER" }),
        expect.objectContaining({ field: "price", code: "NOT_POSITIVE" }),
      ],
    });
  });

  it("rejects zero and empty input with plain wording", () => {
    // #given an empty price and a zero size
    // #when validated
    const result = validateOrderInput({ ...VALID, priceText: "", quantityText: "0" }, BTC_PERP);
    // #then both are explained
    expect(issuesOf(result).map(({ code, message }) => ({ code, message }))).toEqual([
      { code: "NOT_POSITIVE", message: "Size must be greater than zero." },
      { code: "EMPTY", message: "Enter a limit price." },
    ]);
  });

  it("disables orders when the market grid could not be read", () => {
    // #given a market whose lot size came back as zero
    const market = marketFixture({ lotSize: 0n });
    // #when a ticket is validated against it
    const result = validateOrderInput(VALID, market);
    // #then no intent is produced
    expect(issuesOf(result).map((issue) => issue.code)).toEqual(["MARKET_GRID_UNAVAILABLE"]);
  });

  it("never lets an off-grid or below-minimum size reach an intent", () => {
    // #given every raw size from 1 to 30,000 written as the trader would type it
    const sizes = Array.from({ length: 30_000 }, (_, index) => BigInt(index + 1));
    // #when each is validated
    const accepted = sizes.filter(
      (raw) =>
        validateOrderInput({ ...VALID, quantityText: toInputString(raw, BTC_PERP.baseDecimals) }, BTC_PERP).ok,
    );
    // #then only on-grid sizes at or above the minimum produce an intent
    expect(accepted).toEqual(sizes.filter((raw) => raw >= BTC_PERP.minQuantity && raw % BTC_PERP.lotSize === 0n));
  });
});

describe("intentGridIssues", () => {
  it("catches an intent that was built without validation", () => {
    // #given a hand-built intent off both grids and for another pool
    const intent = {
      pool: "0x1111111111111111111111111111111111111111" as const,
      side: "long" as const,
      quantity: 13_500n,
      price: 77_412_350_000_000_000_000_000n,
      timeInForce: "GTC" as const,
    };
    // #when it is re-checked
    const issues = intentGridIssues(intent, BTC_PERP);
    // #then every violation is reported
    expect(issues.map((issue) => issue.code)).toEqual(["MARKET_MISMATCH", "OFF_LOT_GRID", "OFF_TICK_GRID"]);
  });
});

describe("grid helpers", () => {
  it("snaps down and up onto the grid, including below zero", () => {
    // #given values on and off a 1,000 grid
    // #when snapped
    const snapped = [
      snapDownToGrid(13_500n, 1_000n),
      snapUpToGrid(13_500n, 1_000n),
      snapDownToGrid(13_000n, 1_000n),
      snapDownToGrid(-500n, 1_000n),
      snapUpToGrid(-500n, 1_000n),
    ];
    // #then down floors and up ceils
    expect(snapped).toEqual([13_000n, 14_000n, 13_000n, -1_000n, 0n]);
  });

  it("offers neighbours only at or above the floor", () => {
    // #given a value below the minimum and one on the grid
    // #when neighbours are requested
    const results = [nearestGridValues(12_500n, 1_000n, 13_000n), nearestGridValues(14_000n, 1_000n, 13_000n)];
    // #then nothing below the floor is suggested
    expect(results).toEqual([[13_000n], [14_000n]]);
  });

  it("treats a missing grid as no grid instead of dividing by zero", () => {
    // #given a zero step
    // #when helpers run
    const results = [isOnGrid(7n, 0n), snapDownToGrid(7n, 0n)];
    // #then every value is on the unit grid
    expect(results).toEqual([true, 7n]);
  });

  it("computes notional as quantity times price over one base unit, floored", () => {
    // #given 0.00013 BTC at 77,412.3
    // #when the notional is computed
    const notional = computeNotional(13_000n, 77_412_300_000_000_000_000_000n, 8);
    // #then it is 10.063599 USDso exactly
    expect(notional).toBe(10_063_599_000_000_000_000n);
  });
});
