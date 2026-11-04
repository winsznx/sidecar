import { expect, test } from "@playwright/test";

import { ROUTE_TITLES } from "@/lib/risk/explanations";

import { freshAddress, liveScenario } from "./support/chain";
import { installMockWallet } from "./support/mock-wallet";
import {
  addConnectedAsPrimary,
  chooseRoute,
  connectWallet,
  fillTicket,
  openTrade,
  placeTradeCta,
  sendTransactionCount,
} from "./support/trade-page";

test("J2 an unfunded second wallet cannot take the trade and nothing is sent from A", async ({ page }) => {
  // #given a real funded holder connected as A, and a fresh address with no STT or USDso watched as B
  const scenario = await liveScenario();
  const unfunded = freshAddress();
  await installMockWallet(page, { accounts: [scenario.funded], chainId: 50383, send: "reject" });
  await openTrade(page, scenario.ticket.market.baseSymbol);
  await connectWallet(page);
  await addConnectedAsPrimary(page);
  const slotB = page.getByTestId("account-slot-b");
  await slotB.getByRole("textbox", { name: "Address to watch" }).fill(unfunded);
  await slotB.getByRole("button", { name: "Watch this address" }).click();
  await expect(page.getByTestId("account-summary")).toBeVisible();

  // #when the trader prepares a valid order and picks the separate route
  await fillTicket(page, scenario.ticket);
  await chooseRoute(page, "separate");

  // #then card B says why it cannot take the order
  const cardB = page.getByTestId("route-card-separate");
  await expect(cardB.getByText("Can't place here")).toBeVisible();
  await expect(cardB.getByTestId("route-issues-separate")).toContainText("Not enough STT for gas");

  // #then the sign button is off and names the reason
  const cta = placeTradeCta(page);
  await expect(cta).toBeDisabled();
  await expect(cta).toHaveAccessibleDescription(/Account B is watch-only and is short of funds: .+ Connect 0x.+ and fund it\./);

  // #then pressing it anyway opens nothing and never reaches the wallet; the route is not swapped to A
  await cta.click({ force: true });
  await expect(page.getByTestId("review-dialog")).toHaveCount(0);
  await expect(page.getByRole("radio", { name: ROUTE_TITLES.separate })).toBeChecked();
  expect(await sendTransactionCount(page)).toBe(0);
});
