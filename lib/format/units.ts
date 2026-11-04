import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains";
import { formatUnits, getAddress, isAddress, maxUint256, parseUnits } from "viem";

import type { MarketMeta } from "@/lib/dreamdex/types";

/**
 * Human <-> raw conversion and display formatting.
 *
 * Every function here is bigint-only. Human strings exist at the input edge
 * (`parseHumanAmount`) and the display edge (`format*`); nothing in between
 * ever sees a JS float. A `null` input formats as an explicit unavailable
 * marker, never as "0".
 */

export const UNAVAILABLE_TEXT = "Unavailable";

/** Display symbol for the perps collateral token. */
export const COLLATERAL_SYMBOL = "USDso";

export type AmountParseErrorCode =
  | "EMPTY"
  | "NOT_A_NUMBER"
  | "EXPONENT"
  | "NEGATIVE"
  | "TOO_MANY_DECIMALS"
  | "TOO_LARGE";

export interface AmountParseError {
  code: AmountParseErrorCode;
  message: string;
  /** Decimal places the token allows. */
  decimals: number;
  /** TOO_MANY_DECIMALS only: the typed value cut toward zero at `decimals` places. */
  truncatedValue?: bigint;
}

export type AmountParseResult =
  | { ok: true; value: bigint }
  | { ok: false; error: AmountParseError };

export type RoundingMode = "trunc" | "floor" | "ceil" | "half-up";

export interface FormatAmountOptions {
  /** Defaults to the token's full precision. */
  maxFractionDigits?: number;
  /** Pads with zeros up to this many fraction digits. Defaults to 0. */
  minFractionDigits?: number;
  /** Thousands separators. Defaults to true. */
  grouping?: boolean;
  /**
   * Applied when `maxFractionDigits` drops precision. Defaults to "trunc", which never
   * shows a magnitude larger than the raw value. Use "ceil" for amounts a trader must
   * provide (shortfalls, requirements) so the figure shown is always enough.
   */
  rounding?: RoundingMode;
  /** "always" prefixes "+" on positive values. Zero never gets a sign. */
  signDisplay?: "auto" | "always";
  unavailableText?: string;
  suffix?: string;
}

export interface SymbolFormatOptions extends FormatAmountOptions {
  /** Appends the unit, e.g. "0.00013 BTC". */
  withSymbol?: boolean;
}

export interface CollateralFormatOptions extends SymbolFormatOptions {
  /** Unit appended by `withSymbol`. Defaults to {@link COLLATERAL_SYMBOL}. */
  symbol?: string;
}

const DECIMAL_LITERAL = /^(?:\d+(?:\.\d*)?|\.\d+)$/;
const GROUPED_LITERAL = /^\d{1,3}(?:,\d{3})+(?:\.\d*)?$/;
const EXPONENT_LITERAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)e[+-]?\d+$/i;
const MAX_TOKEN_DECIMALS = 255;

/**
 * Parses what a trader typed into raw units at `decimals`.
 *
 * Exact or refused, never rounded: viem's `parseUnits` silently rounds extra fraction
 * digits, so they are rejected here before it is called. Accepts "1234.5", ".5", "5." and
 * strictly grouped "77,412.3" (so a figure copied from Sidecar's own display parses back).
 * Trailing fraction zeros are not significant: "0.000130" is fine at 6 decimals.
 *
 * @throws RangeError when `decimals` is not an integer in [0, 255]. That is a market
 * metadata bug, not a user input problem.
 */
export function parseHumanAmount(text: string, decimals: number): AmountParseResult {
  assertDecimals(decimals);
  const trimmed = text.trim();
  if (trimmed === "") return parseFailure("EMPTY", decimals);
  if (EXPONENT_LITERAL.test(trimmed)) return parseFailure("EXPONENT", decimals);

  const negative = trimmed.startsWith("-");
  const literal = ungroup(negative ? trimmed.slice(1).trimStart() : trimmed);
  if (literal === null) return parseFailure("NOT_A_NUMBER", decimals);
  if (negative) return parseFailure("NEGATIVE", decimals);

  const [integerDigits = "", fractionDigits = ""] = literal.split(".");
  const integer = integerDigits === "" ? "0" : integerDigits;
  const fraction = fractionDigits.replace(/0+$/, "");

  if (fraction.length > decimals) {
    const kept = fraction.slice(0, decimals);
    const truncatedValue = parseUnits(kept === "" ? integer : `${integer}.${kept}`, decimals);
    return parseFailure("TOO_MANY_DECIMALS", decimals, truncatedValue);
  }

  const value = parseUnits(fraction === "" ? integer : `${integer}.${fraction}`, decimals);
  if (value > maxUint256) return parseFailure("TOO_LARGE", decimals);
  return { ok: true, value };
}

/** Exact, ungrouped decimal string for pre-filling an input. No rounding. */
export function toInputString(raw: bigint, decimals: number): string {
  assertDecimals(decimals);
  return formatUnits(raw, decimals);
}

/**
 * Formats raw units for tabular display.
 *
 * A non-zero value that would round to all zeros renders as "<0.01" (or "-<0.01") so a
 * real amount never masquerades as nothing.
 */
export function formatRaw(
  raw: bigint | null | undefined,
  decimals: number,
  options: FormatAmountOptions = {},
): string {
  if (raw === null || raw === undefined) return options.unavailableText ?? UNAVAILABLE_TEXT;
  assertDecimals(decimals);

  const maxFraction = clampDigits(options.maxFractionDigits ?? decimals, decimals);
  const minFraction = Math.min(clampDigits(options.minFractionDigits ?? 0, decimals), maxFraction);
  const negative = raw < 0n;
  const magnitude = negative ? -raw : raw;
  const scaled = roundToScale(
    magnitude,
    10n ** BigInt(decimals - maxFraction),
    options.rounding ?? "trunc",
    negative,
  );
  const sign = negative ? "-" : options.signDisplay === "always" && raw > 0n ? "+" : "";
  const suffix = options.suffix ?? "";

  if (scaled === 0n && magnitude !== 0n) {
    return `${sign}<${smallestStep(maxFraction)}${suffix}`;
  }

  const [integerPart = "0", fractionPart = ""] = formatUnits(scaled, maxFraction).split(".");
  const integerText = options.grouping === false ? integerPart : groupThousands(integerPart);
  const fractionText = fractionPart.padEnd(minFraction, "0");
  return `${sign}${integerText}${fractionText === "" ? "" : `.${fractionText}`}${suffix}`;
}

/**
 * Fraction digits needed to write `step` exactly at `decimals`. A BTC tick of 1e17 at
 * 18 quote decimals is 0.1, so 1 digit; a BTC lot of 1000 at 8 base decimals is
 * 0.00001, so 5 digits.
 */
export function gridFractionDigits(step: bigint, decimals: number): number {
  assertDecimals(decimals);
  if (step <= 0n) return decimals;
  let trailingZeros = 0;
  let rest = step;
  while (trailingZeros < decimals && rest % 10n === 0n) {
    rest /= 10n;
    trailingZeros += 1;
  }
  return decimals - trailingZeros;
}

/** A price at the market's tick precision. */
export function formatPrice(
  raw: bigint | null | undefined,
  market: MarketMeta,
  options: SymbolFormatOptions = {},
): string {
  const digits = gridFractionDigits(market.tickSize, market.quoteDecimals);
  return formatRaw(raw, market.quoteDecimals, {
    maxFractionDigits: digits,
    minFractionDigits: digits,
    ...options,
    suffix: options.withSymbol ? ` ${market.quoteSymbol}` : options.suffix,
  });
}

/** A base quantity at the market's lot precision. */
export function formatQuantity(
  raw: bigint | null | undefined,
  market: MarketMeta,
  options: SymbolFormatOptions = {},
): string {
  const digits = gridFractionDigits(market.lotSize, market.baseDecimals);
  return formatRaw(raw, market.baseDecimals, {
    maxFractionDigits: digits,
    minFractionDigits: digits,
    ...options,
    suffix: options.withSymbol ? ` ${market.baseSymbol}` : options.suffix,
  });
}

/**
 * A collateral amount, cents by default. `decimals` is the collateral token's
 * (`market.quoteDecimals` on a perp market); it is a parameter so no token scale is
 * baked in here.
 */
export function formatUsdso(
  raw: bigint | null | undefined,
  decimals: number,
  options: CollateralFormatOptions = {},
): string {
  return formatRaw(raw, decimals, {
    maxFractionDigits: 2,
    minFractionDigits: 2,
    ...options,
    suffix: options.withSymbol ? ` ${options.symbol ?? COLLATERAL_SYMBOL}` : options.suffix,
  });
}

/** PnL-style collateral amount: "+12.34", "-0.50", "0.00". */
export function formatSignedUsdso(
  raw: bigint | null | undefined,
  decimals: number,
  options: CollateralFormatOptions = {},
): string {
  return formatUsdso(raw, decimals, { signDisplay: "always", ...options });
}

/** Native gas balance (STT), at the chain definition's native decimals. */
export function formatStt(raw: bigint | null | undefined, options: SymbolFormatOptions = {}): string {
  const { decimals, symbol } = hidekiTestnet.nativeCurrency;
  return formatRaw(raw, decimals, {
    maxFractionDigits: 4,
    minFractionDigits: 0,
    ...options,
    suffix: options.withSymbol ? ` ${symbol}` : options.suffix,
  });
}

/** Basis points as a percentage: 750 -> "7.50%". */
export function formatBps(
  bps: bigint | number | null | undefined,
  options: { fractionDigits?: number; unavailableText?: string } = {},
): string {
  const value = toBigIntOrNull(bps);
  if (value === null) return options.unavailableText ?? UNAVAILABLE_TEXT;
  const digits = clampDigits(options.fractionDigits ?? 2, 2);
  return formatRaw(value, 2, {
    maxFractionDigits: digits,
    minFractionDigits: digits,
    rounding: "half-up",
    suffix: "%",
  });
}

/** Leverage in the protocol's "bps of 1x" unit: 200_000 -> "20.00x". */
export function formatLeverageFromBps(
  bps: bigint | null | undefined,
  options: { fractionDigits?: number; unavailableText?: string } = {},
): string {
  if (bps === null || bps === undefined) return options.unavailableText ?? UNAVAILABLE_TEXT;
  const digits = clampDigits(options.fractionDigits ?? 2, 4);
  return formatRaw(bps, 4, { maxFractionDigits: digits, minFractionDigits: digits, suffix: "x" });
}

/** "0xAb12…cdEf", checksummed when the input is a valid address. */
export function shortAddress(
  address: string | null | undefined,
  unavailableText: string = UNAVAILABLE_TEXT,
): string {
  if (address === null || address === undefined || address === "") return unavailableText;
  const normalized = isAddress(address, { strict: false }) ? getAddress(address) : address;
  if (normalized.length <= 12) return normalized;
  return `${normalized.slice(0, 6)}…${normalized.slice(-4)}`;
}

/** Compact age for freshness badges: "4s", "2m", "3h", "1d". */
export function formatAge(
  ms: number | null | undefined,
  unavailableText: string = UNAVAILABLE_TEXT,
): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return unavailableText;
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** "12,345,678". */
export function formatBlockNumber(
  block: bigint | null | undefined,
  unavailableText: string = UNAVAILABLE_TEXT,
): string {
  if (block === null || block === undefined) return unavailableText;
  return block < 0n ? `-${groupThousands((-block).toString())}` : groupThousands(block.toString());
}

function parseFailure(
  code: AmountParseErrorCode,
  decimals: number,
  truncatedValue?: bigint,
): AmountParseResult {
  const messages: Record<AmountParseErrorCode, string> = {
    EMPTY: "Enter an amount.",
    NOT_A_NUMBER: "Use digits with an optional decimal point, for example 1.25.",
    EXPONENT: "Write the number in full, without exponent notation.",
    NEGATIVE: "Enter a positive amount.",
    TOO_MANY_DECIMALS: `Use at most ${decimals} decimal places.`,
    TOO_LARGE: "That amount is too large.",
  };
  const error: AmountParseError = { code, message: messages[code], decimals };
  if (truncatedValue !== undefined) error.truncatedValue = truncatedValue;
  return { ok: false, error };
}

function ungroup(text: string): string | null {
  if (DECIMAL_LITERAL.test(text)) return text;
  if (GROUPED_LITERAL.test(text)) return text.replaceAll(",", "");
  return null;
}

function assertDecimals(decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_TOKEN_DECIMALS) {
    throw new RangeError(`Token decimals must be an integer from 0 to 255, got ${decimals}.`);
  }
}

function clampDigits(digits: number, max: number): number {
  if (!Number.isFinite(digits)) return max;
  return Math.max(0, Math.min(Math.trunc(digits), max));
}

function roundToScale(magnitude: bigint, divisor: bigint, mode: RoundingMode, negative: boolean): bigint {
  const quotient = magnitude / divisor;
  const remainder = magnitude % divisor;
  if (remainder === 0n) return quotient;
  switch (mode) {
    case "trunc":
      return quotient;
    case "half-up":
      return remainder * 2n >= divisor ? quotient + 1n : quotient;
    case "floor":
      return negative ? quotient + 1n : quotient;
    case "ceil":
      return negative ? quotient : quotient + 1n;
  }
}

function smallestStep(fractionDigits: number): string {
  return fractionDigits === 0 ? "1" : `0.${"0".repeat(fractionDigits - 1)}1`;
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function toBigIntOrNull(value: bigint | number | null | undefined): bigint | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return value;
  return Number.isSafeInteger(value) ? BigInt(value) : null;
}
