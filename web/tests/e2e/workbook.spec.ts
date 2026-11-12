import path from "node:path";
import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("start a project from a workbook and see its budget, network and what needs attention", async ({ page }) => {
  await signIn(page);
  await page.goto("/projects");
  await page.getByRole("button", { name: "New from workbook" }).click();
  const dialog = page.getByRole("dialog", { name: "New project from a workbook" });
  await dialog.getByLabel("Workbook").setInputFiles(path.join(__dirname, "../fixtures/project-workbook.xlsx"));
  await dialog.getByLabel("Project name").fill("2027 Worship Center Project");
  const summary = dialog.getByTestId("workbook-summary");
  await expect(summary).toContainText("Budget: 5 categories, $401,000 in total");
  await expect(summary).toContainText("Bill of materials: 4 items");
  await expect(summary).toContainText("Network plan: 8 ports and devices");
  await expect(dialog.getByLabel(/EKO is a contractor/)).toBeChecked();
  await expect(dialog.getByLabel(/HCC is a contractor/)).not.toBeChecked();
  await Promise.all([page.waitForURL(/\/projects\/[^/]+\/budget$/), dialog.getByRole("button", { name: "Create project" }).click()]);

  // Budget by category, grouped by who pays, with the overspend flagged.
  const budget = page.getByRole("region", { name: "Budget by category" });
  await expect(budget.getByRole("row", { name: /Video Walls/ })).toContainText("$290,000");
  await expect(budget.getByRole("row", { name: /^Misc/ })).toContainText("$800 over");
  await expect(page.getByRole("region", { name: /Bill of materials/ }).getByRole("rowgroup").filter({ hasText: "Front Stage Lighting" })).toContainText("Chauvet Pro Ovation E-910FC");

  await page.getByRole("navigation", { name: "Project" }).getByRole("link", { name: "Network" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "used by more than one device" })).toContainText("10.0.19.79");
  await expect(page.getByRole("region", { name: "Switch 2 (4-port)" })).toContainText("Hyperdeck 1");

  await page.getByRole("navigation", { name: "Project" }).getByRole("link", { name: "Overview" }).click();
  const attention = page.getByRole("region", { name: /Needs attention/ });
  await expect(attention).toContainText("Misc is $800 over its $1,000 budget");
  await expect(attention).toContainText("EKO: 2 scopes of work not signed yet");
});
