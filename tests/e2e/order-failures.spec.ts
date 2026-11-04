import { expect, test, type Page } from "@playwright/test";

import { shortAddress } from "@/lib/format/units";

import { liveScenario, type LiveScenario } from "./support/chain";
import { E2E_RECEIPT_TIMEOUT_MS } from "./support/e2e-env";
import { installMockWallet, type MockSendBehaviour } from "./support/mock-wallet";
import {
  addConnectedAsPrimary,
  chooseRoute,
  connectWallet,
  fillTicket,
  openTrade,
  placeTradeCta,
  sendTransactionCount,
} from "./support/trade-page";

/** The hash the scripted wallet hands back for a send it never broadcasts. */
const UNBROADCAST_HASH = `0x${"51dec0de".repeat(8)}`;

/** Connect the funded holder as A, prepare its order on the shared route and open the review. */
async function reviewSharedOrder(page: Page, scenario: LiveScenario, send: MockSendBehaviour): Promise<void> {
  await installMockWallet(page, { accounts: [scenario.funded], chainId: 50383, send });
  await openTrade(page, scenario.ticket.market.baseSymbol);
  await connectWallet(page);
  await addConnectedAsPrimary(page);
  await fillTicket(page, scenario.ticket);
  await chooseRoute(page, "shared");
  const cta = placeTradeCta(page);
  await expect(cta).toBeEnabled();
  await expect(cta).toHaveAccessibleName(`Place ${scenario.ticket.market.baseSymbol} trade in ${shortAddress(scenario.funded)}`);
  await cta.click();
  await expect(page.getByTestId("review-dialog")).toBeVisible();
}

test("J3 a rejected signature keeps the ticket ready to sign again and sends nothing more", async ({ page }) => {
  // #given the funded holder's order under review, with a wallet that rejects
  const scenario = await liveScenario();
  await reviewSharedOrder(page, scenario, "reject");
  const dialog = page.getByTestId("review-dialog");
  const confirm = dialog.getByTestId("confirm-order");
  await expect(confirm).toBeEnabled();

  // #when the trader confirms and the wallet rejects (4001)
  await confirm.click();

  // #then the status says so plainly and the order can be signed again from the same preview
  const status = dialog.getByTestId("execution-status");
  await expect(status).toHaveAttribute("data-phase", "WALLET_REJECTED");
  await expect(status).toContainText("Signature declined. Nothing was sent.");
  await expect(status).toContainText("Your order is kept. Sign again only if you want to.");
  await expect(confirm).toBeEnabled();
  expect(await sendTransactionCount(page)).toBe(1);

  // #when the review closes
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);

  // #then the ticket still holds the order and the screen keeps the declined status, with no second send
  const ticket = page.getByTestId("order-ticket");
  await expect(ticket.getByRole("textbox", { name: "Limit price" })).toHaveValue(scenario.ticket.priceText);
  await expect(ticket.getByRole("textbox", { name: "Size" })).toHaveValue(scenario.ticket.quantityText);
  await expect(page.getByTestId("execution-status")).toHaveAttribute("data-phase", "WALLET_REJECTED");
  await expect(placeTradeCta(page)).toBeEnabled();
  expect(await sendTransactionCount(page)).toBe(1);
});

test("J6 a hash that never mines goes from submitted to outcome unknown and is never resent", async ({ page }) => {
  // #given the funded holder's order under review, with a wallet that returns a hash the chain never sees
  const scenario = await liveScenario();
  await reviewSharedOrder(page, scenario, "unknown-hash");
  const dialog = page.getByTestId("review-dialog");
  const confirm = dialog.getByTestId("confirm-order");
  await expect(confirm).toBeEnabled();

  // #when the trader confirms
  await confirm.click();

  // #then the order shows as submitted with the wallet's hash
  const status = dialog.getByTestId("execution-status");
  await expect(status).toHaveAttribute("data-phase", "SUBMITTED");
  await expect(status).toContainText(UNBROADCAST_HASH);

  // #then once the receipt deadline passes the outcome is unknown, not failed and not filled
  await expect(status).toHaveAttribute("data-phase", "UNKNOWN_OUTCOME", { timeout: E2E_RECEIPT_TIMEOUT_MS + 30_000 });
  await expect(status).toContainText("Outcome unknown: checking the chain. Do not resend.");
  await expect(status).toContainText(UNBROADCAST_HASH);
  await expect(confirm).toBeDisabled();

  // #when the trader asks Sidecar to check again (the button is named by its state, so it is found by either name)
  const checkButton = status.getByRole("button", { name: /^(Check again|Checking the chain)$/ });
  await expect(checkButton).toHaveAccessibleName("Check again", { timeout: E2E_RECEIPT_TIMEOUT_MS + 30_000 });
  await checkButton.click();

  // #then the same hash is looked up again, the outcome stays unknown and nothing was resent
  await expect(checkButton).toHaveAccessibleName("Checking the chain");
  await expect(checkButton).toHaveAccessibleName("Check again", { timeout: E2E_RECEIPT_TIMEOUT_MS + 30_000 });
  await expect(status).toHaveAttribute("data-phase", "UNKNOWN_OUTCOME");
  await expect(confirm).toBeDisabled();
  expect(await sendTransactionCount(page)).toBe(1);
});
