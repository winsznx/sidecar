import { describe, expect, it } from "vitest";

import { explainScenario, SCENARIO_DISCLAIMER } from "@/lib/risk/explanations";
import { estimateScenario } from "@/lib/risk/scenario";
import type { ScenarioInput } from "@/lib/risk/types";
import { ETH_LONG, NOW_MS, PRIMARY_SNAPSHOT, SEPARATE_SNAPSHOT, snapshotFixture } from "@/tests/fixtures/accounts.fixture";
import { BTC_PERP } from "@/tests/fixtures/markets.fixture";
import {
  BTC_MAINTENANCE_BPS,
  BTC_MARK,
  BTC_ORDER,
  PRIMARY_QUOTE,
  SEPARATE_QUOTE,
} from "@/tests/fixtures/quotes.fixture";

function scenario(overrides: Partial<ScenarioInput>): ReturnType<typeof estimateScenario> {
  return estimateScenario({
    market: BTC_PERP,
    maintenanceMarginBps: BTC_MAINTENANCE_BPS,
    snapshot: PRIMARY_SNAPSHOT,
    quote: PRIMARY_QUOTE,
    includeOrder: true,
    intent: BTC_ORDER,
    move: { kind: "bps", bps: -1_000n },
    nowMs: NOW_MS,
    ...overrides,
  });
}

describe("T09 scenario estimate", () => {
  it("matches the SDK's position kernels to the wei for a 10% BTC drop on the shared account", () => {
    // #given account A after the BTC order fills, and BTC moving -10% from 77,412.35
    // #when the scenario is estimated
    const { estimate } = scenario({});
    // #then PnL and maintenance move exactly as the protocol would compute them
    expect(
      estimate.ok
        ? {
            shockedMark: estimate.value.shockedMark,
            pnlChange: estimate.value.pnlChange,
            maintenanceChange: estimate.value.maintenance.shocked - estimate.value.maintenance.start,
          }
        : estimate.reason,
    ).toEqual({
      shockedMark: 69_671_115_000_000_000_000_000n,
      pnlChange: -1_006_360_550_000_000_000n,
      maintenanceChange: -25_159_013_750_000_000n,
    });
  });

  it("is always labelled a scenario estimate with its omitted terms", () => {
    // #given any computable scenario
    // #when it is estimated
    const result = scenario({});
    // #then it is sourced as a scenario, carries the disclaimer and lists what it leaves out
    expect({
      kind: result.estimate.ok ? result.estimate.source.kind : null,
      label: result.label,
      disclaimer: result.disclaimer,
      omitted: result.omitted,
    }).toEqual({
      kind: "scenario",
      label: "Scenario estimate",
      disclaimer: SCENARIO_DISCLAIMER,
      omitted: expect.arrayContaining([
        "funding during the move",
        "price impact and slippage",
        "auto-deleveraging (ADL)",
        "other markets moving",
      ]),
    });
  });

  it("leaves an account with no BTC unchanged by a BTC move", () => {
    // #given account A as read, which holds ETH only
    // #when BTC moves -30%
    const { estimate } = scenario({ includeOrder: false, quote: null, move: { kind: "bps", bps: -3_000n } });
    // #then nothing it holds is repriced
    expect(
      estimate.ok
        ? [estimate.value.exposed, estimate.value.buffer.shocked === estimate.value.buffer.start, estimate.value.pnlChange]
        : estimate.reason,
    ).toEqual([false, true, 0n]);
  });

  it("shows a thinly funded second wallet falling below maintenance on a large drop", () => {
    // #given account B after the order fills on 5 USDso
    // #when BTC drops 50%
    const { estimate } = scenario({ snapshot: SEPARATE_SNAPSHOT, quote: SEPARATE_QUOTE, move: { kind: "bps", bps: -5_000n } });
    // #then the scenario says it would be below maintenance
    expect(estimate.ok ? estimate.value.belowMaintenance : estimate.reason).toBe(true);
  });

  it("suppresses the estimate when any position in the account cannot be priced", () => {
    // #given an account whose ETH feed is dead
    const snapshot = snapshotFixture({
      positions: [{ ...ETH_LONG, priceable: false, markPrice: null }],
      readStatus: "unpriceable",
      margin: null,
    });
    // #when a scenario is requested
    const { estimate } = scenario({ snapshot, includeOrder: false, quote: null });
    // #then no figure is produced and the reason is given
    expect(estimate).toEqual({
      ok: false,
      reason: "The protocol cannot currently price ETH, which this account holds. A scenario would hide that, so none is shown.",
    });
  });

  it("suppresses the estimate on account data the comparison would call stale", () => {
    // #given account data read 45 seconds ago
    // #when a scenario is requested
    const { estimate } = scenario({ includeOrder: false, quote: null, nowMs: NOW_MS + 43_000 });
    // #then it is unavailable with the staleness reason
    expect(estimate).toEqual({ ok: false, reason: "Account data is 45s old. Refresh it to see a scenario." });
  });

  it("suppresses the post-order estimate when the preview is stale or for a different order", () => {
    // #given the shared route's preview
    // #when the scenario starts from it 20 seconds later, or after the size changed
    const reasons = [
      scenario({ nowMs: NOW_MS + 20_000 }).estimate,
      scenario({ intent: { ...BTC_ORDER, quantity: 14_000n } }).estimate,
    ].map((estimate) => (estimate.ok ? "computed" : estimate.reason));
    // #then neither projection is used
    expect(reasons).toEqual([
      "The preview is 21s old. Refresh it before signing.",
      "The size changed since the preview. Refresh it.",
    ]);
  });

  it("suppresses the estimate when the maintenance threshold was not read", () => {
    // #given an exposed account and no maintenance rate
    // #when a scenario is requested
    const { estimate } = scenario({ maintenanceMarginBps: null });
    // #then it is unavailable rather than computed with a guessed rate
    expect(estimate).toEqual({ ok: false, reason: "The BTC-PERP maintenance threshold was not read." });
  });

  it("refuses a move to zero or below", () => {
    // #given a -100% move
    // #when a scenario is requested
    const { estimate } = scenario({ move: { kind: "bps", bps: -10_000n } });
    // #then it is refused with the allowed range
    expect(estimate.ok ? null : estimate.reason).toBe("Choose a move between -99.99% and +1,000.00%.");
  });

  it("accepts an absolute hypothetical price", () => {
    // #given a target price equal to the current mark
    // #when the scenario is estimated
    const { estimate } = scenario({ move: { kind: "price", price: BTC_MARK } });
    // #then nothing moves
    expect(estimate.ok ? [estimate.value.moveBps, estimate.value.pnlChange] : estimate.reason).toEqual([0n, 0n]);
  });

  it("explains the result without promising when liquidation happens", () => {
    // #given the thin second wallet's 50% drop
    const result = scenario({ snapshot: SEPARATE_SNAPSHOT, quote: SEPARATE_QUOTE, move: { kind: "bps", bps: -5_000n } });
    // #when it is put into words
    const lines = explainScenario(result, BTC_PERP);
    // #then it reads as an estimate and never as a guarantee or a precise liquidation price
    expect({
      labelled: lines[0]?.startsWith("Scenario estimate:"),
      disclaimer: lines.includes(SCENARIO_DISCLAIMER),
      promises: lines.filter((line) => /guarantee|will be liquidated|liquidation at|liquidates at/i.test(line)),
    }).toEqual({ labelled: true, disclaimer: true, promises: [] });
  });
});
