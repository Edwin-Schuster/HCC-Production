import { expect, test } from "@playwright/test";
import { openSop, signIn } from "./helpers";

test("start a run, tick steps, add a note and finish", async ({ page }) => {
  await signIn(page);
  await openSop(page, "Wireless Mic Frequencies & Batteries");
  await page.getByRole("button", { name: /Run/ }).first().click();
  await page.fill("#run-label", "Sunday 9:00");
  await Promise.all([page.waitForURL(/\/runs\//), page.getByRole("button", { name: /^Start$/ }).click()]);

  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "3");
  await page.getByRole("checkbox", { name: "Tick 1" }).click();
  await page.getByRole("checkbox", { name: "Tick 2" }).click();
  await expect(page.getByText("2/3")).toBeVisible();
  await page.getByRole("button", { name: "Add a note to this step" }).first().click();
  await page.getByRole("textbox", { name: "Note" }).fill("Pastor pack at 80% after service");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByText("Pastor pack at 80% after service")).toBeVisible();

  // Ticks are saved on the server, not just on screen.
  await page.reload();
  await expect(page.getByText("2/3")).toBeVisible();

  await page.getByRole("button", { name: /Finish/ }).click();
  await expect(page.getByText(/1 step is not ticked/)).toBeVisible();
  await page.getByRole("button", { name: /Finish run/ }).click();
  await expect(page.getByText("Completed", { exact: true })).toBeVisible();

  await page.goto("/runs");
  await expect(page.getByText("Sunday 9:00")).toBeVisible();
  await expect(page.getByText(/2 done · 1 skipped/)).toBeVisible();
});
