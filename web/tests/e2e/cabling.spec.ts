import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";

async function openSanctuary(page: Page, tab: string) {
  await page.goto("/projects");
  await page.getByRole("link", { name: /Sanctuary AV Refresh/ }).first().click();
  await page.getByRole("link", { name: tab, exact: true }).click();
}

test("add a cable to the schedule and print its labels", async ({ page }) => {
  await signIn(page);
  await openSanctuary(page, "Cabling");
  await expect(page.getByRole("button", { name: "FO-001" })).toBeVisible();

  await page.getByRole("button", { name: "Cable", exact: true }).click();
  await page.getByLabel("Cable ID").fill("NET-020");
  await page.getByLabel("Type", { exact: true }).fill("Cat6");
  await page.getByLabel("From", { exact: true }).fill("Booth Rack B");
  await page.getByLabel("To", { exact: true }).fill("Lobby display");
  await page.getByLabel("Length (ft)").fill("210");
  await page.getByRole("button", { name: "Add cable" }).click();
  await expect(page.getByRole("button", { name: "NET-020" })).toBeVisible();
  await expect(page.getByText(/905 ft in total/)).toBeVisible();

  // Duplicate IDs are refused.
  await page.getByRole("button", { name: "Cable", exact: true }).click();
  await page.getByLabel("Cable ID").fill("net-020");
  await page.getByRole("button", { name: "Add cable" }).click();
  await expect(page.getByText(/already a cable labelled/)).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  const [labels] = await Promise.all([page.waitForEvent("popup"), page.getByRole("link", { name: "Cable labels" }).click()]);
  await expect(labels.getByText("NET-020-A")).toBeVisible();
  await expect(labels.getByText("NET-020-B")).toBeVisible();
});

test("draw a room layout and link a run to a cable", async ({ page }) => {
  await signIn(page);
  await openSanctuary(page, "Room layouts");
  await page.getByRole("button", { name: "Layout", exact: true }).click();
  await page.waitForURL(/\/layouts\/[\w-]+$/);
  await page.getByLabel("Layout name").fill("Lobby");

  const add = page.getByLabel("Add device");
  await add.selectOption("display");
  await page.getByLabel("Label", { exact: true }).fill("Lobby display");
  await add.selectOption("rack");
  // New devices land in the middle; nudge the rack away so both can be tapped.
  await page.locator("[tabindex='0']").filter({ has: page.locator("svg") }).focus();
  for (let i = 0; i < 10; i++) await page.keyboard.press("Shift+ArrowLeft");

  await page.getByRole("button", { name: "Connect" }).click();
  const editor = page.locator("svg.touch-none");
  await editor.locator("[data-item]").filter({ hasText: "R" }).click();
  await editor.locator("[data-item]").filter({ hasText: "Lobby display" }).click();
  await page.getByLabel("Cable from the schedule").selectOption({ label: "FO-001 · Fiber SM" });
  await expect(page.getByLabel("Label", { exact: true })).toHaveValue("FO-001");
  await expect(page.getByRole("status")).toHaveText("Saved");

  await page.reload();
  await expect(page.getByLabel("Layout name")).toHaveValue("Lobby");
  await expect(page.locator("svg.touch-none").getByText("FO-001")).toBeVisible();
});
