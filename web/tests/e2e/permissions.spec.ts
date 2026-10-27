import { expect, test } from "@playwright/test";
import { openSop, signIn } from "./helpers";

test("public folders are readable signed out; member folders are not", async ({ page, browser }) => {
  await signIn(page);
  await openSop(page, "Sunday System Startup"); // Sunday Service is a public folder
  const publicUrl = page.url();
  await openSop(page, "Livestream Go-Live"); // Video & Stream is members-only
  const membersUrl = page.url();

  const anon = await browser.newPage();
  await anon.goto(publicUrl);
  await expect(anon.getByRole("heading", { level: 1, name: "Sunday System Startup" })).toBeVisible();
  await expect(anon.getByRole("link", { name: /^Edit/ })).toHaveCount(0);

  // Members-only SOPs look the same as missing ones, so signed-out visitors learn nothing about them.
  await anon.goto(membersUrl);
  await expect(anon.getByText("This SOP isn't available")).toBeVisible();
  await expect(anon.getByText("Livestream Go-Live")).toHaveCount(0);
  const pdf = await anon.request.get(membersUrl.replace(/\/sops\/([^/]+)$/, "/api/sops/$1/pdf"));
  expect(pdf.ok()).toBe(false);
  await anon.close();
});

test("signed-out visitors cannot autosave drafts", async ({ page, browser }) => {
  await signIn(page);
  await openSop(page, "Livestream Go-Live");
  const id = page.url().split("/").pop();
  const anon = await browser.newContext();
  const res = await anon.request.put(`/api/sops/${id}/draft`, { data: { title: "Hacked", summary: "", blocks: [] } });
  expect([401, 403, 404]).toContain(res.status());
  await anon.close();
});
