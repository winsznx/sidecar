import { expect, test } from "@playwright/test";

import { shortAddress } from "@/lib/format/units";

import { liveScenario } from "./support/chain";
import { installMockWallet, mockWalletRequests, setMockAccounts } from "./support/mock-wallet";
import { chooseRoute, connectWallet, fillTicket, openTrade, placeTradeCta, seedAccountBook } from "./support/trade-page";

test("J4 a wallet on another chain sees the switch banner, and switching to Hideki clears it", async ({ page }) => {
  // #given a wallet that reports Ethereum mainnet
  const scenario = await liveScenario();
  await installMockWallet(page, { accounts: [scenario.funded], chainId: 1, send: "reject" });
  await openTrade(page, scenario.ticket.market.baseSymbol);

  // #when it connects
  await connectWallet(page);

  // #then signing is off behind a banner that offers the switch
  const switchButton = page.getByRole("button", { name: "Switch to Hideki (50383)" });
  await expect(switchButton).toBeVisible();
  await expect(page.getByText("Your wallet is on chain 1.")).toBeVisible();

  // #when the trader asks for the switch and the wallet emits chainChanged
  await switchButton.click();

  // #then the banner is gone and the wallet was asked for exactly Hideki
  await expect(switchButton).toHaveCount(0);
  await expect(page.getByText("Your wallet is on chain 1.")).toHaveCount(0);
  const switches = (await mockWalletRequests(page)).filter((request) => request.method === "wallet_switchEthereumChain");
  expect(switches.map((request) => request.params)).toEqual([[{ chainId: "0xc4cf" }]]);
});

test("J5 the separate route needs B while A is connected, and switching the wallet to B unlocks it", async ({ page }) => {
  // #given two real funded holders saved as A and B, with A connected
  const scenario = await liveScenario();
  const accountB = scenario.secondFunded;
  test.skip(accountB === null, `J5 skipped: only one of ${scenario.searched} searched holders can take the order, so there is no funded B to switch to.`);
  if (accountB === null) return;
  await seedAccountBook(page, [
    { address: scenario.funded, role: "primary" },
    { address: accountB, role: "separate" },
  ]);
  await installMockWallet(page, { accounts: [scenario.funded], chainId: 50383, send: "reject" });
  await openTrade(page, scenario.ticket.market.baseSymbol);
  await connectWallet(page);

  // #when the trader prepares the order on B
  await fillTicket(page, scenario.ticket);
  await chooseRoute(page, "separate");

  // #then the sign button is off with the mismatch message, and the screen says which account to pick
  const cta = placeTradeCta(page);
  await expect(cta).toBeDisabled();
  await expect(cta).toHaveAccessibleDescription(`Wallet mismatch: switch to ${shortAddress(accountB)} before signing.`);
  await expect(page.getByText("Switch accounts in your wallet app")).toBeVisible();

  // #when the wallet's active account becomes B
  await setMockAccounts(page, [accountB]);

  // #then the mismatch clears and B can sign its own trade
  await expect(cta).toBeEnabled();
  await expect(cta).toHaveAccessibleName(`Place ${scenario.ticket.market.baseSymbol} trade in ${shortAddress(accountB)}`);
  await expect(page.getByText("Switch accounts in your wallet app")).toHaveCount(0);
});
