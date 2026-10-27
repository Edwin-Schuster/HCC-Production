import { expect, test } from "@playwright/test";
import { openSop, signIn } from "./helpers";

test("library lists the seeded SOPs and the reading view numbers steps", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("link", { name: /Sunday System Startup/ }).first()).toBeVisible();
  await openSop(page, "Sunday System Startup");
  await expect(page.getByText("v2", { exact: false }).first()).toBeVisible();
  await expect(page.locator(".sop-step").first()).toContainText("Unlock the booth");
  // Sub-steps of step 3 are numbered 3.1 and 3.2.
  await expect(page.locator(".sop-step", { hasText: "Load the show file" }).first()).toContainText("3.1");
});

test("version history shows both published versions", async ({ page }) => {
  await signIn(page);
  await openSop(page, "Sunday System Startup");
  await page.getByRole("link", { name: /History/ }).click();
  await expect(page.getByRole("link", { name: "Added the rack diagram and breaker table." })).toBeVisible();
  await expect(page.getByRole("link", { name: "First version, moved from the old handbook." })).toBeVisible();
});

test("search finds text inside steps and callouts", async ({ page }) => {
  await signIn(page);
  await page.goto("/search?q=amplifiers");
  await expect(page.getByRole("link", { name: /Sunday System Startup/ })).toBeVisible();
  await expect(page.locator("mark").first()).toBeVisible();
});

test("PDF export returns a PDF", async ({ page }) => {
  await signIn(page);
  await openSop(page, "Livestream Go-Live");
  const id = page.url().split("/").pop();
  const res = await page.request.get(`/api/sops/${id}/pdf`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/pdf");
  expect((await res.body()).subarray(0, 5).toString()).toBe("%PDF-");
});
