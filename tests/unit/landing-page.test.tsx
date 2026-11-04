import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NetworkMeta, NetworkStatus } from "@/components/chrome/network-status";
import { LandingPage } from "@/components/landing/landing-page";
import type { LandingRecords } from "@/components/landing/recorded-runs-model";
import { LANDING_CHECKS } from "@/components/landing/truth-checks";
import { SiteHeader } from "@/components/ui/site-header";
import { useChainStatus } from "@/hooks/use-sidecar-queries";

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
  sidecarKeys: { all: ["sidecar", 50383] },
}));

// The market list stays pending: its own states are covered in landing-markets.test.tsx.
vi.mock("@/hooks/use-perps-adapter", () => ({
  getBrowserAdapter: () => ({ getMarketListing: () => new Promise(() => undefined) }),
}));

// The shared header reads the wallet; the landing only has to render it.
vi.mock("@/components/chrome/global-header", () => ({
  GlobalHeader: () => <SiteHeader />,
}));

const NO_RECORDS: LandingRecords = { state: "read", runs: [], recordedCount: 0 };

function renderLanding(records: LandingRecords = NO_RECORDS): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }): ReactNode => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return render(<LandingPage records={records} />, { wrapper });
}

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
  it("leads with the headline and sends the two calls to action to /trade and /start", () => {
    // #given
    chainQuery.current = liveHead();

    // #when
    renderLanding();

    // #then
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("Put the trade next to your positions, or give it its own margin.");
    expect(heading.querySelectorAll("mark")).toHaveLength(1);

    const main = screen.getByRole("main");
    const ctas = within(main).getAllByRole("link", { name: "Open the trade screen" });
    expect(ctas.length).toBeGreaterThan(0);
    for (const cta of ctas) expect(cta).toHaveAttribute("href", "/trade");
    const starts = within(main).getAllByRole("link", { name: "Get started" });
    expect(starts.length).toBeGreaterThan(0);
    for (const start of starts) expect(start).toHaveAttribute("href", "/start");
  });

  it("numbers its eight chapters in order", () => {
    // #given
    chainQuery.current = liveHead();

    // #when
    renderLanding();

    // #then
    const sections = Array.from(screen.getByRole("main").querySelectorAll("section[aria-labelledby]"));
    const numbers = sections.map((section) => section.querySelector("p > span.tabular")?.textContent);
    expect(numbers).toEqual(["01", "02", "03", "04", "05", "06", "07", "08"]);
  });

  it("labels every illustrative figure as simulated, and only the live reads as chain", () => {
    // #given
    chainQuery.current = liveHead();

    // #when
    const { container } = renderLanding();

    // #then every badge outside the live reads is SIMULATED
    const liveGroups = [
      screen.getByRole("group", { name: "Hideki head block" }),
      screen.getByRole("group", { name: "Listed markets" }),
    ];
    const badges = Array.from(container.querySelectorAll<HTMLElement>("[data-provenance]"));
    const outside = badges.filter((badge) => !liveGroups.some((group) => group.contains(badge)));
    expect(outside.length).toBeGreaterThan(0);
    for (const badge of outside) expect(badge).toHaveAttribute("data-provenance", "simulated");

    const inside = badges.filter((badge) => liveGroups.some((group) => group.contains(badge)));
    for (const badge of inside) expect(badge).toHaveAttribute("data-provenance", "chain");

    expect(screen.getByText(/Sample figures, not live state\./)).toBeInTheDocument();
    expect(screen.getByText(/Sample figures for illustration, not live state\./)).toBeInTheDocument();
  });

  it("explains shared margin with simulated figures and never says separate margin is safe", () => {
    chainQuery.current = liveHead();
    renderLanding();
    const chapter = within(screen.getByRole("heading", { name: /a losing trade draws on every position's margin/ }).closest("section") ?? document.body);
    expect(chapter.getByText(/caps the damage at that account's own deposit/)).toBeInTheDocument();
    expect(chapter.getByText(/either account can still be liquidated/)).toBeInTheDocument();
    expect(chapter.queryByText(/\bsafe\b|protected|guarantee/i)).not.toBeInTheDocument();
  });

  it("lists the ten receipt checks without claiming any result", () => {
    // #given
    chainQuery.current = liveHead();

    // #when
    renderLanding();

    // #then
    const card = screen.getByRole("heading", { name: "Checks on every order" }).closest("article");
    if (!(card instanceof HTMLElement)) throw new Error("The check list is not inside an article.");
    const scoped = within(card);
    for (const check of LANDING_CHECKS) expect(scoped.getByText(check.label)).toBeInTheDocument();
    expect(scoped.getByText("10 checks · pass, fail or unknown · never assumed")).toBeInTheDocument();
    expect(scoped.queryByTestId("inspection-tally")).not.toBeInTheDocument();
    expect(scoped.queryByText("Pass")).not.toBeInTheDocument();
  });

  it("says no runs are recorded when the index holds none", () => {
    chainQuery.current = liveHead();
    renderLanding();
    expect(screen.getByText(/No runs are recorded yet\./)).toBeInTheDocument();
  });

  it("shows the gas floor from the order config in the getting started steps", () => {
    chainQuery.current = liveHead();
    renderLanding();
    expect(screen.getByText("At least 0.6 STT")).toBeInTheDocument();
  });

  it("leaves the network status line to the header, so assistive tech hears it once", () => {
    // #given
    chainQuery.current = liveHead();

    // #when
    renderLanding();

    // #then
    expect(screen.getByRole("main").querySelectorAll("[aria-label='Network status']")).toHaveLength(0);
  });

  it("uses sample addresses nobody could mistake for a real wallet", () => {
    chainQuery.current = liveHead();
    const { container } = renderLanding();
    const titled = Array.from(container.querySelectorAll<HTMLElement>("[title^='0x']"));
    expect(titled.length).toBeGreaterThan(0);
    for (const element of titled) expect(element.title).toMatch(/^0x(a{40}|b{40})$/);
  });
});

// The landing's live line is the header's: the same states, read through the same hook.
function HeaderNetworkLine(): ReactNode {
  const chain = useChainStatus();
  return <NetworkMeta network={<NetworkStatus chain={chain} nowMs={NOW_MS} />} />;
}

describe("Header network line", () => {
  it("shows the chain id, the head block as a chain read, and its age", () => {
    // #given
    chainQuery.current = liveHead();

    // #when
    render(<HeaderNetworkLine />);

    // #then
    const line = screen.getByLabelText("Network status");
    expect(line).toHaveTextContent("Somnia Hideki Testnet · 50383");
    expect(line).toHaveTextContent(/Block\s*CHAIN · #38,357,692/);
    expect(line).toHaveTextContent("· 2s old");
    expect(line).not.toHaveTextContent("Stale");
    expect(line.querySelector("[data-provenance]")).toHaveAttribute("data-provenance", "chain");
  });

  it("marks a reading older than a minute as stale", () => {
    chainQuery.current = liveHead({ readAt: new Date(NOW_MS - 90_000).toISOString() });
    render(<HeaderNetworkLine />);
    expect(screen.getByLabelText("Network status")).toHaveTextContent(/Stale\s*Block/);
  });

  it("says the network is unreachable, and shows no block number, when the read fails", () => {
    // #given
    chainQuery.current = { isPending: false, isError: true, error: new Error("fetch failed"), data: undefined };

    // #when
    render(<HeaderNetworkLine />);

    // #then
    const line = screen.getByLabelText("Network status");
    expect(line).toHaveTextContent(/Network unreachable\./);
    expect(line).not.toHaveTextContent(/#\d/);
    expect(line.querySelector("[data-provenance]")).toBeNull();
  });

  it("names a wrong chain instead of showing it as live", () => {
    chainQuery.current = liveHead({ chainId: 1, matches: false });
    render(<HeaderNetworkLine />);
    const line = screen.getByLabelText("Network status");
    expect(line).toHaveTextContent("The RPC reports chain 1, not 50383.");
    expect(line).not.toHaveTextContent(/#\d/);
  });

  it("is busy while the first read is in flight", () => {
    chainQuery.current = { isPending: true, isError: false, error: null, data: undefined };
    render(<HeaderNetworkLine />);
    expect(screen.getByLabelText("Network status").querySelector("[aria-busy='true']")).not.toBeNull();
  });
});
