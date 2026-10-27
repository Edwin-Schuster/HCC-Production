import { expect, test } from "@playwright/test";
import { openSop, signIn } from "./helpers";

test("write a quiz, assign training, fail once and then pass", async ({ page }) => {
  await signIn(page);
  await openSop(page, "Wireless Mic Frequencies & Batteries");
  await page.goto(page.url().split("?")[0] + "/training");
  await page.getByRole("button", { name: /Question/ }).click();
  await page.getByLabel("Question 1").fill("How often do the pastor's batteries get changed?");
  await page.getByPlaceholder("Choice 1").fill("When the meter is low");
  await page.getByPlaceholder("Choice 2").fill("Every service");
  await page.getByLabel("Choice 2 is correct").check();
  await page.getByRole("button", { name: "Save quiz" }).click();
  await expect(page.getByText("Quiz saved")).toBeVisible();
  await page.locator("label", { hasText: "E2E Admin" }).click();
  await page.getByRole("button", { name: /^Assign$/ }).click();
  await expect(page.getByText(/Assigned to 1 person/)).toBeVisible();

  await page.goto("/training");
  await page.getByRole("link", { name: /Wireless Mic Frequencies/ }).first().click();
  await page.getByLabel("When the meter is low").check();
  await page.getByRole("button", { name: "Submit answers" }).click();
  await expect(page.getByText(/Not quite/)).toBeVisible();
  await page.getByLabel("Every service").check();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText(/Finished .* on v1 · quiz 1\/1/)).toBeVisible();
  await page.goto("/training");
  await expect(page.getByText(/Done · v1/).first()).toBeVisible();
});
