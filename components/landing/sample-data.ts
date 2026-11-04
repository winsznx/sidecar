import type { Source } from "@/lib/dreamdex/types";

/**
 * The landing page illustrates the product with one fixed example. None of it is chain state,
 * so every figure built from these values carries this source and renders as SIMULATED.
 */
export const LANDING_SAMPLE: Source = {
  kind: "simulated",
  note: "Sample figure for the landing page. Not read from the chain.",
};

/** Repeated-letter addresses so nobody mistakes the sample for a real, specific wallet. */
export const SAMPLE_ACCOUNTS = {
  A: { label: "Main account", address: `0x${"a".repeat(40)}`, short: "0xaaaa…aaaa" },
  B: { label: "Second wallet", address: `0x${"b".repeat(40)}`, short: "0xbbbb…bbbb" },
} as const;

/** The position account A already holds. Account B holds nothing. */
export const SAMPLE_POSITION = {
  market: "ETH-PERP",
  side: "long",
  size: "1.250 ETH",
  entry: "3,412.60",
} as const;

/** Initial margin is 5% of the notional (0.013 × 77,412.5 = 1,006.36). */
export const SAMPLE_ORDER = {
  market: "BTC-PERP",
  side: "long",
  size: "0.01300 BTC",
  price: "77,412.5",
  initialMargin: "50.32",
} as const;

/** "After" is the free collateral less the order's initial margin. */
export const SAMPLE_ROUTES = {
  A: { freeNow: "1,206.40", freeAfter: "1,156.08" },
  B: { freeNow: "600.00", freeAfter: "549.68" },
} as const;

/**
 * The margin chapter's one price move, told twice. The same 1,000 USDso and the same BTC loss of
 * 360 USDso: once inside one shared account, once with BTC in its own 400 USDso account.
 * Remaining figures are deposit less loss; no protocol formula is involved.
 */
export const SAMPLE_MOVE = {
  loss: "360",
  shared: { deposit: "1,000", left: "640", depositUnits: 1000, lossUnits: 360 },
  separate: {
    A: { deposit: "600", left: "600", depositUnits: 600, lossUnits: 0 },
    B: { deposit: "400", left: "40", depositUnits: 400, lossUnits: 360 },
  },
} as const;
