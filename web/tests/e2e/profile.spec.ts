import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("change your own name on Profile", async ({ page }) => {
  await signIn(page);
  await page.goto("/profile");
  await page.getByLabel("Name").fill("E2E Administrator Renamed");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("E2E Administrator Renamed");
});

test("removed features are gone from the app", async ({ page }) => {
  await signIn(page);
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: "Projects" })).toBeVisible();
  for (const name of ["Runs", "Roster", "Training", "Reviews", "Analytics"]) await expect(nav.getByRole("link", { name })).toHaveCount(0);
  for (const path of ["/runs", "/roster", "/training", "/reviews", "/analytics"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(404);
  }
  // The SOP page has no Run button, training or review actions, and no description line.
  await page.goto("/sops");
  await page.getByRole("main").getByRole("link", { name: /Sunday System Startup/ }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Sunday System Startup" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run" })).toHaveCount(0);
  await page.getByRole("button", { name: "More actions" }).click();
  await expect(page.getByRole("menuitem", { name: /Training/ })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: /reviewed/ })).toHaveCount(0);
  await expect(page.getByText(/What changed in v/)).toHaveCount(0);
});
