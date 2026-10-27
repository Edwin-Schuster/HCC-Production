import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("add a contractor, warn about insurance, and track their punch items and invoices", async ({ page }) => {
  await signIn(page);
  await page.goto("/contractors");
  await expect(page.getByRole("link", { name: /Summit Rigging/ })).toContainText("Insurance to");

  await page.getByRole("button", { name: "Contractor", exact: true }).first().click();
  await page.getByLabel("Company").fill("Northside Low Voltage");
  await page.getByLabel("Trade").fill("Low voltage");
  await page.getByLabel("Insurance expires").fill("2020-01-31");
  await Promise.all([page.waitForURL(/\/contractors\/[\w-]+$/), page.getByRole("button", { name: "Add contractor" }).click()]);
  await expect(page.getByRole("heading", { level: 1, name: "Northside Low Voltage" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Insurance expired" })).toBeVisible();

  await page.getByRole("button", { name: "Punch item" }).click();
  await page.getByLabel("What needs doing").fill("Relabel patch panel B");
  await page.getByLabel("Location").fill("Booth rack");
  await page.getByLabel("Project").selectOption({ label: "Sanctuary AV Refresh" });
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("table", { name: "Punch list" })).toContainText("Relabel patch panel B");

  await page.getByRole("button", { name: "Invoice", exact: true }).click();
  await page.getByLabel("Invoice #").fill("NLV-77");
  await page.getByLabel("Amount ($)").fill("1450");
  await page.getByLabel("Project").selectOption({ label: "Sanctuary AV Refresh" });
  await page.getByLabel("Status").selectOption("paid");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("table", { name: "Invoices" })).toContainText("$1,450");

  await page.goto("/projects");
  await page.getByRole("link", { name: /Sanctuary AV Refresh/ }).first().click();
  await page.getByRole("navigation", { name: "Project" }).getByRole("link", { name: "Contractors" }).click();
  await expect(page.getByRole("table", { name: "Punch list" })).toContainText("Northside Low Voltage");
  await expect(page.getByRole("table", { name: "Invoices" })).toContainText("NLV-77");
});
