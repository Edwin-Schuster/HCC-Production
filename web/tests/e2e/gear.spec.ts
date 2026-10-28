import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("add gear, log a firmware update, back up a config and read it", async ({ page }) => {
  await signIn(page);
  await page.goto("/gear");
  await expect(page.getByRole("link", { name: /FOH Console/ })).toBeVisible();

  await page.getByRole("button", { name: "Gear", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Core switch");
  await page.getByRole("dialog").getByLabel("Category").fill("Network");
  await page.getByLabel("Model").fill("CBS350-24P");
  await page.getByLabel("Firmware version").fill("3.1.0");
  await page.getByLabel("IP address").fill("192.168.1.2");
  await Promise.all([page.waitForURL(/\/gear\/[\w-]+$/), page.getByRole("button", { name: "Add gear" }).click()]);
  await expect(page.getByTestId("gear-label")).toContainText("3.1.0");

  await page.getByLabel("New firmware version").fill("3.2.1");
  await page.getByLabel("Firmware note").fill("Security fixes");
  await page.getByRole("button", { name: "Log update" }).click();
  await expect(page.getByRole("list", { name: "Firmware history" })).toContainText("3.1.0 → 3.2.1");
  await expect(page.getByTestId("gear-label")).toContainText("3.2.1");

  page.once("dialog", (d) => d.accept("Before 3.2.1"));
  await page.locator("input[type=file]:not([accept])").setInputFiles({ name: "switch.cfg", mimeType: "text/plain", buffer: Buffer.from("hostname core\nvlan 10\nvlan 20 name video\ninterface gi1\n") });
  await page.getByRole("button", { name: "switch.cfg", exact: true }).click();
  const viewer = page.getByTestId("config-text");
  await expect(viewer).toContainText("hostname core");
  await page.getByLabel("Filter lines").fill("vlan");
  await expect(page.getByText("2 matching lines")).toBeVisible();
  await expect(viewer).not.toContainText("hostname");
});
