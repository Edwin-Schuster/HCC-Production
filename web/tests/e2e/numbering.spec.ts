import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("one SOP can hold two 1, 2, 3 step lists", async ({ page }) => {
  await signIn(page);
  await page.goto("/sops/new");
  await page.getByText("Blank", { exact: true }).click();
  await page.fill("#title", "Two Lists");
  await Promise.all([page.waitForURL("**/edit"), page.click("button[type=submit]")]);

  const editor = page.locator(".hcc-editor [contenteditable=true]").first();
  await editor.click();
  await page.keyboard.type("/step");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Power on");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Load show");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter"); // leave the list
  await page.keyboard.type("/new step list");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Save show");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Power off");
  await expect(page.locator(".hcc-step-num")).toHaveText(["1", "2", "1", "2"]);

  // The block menu turns it back into one list.
  await page.locator(".hcc-step", { hasText: "Save show" }).hover();
  await page.locator(".bn-side-menu [draggable=true]").click();
  await page.getByRole("menuitem", { name: "Continue numbering" }).click();
  await expect(page.locator(".hcc-step-num")).toHaveText(["1", "2", "3", "4"]);
  await page.locator(".hcc-step", { hasText: "Save show" }).hover();
  await page.locator(".bn-side-menu [draggable=true]").click();
  await page.getByRole("menuitem", { name: "Start again at 1" }).click();
  await expect(page.locator(".hcc-step-num")).toHaveText(["1", "2", "1", "2"]);
  await expect(page.getByText(/Saved/).first()).toBeVisible();

  await page.getByRole("button", { name: /Publish/ }).click();
  await page.fill("#change-summary", "Two lists");
  await Promise.all([page.waitForURL(/\/sops\/[^/]+$/), page.getByRole("button", { name: "Publish v1" }).click()]);
  await expect(page.locator(".sop-step", { hasText: "Save show" }).first()).toContainText("1");
  await expect(page.locator(".sop-step", { hasText: "Power off" }).first()).toContainText("2");
});
