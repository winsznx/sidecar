import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Stat } from "@/components/ui/stat";
import { Unavailable } from "@/components/ui/unavailable";

afterEach(cleanup);

const ZERO_LIKE = /(^|[^\d.,])0+([.,]0+)?($|[^\d])/;

describe("Unavailable", () => {
  it("shows the state and the reason, and nothing that reads as zero", () => {
    const { container } = render(<Unavailable reason="The protocol cannot price this market right now." />);

    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.getByText(/The protocol cannot price this market right now\./)).toBeInTheDocument();
    expect(container.textContent ?? "").not.toMatch(ZERO_LIKE);
    expect(container.textContent ?? "").not.toMatch(/[-\u2013\u2014]\s*$/);
  });

  it("keeps the reason reachable in the compact inline form", () => {
    render(<Unavailable variant="inline" reason="Mark price is stale." />);

    expect(screen.getByText(": Mark price is stale.")).toHaveClass("sr-only");
    expect(screen.getByTitle("Mark price is stale.")).toBeInTheDocument();
  });
});

describe("Stat", () => {
  it("renders an unavailable reading as the reason, never as 0", () => {
    const { container } = render(
      <Stat state="unavailable" label="Liquidation price" reason="Unpriceable market in this account." />,
    );

    expect(screen.getByText("Liquidation price")).toBeInTheDocument();
    expect(screen.getByText(/Unpriceable market in this account\./)).toBeInTheDocument();
    expect(container.textContent ?? "").not.toMatch(ZERO_LIKE);
  });

  it("marks a loading reading as busy without showing a placeholder number", () => {
    const { container } = render(<Stat state="loading" label="Free collateral" />);

    expect(container.querySelector("dl")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Loading")).toBeInTheDocument();
    expect(container.textContent ?? "").not.toMatch(/\d/);
  });

  it("shows a known value exactly as formatted, with its unit and source", () => {
    render(
      <Stat
        state="known"
        label="Equity"
        value="2,418.73"
        unit="USDso"
        source={{ kind: "chain", block: 38_357_692n, readAt: "2026-11-01T12:04:31Z", via: "getMarginAccount" }}
      />,
    );

    expect(screen.getByText("2,418.73")).toBeInTheDocument();
    expect(screen.getByText("USDso")).toBeInTheDocument();
    expect(screen.getByText("CHAIN · #38,357,692")).toBeInTheDocument();
  });

  it("keeps the provenance rule when the group badge replaces the per-figure badge", () => {
    render(
      <Stat
        state="known"
        label="Equity"
        value="600.00"
        source={{ kind: "simulated", note: "Fixture" }}
        badge={false}
      />,
    );

    expect(screen.queryByText("SIMULATED")).not.toBeInTheDocument();
    expect(screen.getByText("600.00")).toHaveClass("rule-simulated");
  });
});
