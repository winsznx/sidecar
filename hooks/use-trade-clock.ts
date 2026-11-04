"use client";

import { useSyncExternalStore } from "react";

const TICK_MS = 1_000;

let now = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function tick(): void {
  now = Date.now();
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  if (timer === null) {
    now = Date.now();
    timer = setInterval(tick, TICK_MS);
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function getSnapshot(): number {
  return now;
}

function getServerSnapshot(): number {
  return 0;
}

/**
 * Wall-clock milliseconds, refreshed once a second, so data ages and quote freshness are
 * judged against the same "now" everywhere on the screen. `0` until the browser has a clock,
 * which callers treat as "age unknown" rather than as fresh.
 */
export function useTradeClock(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
