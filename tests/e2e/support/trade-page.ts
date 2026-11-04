import { expect, type Locator, type Page } from "@playwright/test";
import type { Address } from "viem";

import { ROUTE_TITLES } from "@/lib/risk/explanations";
import type { RouteKind } from "@/lib/risk/types";
import { ACCOUNT_STORAGE_KEY, type AccountRole } from "@/lib/wallets/identity";

import type { TicketInput } from "./chain";
import { mockWalletRequests } from "./mock-wallet";

export const TEST_WALLET_NAME = "Sidecar Test Wallet";

/**
 * Saves accounts in this browser the way the accounts panel does, before the app loads.
 * Written once per page, so a later save by the app is not overwritten on reload.
 */
export async function seedAccountBook(page: Page, accounts: readonly { address: Address; role: AccountRole }[]): Promise<void> {
  const record = JSON.stringify({
    v: 1,
    accounts: accounts.map(({ address, role }) => ({ address, role, label: role === "primary" ? "Account A" : "Account B", addedAt: new Date().toISOString() })),
  });
  await page.addInitScript(
    ({ key, value }) => {
      if (window.sessionStorage.getItem("sidecar.e2e.seeded") !== null) return;
      window.localStorage.setItem(key, value);
      window.sessionStorage.setItem("sidecar.e2e.seeded", "1");
    },
    { key: ACCOUNT_STORAGE_KEY, value: record },
  );
}

/** Opens /trade on a market and waits for the screen to hydrate past its skeleton. */
export async function openTrade(page: Page, symbol: string): Promise<void> {
  await page.goto(`/trade?market=${encodeURIComponent(symbol)}`);
  await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();
}

/** Connects the scripted wallet through the top bar's picker. */
export async function connectWallet(page: Page): Promise<void> {
  await page.getByRole("banner").getByRole("button", { name: "Connect wallet" }).click();
  const picker = page.getByRole("dialog", { name: "Connect a wallet" });
  await picker.getByRole("button", { name: TEST_WALLET_NAME }).click();
  await expect(picker).toBeHidden();
  await expect(page.getByTestId("connected-wallet")).toBeVisible();
}

/** Adds the connected wallet as account A from the accounts panel. */
export async function addConnectedAsPrimary(page: Page): Promise<void> {
  await page.getByTestId("account-slot-a").getByRole("button", { name: /^Use connected wallet/ }).click();
  await expect(page.getByTestId("account-slot-a").getByText("Connected", { exact: true })).toBeVisible();
}

export async function fillTicket(page: Page, ticket: TicketInput): Promise<void> {
  const form = page.getByTestId("order-ticket");
  await form.getByRole("textbox", { name: "Limit price" }).fill(ticket.priceText);
  await form.getByRole("textbox", { name: "Size" }).fill(ticket.quantityText);
}

export function routeRadio(page: Page, kind: RouteKind): Locator {
  return page.getByRole("radio", { name: ROUTE_TITLES[kind] });
}

/** Picks a route by clicking its card title, as a trader would, once the comparison is live. */
export async function chooseRoute(page: Page, kind: RouteKind): Promise<void> {
  const radio = routeRadio(page, kind);
  await expect(radio).toBeEnabled();
  await page.getByTestId(`route-card-${kind}`).getByText(ROUTE_TITLES[kind], { exact: true }).click();
  await expect(radio).toBeChecked();
}

export function placeTradeCta(page: Page): Locator {
  return page.getByTestId("place-trade-cta");
}

export async function sendTransactionCount(page: Page): Promise<number> {
  const requests = await mockWalletRequests(page);
  return requests.filter((request) => request.method === "eth_sendTransaction").length;
}
