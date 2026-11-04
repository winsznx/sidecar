import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChoiceCard, ChoiceCardGroup } from "@/components/ui/choice-card";
import { NumberField } from "@/components/ui/number-field";
import { RiskPill } from "@/components/ui/risk-pill";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SideTag } from "@/components/ui/side-tag";
import { Stamp } from "@/components/ui/stamp";
import { ValueFlash } from "@/components/ui/value-flash";

afterEach(cleanup);

function SideControl({ onChange }: { onChange: (side: "long" | "short") => void }): ReactNode {
  const [side, setSide] = useState<"long" | "short">("long");
  return (
    <SegmentedControl
      label="Side"
      value={side}
      onValueChange={(next) => {
        setSide(next);
        onChange(next);
      }}
      options={[
        { value: "long", label: "Long", tone: "long" },
        { value: "short", label: "Short", tone: "short" },
      ]}
    />
  );
}

describe("SegmentedControl", () => {
  it("is a labelled radio group that arrow keys move through", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SideControl onChange={onChange} />);

    expect(screen.getByRole("radiogroup", { name: "Side" })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Long" }));
    // Roving focus moves on a timer while the key is held, as it is for a person pressing it.
    await user.keyboard("{ArrowRight>}");
    await waitFor(() => expect(screen.getByRole("radio", { name: "Short" })).toBeChecked());
    await user.keyboard("{/ArrowRight}");

    expect(onChange).toHaveBeenLastCalledWith("short");
  });
});

describe("ChoiceCard", () => {
  function Routes({ onSelect }: { onSelect: (route: "a" | "b") => void }): ReactNode {
    const [route, setRoute] = useState<"a" | "b" | null>(null);
    const select = (next: "a" | "b"): void => {
      setRoute(next);
      onSelect(next);
    };
    return (
      <ChoiceCardGroup legend="Where should this trade live?">
        <ChoiceCard
          name="route"
          value="a"
          tone="a"
          checked={route === "a"}
          onSelect={() => select("a")}
          title="Share with my current positions"
          description="BTC on this account shares collateral with your existing ETH position."
        >
          <button type="button">Copy Main account address</button>
        </ChoiceCard>
        <ChoiceCard
          name="route"
          value="b"
          tone="b"
          checked={route === "b"}
          onSelect={() => select("b")}
          title="Give this trade its own margin"
          description="BTC in your second wallet uses a different margin balance."
        />
      </ChoiceCardGroup>
    );
  }

  it("exposes each card as a radio named by its title and described by its summary", () => {
    render(<Routes onSelect={vi.fn()} />);

    expect(screen.getByRole("group", { name: "Where should this trade live?" })).toBeInTheDocument();
    const radio = screen.getByRole("radio", { name: "Give this trade its own margin" });
    expect(radio).toHaveAccessibleDescription("BTC in your second wallet uses a different margin balance.");
    expect(radio).not.toBeChecked();
  });

  it("selects when any part of the card is clicked, but not from a nested control", () => {
    const onSelect = vi.fn();
    render(<Routes onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy Main account address" }));
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("BTC in your second wallet uses a different margin balance."));
    expect(onSelect).toHaveBeenCalledWith("b");
    expect(screen.getByRole("radio", { name: "Give this trade its own margin" })).toBeChecked();
  });

  it("does not preselect either route", () => {
    render(<Routes onSelect={vi.fn()} />);

    for (const radio of screen.getAllByRole("radio")) expect(radio).not.toBeChecked();
  });
});

describe("state words", () => {
  it("never shows an unknown risk as healthy", () => {
    render(<RiskPill state="unknown" />);

    expect(screen.getByText("Unknown")).toBeInTheDocument();
    expect(screen.queryByText("Healthy")).not.toBeInTheDocument();
  });

  it("spells out direction next to the colour", () => {
    render(
      <>
        <SideTag side="long" />
        <SideTag side="short" />
      </>,
    );

    expect(screen.getByText("Long")).toBeInTheDocument();
    expect(screen.getByText("Short")).toBeInTheDocument();
  });

  it("reserves the word Verified for verified records", () => {
    const { rerender } = render(<Stamp status="not-verified" />);
    expect(screen.getByText("Not verified")).toBeInTheDocument();
    expect(screen.queryByText("Verified")).not.toBeInTheDocument();

    rerender(<Stamp status="pending" />);
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.queryByText("Verified")).not.toBeInTheDocument();

    rerender(<Stamp status="verified" detail="6 / 6 checks" />);
    expect(screen.getByText("Verified")).toBeInTheDocument();
  });
});

describe("NumberField", () => {
  it("passes the typed text through untouched, with a decimal keypad", () => {
    const onValueChange = vi.fn();
    render(<NumberField label="Size" value="" onValueChange={onValueChange} suffix="BTC" />);

    const input = screen.getByLabelText("Size");
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveAttribute("inputmode", "decimal");

    fireEvent.change(input, { target: { value: "0.000071000" } });
    expect(onValueChange).toHaveBeenCalledWith("0.000071000");
  });

  it("links the hint and the error to the input and marks it invalid", () => {
    render(
      <NumberField
        label="Size"
        value="0.000071"
        onValueChange={vi.fn()}
        hint="Min 0.00013, steps of 0.00001"
        error="Below the minimum size of 0.00013 BTC."
      />,
    );

    const input = screen.getByLabelText("Size");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Min 0.00013, steps of 0.00001 Below the minimum size of 0.00013 BTC.");
  });
});

describe("ValueFlash", () => {
  it("highlights a change, but not the first render or an unchanged value", () => {
    const { rerender } = render(<ValueFlash value="2,418.73" />);
    expect(screen.getByText("2,418.73")).not.toHaveAttribute("data-changed");

    rerender(<ValueFlash value="2,418.73" />);
    expect(screen.getByText("2,418.73")).not.toHaveAttribute("data-changed");

    rerender(<ValueFlash value="2,409.10" />);
    expect(screen.getByText("2,409.10")).toHaveAttribute("data-changed", "true");
    expect(screen.getByText("2,409.10")).toHaveClass("animate-flash");
  });
});
