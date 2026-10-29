import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// Arrowing up from a sub-step used to leave an invisible cursor between steps; Enter there crashed the editor.
test("arrowing between sub-steps and pressing Enter on an empty one doesn't crash", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signIn(page);
  await page.goto("/sops/new");
  await page.getByText("Blank", { exact: true }).click();
  await page.fill("#title", "Arrow Keys");
  await Promise.all([page.waitForURL("**/edit"), page.click("button[type=submit]")]);

  await page.locator(".hcc-editor [contenteditable=true]").first().click();
  await page.keyboard.type("/step");
  await page.keyboard.press("Enter");
  for (const k of ["A", "Enter", "Tab", "A1", "Enter", "A2", "Enter", "A3", "ArrowUp", "End", "Backspace", "Backspace", "Enter"]) {
    if (["Enter", "Tab", "ArrowUp", "End", "Backspace"].includes(k)) await page.keyboard.press(k);
    else await page.keyboard.type(k);
  }
  await expect(page.locator(".hcc-step-title")).toHaveText(["A", "A1", "A3"]);
  expect(errors).toEqual([]);
});
