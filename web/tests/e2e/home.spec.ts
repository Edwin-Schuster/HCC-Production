import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// A 1×1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test("home shows my status, my tasks and insurance warnings; check in from there", async ({ page }) => {
  await signIn(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("E2E");
  await expect(page.getByRole("heading", { name: "My tasks" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Summit Rigging" })).toBeVisible();
  await page.getByRole("link", { name: "Check in" }).click();
  await expect(page.getByRole("dialog", { name: "Check in" })).toBeVisible();
});

test("add site photos by location, then print the project report", async ({ page }) => {
  await signIn(page);
  await page.goto("/projects");
  await page.getByRole("link", { name: /Sanctuary AV Refresh/ }).first().click();
  await page.getByRole("navigation", { name: "Project" }).getByRole("link", { name: "Photos" }).click();
  await page.getByLabel("Location for new photos").fill("Balcony rail");
  await page.locator("input[type=file][multiple]").setInputFiles({ name: "rail.png", mimeType: "image/png", buffer: PNG });
  const photos = page.getByRole("list", { name: "Photos" });
  await expect(photos.getByRole("listitem")).toHaveCount(1);
  await expect(photos).toContainText("Balcony rail");
  await page.getByRole("button", { name: "Edit caption" }).click();
  await page.getByLabel("Caption", { exact: true }).fill("PTZ-2 bracket position");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(photos).toContainText("PTZ-2 bracket position");

  const [report] = await Promise.all([page.waitForEvent("popup"), page.getByRole("link", { name: "Report" }).click()]);
  await expect(report.getByRole("heading", { level: 1, name: "Sanctuary AV Refresh" })).toBeVisible();
  await expect(report.getByRole("heading", { name: /Open tasks/ })).toBeVisible();
  await expect(report.getByText("Patch sheet out of date")).toBeVisible();
  await expect(report.getByRole("heading", { name: /Open punch items/ })).toBeVisible();
});
