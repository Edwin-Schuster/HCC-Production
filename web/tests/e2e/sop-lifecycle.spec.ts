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

test("an admin can delete a published SOP after typing its title", async ({ page }) => {
  await signIn(page);
  await page.goto("/sops/new");
  await page.getByText("Blank", { exact: true }).click();
  await page.fill("#title", "Old Lighting Desk");
  await Promise.all([page.waitForURL("**/edit"), page.click("button[type=submit]")]);
  await page.locator(".hcc-editor [contenteditable=true]").first().click();
  await page.keyboard.type("Turn it off");
  await expect(page.getByText(/Saved/).first()).toBeVisible();
  await page.getByRole("button", { name: /Publish/ }).click();
  await page.fill("#change-summary", "First version");
  await Promise.all([page.waitForURL(/\/sops\/[^/]+$/), page.getByRole("button", { name: "Publish v1" }).click()]);

  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete…" }).click();
  const dialog = page.getByRole("dialog");
  const button = dialog.getByRole("button", { name: "Delete forever" });
  await expect(button).toBeDisabled();
  await dialog.getByLabel(/Type .* to confirm/).fill("Old Lighting Desk");
  await button.click();
  await expect(page).toHaveURL(/\/sops$/);
  await expect(page.getByRole("link", { name: /Old Lighting Desk/ })).toHaveCount(0);
});

test("change an SOP's document code, or give it the next code of a new folder", async ({ page }) => {
  await signIn(page);
  await page.goto("/sops/new");
  await page.getByText("Blank", { exact: true }).click();
  await page.fill("#title", "Code Change");
  await Promise.all([page.waitForURL("**/edit"), page.click("button[type=submit]")]);
  await page.goto(page.url().replace(/\/edit$/, ""));

  const details = async () => {
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: /Owner, folder, tags/ }).click();
    return page.getByRole("dialog", { name: "SOP details" });
  };
  let dialog = await details();
  await dialog.getByLabel("Document code").fill("sop-svc-042");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("SOP-SVC-042").first()).toBeVisible();

  dialog = await details();
  await dialog.getByLabel("Folder", { exact: true }).selectOption({ label: "Audio" });
  await dialog.getByLabel("Give it the next code in the chosen folder").check();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/SOP-AUD-\d{3}/).first()).toBeVisible();
  await expect(page.getByText("SOP-SVC-042")).toHaveCount(0);
});
