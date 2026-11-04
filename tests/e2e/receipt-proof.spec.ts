import { expect, test, type Locator } from "@playwright/test";

import { findPublicFillHash } from "./support/chain";

function checkRow(checks: Locator, label: string): Locator {
  return checks.locator("dl > div").filter({ hasText: label }).locator("dd");
}

test("J7 a malformed hash is refused without a lookup", async ({ page }) => {
  // #given / #when
  await page.goto("/receipt/0x1234");

  // #then
  await expect(page.getByRole("heading", { level: 1, name: "This is not a transaction hash" })).toBeVisible();
  await expect(page.getByText("Sidecar did not look anything up.")).toBeVisible();
});

test("J7 a real public fill renders its decoded outcome and truth checks", async ({ page }) => {
  // #given a recent public perp fill placed directly on its pool, searched live
  test.setTimeout(240_000);
  const fill = await findPublicFillHash();
  test.skip(fill === null, "J7 receipt skipped: no recent BTC or ETH fill placed directly on its pool was found on Hideki.");
  if (fill === null) return;

  // #when the receipt opens with the account that sent it
  await page.goto(`/receipt/${fill.hash}?account=${fill.sender}`);

  // #then the outcome is decoded from the chain receipt
  await expect(page.getByRole("heading", { level: 1, name: /-PERP (long|short) (filled|partially filled)$/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fills" })).toBeVisible();

  // #then the chain and sender checks pass
  const checks = page.getByRole("region", { name: "Truth checks" });
  await expect(checkRow(checks, "Transaction is on Somnia Hideki (50383)")).toContainText("Pass");
  await expect(checkRow(checks, "Sent by the selected account")).toContainText("Pass");
});

test("J7 the proof page shows its empty state when nothing has been recorded", async ({ page }) => {
  // #given an empty published proof index
  await page.route("**/proof/index.json", (route) =>
    route.fulfill({ json: { schema: "sidecar.proof-index.v1", updatedAt: new Date().toISOString(), records: [] } }),
  );

  // #when
  await page.goto("/proof");

  // #then
  await expect(page.getByRole("heading", { level: 1, name: "Two trades. Two accounts. One chain to check." })).toBeVisible();
  await expect(page.getByText("Not yet recorded")).toHaveCount(3);
});

test("J7 the proof page shows every run recorded in the published index", async ({ page }) => {
  // #given the proof index this repo publishes, with real Hideki runs in it
  const response = await page.request.get("/proof/index.json");
  const index = (await response.json()) as { records: unknown[] };
  test.skip(index.records.length === 0, "No runs are recorded in public/proof/index.json yet.");

  // #when
  await page.goto("/proof");

  // #then each journey card is backed by a recorded run, and none is left unrecorded
  await expect(page.getByText("Recorded run", { exact: true })).toHaveCount(3);
});
