import type { MarketMeta, OrderIntent, OrderSide, TimeInForce } from "@/lib/dreamdex/types";
import {
  formatPrice,
  formatQuantity,
  parseHumanAmount,
  type AmountParseError,
} from "@/lib/format/units";

export const ORDER_SIDES: readonly OrderSide[] = ["long", "short"];
export const TIMES_IN_FORCE: readonly TimeInForce[] = ["GTC", "IOC", "FOK", "POST_ONLY"];

export type OrderInputField = "side" | "price" | "quantity" | "timeInForce" | "market";

export type OrderInputIssueCode =
  | "EMPTY"
  | "NOT_A_NUMBER"
  | "TOO_MANY_DECIMALS"
  | "TOO_LARGE"
  | "NOT_POSITIVE"
  | "BELOW_MIN_SIZE"
  | "OFF_LOT_GRID"
  | "OFF_TICK_GRID"
  | "INVALID_SIDE"
  | "INVALID_TIME_IN_FORCE"
  | "MARKET_GRID_UNAVAILABLE"
  | "MARKET_MISMATCH";

export interface OrderInputIssue {
  field: OrderInputField;
  code: OrderInputIssueCode;
  message: string;
  /** Valid raw values closest to what was typed, ascending. Empty when none apply. */
  nearestValid: bigint[];
}

/** What the order ticket holds: raw text straight from the inputs. */
export interface OrderInputDraft {
  side: string;
  priceText: string;
  quantityText: string;
  timeInForce: string;
}

export type OrderValidationResult =
  | { ok: true; intent: OrderIntent; notional: bigint }
  | { ok: false; issues: OrderInputIssue[] };

export function isOrderSide(value: unknown): value is OrderSide {
  return typeof value === "string" && (ORDER_SIDES as readonly string[]).includes(value);
}

export function isTimeInForce(value: unknown): value is TimeInForce {
  return typeof value === "string" && (TIMES_IN_FORCE as readonly string[]).includes(value);
}

/**
 * Turns ticket text into an intent on the market grid, or explains exactly why not.
 * Invalid input never yields an intent: there is no partially valid result.
 */
export function validateOrderInput(draft: OrderInputDraft, market: MarketMeta): OrderValidationResult {
  const gridIssue = marketGridIssue(market);
  if (gridIssue) return { ok: false, issues: [gridIssue] };

  const { side, timeInForce } = draft;
  const quantity = validateQuantityText(draft.quantityText, market);
  const price = validatePriceText(draft.priceText, market);

  const issues: OrderInputIssue[] = [];
  if (!isOrderSide(side)) issues.push(issue("side", "INVALID_SIDE", "Choose Long or Short."));
  if (!isTimeInForce(timeInForce)) {
    issues.push(issue("timeInForce", "INVALID_TIME_IN_FORCE", "Choose an order type."));
  }
  if (!quantity.ok) issues.push(quantity.issue);
  if (!price.ok) issues.push(price.issue);

  if (!isOrderSide(side) || !isTimeInForce(timeInForce) || !quantity.ok || !price.ok) {
    return { ok: false, issues };
  }

  const intent: OrderIntent = {
    pool: market.pool,
    side,
    quantity: quantity.value,
    price: price.value,
    timeInForce,
  };
  return { ok: true, intent, notional: computeNotional(intent.quantity, intent.price, market.baseDecimals) };
}

/**
 * Re-checks an intent that was built elsewhere against the market grid. Used as a
 * second line of defence before quoting or signing.
 */
export function intentGridIssues(intent: OrderIntent, market: MarketMeta): OrderInputIssue[] {
  const gridIssue = marketGridIssue(market);
  if (gridIssue) return [gridIssue];
  const issues: OrderInputIssue[] = [];
  if (intent.pool.toLowerCase() !== market.pool.toLowerCase()) {
    issues.push(
      issue("market", "MARKET_MISMATCH", `This order is not for ${market.displaySymbol}. Enter it again.`),
    );
  }
  const quantity = checkQuantityValue(intent.quantity, market);
  if (!quantity.ok) issues.push(quantity.issue);
  const price = checkPriceValue(intent.price, market);
  if (!price.ok) issues.push(price.issue);
  return issues;
}

/** Rounds toward negative infinity onto multiples of `step`. A step of 0 or less means no grid. */
export function snapDownToGrid(raw: bigint, step: bigint): bigint {
  const unit = effectiveStep(step);
  const remainder = raw % unit;
  if (remainder === 0n) return raw;
  return raw > 0n ? raw - remainder : raw - remainder - unit;
}

/** Rounds toward positive infinity onto multiples of `step`. */
export function snapUpToGrid(raw: bigint, step: bigint): bigint {
  const unit = effectiveStep(step);
  const remainder = raw % unit;
  if (remainder === 0n) return raw;
  return raw > 0n ? raw - remainder + unit : raw - remainder;
}

export function isOnGrid(raw: bigint, step: bigint): boolean {
  return raw % effectiveStep(step) === 0n;
}

/**
 * The grid values either side of `raw` (just `raw` when it is already on the grid),
 * restricted to values of at least `atLeast`.
 */
export function nearestGridValues(raw: bigint, step: bigint, atLeast: bigint = 1n): bigint[] {
  const down = snapDownToGrid(raw, step);
  const candidates = down === raw ? [raw] : [down, down + effectiveStep(step)];
  const valid = candidates.filter((value) => value >= atLeast);
  if (valid.length > 0) return valid;
  return [snapUpToGrid(atLeast, step)];
}

/**
 * Raw quote units for `quantity` at `price`: quantity x price / 10^baseDecimals,
 * floored, which matches how the SDK computes notional.
 */
export function computeNotional(quantity: bigint, price: bigint, baseDecimals: number): bigint {
  return (quantity * price) / 10n ** BigInt(baseDecimals);
}

type FieldCheck = { ok: true; value: bigint } | { ok: false; issue: OrderInputIssue };

function validateQuantityText(text: string, market: MarketMeta): FieldCheck {
  const parsed = parseHumanAmount(text, market.baseDecimals);
  if (!parsed.ok) return { ok: false, issue: quantityParseIssue(parsed.error, market) };
  return checkQuantityValue(parsed.value, market);
}

function validatePriceText(text: string, market: MarketMeta): FieldCheck {
  const parsed = parseHumanAmount(text, market.quoteDecimals);
  if (!parsed.ok) return { ok: false, issue: priceParseIssue(parsed.error, market) };
  return checkPriceValue(parsed.value, market);
}

function checkQuantityValue(value: bigint, market: MarketMeta): FieldCheck {
  if (value <= 0n) {
    return { ok: false, issue: issue("quantity", "NOT_POSITIVE", "Size must be greater than zero.") };
  }
  const minimum = minimumValidQuantity(market);
  if (value < market.minQuantity) {
    return {
      ok: false,
      issue: issue(
        "quantity",
        "BELOW_MIN_SIZE",
        `Minimum size is ${formatQuantity(minimum, market, { withSymbol: true })}.`,
        [minimum],
      ),
    };
  }
  if (!isOnGrid(value, market.lotSize)) {
    return { ok: false, issue: lotGridIssue("OFF_LOT_GRID", value, market) };
  }
  return { ok: true, value };
}

function checkPriceValue(value: bigint, market: MarketMeta): FieldCheck {
  if (value <= 0n) {
    return { ok: false, issue: issue("price", "NOT_POSITIVE", "Price must be greater than zero.") };
  }
  if (!isOnGrid(value, market.tickSize)) {
    return { ok: false, issue: tickGridIssue("OFF_TICK_GRID", value, market) };
  }
  return { ok: true, value };
}

function quantityParseIssue(error: AmountParseError, market: MarketMeta): OrderInputIssue {
  switch (error.code) {
    case "EMPTY":
      return issue("quantity", "EMPTY", "Enter a size.");
    case "NOT_A_NUMBER":
    case "EXPONENT":
      return issue(
        "quantity",
        "NOT_A_NUMBER",
        `Enter the size as a plain number, for example ${formatQuantity(minimumValidQuantity(market), market)}.`,
      );
    case "NEGATIVE":
      return issue("quantity", "NOT_POSITIVE", "Size must be greater than zero. Choose Short to sell.");
    case "TOO_LARGE":
      return issue("quantity", "TOO_LARGE", "That size is too large.");
    case "TOO_MANY_DECIMALS":
      // The typed value sits strictly between the truncated value and one raw unit above,
      // so the neighbours of the truncated value are the neighbours of what was typed.
      return lotGridIssue("TOO_MANY_DECIMALS", error.truncatedValue ?? 0n, market, true);
  }
}

function priceParseIssue(error: AmountParseError, market: MarketMeta): OrderInputIssue {
  switch (error.code) {
    case "EMPTY":
      return issue("price", "EMPTY", "Enter a limit price.");
    case "NOT_A_NUMBER":
    case "EXPONENT":
      return issue("price", "NOT_A_NUMBER", "Enter the price as a plain number, for example 1234.5.");
    case "NEGATIVE":
      return issue("price", "NOT_POSITIVE", "Price must be greater than zero.");
    case "TOO_LARGE":
      return issue("price", "TOO_LARGE", "That price is too large.");
    case "TOO_MANY_DECIMALS":
      return tickGridIssue("TOO_MANY_DECIMALS", error.truncatedValue ?? 0n, market, true);
  }
}

function lotGridIssue(
  code: OrderInputIssueCode,
  value: bigint,
  market: MarketMeta,
  hadExtraDigits = false,
): OrderInputIssue {
  const nearest = neighbours(value, market.lotSize, minimumValidQuantity(market), hadExtraDigits);
  const step = formatQuantity(market.lotSize, market, { withSymbol: true });
  const suggestions = nearest.map((raw) => formatQuantity(raw, market));
  return issue("quantity", code, `Size must be a multiple of ${step}.${nearestText(suggestions)}`, nearest);
}

function tickGridIssue(
  code: OrderInputIssueCode,
  value: bigint,
  market: MarketMeta,
  hadExtraDigits = false,
): OrderInputIssue {
  const nearest = neighbours(value, market.tickSize, market.tickSize, hadExtraDigits);
  const step = formatPrice(market.tickSize, market, { withSymbol: true });
  const suggestions = nearest.map((raw) => formatPrice(raw, market));
  return issue("price", code, `Price must be a multiple of ${step}.${nearestText(suggestions)}`, nearest);
}

/**
 * Grid neighbours of a value. When digits were cut off, the true value lies just above
 * `value`, so an on-grid `value` still needs the next step up as a second neighbour.
 */
function neighbours(value: bigint, step: bigint, atLeast: bigint, hadExtraDigits: boolean): bigint[] {
  if (!hadExtraDigits || !isOnGrid(value, step)) return nearestGridValues(value, step, atLeast);
  const valid = [value, value + effectiveStep(step)].filter((candidate) => candidate >= atLeast);
  return valid.length > 0 ? valid : [snapUpToGrid(atLeast, step)];
}

function nearestText(values: string[]): string {
  if (values.length === 0) return "";
  if (values.length === 1) return ` Nearest valid: ${values[0]}.`;
  return ` Nearest valid: ${values.slice(0, -1).join(", ")} or ${values[values.length - 1]}.`;
}

function minimumValidQuantity(market: MarketMeta): bigint {
  const floor = market.minQuantity > market.lotSize ? market.minQuantity : market.lotSize;
  return snapUpToGrid(floor, market.lotSize);
}

function marketGridIssue(market: MarketMeta): OrderInputIssue | null {
  if (market.lotSize > 0n && market.tickSize > 0n && market.minQuantity >= 0n) return null;
  return issue(
    "market",
    "MARKET_GRID_UNAVAILABLE",
    `${market.displaySymbol} price and size steps could not be read, so orders are disabled.`,
  );
}

function effectiveStep(step: bigint): bigint {
  return step > 0n ? step : 1n;
}

function issue(
  field: OrderInputField,
  code: OrderInputIssueCode,
  message: string,
  nearestValid: bigint[] = [],
): OrderInputIssue {
  return { field, code, message, nearestValid };
}
