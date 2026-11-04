import { describe, expect, it } from "vitest";

import {
  formatAge,
  formatBlockNumber,
  formatBps,
  formatLeverageFromBps,
  formatPrice,
  formatQuantity,
  formatRaw,
  formatSignedUsdso,
  formatStt,
  formatUsdso,
  gridFractionDigits,
  parseHumanAmount,
  shortAddress,
  toInputString,
  UNAVAILABLE_TEXT,
} from "@/lib/format/units";
import { validateOrderInput } from "@/lib/orders/validation";
import {
  BTC_PERP,
  ETH_PERP,
  NEAR_PERP,
  SEVEN_DECIMAL_PERP,
  SIX_DECIMAL_PERP,
  SOL_PERP,
} from "@/tests/fixtures/markets.fixture";

function parsed(text: string, decimals: number): bigint {
  const result = parseHumanAmount(text, decimals);
  if (!result.ok) throw new Error(`expected ${text} to parse: ${result.error.message}`);
  return result.value;
}

function parseCode(text: string, decimals = 8): string | null {
  const result = parseHumanAmount(text, decimals);
  return result.ok ? null : result.error.code;
}

describe("T01 decimal round trips", () => {
  const cases: Array<{ name: string; decimals: number; samples: string[] }> = [
    { name: "BTC (8)", decimals: 8, samples: ["0.00013", "1", "21000000", "0.00000001", "77412.3"] },
    { name: "SOL (9)", decimals: 9, samples: ["0.000000001", "123.456789", "0.5"] },
    { name: "ETH (18)", decimals: 18, samples: ["0.000000000000000001", "3100.25", "1"] },
    {
      name: "NEAR (24)",
      decimals: 24,
      samples: ["0.000000000000000000000001", "1.5", "987654321.123456789012345678901234"],
    },
    { name: "6 decimals", decimals: 6, samples: ["0.000001", "999999.999999", "42"] },
    { name: "7 decimals", decimals: 7, samples: ["0.0000001", "12.3456789", "0.1"] },
  ];

  for (const { name, decimals, samples } of cases) {
    it(`returns the exact typed text after human -> raw -> human for ${name}`, () => {
      // #given human amounts at the token's full precision
      // #when each is parsed to raw units and formatted back
      const roundTripped = samples.map((text) => formatRaw(parsed(text, decimals), decimals, { grouping: false }));
      // #then nothing is gained or lost
      expect(roundTripped).toEqual(samples);
    });

    it(`gives an input string that parses back to the same raw value for ${name}`, () => {
      // #given raw values
      const raws = samples.map((text) => parsed(text, decimals));
      // #when they are turned into input text and parsed again
      const reparsed = raws.map((raw) => parsed(toInputString(raw, decimals), decimals));
      // #then the raw values are identical
      expect(reparsed).toEqual(raws);
    });
  }

  it("keeps validated orders on each market's grid and prints them back as typed", () => {
    // #given one valid order per decimal scale
    const tickets = [
      { market: BTC_PERP, size: "0.00013", price: "77412.3" },
      { market: SOL_PERP, size: "1.234", price: "151.123" },
      { market: ETH_PERP, size: "0.0015", price: "3100.25" },
      { market: NEAR_PERP, size: "12.345", price: "4.1234" },
      { market: SIX_DECIMAL_PERP, size: "0.00105", price: "1.0001" },
      { market: SEVEN_DECIMAL_PERP, size: "0.00105", price: "2.5" },
    ];
    // #when each passes through validation and display formatting
    const results = tickets.map(({ market, size, price }) => {
      const result = validateOrderInput({ side: "long", priceText: price, quantityText: size, timeInForce: "GTC" }, market);
      if (!result.ok) return { market: market.displaySymbol, onGrid: false, size: null, price: null };
      return {
        market: market.displaySymbol,
        onGrid: result.intent.quantity % market.lotSize === 0n && result.intent.price % market.tickSize === 0n,
        size: formatQuantity(result.intent.quantity, market, { grouping: false }),
        price: formatPrice(result.intent.price, market, { grouping: false }),
      };
    });
    // #then every order is on its grid and prints exactly as typed
    expect(results).toEqual(
      tickets.map(({ market, size, price }) => ({ market: market.displaySymbol, onGrid: true, size, price })),
    );
  });

  it("reads the live BTC grid at the documented precision", () => {
    // #given the BTC minimum, lot and tick as a trader would type them
    // #when they are parsed at the market's decimals
    const raw = [
      parsed("0.00013", BTC_PERP.baseDecimals),
      parsed("0.00001", BTC_PERP.baseDecimals),
      parsed("0.1", BTC_PERP.quoteDecimals),
    ];
    // #then they match the raw grid the chain reports
    expect(raw).toEqual([BTC_PERP.minQuantity, BTC_PERP.lotSize, BTC_PERP.tickSize]);
  });
});

describe("parseHumanAmount", () => {
  it("refuses extra fraction digits instead of rounding them", () => {
    // #given more digits than the token holds
    // #when it is parsed
    const result = parseHumanAmount("0.123456789", 8);
    // #then it is refused, with the truncated value available for suggestions
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "TOO_MANY_DECIMALS", truncatedValue: 12_345_678n }),
    });
  });

  it("names each kind of malformed input", () => {
    // #given inputs a trader might paste
    const inputs = ["", "   ", "1e-5", "2E3", "-1", "-0.5", "abc", "1.2.3", "1,2", "+5", "Infinity", "0x10"];
    // #when each is parsed
    const codes = inputs.map((text) => parseCode(text));
    // #then each gets a specific code and none parses
    expect(codes).toEqual([
      "EMPTY",
      "EMPTY",
      "EXPONENT",
      "EXPONENT",
      "NEGATIVE",
      "NEGATIVE",
      "NOT_A_NUMBER",
      "NOT_A_NUMBER",
      "NOT_A_NUMBER",
      "NOT_A_NUMBER",
      "NOT_A_NUMBER",
      "NOT_A_NUMBER",
    ]);
  });

  it("accepts grouping from Sidecar's own display and insignificant zeros", () => {
    // #given formats a trader may reasonably type or copy
    // #when they are parsed
    const values = [
      parsed("77,412.3", 18),
      parsed("1,000,000", 6),
      parsed("0.000130", 6),
      parsed(".5", 2),
      parsed("5.", 2),
      parsed("  42  ", 0),
    ];
    // #then each yields the exact raw amount
    expect(values).toEqual([77_412_300_000_000_000_000_000n, 1_000_000_000_000n, 130n, 50n, 500n, 42n]);
  });

  it("treats invalid token decimals as a programming error", () => {
    // #given decimals no token can have
    // #when parsing with them
    const attempts = [() => parseHumanAmount("1", -1), () => parseHumanAmount("1", 1.5)];
    // #then it throws rather than guessing a scale
    for (const attempt of attempts) expect(attempt).toThrow(RangeError);
  });
});

describe("display formatting", () => {
  it("never formats an unavailable value as zero", () => {
    // #given missing values in every formatter
    // #when they are formatted
    const outputs = [
      formatRaw(null, 18),
      formatUsdso(null, 18),
      formatPrice(undefined, BTC_PERP),
      formatQuantity(null, BTC_PERP),
      formatBps(null),
      formatLeverageFromBps(null),
      formatAge(null),
      formatStt(null),
    ];
    // #then each says it is unavailable
    expect(outputs).toEqual(Array(outputs.length).fill(UNAVAILABLE_TEXT));
  });

  it("lets dense tables choose a shorter unavailable marker", () => {
    // #given a table that wants a compact marker
    // #when a missing amount is formatted with it
    const text = formatUsdso(null, 18, { unavailableText: "n/a" });
    // #then the marker is used, still not a zero
    expect(text).toBe("n/a");
  });

  it("shows a real tiny amount as below the smallest step, never as zero", () => {
    // #given one wei either side of zero, and zero itself
    // #when formatted to cents
    const outputs = [formatUsdso(1n, 18), formatUsdso(-1n, 18), formatUsdso(0n, 18), formatStt(1n, { withSymbol: true })];
    // #then only the true zero reads as zero
    expect(outputs).toEqual(["<0.01", "-<0.01", "0.00", "<0.0001 STT"]);
  });

  it("groups thousands and keeps tabular fraction digits", () => {
    // #given amounts, prices and sizes from the BTC market
    // #when formatted for a table
    const outputs = [
      formatUsdso(1_234_567_890_000_000_000_000_000n, 18),
      formatUsdso(5n * 10n ** 18n, 18, { withSymbol: true }),
      formatPrice(77_412_300_000_000_000_000_000n, BTC_PERP),
      formatPrice(77_412_350_000_000_000_000_000n, BTC_PERP),
      formatQuantity(13_000n, BTC_PERP, { withSymbol: true }),
      formatQuantity(100_000_000n, BTC_PERP),
    ];
    // #then digits follow the market grid and thousands are grouped
    expect(outputs).toEqual(["1,234,567.89", "5.00 USDso", "77,412.3", "77,412.3", "0.00013 BTC", "1.00000"]);
  });

  it("rounds in the requested direction", () => {
    // #given 1.001 and its negative, and 1.005
    const value = 1_001_000_000_000_000_000n;
    // #when formatted to cents with each rounding mode
    const outputs = [
      formatUsdso(value, 18),
      formatUsdso(value, 18, { rounding: "ceil" }),
      formatUsdso(-value, 18, { rounding: "floor" }),
      formatUsdso(-value, 18, { rounding: "ceil" }),
      formatUsdso(1_005_000_000_000_000_000n, 18, { rounding: "half-up" }),
    ];
    // #then truncation is the default and the others round as named
    expect(outputs).toEqual(["1.00", "1.01", "-1.01", "-1.00", "1.01"]);
  });

  it("signs PnL-style amounts and leaves zero unsigned", () => {
    // #given a gain, a loss and zero
    // #when formatted as signed collateral
    const outputs = [
      formatSignedUsdso(12_340_000_000_000_000_000n, 18),
      formatSignedUsdso(-500_000_000_000_000_000n, 18),
      formatSignedUsdso(0n, 18),
    ];
    // #then each carries the right sign
    expect(outputs).toEqual(["+12.34", "-0.50", "0.00"]);
  });

  it("derives display precision from the market grid", () => {
    // #given ticks and lots at different scales
    // #when the needed fraction digits are computed
    const digits = [
      gridFractionDigits(100_000_000_000_000_000n, 18),
      gridFractionDigits(1_000n, 8),
      gridFractionDigits(25_000_000_000_000_000n, 18),
      gridFractionDigits(10n ** 18n, 18),
      gridFractionDigits(0n, 8),
    ];
    // #then each step is written exactly, and a missing grid falls back to full precision
    expect(digits).toEqual([1, 5, 3, 0, 8]);
  });

  it("formats rates, leverage, ages and blocks for badges", () => {
    // #given protocol-unit values
    // #when formatted
    const outputs = [
      formatBps(500n),
      formatBps(750),
      formatBps(1n),
      formatBps(-1_000n),
      formatLeverageFromBps(200_000n),
      formatLeverageFromBps(25_000n),
      formatAge(4_000),
      formatAge(125_000),
      formatAge(3 * 3_600_000),
      formatAge(26 * 3_600_000),
      formatAge(-50),
      formatBlockNumber(12_345_678n),
    ];
    // #then each reads plainly
    expect(outputs).toEqual([
      "5.00%",
      "7.50%",
      "0.01%",
      "-10.00%",
      "20.00x",
      "2.50x",
      "4s",
      "2m",
      "3h",
      "1d",
      "0s",
      "12,345,678",
    ]);
  });

  it("shortens addresses with their checksum", () => {
    // #given a lowercase and a checksummed address
    // #when shortened
    const outputs = [
      shortAddress("0xf07510313917852bc9d6ddaa811a158d7242dcd0"),
      shortAddress("0x0DE15c470291d26b6604D9D30eF6D53F169bb1E0"),
      shortAddress(null),
    ];
    // #then both show the checksummed ends
    expect(outputs).toEqual(["0xf075…dcd0", "0x0DE1…b1E0", UNAVAILABLE_TEXT]);
  });
});
