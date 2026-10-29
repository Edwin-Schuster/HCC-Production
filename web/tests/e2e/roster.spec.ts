import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("add a person to a role; no one has a status", async ({ page }) => {
  await signIn(page);
  await page.goto("/roster");
  await expect(page.getByTestId("person-card").filter({ hasText: "(you)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Check in" })).toHaveCount(0);
  await expect(page.getByText("On site")).toHaveCount(0);

  await page.getByRole("button", { name: "Person" }).click();
  await page.getByLabel("Name").fill("Riley Nguyen");
  await page.getByRole("dialog").getByText("Lighting").click();
  await page.getByRole("button", { name: "Add person" }).click();
  await expect(page.getByTestId("person-card").filter({ hasText: "Riley Nguyen" })).toContainText("Lighting");
  await expect(page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Lighting" }) })).toContainText("Riley Nguyen");
});

test("change your own name on Profile and see it everywhere", async ({ page }) => {
  await signIn(page);
  await page.goto("/profile");
  await page.getByLabel("Name").fill("E2E Administrator Renamed");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("E2E Administrator Renamed");
  await page.goto("/roster");
  await expect(page.getByTestId("person-card").filter({ hasText: "(you)" })).toContainText("E2E Administrator Renamed");
});
