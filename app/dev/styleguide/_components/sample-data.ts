import type { Source } from "@/lib/dreamdex/types";

/**
 * SIMULATED sample values for the styleguide only. Every figure is a preformatted string,
 * none of it is chain state, and every place that renders it carries the SIMULATED badge.
 * Nothing outside app/dev/styleguide may import this file.
 */
export const SIMULATED: Source = {
  kind: "simulated",
  note: "Styleguide sample value. Not read from the chain.",
};

/**
 * Projected figures (margin and collateral after the trade) are estimates in the product, so the
 * study marks them EST. The basis says plainly that this sample is still simulated.
 */
export const SIMULATED_ESTIMATE: Source = {
  kind: "estimate",
  basis: "Simulated sample of a projected figure. Not read from the chain. In the product this is Sidecar arithmetic over SDK order previews, shown until the trade is signed and confirmed.",
};

export const SAMPLE_ACCOUNTS = {
  A: {
    label: "Main account",
    address: "0x5Ae3c0F2b9D41e7a8C06f3B1d29E4c7A90B1e2D4",
    short: "0x5Ae3c0…e2D4",
  },
  B: {
    label: "Sidecar account",
    address: "0x9c3F7b21E08d4A6f5C1e2B9a7D3f0E6c8B4a1A41",
    short: "0x9c3F7b…1A41",
  },
} as const;

export const SAMPLE_NETWORK = {
  name: "Somnia Hideki Testnet",
  chainId: "50383",
  block: "38,357,692",
  age: "2s",
} as const;

export const SAMPLE_POSITION = {
  market: "ETH-PERP",
  side: "long",
  size: "1.250",
  sizeUnit: "ETH",
  entry: "3,412.60",
  mark: "3,388.15",
  unrealizedPnl: "-30.56",
  notional: "4,235.19",
} as const;

export const SAMPLE_ACCOUNT_A = {
  equity: "2,418.73",
  available: "1,206.40",
  maintenance: "211.76",
  gas: "1.92",
} as const;

export const SAMPLE_ACCOUNT_B = {
  equity: "600.00",
  available: "600.00",
  maintenance: "0.00",
  gas: "0.84",
} as const;

export const SAMPLE_ORDER = {
  market: "BTC-PERP",
  price: "77,412.5",
  size: "0.01300",
  notional: "1,006.36",
  mark: "77,418.9",
  maxSizeB: "0.04120",
  minSize: "0.00013",
  lot: "0.00001",
  tick: "0.1",
  initialMargin: "50.32",
  maintenanceAfterA: "236.92",
  maintenanceAfterB: "25.16",
  freeAfterA: "1,156.08",
  freeAfterB: "549.68",
} as const;

export const SAMPLE_RECEIPT = {
  hash: "0x7d1e9a40c3b25f68e0a4d7c19b3f5e2a81c6d04f97e3b2a5c8d1f0e4a7b6c3d2",
  hashShort: "0x7d1e9a…c3d2",
  block: "38,357,701",
  gasUsed: "1,284,316",
  orderId: "184,467,203",
} as const;
