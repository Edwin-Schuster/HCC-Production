import { expect, test } from "@playwright/test";
import { openSop, signIn } from "./helpers";

test("comment on a step, suggest an edit, accept it into the draft, and flag a step", async ({ page }) => {
  await signIn(page);
  await openSop(page, "Sunday System Shutdown");
  const first = page.locator(".sop-step").first();
  await first.hover();
  await first.getByRole("button", { name: "Comment on this step" }).click();
  await page.getByRole("textbox", { name: /Comment on this step/ }).fill("Which drive is the show file on?");
  await page.getByRole("button", { name: /^Comment$/ }).click();
  await expect(page.getByText("Which drive is the show file on?")).toBeVisible();

  await page.getByRole("tab", { name: "Suggest edit" }).click();
  await page.getByRole("textbox", { name: "Suggested text" }).fill("Save the console show file to the USB stick");
  await page.getByRole("button", { name: /Suggest edit/ }).last().click();
  await page.getByRole("button", { name: /Accept into draft/ }).click();
  await expect(page.getByText("Added to the draft")).toBeVisible();

  await page.goto(page.url().split("?")[0] + "?draft=1");
  await expect(page.locator(".sop-step").first()).toContainText("Save the console show file to the USB stick");

  await openSop(page, "Sunday System Shutdown");
  await page.locator(".sop-step").nth(1).hover();
  await page.locator(".sop-step").nth(1).getByRole("button", { name: "Report a problem with this step" }).click();
  await page.getByLabel("This step is wrong").check();
  await page.getByRole("textbox", { name: "Details" }).fill("Mains are on bus 13/14 now");
  await page.getByRole("button", { name: /Send to owner/ }).click();
  await expect(page.getByText("Thanks. The owner has been told.")).toBeVisible();
  await page.goto(page.url().split("?")[0] + "/feedback");
  await expect(page.getByText("Mains are on bus 13/14 now")).toBeVisible();
  await page.getByRole("button", { name: /Accept/ }).click();
  await expect(page.getByText("Accepted", { exact: true })).toBeVisible();
});
