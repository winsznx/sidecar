export interface TimingSample {
  id: number;
  operation: string;
  /** Wall-clock start, ms since the epoch. */
  startedAt: number;
  /** Wall-clock end, ms since the epoch. */
  endedAt: number;
  durationMs: number;
  ok: boolean;
  /** The thrown value's name, when the operation failed. */
  error?: string;
}

export interface TimingSummary {
  operation: string;
  count: number;
  failures: number;
  minMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
}

export interface TimingClock {
  /** Monotonic milliseconds, for durations. */
  monotonic(): number;
  /** Milliseconds since the epoch, for timestamps. */
  wall(): number;
}

export interface TimingRecorder {
  time<T>(operation: string, run: () => Promise<T>): Promise<T>;
  samples(): readonly TimingSample[];
  summary(): TimingSummary[];
  clear(): void;
  subscribe(listener: (sample: TimingSample) => void): () => void;
}

const SYSTEM_CLOCK: TimingClock = {
  monotonic: () => performance.now(),
  wall: () => Date.now(),
};

/** Nearest-rank percentile over an ascending list. */
function percentile(sorted: readonly number[], p: number): number {
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[Math.min(rank, sorted.length) - 1] ?? Number.NaN;
}

function errorName(error: unknown): string {
  if (error instanceof Error) return error.name;
  return typeof error;
}

/**
 * In-memory latency recorder. Keeps the newest `capacity` samples so a long session
 * cannot grow without bound; nothing leaves the process unless a caller exports it.
 */
export function createTimingRecorder(options: { capacity?: number; clock?: TimingClock } = {}): TimingRecorder {
  const capacity = options.capacity ?? 1_000;
  const clock = options.clock ?? SYSTEM_CLOCK;
  const buffer: TimingSample[] = [];
  const listeners = new Set<(sample: TimingSample) => void>();
  let nextId = 1;

  const push = (sample: TimingSample): void => {
    buffer.push(sample);
    if (buffer.length > capacity) buffer.splice(0, buffer.length - capacity);
    for (const listener of listeners) listener(sample);
  };

  return {
    async time<T>(operation: string, run: () => Promise<T>): Promise<T> {
      const startedAt = clock.wall();
      const start = clock.monotonic();
      const finish = (ok: boolean, error?: unknown): void => {
        const durationMs = clock.monotonic() - start;
        push({
          id: nextId++,
          operation,
          startedAt,
          endedAt: startedAt + durationMs,
          durationMs,
          ok,
          ...(ok ? {} : { error: errorName(error) }),
        });
      };
      try {
        const result = await run();
        finish(true);
        return result;
      } catch (error) {
        finish(false, error);
        throw error;
      }
    },
    samples: () => [...buffer],
    summary(): TimingSummary[] {
      const byOperation = new Map<string, TimingSample[]>();
      for (const sample of buffer) {
        const list = byOperation.get(sample.operation) ?? [];
        list.push(sample);
        byOperation.set(sample.operation, list);
      }
      return [...byOperation.entries()]
        .map(([operation, list]) => {
          const durations = list.map((s) => s.durationMs).sort((a, b) => a - b);
          return {
            operation,
            count: list.length,
            failures: list.filter((s) => !s.ok).length,
            minMs: durations[0] ?? Number.NaN,
            p50Ms: percentile(durations, 50),
            p95Ms: percentile(durations, 95),
            maxMs: durations[durations.length - 1] ?? Number.NaN,
          };
        })
        .sort((a, b) => a.operation.localeCompare(b.operation));
    },
    clear: () => {
      buffer.length = 0;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** The recorder the browser adapter and the scripts share by default. */
export const sharedTimingRecorder: TimingRecorder = createTimingRecorder();
