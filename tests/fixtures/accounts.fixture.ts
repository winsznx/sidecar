import type { Address } from "viem";

import type { AccountSnapshot, MarginAccountState, PositionSnapshot } from "@/lib/dreamdex/types";
import type { AccountIdentity } from "@/lib/wallets/identity";

import { ETH_POOL, MARGIN_BANK, usdso } from "./markets.fixture";

/**
 * Simulated account reads in the shape the adapter returns. Values are illustrative;
 * the addresses are derived test addresses that hold nothing on any chain.
 */

export const NOW_MS = Date.parse("2026-11-01T12:00:00.000Z");
export const READ_AT = new Date(NOW_MS - 2_000).toISOString();
export const READ_BLOCK = 300_000n;

export const PRIMARY_ADDRESS: Address = "0xf07510313917852bc9D6ddaA811A158D7242dcd0";
export const SEPARATE_ADDRESS: Address = "0x0DE15c470291d26b6604D9D30eF6D53F169bb1E0";
export const OTHER_ADDRESS: Address = "0x44Af5545018BF468dCC51DE0bda7fE15Fbf17dcf";

export const PRIMARY_IDENTITY: AccountIdentity = {
  address: PRIMARY_ADDRESS,
  label: "Primary account",
  role: "primary",
  addedAt: "2026-10-30T09:00:00.000Z",
};

export const SEPARATE_IDENTITY: AccountIdentity = {
  address: SEPARATE_ADDRESS,
  label: "Second wallet",
  role: "separate",
  addedAt: "2026-10-30T09:05:00.000Z",
};

/** 0.5 ETH long from 3,000 marked at 3,100: +50 PnL, 0.2 funding owed. */
export const ETH_LONG: PositionSnapshot = {
  pool: ETH_POOL,
  baseSymbol: "ETH",
  side: "long",
  size: 500_000_000_000_000_000n,
  entryPrice: usdso(3_000n),
  priceable: true,
  markPrice: usdso(3_100n),
  notional: usdso(1_550n),
  unrealizedPnl: usdso(50n),
  accruedFunding: usdso(0n, 20n),
  equityContribution: usdso(49n, 80n),
  imRequirement: usdso(77n, 50n),
  mmRequirement: usdso(38n, 75n),
  block: READ_BLOCK,
};

export function marginFixture(overrides: Partial<MarginAccountState> = {}): MarginAccountState {
  return {
    unlockedCollateral: 0n,
    lockedCollateral: 0n,
    equity: 0n,
    withdrawable: 0n,
    imReq: 0n,
    mmReq: 0n,
    cmReq: 0n,
    status: "Healthy",
    activePools: [],
    ...overrides,
  };
}

export function snapshotFixture(overrides: Partial<AccountSnapshot> = {}): AccountSnapshot {
  return {
    chainId: 50383,
    account: PRIMARY_ADDRESS,
    marginBank: MARGIN_BANK,
    block: READ_BLOCK,
    readAt: READ_AT,
    margin: marginFixture(),
    positions: [],
    positionsBlock: READ_BLOCK,
    voucher: { claimed: false, floor: 0n, expiresAt: null },
    gasBalance: 2_000_000_000_000_000_000n,
    walletCollateral: { balance: 0n, allowanceToBank: 0n },
    openOrders: { status: "ok", orders: [], source: { kind: "chain", block: READ_BLOCK, readAt: READ_AT, via: "getOwnOpenOrdersOnchain" } },
    readStatus: "verified",
    issues: [],
    ...overrides,
  };
}

/** Account A: 1,000 USDso deposited, holding the ETH long. */
export const PRIMARY_MARGIN = marginFixture({
  unlockedCollateral: usdso(1_000n),
  equity: usdso(1_049n, 80n),
  withdrawable: usdso(970n),
  imReq: usdso(77n, 50n),
  mmReq: usdso(38n, 75n),
  cmReq: usdso(19n, 37n),
  activePools: [ETH_POOL],
});

export const PRIMARY_SNAPSHOT = snapshotFixture({
  account: PRIMARY_ADDRESS,
  margin: PRIMARY_MARGIN,
  positions: [ETH_LONG],
});

/** Account B: separately funded with 5 USDso, flat, with 1 STT: above the node's 0.6 STT admission floor. */
export const SEPARATE_SNAPSHOT = snapshotFixture({
  account: SEPARATE_ADDRESS,
  margin: marginFixture({ unlockedCollateral: usdso(5n), equity: usdso(5n), withdrawable: usdso(5n) }),
  gasBalance: 1_000_000_000_000_000_000n,
});

/** Account B before any funding: nothing in the margin account. */
export const EMPTY_SEPARATE_SNAPSHOT = snapshotFixture({ account: SEPARATE_ADDRESS, margin: marginFixture() });
