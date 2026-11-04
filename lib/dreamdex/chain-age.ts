import type { ChainStatus } from "./types";

export const NETWORK_NAME = "Somnia Hideki Testnet";

/** Age of the last chain read. `nowMs` is 0 before the client clock starts, which reads as unknown, not as fresh. */
export function chainAgeMs(status: ChainStatus | undefined, nowMs: number): number | null {
  if (status === undefined || nowMs === 0) return null;
  const readAt = Date.parse(status.readAt);
  return Number.isFinite(readAt) ? Math.max(0, nowMs - readAt) : null;
}
