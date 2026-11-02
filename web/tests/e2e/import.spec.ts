import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("import a Word document, preview it, and create a draft", async ({ page }) => {
  await signIn(page);
  await page.goto("/sops/import");
  await expect(page.getByText("Drop a document here")).toBeVisible();
  await page.waitForTimeout(1500); // the file input needs React attached before a file is picked
  await page.locator('input[type="file"]').setInputFiles(path.join(__dirname, "../fixtures/sample.docx"));
  await expect(page.locator("#title")).toHaveValue("Projector Lamp Swap");
  await expect(page.getByText(/3 steps|5 steps/)).toBeVisible();
  await expect(page.locator(".sop-step", { hasText: "Remove the lamp door screws" }).last()).toContainText("2.2");
  await Promise.all([page.waitForURL(/\/edit$/), page.getByRole("button", { name: "Create draft" }).click()]);
  await expect(page.locator(".hcc-step-num")).toHaveText(["1", "2", "2.1", "2.2", "3"]);
});

test("import an SOP package (.zip of Markdown and images) with step details", async ({ page }) => {
  const { zipSync } = await import("fflate");
  const png = new Uint8Array(readFileSync(path.join(__dirname, "../fixtures/two-tone.png")));
  const md = [
    "---",
    "title: Rack Power Check",
    "summary: Make sure the racks are powered before service.",
    "tags: power, racks",
    "folder: Audio",
    "---",
    "",
    "1. Turn on the UPS",
    "   - role: Technical Director",
    "   - time: 2 min",
    "   - expected: UPS shows Online",
    "",
    "   ![UPS front panel](images/ups.png \"width=360\")",
    "",
    "2. Check the rack lights",
    "   - role: Lighting Wizard",
    "",
    "> [!WARNING]",
    "> Never unplug the UPS during service.",
  ].join("\n");
  const zip = zipSync({ "rack.md": new TextEncoder().encode(md), "images/ups.png": png });

  await signIn(page);
  await page.goto("/sops/import");
  await page.waitForTimeout(1500);
  await page.locator('input[type="file"]').setInputFiles({ name: "rack-power.zip", mimeType: "application/zip", buffer: Buffer.from(zip) });
  await expect(page.locator("#title")).toHaveValue("Rack Power Check");
  await expect(page.locator("#summary")).toHaveValue("Make sure the racks are powered before service.");
  await expect(page.locator("#tags")).toHaveValue("power, racks");
  await expect(page.locator("#folder option:checked")).toHaveText(/Audio/);
  await expect(page.getByText(/Lighting Wizard/)).toBeVisible(); // unknown role warning
  const first = page.locator(".sop-step", { hasText: "Turn on the UPS" }).first();
  await expect(first).toContainText("Technical Director");
  await expect(first).toContainText("UPS shows Online");
  await expect(first.locator("img")).toHaveAttribute("alt", "UPS front panel");

  await Promise.all([page.waitForURL(/\/edit$/), page.getByRole("button", { name: "Create draft" }).click()]);
  await expect(page.locator(".hcc-step-num")).toHaveText(["1", "2"]);
  await expect.poll(async () => Math.round((await page.locator(".hcc-editor img").first().boundingBox())?.width ?? 0)).toBe(360);
});
