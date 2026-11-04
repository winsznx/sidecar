import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { hasTokenIcon, NetworkIcon, normalizeTokenSymbol, TokenIcon } from "@/components/icons/token-icon";

afterEach(cleanup);

const PERP_BASES = [
  "BTC", "ETH", "SOL", "HYPE", "XRP", "DOGE", "BNB", "ADA", "SUI", "LINK", "AVAX",
  "XLM", "NEAR", "WLD", "TAO", "ZEC", "PUMP", "1000PEPE", "VVV", "LIT", "ZRO",
];

describe("TokenIcon", () => {
  it("renders a known symbol as a decorative svg by default", () => {
    const { container } = render(<TokenIcon symbol="BTC" />);

    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("data-token-icon", "BTC");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("gives a standalone icon an accessible name from title", () => {
    render(<TokenIcon symbol="ETH" title="Ether" size={32} />);

    const icon = screen.getByRole("img", { name: "Ether" });
    expect(icon.tagName.toLowerCase()).toBe("svg");
    expect(icon).not.toHaveAttribute("aria-hidden");
    expect(icon).toHaveAttribute("width", "32");
  });

  it("resolves the BTC-PERP display symbol like BTC", () => {
    const { container } = render(<TokenIcon symbol="BTC-PERP" />);

    expect(container.querySelector("svg")).toHaveAttribute("data-token-icon", "BTC");
    expect(normalizeTokenSymbol("btc-perp")).toBe("BTC");
  });

  it("resolves 1000PEPE to the PEPE logo", () => {
    const { container } = render(<TokenIcon symbol="1000PEPE" />);

    expect(container.querySelector("svg")).toHaveAttribute("data-token-icon", "PEPE");
    expect(hasTokenIcon("1000PEPE-PERP")).toBe(true);
  });

  it("draws a letter fallback, never an image, for an unknown symbol", () => {
    const { container } = render(<TokenIcon symbol="FARTCOIN" title="Fartcoin" />);

    expect(container.querySelector("svg, img")).toBeNull();
    const mark = screen.getByRole("img", { name: "Fartcoin" });
    expect(mark).toHaveTextContent("FAR");
    expect(mark).toHaveClass("font-mono", "rounded-full");
    expect(hasTokenIcon("FARTCOIN")).toBe(false);
  });

  it("hides the letter fallback from assistive tech when decorative", () => {
    const { container } = render(<TokenIcon symbol="QQQ" />);

    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(container.firstElementChild).toHaveTextContent("QQQ");
  });

  it("renders the bundled USDso and STT logos, decorative by default", () => {
    for (const [symbol, key] of [["USDso", "USDSO"], ["STT", "STT"]] as const) {
      const { container, unmount } = render(<TokenIcon symbol={symbol} />);
      const img = container.querySelector("img");
      expect(img).toHaveAttribute("data-token-icon", key);
      expect(img).toHaveAttribute("aria-hidden", "true");
      expect(img).toHaveAttribute("alt", "");
      expect(hasTokenIcon(symbol)).toBe(true);
      unmount();
    }
  });

  it("has a real logo, served from this app, for every perp base Sidecar lists", () => {
    for (const symbol of PERP_BASES) {
      const { container, unmount } = render(<TokenIcon symbol={symbol} />);
      expect(hasTokenIcon(symbol)).toBe(true);
      expect(container.querySelector("[data-token-fallback]")).toBeNull();
      const img = container.querySelector("img");
      if (img !== null) expect(img.getAttribute("src") ?? "").not.toMatch(/^https?:/);
      unmount();
    }
  });
});

describe("NetworkIcon", () => {
  it("names Somnia when given a title", () => {
    render(<NetworkIcon title="Somnia" />);

    expect(screen.getByRole("img", { name: "Somnia" })).toBeInTheDocument();
  });
});
