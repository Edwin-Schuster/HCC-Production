import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

const REVIEWER = { username: "e2e-reviewer", password: "reviewer-pass-1" };

test("a draft in an approval folder can't be published until another editor approves it", async ({ page, browser }) => {
  await signIn(page);

  // A second editor to approve.
  await page.goto("/admin/people");
  await page.getByRole("button", { name: /Add person/ }).click();
  await page.fill("#name", "E2E Reviewer");
  await page.fill("#username", REVIEWER.username);
  await page.selectOption("#role", "editor");
  await page.fill("#password", REVIEWER.password);
  await page.locator("form button[type=submit]").click();
  await expect(page.getByText("E2E Reviewer")).toBeVisible();

  // The seeded firmware draft lives in Maintenance, which needs one approval.
  await page.goto("/sops");
  await page.getByRole("link", { name: /Firmware Updates/ }).first().click();
  await page.getByRole("link", { name: /^Edit/ }).click();
  await expect(page.getByText("0/1 approved")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Publish/ })).toBeDisabled();
  await page.getByRole("button", { name: /Request review/ }).click();
  await page.getByLabel("E2E Reviewer").check();
  await page.locator("form button[type=submit]", { hasText: "Request review" }).click();
  await expect(page.getByText(/Review requested from 1 person/)).toBeVisible();
  const editUrl = page.url();

  // The reviewer gets a notification and approves from the draft view.
  const ctx = await browser.newContext();
  const reviewer = await ctx.newPage();
  await signIn(reviewer, REVIEWER);
  await reviewer.goto("/inbox");
  await reviewer.getByText(/asked for a review: Firmware Updates/).click();
  await expect(reviewer.locator("#review")).toContainText("0 of 1");
  await reviewer.getByRole("button", { name: "Approve" }).click();
  await expect(reviewer.locator("#review")).toContainText("1 of 1");
  await ctx.close();

  // Now the author can publish, and history records the approver.
  await page.goto(editUrl);
  await expect(page.getByText("1/1 approved")).toBeVisible();
  await page.getByRole("button", { name: /^Publish/ }).click();
  await page.fill("#change-summary", "First version");
  await Promise.all([page.waitForURL(/\/sops\/[^/]+$/), page.locator("form button[type=submit]", { hasText: "Publish" }).click()]);
  await page.getByRole("link", { name: /History/ }).click();
  await expect(page.getByText(/approved by E2E Reviewer/)).toBeVisible();
});
