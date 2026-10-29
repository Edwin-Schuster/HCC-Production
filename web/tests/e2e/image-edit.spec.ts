import path from "node:path";
import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("resize and crop an uploaded image in the editor", async ({ page }) => {
  await signIn(page);
  await page.goto("/sops/new");
  await page.getByText("Blank", { exact: true }).click();
  await page.fill("#title", "Rack Photo Test");
  await Promise.all([page.waitForURL("**/edit"), page.click("button[type=submit]")]);

  const editor = page.locator(".hcc-editor [contenteditable=true]").first();
  await editor.click();
  await page.keyboard.type("/image");
  await page.keyboard.press("Enter");
  await page.locator(".hcc-editor input[type=file]").setInputFiles(path.join(__dirname, "../fixtures/two-tone.png"));
  const img = page.locator(".hcc-editor img").first();
  await expect(img).toBeVisible();
  const before = await img.getAttribute("src");

  // From the toolbar that appears when the image is selected.
  await img.click();
  await page.getByRole("button", { name: "Resize & crop" }).click();
  const dialog = page.getByRole("dialog", { name: "Resize & crop image" });
  // Drag the bottom-right corner in, then switch to a square crop.
  await expect(dialog.getByText("400 × 200 px")).toBeVisible();
  const corner = (await dialog.locator("[data-handle=se]").boundingBox())!;
  const box = (await dialog.getByTestId("crop-box").boundingBox())!;
  await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
  await page.mouse.down();
  await page.mouse.move(corner.x + corner.width / 2 - box.width / 4, corner.y + corner.height / 2 - box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(dialog.getByText("300 × 100 px")).toBeVisible();
  await dialog.getByRole("button", { name: "1:1" }).click();
  await expect(dialog.getByText("200 × 200 px")).toBeVisible();
  await dialog.getByRole("button", { name: "Small" }).click();
  await expect(dialog.getByRole("button", { name: "Small" })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("button", { name: "Full width" })).toHaveAttribute("aria-pressed", "false");
  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect(dialog).toBeHidden();

  await expect(img).not.toHaveAttribute("src", before!);
  await expect.poll(async () => img.evaluate((el: HTMLImageElement) => [el.naturalWidth, el.naturalHeight])).toEqual([200, 200]);
  await expect.poll(async () => Math.round((await img.boundingBox())!.width)).toBe(320);
  await expect(page.getByText(/Saved/).first()).toBeVisible();

  // The reading view keeps the crop and the size.
  await page.reload();
  await expect.poll(async () => Math.round((await page.locator(".hcc-editor img").first().boundingBox())?.width ?? 0)).toBe(320);
  await page.goto(page.url().replace(/\/edit$/, "?draft=1"));
  const shown = page.locator("figure img").first();
  await expect.poll(async () => shown.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(200);
  await expect.poll(async () => Math.round((await shown.boundingBox())!.width)).toBe(320);
});
