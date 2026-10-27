import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("create, write steps with nesting, autosave and publish", async ({ page }) => {
  await signIn(page);
  await page.goto("/sops/new");
  await page.getByText("Blank", { exact: true }).click();
  await page.fill("#title", "Projector Lamp Swap");
  await Promise.all([page.waitForURL("**/edit"), page.click("button[type=submit]")]);

  const editor = page.locator(".hcc-editor [contenteditable=true]").first();
  await editor.click();
  await page.keyboard.type("/step");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Power down the projector");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Let the lamp cool");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Check the housing is cool");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.type("Install the new lamp");

  await expect(page.locator(".hcc-step-num")).toHaveText(["1", "2", "2.1", "3"]);
  await expect(page.getByText(/Saved/).first()).toBeVisible();

  // Survives a reload (autosaved to the server, not just local storage).
  await page.reload();
  await expect(page.locator(".hcc-step-num")).toHaveText(["1", "2", "2.1", "3"]);

  await page.getByRole("button", { name: /Publish/ }).click();
  await page.fill("#change-summary", "First version");
  await Promise.all([page.waitForURL(/\/sops\/[^/]+$/), page.locator("form button[type=submit]").click()]);
  await expect(page.getByRole("heading", { level: 1, name: "Projector Lamp Swap" })).toBeVisible();
  await expect(page.locator(".sop-step", { hasText: "Check the housing is cool" }).first()).toContainText("2.1");
});
