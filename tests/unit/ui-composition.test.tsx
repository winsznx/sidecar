import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Band } from "@/components/ui/band";
import { Button } from "@/components/ui/button";
import { Connector } from "@/components/ui/connector";
import { FloatingCard } from "@/components/ui/floating-card";
import { InspectionCard, tallyChecks, tallyLabel } from "@/components/ui/inspection-card";
import type { KeyValueItem } from "@/components/ui/key-value-list";
import { Accent, SectionHeading } from "@/components/ui/section-heading";
import { SiteHeader } from "@/components/ui/site-header";
import { Stamp } from "@/components/ui/stamp";

afterEach(cleanup);

describe("SiteHeader", () => {
  it("links home and to both sections, and marks only the open one as current", () => {
    render(<SiteHeader current="proof" />);

    expect(screen.getByRole("link", { name: "Sidecar home" })).toHaveAttribute("href", "/");
    const nav = screen.getByRole("navigation", { name: "Sidecar" });
    expect(within(nav).getByRole("link", { name: "Trade" })).toHaveAttribute("href", "/trade");
    expect(within(nav).getByRole("link", { name: "Trade" })).not.toHaveAttribute("aria-current");
    expect(within(nav).getByRole("link", { name: "Proof" })).toHaveAttribute("aria-current", "page");
  });

  it("renders the meta and wallet slots only when given", () => {
    const { rerender } = render(<SiteHeader />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();

    rerender(<SiteHeader meta={<span>Chain 50383</span>} wallet={<Button variant="secondary">Connect wallet</Button>} />);
    expect(screen.getByText("Chain 50383")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect wallet" })).toBeInTheDocument();
  });
});

describe("Band", () => {
  it("switches its subtree to the band surface and shows every corner it is given", () => {
    const { container } = render(
      <Band
        aria-label="Before you sign"
        corners={{ topStart: "Somnia Hideki · 50383", bottomEnd: "Paper funds only" }}
      >
        <p>Content</p>
      </Band>,
    );

    const band = screen.getByRole("region", { name: "Before you sign" });
    expect(band).toHaveAttribute("data-surface", "band");
    expect(within(band).getByText("Somnia Hideki · 50383")).toBeInTheDocument();
    expect(within(band).getByText("Paper funds only")).toBeInTheDocument();
    expect(container.textContent).toBe("Somnia Hideki · 50383ContentPaper funds only");
  });

  it("leaves out corner rows that have nothing in them", () => {
    const { container } = render(<Band as="div">Only content</Band>);
    expect(container.firstElementChild?.children).toHaveLength(1);
  });
});

describe("SectionHeading and Accent", () => {
  it("renders the eyebrow step, the heading at the asked level with its id, and the lede", () => {
    render(
      <SectionHeading
        as="h1"
        index={3}
        eyebrow="Choose the account"
        id="route-heading"
        title={
          <>
            Where should this trade <Accent>live?</Accent>
          </>
        }
        lede="Nothing is sent until you sign."
      />,
    );

    const heading = screen.getByRole("heading", { level: 1, name: "Where should this trade live?" });
    expect(heading).toHaveAttribute("id", "route-heading");
    expect(screen.getByText("03")).toBeInTheDocument();
    expect(screen.getByText("Choose the account")).toBeInTheDocument();
    expect(screen.getByText("Nothing is sent until you sign.")).toBeInTheDocument();
  });

  it("marks the accent phrase with a <mark> so it is more than a colour", () => {
    render(<Accent>its own margin</Accent>);
    const mark = screen.getByText("its own margin");
    expect(mark.tagName).toBe("MARK");
    expect(mark).toHaveClass("marker");
  });
});

describe("FloatingCard", () => {
  it("renders an ink card on the band surface and a paper card without a surface switch", () => {
    render(
      <>
        <FloatingCard tone="ink" data-testid="ink">
          Order
        </FloatingCard>
        <FloatingCard depth="back" tilt={-2} data-testid="paper">
          Route
        </FloatingCard>
      </>,
    );

    expect(screen.getByTestId("ink")).toHaveAttribute("data-surface", "band");
    expect(screen.getByTestId("paper")).not.toHaveAttribute("data-surface");
    expect(screen.getByTestId("paper")).toHaveAttribute("data-depth", "back");
    expect(screen.getByTestId("paper")).toHaveClass("-rotate-2");
  });
});

describe("Connector", () => {
  it("is decorative and hidden from assistive tech", () => {
    const { container } = render(<Connector orientation="horizontal" start="ring" end="dot" />);
    const connector = container.firstElementChild;
    expect(connector).toHaveAttribute("aria-hidden", "true");
    expect(connector).toHaveAttribute("data-orientation", "horizontal");
    expect(connector?.children).toHaveLength(3);
  });
});

const ROWS: ReadonlyArray<KeyValueItem> = [
  { id: "chain", label: "Chain is 50383", value: "Hideki", check: "pass" },
  { id: "sender", label: "Sender is the selected account", value: "0x9c3F7b…1A41", check: "pass" },
  { id: "fill", label: "Fill reported by indexer", value: "Waiting", check: "unknown" },
  { id: "margin", label: "Main account margin untouched", value: "Changed", check: "fail" },
  { id: "req", label: "Requested", value: "Long 0.01300 BTC" },
];

describe("InspectionCard", () => {
  it("counts every verdict and never folds unknown or failed checks into passes", () => {
    expect(tallyChecks(ROWS)).toEqual({ passed: 2, failed: 1, unknown: 1, total: 4 });
    expect(tallyLabel(tallyChecks(ROWS))).toBe("2 / 4 passed · 1 failed · 1 unknown");
    expect(tallyLabel(tallyChecks(ROWS.slice(0, 2)))).toBe("2 / 2 passed");
  });

  it("shows the rows, the tally from those rows, the footnote and the verdict slot", () => {
    render(
      <InspectionCard
        title="Truth checks"
        items={ROWS}
        footnote="re-read at block 38,357,701"
        verdict={<Stamp status="not-verified" />}
      />,
    );

    expect(screen.getByRole("heading", { level: 3, name: "Truth checks" })).toBeInTheDocument();
    expect(screen.getByTestId("inspection-tally")).toHaveTextContent("2 / 4 passed · 1 failed · 1 unknown");
    expect(screen.getByText("re-read at block 38,357,701")).toBeInTheDocument();
    expect(screen.getByText("Not verified")).toBeInTheDocument();
    expect(screen.getByText("Main account margin untouched")).toBeInTheDocument();
  });

  it("omits the tally when no row carries a check", () => {
    render(<InspectionCard title="Order" items={[{ id: "m", label: "Market", value: "BTC-PERP" }]} />);
    expect(screen.queryByTestId("inspection-tally")).not.toBeInTheDocument();
  });
});

describe("Button accent variant", () => {
  it("keeps the disabled-reason behaviour of every other variant", () => {
    render(
      <Button variant="accent" disabledReason="Connect a wallet first.">
        Open the trade screen
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Open the trade screen" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAccessibleDescription("Connect a wallet first.");
  });
});
