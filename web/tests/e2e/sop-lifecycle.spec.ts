import { expect, test } from "@playwright/test";
import { openSop, signIn } from "./helpers";

test("retire an SOP, find it under the Retired filter, and restore it", async ({ page }) => {
  await signIn(page);
  await openSop(page, "Firmware Updates & Config Backups");
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Retire…" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Retire" }).click();
  await expect(page.getByText("This SOP is retired.")).toBeVisible();

  await page.goto("/sops");
  await page.getByLabel("Status").selectOption("retired");
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await expect(page).toHaveURL(/status=retired/);
  await page.getByRole("link", { name: /Firmware Updates & Config Backups/ }).first().click();
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Restore" }).click();
  await expect(page.getByText("This SOP is retired.")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Edit", exact: true })).toBeVisible();
});
