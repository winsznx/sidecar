import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Button } from "@/components/ui/button";

afterEach(cleanup);

describe("Button", () => {
  it("runs its action when enabled", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Review order</Button>);

    fireEvent.click(screen.getByRole("button", { name: "Review order" }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("announces the disabled reason, stays focusable and blocks the action", () => {
    const onClick = vi.fn();
    const reason = "Wallet mismatch: switch to 0x5Ae3c0…e2D4 before signing.";
    render(
      <Button tone="a" disabledReason={reason} onClick={onClick}>
        Place BTC trade in 0x5Ae3c0…e2D4
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Place BTC trade in 0x5Ae3c0…e2D4" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).not.toBeDisabled();
    expect(button).toHaveAccessibleDescription(reason);
    expect(screen.getByText(reason)).toBeVisible();

    button.focus();
    expect(button).toHaveFocus();

    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("keeps the same focused button when a disabled reason appears and clears", () => {
    const { rerender } = render(<Button>Place BTC trade</Button>);
    const button = screen.getByRole("button", { name: "Place BTC trade" });
    button.focus();

    rerender(<Button disabledReason="Account B has no gas.">Place BTC trade</Button>);
    expect(screen.getByRole("button", { name: "Place BTC trade" })).toBe(button);
    expect(button).toHaveFocus();
    expect(button).toHaveAccessibleDescription("Account B has no gas.");

    rerender(<Button>Place BTC trade</Button>);
    expect(screen.getByRole("button", { name: "Place BTC trade" })).toBe(button);
    expect(button).toHaveFocus();
    expect(button).not.toHaveAttribute("aria-describedby");
  });

  it("keeps any description the caller already linked", () => {
    render(
      <>
        <p id="fee-note">Gas is paid in STT.</p>
        <Button aria-describedby="fee-note" disabledReason="Account B has no gas.">
          Place in account B
        </Button>
      </>,
    );

    expect(screen.getByRole("button")).toHaveAccessibleDescription("Gas is paid in STT. Account B has no gas.");
  });

  it("marks a loading button busy, shows the loading label and ignores repeat clicks", () => {
    const onClick = vi.fn();
    render(
      <Button tone="b" loading loadingLabel="Waiting for wallet" onClick={onClick}>
        Place BTC trade
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Waiting for wallet" });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).not.toHaveAttribute("aria-disabled");

    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("defaults to type=button so it never submits a form by accident", () => {
    render(<Button>Refresh</Button>);

    expect(screen.getByRole("button", { name: "Refresh" })).toHaveAttribute("type", "button");
  });
});
