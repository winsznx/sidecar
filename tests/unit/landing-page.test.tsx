import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LandingPage } from "@/components/landing/landing-page";
import { LiveNetworkLine } from "@/components/landing/live-network-line";
import { LANDING_CHECKS } from "@/components/landing/truth-checks";

const READ_AT = "2026-11-03T12:00:00.000Z";
const NOW_MS = Date.parse(READ_AT) + 2_000;

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
    data: { chainId: 50383, expectedChainId: 50383, matches: true, headBlock: 38_357_692n, readAt: READ_AT, ...overrides },
  };
}

afterEach(() => {
  cleanup();
  chainQuery.current = null;
});

describe("LandingPage", () => {
  it("leads with the headline and sends the primary call to action to /trade", () => {
    // #given
    chainQuery.current = liveHead();

    // #when
    render(<LandingPage />);

    // #then
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("Put the trade next to your positions, or give it its own margin.");
    expect(heading.querySelectorAll("mark")).toHaveLength(1);

    const main = screen.getByRole("main");
    const ctas = within(main).getAllByRole("link", { name: "Open the trade screen" });
    expect(ctas.length).toBeGreaterThan(0);
    for (const cta of ctas) expect(cta).toHaveAttribute("href", "/trade");
    expect(within(main).getByRole("link", { name: "See a real Hideki fill, decoded" })).toHaveAttribute(
      "href",
      "/receipt/0xa71faaf75c1fa13abab1f1047b1049ae86477310761fbbafaf01a6bd0fd17259",
    );

    const nav = screen.getByRole("navigation", { name: "Sidecar" });
    expect(within(nav).getByRole("link", { name: "Trade" })).toHaveAttribute("href", "/trade");
    expect(within(nav).getByRole("link", { name: "Proof" })).toHaveAttribute("href", "/proof");
  });

  it("labels every illustrative figure as simulated, and only the live reads as chain", () => {
    // #given
    chainQuery.current = liveHead();

    // #when
    const { container } = render(<LandingPage />);

    // #then every badge outside the two live reads is SIMULATED
    const networkLines = [
      screen.getByRole("group", { name: "Network status" }),
      screen.getByRole("group", { name: "Hideki head block" }),
    ];
    const badges = Array.from(container.querySelectorAll<HTMLElement>("[data-provenance]"));
    const outside = badges.filter((badge) => !networkLines.some((line) => line.contains(badge)));
    expect(outside.length).toBeGreaterThan(0);
    for (const badge of outside) expect(badge).toHaveAttribute("data-provenance", "simulated");

    const inside = badges.filter((badge) => networkLines.some((line) => line.contains(badge)));
    for (const badge of inside) expect(badge).toHaveAttribute("data-provenance", "chain");

    expect(screen.getByText(/Sample figures, not live state\./)).toBeInTheDocument();
  });

  it("lists the ten receipt checks without claiming any result", () => {
    // #given
    chainQuery.current = liveHead();

    // #when
    render(<LandingPage />);

    // #then
    const card = screen.getByRole("heading", { name: "Checks on every order" }).closest("article");
    if (!(card instanceof HTMLElement)) throw new Error("The check list is not inside an article.");
    const scoped = within(card);
    for (const check of LANDING_CHECKS) expect(scoped.getByText(check.label)).toBeInTheDocument();
    expect(scoped.getByText("10 checks · pass, fail or unknown · never assumed")).toBeInTheDocument();
    expect(scoped.queryByTestId("inspection-tally")).not.toBeInTheDocument();
    expect(scoped.queryByText("Pass")).not.toBeInTheDocument();
  });

  it("states that the decoded fill was not sent by Sidecar", () => {
    chainQuery.current = liveHead();
    render(<LandingPage />);
    expect(screen.getByText(/Someone else sent it, not Sidecar\./)).toBeInTheDocument();
  });

  it("qualifies the fill link in the hero and never implies Sidecar has sent a live order", () => {
    chainQuery.current = liveHead();
    render(<LandingPage />);
    expect(screen.getByText("Someone else sent that fill. Sidecar's own runs are on the proof page.")).toBeInTheDocument();
  });

  it("names the network status group once, so assistive tech hears one live line", () => {
    chainQuery.current = liveHead();
    render(<LandingPage />);
    expect(screen.getAllByRole("group", { name: "Network status" })).toHaveLength(1);
  });

  it("uses sample addresses nobody could mistake for a real wallet", () => {
    chainQuery.current = liveHead();
    const { container } = render(<LandingPage />);
    const titled = Array.from(container.querySelectorAll<HTMLElement>("[title^='0x']"));
    expect(titled.length).toBeGreaterThan(0);
    for (const element of titled) expect(element.title).toMatch(/^0x(a{40}|b{40})$/);
  });
});

describe("LiveNetworkLine", () => {
  it("shows the chain id, the head block as a chain read, and its age", () => {
    // #given
    chainQuery.current = liveHead();

    // #when
    render(<LiveNetworkLine />);

    // #then
    const line = screen.getByRole("group", { name: "Network status" });
    expect(line).toHaveTextContent("Live");
    expect(line).toHaveTextContent("Somnia Hideki Testnet · 50383");
    expect(line).toHaveTextContent(/Block\s*CHAIN · #38,357,692/);
    expect(line).toHaveTextContent("· 2s old");
  });

  it("marks a reading older than a minute as stale", () => {
    chainQuery.current = liveHead({ readAt: new Date(NOW_MS - 90_000).toISOString() });
    render(<LiveNetworkLine />);
    const line = screen.getByRole("group", { name: "Network status" });
    expect(line).toHaveTextContent("Stale");
    expect(line).not.toHaveTextContent("Live");
  });

  it("shows Unavailable with a reason, and no block number, when the read fails", () => {
    // #given
    chainQuery.current = { isPending: false, isError: true, error: new Error("fetch failed"), data: undefined };

    // #when
    render(<LiveNetworkLine />);

    // #then
    const line = screen.getByRole("group", { name: "Network status" });
    expect(line).toHaveTextContent("Unavailable");
    expect(line).toHaveTextContent(/Network unreachable\./);
    expect(line).not.toHaveTextContent(/#\d/);
    expect(line.querySelector("[data-provenance]")).toBeNull();
  });

  it("names a wrong chain instead of showing it as live", () => {
    chainQuery.current = liveHead({ chainId: 1, matches: false });
    render(<LiveNetworkLine />);
    const line = screen.getByRole("group", { name: "Network status" });
    expect(line).toHaveTextContent("The RPC reports chain 1, not 50383.");
    expect(line).not.toHaveTextContent("Live");
  });

  it("is busy while the first read is in flight", () => {
    chainQuery.current = { isPending: true, isError: false, error: null, data: undefined };
    render(<LiveNetworkLine />);
    expect(screen.getByRole("group", { name: "Network status" })).toHaveAttribute("aria-busy", "true");
  });
});
