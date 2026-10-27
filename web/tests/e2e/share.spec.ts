import { expect, test } from "@playwright/test";
import { openSop, signIn } from "./helpers";

test("share a members-only SOP with a password; a signed-out guest can read it", async ({ page, browser }) => {
  await signIn(page);
  await openSop(page, "Livestream Go-Live");
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: /Share outside the team/ }).click();
  await page.fill("#share-label", "Guest stream tech");
  await page.fill("#share-pass", "streamday");
  await page.getByRole("button", { name: "Create link" }).click();
  const url = (await page.locator("p.font-mono", { hasText: "/s/" }).first().innerText()).trim();

  const guest = await (await browser.newContext()).newPage();
  await guest.goto(url);
  await expect(guest.getByText(/password protected/)).toBeVisible();
  await guest.getByLabel("Password").fill("nope-nope");
  await guest.getByRole("button", { name: "Open", exact: true }).click();
  await expect(guest.getByText("That password isn't right.")).toBeVisible();
  await guest.getByLabel("Password").fill("streamday");
  await guest.getByRole("button", { name: "Open", exact: true }).click();
  await expect(guest.getByRole("heading", { level: 1, name: "Livestream Go-Live" })).toBeVisible();
  await expect(guest.getByRole("link", { name: /Edit/ })).toHaveCount(0);

  await page.getByRole("button", { name: /Turn off/ }).click();
  await guest.reload();
  await expect(guest.getByText("This link doesn't work any more")).toBeVisible();
});
