import { describe, expect, it } from "vitest";

import { createTimingRecorder, type TimingClock, type TimingSample } from "@/lib/dreamdex/timing";

/** A clock that advances only when told, so durations are exact. */
function manualClock(): TimingClock & { advance(ms: number): void } {
  let now = 0;
  return {
    monotonic: () => now,
    wall: () => 1_793_490_000_000 + now,
    advance(ms: number) {
      now += ms;
    },
  };
}

describe("createTimingRecorder", () => {
  it("records start, end and duration of a successful call", async () => {
    // #given
    const clock = manualClock();
    const recorder = createTimingRecorder({ clock });
    // #when
    await recorder.time("getMarginAccount", async () => {
      clock.advance(120);
      return 1;
    });
    // #then
    expect(recorder.samples()).toEqual([
      { id: 1, operation: "getMarginAccount", startedAt: 1_793_490_000_000, endedAt: 1_793_490_000_120, durationMs: 120, ok: true },
    ]);
  });

  it("records a failure with the error's name and rethrows it", async () => {
    // #given
    const clock = manualClock();
    const recorder = createTimingRecorder({ clock });
    const failing = recorder.time("listPerpMarkets", async () => {
      clock.advance(30);
      throw new TypeError("indexer down");
    });
    // #when / #then
    await expect(failing).rejects.toThrow("indexer down");
    expect(recorder.samples()[0]).toMatchObject({ ok: false, error: "TypeError", durationMs: 30 });
  });

  it("summarises count, failures and nearest-rank percentiles per operation", async () => {
    // #given
    const clock = manualClock();
    const recorder = createTimingRecorder({ clock });
    for (const ms of [10, 20, 30, 40, 100]) {
      await recorder.time("previewPerpOrderMargin", async () => clock.advance(ms));
    }
    // #when
    const [summary] = recorder.summary();
    // #then
    expect(summary).toEqual({ operation: "previewPerpOrderMargin", count: 5, failures: 0, minMs: 10, p50Ms: 30, p95Ms: 100, maxMs: 100 });
  });

  it("keeps only the newest samples past its capacity", async () => {
    // #given
    const recorder = createTimingRecorder({ capacity: 2, clock: manualClock() });
    // #when
    for (const operation of ["a", "b", "c"]) await recorder.time(operation, async () => undefined);
    // #then
    expect(recorder.samples().map((s) => s.operation)).toEqual(["b", "c"]);
  });

  it("notifies subscribers until they unsubscribe", async () => {
    // #given
    const recorder = createTimingRecorder({ clock: manualClock() });
    const seen: TimingSample[] = [];
    const unsubscribe = recorder.subscribe((sample) => seen.push(sample));
    // #when
    await recorder.time("first", async () => undefined);
    unsubscribe();
    await recorder.time("second", async () => undefined);
    // #then
    expect(seen.map((s) => s.operation)).toEqual(["first"]);
  });
});
