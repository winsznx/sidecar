import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LiveHeadFigure } from "@/components/landing/live-head-figure";

const READ_AT = "2026-11-03T12:00:00.000Z";
const NOW_MS = Date.parse(READ_AT) + 4_000;

interface ChainQueryStub {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  data: { chainId: number; expectedChainId: 50383; matches: boolean; headBlock: bigint; readAt: string } | undefined;
}

const chainQuery = vi.hoisted(() => ({ current: null as ChainQueryStub | null }));

vi.mock("@/hooks/use-sidecar-queries", () => ({
  useChainStatus: () => chainQuery.current,
}));

vi.mock("@/hooks/use-trade-clock", () => ({
  useTradeClock: () => NOW_MS,
}));

function liveHead(overrides: Partial<NonNullable<ChainQueryStub["data"]>> = {}): ChainQueryStub {
  return {
    isPending: false,
    isError: false,
    error: null,
    data: { chainId: 50383, expectedChainId: 50383, matches: true, headBlock: 40_742_145n, readAt: READ_AT, ...overrides },
  };
}

afterEach(() => {
  cleanup();
  chainQuery.current = null;
});

describe("LiveHeadFigure", () => {
  it("sets the live head block large, badged as a chain read, with its age", () => {
    // #given
    chainQuery.current = liveHead();

    // #when
    render(<LiveHeadFigure />);

    // #then
    const group = screen.getByRole("group", { name: "Hideki head block" });
    expect(group).toHaveTextContent("40,742,145");
    expect(group.querySelector("[data-provenance]")).toHaveAttribute("data-provenance", "chain");
    expect(group).toHaveTextContent("Read 4s ago with eth_blockNumber, re-read every 10 s.");
  });

  it("marks a reading older than a minute as stale", () => {
    chainQuery.current = liveHead({ readAt: new Date(NOW_MS - 90_000).toISOString() });
    render(<LiveHeadFigure />);
    expect(screen.getByRole("group", { name: "Hideki head block" })).toHaveTextContent(/^.*Stale\. Read 1m ago/);
  });

  it("shows Unavailable with the reason and no number when the read fails", () => {
    // #given
    chainQuery.current = { isPending: false, isError: true, error: new Error("fetch failed"), data: undefined };

    // #when
    render(<LiveHeadFigure />);

    // #then
    const group = screen.getByRole("group", { name: "Hideki head block" });
    expect(group).toHaveTextContent("Unavailable");
    expect(group).toHaveTextContent(/Network unreachable\./);
    expect(group).not.toHaveTextContent(/\d{1,3},\d{3}/);
    expect(group.querySelector("[data-provenance]")).toBeNull();
  });

  it("shows no block for the wrong chain", () => {
    chainQuery.current = liveHead({ chainId: 1, matches: false });
    render(<LiveHeadFigure />);
    const group = screen.getByRole("group", { name: "Hideki head block" });
    expect(group).toHaveTextContent("The RPC reports chain 1, not 50383.");
    expect(group).not.toHaveTextContent("40,742,145");
  });

  it("is busy while the first read is in flight", () => {
    chainQuery.current = { isPending: true, isError: false, error: null, data: undefined };
    render(<LiveHeadFigure />);
    expect(screen.getByRole("group", { name: "Hideki head block" })).toHaveAttribute("aria-busy", "true");
  });
});
