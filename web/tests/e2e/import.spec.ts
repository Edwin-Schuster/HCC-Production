import path from "node:path";
import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("import a Word document, preview it, and create a draft", async ({ page }) => {
  await signIn(page);
  await page.goto("/sops/import");
  await page.waitForLoadState("networkidle"); // the file input needs React attached before a file is picked
  await page.locator('input[type="file"]').setInputFiles(path.join(__dirname, "../fixtures/sample.docx"));
  await expect(page.locator("#title")).toHaveValue("Projector Lamp Swap");
  await expect(page.getByText(/3 steps|5 steps/)).toBeVisible();
  await expect(page.locator(".sop-step", { hasText: "Remove the lamp door screws" }).last()).toContainText("2.2");
  await Promise.all([page.waitForURL(/\/edit$/), page.getByRole("button", { name: "Create draft" }).click()]);
  await expect(page.locator(".hcc-step-num")).toHaveText(["1", "2", "2.1", "2.2", "3"]);
});
