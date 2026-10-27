import { expect, type Page } from "@playwright/test";

export const ADMIN = { username: "e2e-admin", password: "e2e-password-1" };

export async function signIn(page: Page, user = ADMIN) {
  await page.goto("/login");
  // On a cold dev server the form can render before it hydrates, and a click then just reloads the page.
  // Retry the submit until it signs in.
  for (let attempt = 0; ; attempt++) {
    await page.fill("#username", user.username);
    await page.fill("#password", user.password);
    await page.click("button[type=submit]");
    try {
      await page.waitForURL("**/sops**", { timeout: 15_000 });
      return;
    } catch (e) {
      if (attempt >= 4) throw e;
    }
  }
}

/** Opens a seeded SOP from the library by title. */
export async function openSop(page: Page, title: string) {
  await page.goto("/sops");
  await page.getByRole("link", { name: new RegExp(title) }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
}
