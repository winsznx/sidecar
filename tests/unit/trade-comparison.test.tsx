import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RouteComparison } from "@/components/trade/route-comparison";
import { ctaBlocker, ctaLabel, SignBar } from "@/components/trade/sign-bar";
import { buildComparison } from "@/lib/risk/preview";
import type { Comparison, ComparisonInput } from "@/lib/risk/types";
import {
  NOW_MS,
  PRIMARY_ADDRESS,
  PRIMARY_IDENTITY,
  PRIMARY_SNAPSHOT,
  SEPARATE_ADDRESS,
  SEPARATE_IDENTITY,
  SEPARATE_SNAPSHOT,
} from "@/tests/fixtures/accounts.fixture";
import { BTC_PERP } from "@/tests/fixtures/markets.fixture";
import { BTC_ORDER, PRIMARY_QUOTE, SEPARATE_QUOTE } from "@/tests/fixtures/quotes.fixture";

afterEach(cleanup);

function compare(overrides: Partial<ComparisonInput> = {}): Comparison {
  return buildComparison({
    market: BTC_PERP,
    intent: BTC_ORDER,
    primary: { identity: PRIMARY_IDENTITY, snapshot: PRIMARY_SNAPSHOT, quote: PRIMARY_QUOTE },
    separate: { identity: SEPARATE_IDENTITY, snapshot: SEPARATE_SNAPSHOT, quote: SEPARATE_QUOTE },
    wallet: { address: SEPARATE_ADDRESS, chainId: 50383 },
    nowMs: NOW_MS,
    ...overrides,
  });
}

const BASE_CTA = {
  hasPrimary: true,
  ticketIssue: null,
  selected: "separate" as const,
  executionLocked: false,
  executionHeadline: "Edit the order",
};

describe("RouteComparison", () => {
  it("renders both routes as equal radio cards and selects the one clicked", async () => {
    const onSelect = vi.fn();
    render(<RouteComparison comparison={compare()} placeholderReason="" selected={null} onSelect={onSelect} nowMs={NOW_MS} />);

    const shared = screen.getByRole("radio", { name: "Share with my current positions" });
    const separate = screen.getByRole("radio", { name: "Give this trade its own margin" });
    expect(shared).not.toBeChecked();
    expect(separate).not.toBeChecked();

    await userEvent.click(screen.getByText("Give this trade its own margin"));
    expect(onSelect).toHaveBeenCalledWith("separate");
  });

  it("tags the separate route as not sharing margin with the primary and answers the shared question per card", () => {
    render(<RouteComparison comparison={compare()} placeholderReason="" selected="separate" onSelect={() => undefined} nowMs={NOW_MS} />);
    const separateCard = screen.getByTestId("route-card-separate");
    expect(within(separateCard).getByText(`No shared margin with ${PRIMARY_IDENTITY.label}`)).toBeInTheDocument();
    expect(within(separateCard).getByText("No")).toBeInTheDocument();
    expect(within(screen.getByTestId("route-card-shared")).getByText("Yes")).toBeInTheDocument();
  });

  it("shows unread figures as unavailable rather than zero", () => {
    const comparison = compare({ separate: { identity: SEPARATE_IDENTITY, snapshot: null, quote: null } });
    render(<RouteComparison comparison={comparison} placeholderReason="" selected={null} onSelect={() => undefined} nowMs={NOW_MS} />);
    const separateCard = screen.getByTestId("route-card-separate");
    expect(within(separateCard).getAllByText("Unavailable").length).toBeGreaterThan(0);
    expect(within(separateCard).queryByText(/^0\.00 USDso$/)).toBeNull();
    expect(screen.queryByText(/liquidates at 0/i)).toBeNull();
  });

  it("renders two placeholder cards before there is an order to compare", () => {
    render(<RouteComparison comparison={null} placeholderReason="Enter a valid limit price and size." selected={null} onSelect={() => undefined} nowMs={NOW_MS} />);
    expect(screen.getByRole("radio", { name: "Share with my current positions" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Give this trade its own margin" })).toBeDisabled();
  });
});

describe("ctaBlocker", () => {
  it("asks for the primary account, then the order, then the route, in that order", () => {
    const comparison = compare();
    expect(ctaBlocker({ ...BASE_CTA, hasPrimary: false, comparison })).toMatch(/primary account/);
    expect(ctaBlocker({ ...BASE_CTA, ticketIssue: "Enter a size.", comparison })).toBe("Enter a size.");
    expect(ctaBlocker({ ...BASE_CTA, comparison, selected: null })).toMatch(/Choose where this trade lives/);
  });

  it("blocks while a transaction is in flight", () => {
    expect(
      ctaBlocker({ ...BASE_CTA, comparison: compare(), executionLocked: true, executionHeadline: "Submitted, waiting for the chain" }),
    ).toBe("Submitted, waiting for the chain");
  });

  it("names the wallet to switch to when the connected wallet is the other account", () => {
    const comparison = compare({ wallet: { address: PRIMARY_ADDRESS, chainId: 50383 } });
    expect(ctaBlocker({ ...BASE_CTA, comparison })).toMatch(/Wallet mismatch: switch to 0x0DE1/);
  });

  it("refuses on the wrong chain", () => {
    const comparison = compare({ wallet: { address: SEPARATE_ADDRESS, chainId: 1 } });
    expect(ctaBlocker({ ...BASE_CTA, comparison })).toMatch(/Hideki \(50383\)/);
  });

  it("opens the review when the selected account can sign and take the order", () => {
    expect(ctaBlocker({ ...BASE_CTA, comparison: compare() })).toBeUndefined();
  });
});

describe("SignBar", () => {
  it("names the market and the signing account on the primary action", async () => {
    const onPlace = vi.fn();
    const comparison = compare();
    render(<SignBar comparison={comparison} selected="separate" blocker={undefined} onPlace={onPlace} walletAddress={SEPARATE_ADDRESS} chainAgeMs={2_000} />);
    const cta = screen.getByTestId("place-trade-cta");
    expect(cta).toHaveTextContent(ctaLabel(comparison, "separate"));
    expect(cta).toHaveTextContent(/Place BTC trade in 0x0DE1/);
    await userEvent.click(cta);
    expect(onPlace).toHaveBeenCalledTimes(1);
  });

  it("keeps a blocked action focusable with its reason announced, and does not fire", async () => {
    const onPlace = vi.fn();
    render(<SignBar comparison={compare()} selected="separate" blocker="Wallet mismatch: switch to 0x0DE1…b1E0 before signing." onPlace={onPlace} walletAddress={PRIMARY_ADDRESS} chainAgeMs={2_000} />);
    const cta = screen.getByTestId("place-trade-cta");
    expect(cta).toHaveAttribute("aria-disabled", "true");
    expect(cta).toHaveAccessibleDescription(/Wallet mismatch/);
    await userEvent.click(cta);
    expect(onPlace).not.toHaveBeenCalled();
  });
});
