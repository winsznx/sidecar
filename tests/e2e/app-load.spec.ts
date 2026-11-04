import { expect, test } from "@playwright/test";

import { installMockWallet, mockWalletRequests } from "./support/mock-wallet";
import { freshAddress } from "./support/chain";

const PROMPT_METHODS = new Set(["eth_requestAccounts", "wallet_requestPermissions", "eth_sendTransaction", "personal_sign", "eth_signTypedData_v4"]);

test("J1 the app opens read-only on the landing, then /trade with live markets and the Hideki head", async ({ page }) => {
  // #given a browser wallet that is installed but never asked for anything
  await installMockWallet(page, { accounts: [freshAddress()], chainId: 50383, send: "reject" });

  // #when
  await page.goto("/");

  // #then the root renders the landing, and loading it asked the wallet for nothing
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const primaryCta = page.getByRole("main").getByRole("link", { name: "Open the trade screen" }).first();
  await expect(primaryCta).toHaveAttribute("href", "/trade");
  expect((await mockWalletRequests(page)).filter((request) => PROMPT_METHODS.has(request.method))).toEqual([]);

  // #then the landing lists the live markets and Sidecar's recorded runs with their receipts
  const markets = page.getByRole("group", { name: "Listed markets" });
  await expect(markets).toContainText(/\d+ perp markets? listed/);
  await expect(markets.getByText("BTC-PERP", { exact: true })).toBeVisible();
  const runs = page.getByRole("region", { name: "Sidecar's own orders on Hideki, with their receipts." });
  await expect(runs.getByRole("link", { name: /Open receipt/ }).first()).toHaveAttribute("href", /^\/receipt\/0x[0-9a-f]{64}/);

  // #when the trader follows the primary call to action
  await primaryCta.click();

  // #then
  await expect(page).toHaveURL(/\/trade(\?|$)/);

  // #then the market list loaded from the network
  const marketSelect = page.getByTestId("order-ticket").getByRole("combobox", { name: "Market" });
  await expect(marketSelect).toBeVisible();
  // The picker is a listbox popup, so its options exist only while it is open, as a trader sees them.
  await marketSelect.click();
  await expect(page.getByRole("listbox", { name: "Market" }).getByRole("option", { name: /^BTC-PERP/ })).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox", { name: "Market" })).toHaveCount(0);
  await expect(page.getByTestId("order-ticket").getByText("Price step · size step · minimum")).toBeVisible();

  // #then the network line names Hideki and shows a block read from the chain
  const network = page.getByRole("banner").getByLabel("Network status");
  await expect(network).toContainText("Somnia Hideki Testnet · 50383");
  // The badge carries a screen-reader description of the read between the block number and the age.
  await expect(network).toContainText(/Block\s*CHAIN · #\d[\d,]*[\s\S]*· .+ old/);

  // #then nothing asked the wallet to connect or sign, and no dialog is open
  await expect(page.getByRole("banner").getByRole("button", { name: "Connect wallet" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const prompts = (await mockWalletRequests(page)).filter((request) => PROMPT_METHODS.has(request.method));
  expect(prompts).toEqual([]);
});
