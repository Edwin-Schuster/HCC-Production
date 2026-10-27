import { expect, type Page } from "@playwright/test";

export const ADMIN = { username: "e2e-admin", password: "e2e-password-1" };

export async function signIn(page: Page, user = ADMIN) {
  await page.goto("/login");
  await page.fill("#username", user.username);
  await page.fill("#password", user.password);
  await Promise.all([page.waitForURL("**/sops**"), page.click("button[type=submit]")]);
}

/** Opens a seeded SOP from the library by title. */
export async function openSop(page: Page, title: string) {
  await page.goto("/sops");
  await page.getByRole("link", { name: new RegExp(title) }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
}
