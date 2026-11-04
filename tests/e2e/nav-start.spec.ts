import { expect, test, type Page } from "@playwright/test";

import { PUBLIC_FILL_HASH } from "@/lib/evidence/public-fill";

import { freshAddress } from "./support/chain";
import { installMockWallet, mockWalletRequests } from "./support/mock-wallet";
import { connectWallet } from "./support/trade-page";

const SECTIONS = [
  { label: "Trade", href: "/trade" },
  { label: "Proof", href: "/proof" },
  { label: "Receipts", href: "/receipt" },
  { label: "Get started", href: "/start" },
] as const;

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

function isNarrow(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) < 1024;
}

test("N1 every page shares the header and footer, and the narrow header folds its nav behind Menu", async ({ page }) => {
  // #given
  await installMockWallet(page, { accounts: [freshAddress()], chainId: 50383, send: "reject" });

  for (const path of ["/proof", "/receipt", "/start"]) {
    // #when
    await page.goto(path);
    const banner = page.getByRole("banner");

    // #then the header carries the live network line, the testnet badge and Connect wallet
    await expect(banner.getByLabel("Network status")).toContainText(/Somnia Hideki Testnet · 50383\s*Block\s*CHAIN · #\d[\d,]*[\s\S]*old/);
    await expect(banner.getByText("Paper funds only")).toBeVisible();
    await expect(banner.getByRole("button", { name: "Connect wallet" })).toBeVisible();
    await expect(page.getByRole("contentinfo").getByRole("navigation", { name: "Footer" })).toBeAttached();
    expect(await horizontalOverflow(page)).toBe(0);

    const nav = banner.getByRole("navigation", { name: "Sidecar" });
    if (isNarrow(page)) {
      // #then the nav is folded until Menu opens it
      await expect(nav).toBeHidden();
      await banner.locator("summary").click();
      await expect(nav).toBeVisible();
      expect(await horizontalOverflow(page)).toBe(0);
    }
    for (const section of SECTIONS) {
      await expect(nav.getByRole("link", { name: section.label })).toHaveAttribute("href", section.href);
    }
    await expect(nav.locator("[aria-current=page]")).toHaveCount(1);
  }
});

test("N2 /start reads a connected wallet, fills the faucet command and never sends", async ({ page }) => {
  // #given a fresh address that holds nothing on Hideki
  const address = freshAddress();
  await installMockWallet(page, { accounts: [address], chainId: 50383, send: "reject" });
  await page.goto("/start");

  // #then without a wallet nothing reads as passed
  await expect(page.getByTestId("start-tally")).toContainText("Connect a wallet to check");
  await expect(page.getByTestId("faucet-command")).toHaveText("/faucet 0xYourAddress");
  await expect(page.getByTestId("start-step-4").locator("[data-provenance]")).toHaveCount(0);

  // #when the wallet connects from the header
  await connectWallet(page);

  // #then the command carries the address and the balance steps read the chain
  await expect(page.getByTestId("faucet-command")).toHaveText(`/faucet ${address}`);
  await expect(page.getByTestId("start-step-2")).toContainText("On Hideki");
  await expect(page.getByTestId("start-step-4")).toContainText("Short of gas");
  await expect(page.getByTestId("start-step-4").getByText("0 STT", { exact: true })).toBeVisible();
  await expect(page.getByTestId("start-step-4").locator("[data-provenance=chain]").first()).toBeVisible();
  await expect(page.getByTestId("start-tally")).toContainText(/\d of 5 readable checks pass/);
  expect(await horizontalOverflow(page)).toBe(0);

  // #then the page asked the wallet for no transaction
  const sends = (await mockWalletRequests(page)).filter((request) => request.method === "eth_sendTransaction");
  expect(sends).toEqual([]);
  await expect(page.getByRole("main").getByRole("link", { name: "Open the trade screen" })).toHaveAttribute("href", "/trade");
});

test("N3 /receipt opens a pasted hash and lists the recorded runs", async ({ page }) => {
  // #given
  await page.goto("/receipt");
  await expect(page.getByRole("heading", { level: 1, name: "Open a receipt" })).toBeVisible();

  // #when
  await page.getByLabel(/Transaction hash/).fill(PUBLIC_FILL_HASH);
  await page.getByRole("button", { name: "Open receipt" }).click();

  // #then
  await expect(page).toHaveURL(new RegExp(`/receipt/${PUBLIC_FILL_HASH}$`));

  // #when the published index has runs, each links to its receipt
  const response = await page.request.get("/proof/index.json");
  const index = (await response.json()) as { records: { hash: string }[] };
  test.skip(index.records.length === 0, "No runs are recorded in public/proof/index.json yet.");
  await page.goto("/receipt");
  const runs = page.getByRole("region", { name: "Recorded runs" });
  await expect(runs.getByRole("link", { name: "Open receipt" })).toHaveCount(index.records.length);
});
