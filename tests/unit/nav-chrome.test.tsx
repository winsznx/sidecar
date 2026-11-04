import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GlobalHeader } from "@/components/chrome/global-header";
import { FOOTER_GROUPS, SiteFooter } from "@/components/chrome/site-footer";
import { SiteHeader } from "@/components/ui/site-header";

const READ_AT = "2026-11-03T12:00:00.000Z";

vi.mock("@/hooks/use-sidecar-queries", () => ({
  useChainStatus: () => ({
    isPending: false,
    isError: false,
    error: null,
    data: { chainId: 50383, expectedChainId: 50383, matches: true, headBlock: 40_742_145n, readAt: READ_AT },
  }),
}));

vi.mock("@/hooks/use-trade-clock", () => ({ useTradeClock: () => Date.parse(READ_AT) + 4_000 }));

vi.mock("@/hooks/use-wallet-state", () => ({
  useWalletState: () => ({
    status: "disconnected",
    address: null,
    chainId: null,
    onHideki: false,
    connected: null,
    connectorName: null,
    options: [],
    connect: () => undefined,
    connecting: false,
    connectError: null,
    disconnect: () => undefined,
    switchToHideki: () => undefined,
    switching: false,
    switchError: null,
    walletClient: null,
  }),
}));

afterEach(cleanup);

describe("SiteHeader", () => {
  it("links every section and marks only the open one as current", () => {
    // #given / #when
    render(<SiteHeader current="start" />);
    // #then
    const nav = screen.getByRole("navigation", { name: "Sidecar" });
    const links = within(nav)
      .getAllByRole("link")
      .map((link) => [link.textContent, link.getAttribute("href"), link.getAttribute("aria-current")]);
    expect(links).toEqual([
      ["Trade", "/trade", null],
      ["Proof", "/proof", null],
      ["Receipts", "/receipt", null],
      ["Get started", "/start", "page"],
    ]);
  });

  it("folds the nav behind a menu disclosure that controls it", () => {
    // #given / #when
    const { container } = render(<SiteHeader />);
    // #then
    const summary = container.querySelector("details > summary");
    expect({ controls: summary?.getAttribute("aria-controls"), name: summary?.textContent }).toEqual({ controls: "site-nav", name: "Menu" });
    expect(screen.getByRole("navigation", { name: "Sidecar" })).toHaveAttribute("id", "site-nav");
  });
});

describe("GlobalHeader", () => {
  it("shows the live head block with its chain badge and age, the testnet badge and Connect wallet", () => {
    // #given / #when
    render(<GlobalHeader current="proof" />);
    // #then
    const banner = screen.getByRole("banner");
    const network = within(banner).getByLabelText("Network status");
    expect({
      network: network.textContent,
      badge: network.querySelector("[data-provenance]")?.getAttribute("data-provenance"),
      paper: within(banner).getByText("Paper funds only").tagName,
      connect: within(banner).getByRole("button", { name: "Connect wallet" }).tagName,
      current: within(banner).getByRole("link", { name: "Proof" }).getAttribute("aria-current"),
    }).toEqual({
      network: expect.stringMatching(/Somnia Hideki Testnet · 50383Block.*40,742,145.*· 4s old/),
      badge: "chain",
      paper: "SPAN",
      connect: "BUTTON",
      current: "page",
    });
  });
});

describe("SiteFooter", () => {
  it("groups links into product, evidence and resources, opening only external ones in a new tab", () => {
    // #given / #when
    render(<SiteFooter />);
    // #then
    const nav = screen.getByRole("navigation", { name: "Footer" });
    const groups = FOOTER_GROUPS.map((group) => ({
      title: group.title,
      links: within(within(nav).getByRole("list", { name: group.title }))
        .getAllByRole("link")
        .map((link) => [link.getAttribute("href"), link.getAttribute("target")]),
    }));
    expect(groups).toEqual([
      { title: "Product", links: [["/trade", null], ["/start", null], ["/receipt", null]] },
      {
        title: "Evidence",
        links: [
          ["/proof", null],
          ["/receipt/0xa71faaf75c1fa13abab1f1047b1049ae86477310761fbbafaf01a6bd0fd17259", null],
          ["https://explorer.testnet.somnia.network/tokyo/address/0x478769E1177C0773c43A593DCCc4Ad15F15F1394", "_blank"],
        ],
      },
      {
        title: "Resources",
        links: [
          ["https://www.npmjs.com/package/@somnia-chain/markets-sdk", "_blank"],
          ["https://explorer.testnet.somnia.network/tokyo", "_blank"],
        ],
      },
    ]);
    expect(screen.getByRole("contentinfo")).toHaveTextContent("Testnet only.");
  });
});
