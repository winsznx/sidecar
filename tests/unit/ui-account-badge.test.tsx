import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AccountBadge, AccountLetter, shortenAddress } from "@/components/ui/account-badge";

afterEach(cleanup);

const ADDRESS_B = "0x9c3F7b21E08d4A6f5C1e2B9a7D3f0E6c8B4a1A41";

function stubClipboard(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "clipboard");
});

describe("shortenAddress", () => {
  it("keeps six characters after 0x and the last four", () => {
    expect(shortenAddress(ADDRESS_B)).toBe("0x9c3F7b…1A41");
  });

  it("leaves short strings untouched", () => {
    expect(shortenAddress("0x1234")).toBe("0x1234");
  });
});

describe("AccountBadge", () => {
  it("shows the letter, the label and the short address together", () => {
    render(<AccountBadge account="B" label="Sidecar account" address={ADDRESS_B} />);

    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByText("Sidecar account")).toBeInTheDocument();
    expect(screen.getByText("0x9c3F7b…1A41")).toHaveAttribute("title", ADDRESS_B);
    expect(screen.getByText(/Account B,/)).toHaveClass("sr-only");
  });

  it("copies the full address and announces it", async () => {
    const writeText = vi.fn((text: string) => Promise.resolve(void text));
    stubClipboard(writeText);
    render(<AccountBadge account="A" label="Main account" address={ADDRESS_B} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy Main account address" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Address copied");
    expect(writeText).toHaveBeenCalledWith(ADDRESS_B);
    expect(screen.getByText("Copied")).toBeInTheDocument();
  });

  it("says so, visibly and to screen readers, when the clipboard is blocked", async () => {
    stubClipboard(() => Promise.reject(new Error("blocked")));
    render(<AccountBadge account="A" label="Main account" address={ADDRESS_B} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy Main account address" }));

    expect(await screen.findByText("Copy failed")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Copy failed. The browser blocked clipboard access.");
  });

  it("renders no copy control when copying is off", () => {
    render(<AccountBadge account="B" label="Connected" address={ADDRESS_B} copyable={false} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("AccountLetter", () => {
  it("gives A the square body shape and B the round compartment shape", () => {
    render(
      <>
        <AccountLetter account="A" />
        <AccountLetter account="B" />
      </>,
    );

    expect(screen.getByText("A")).toHaveClass("rounded-xs");
    expect(screen.getByText("B")).toHaveClass("rounded-full");
  });
});
