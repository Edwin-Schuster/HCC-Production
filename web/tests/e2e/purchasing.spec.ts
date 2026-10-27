import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("plan a part, order it, receive it, and watch the budget move", async ({ page }) => {
  await signIn(page);
  await page.goto("/projects");
  await page.getByRole("link", { name: /Youth Room Install/ }).first().click();
  await page.getByRole("link", { name: "Budget", exact: true }).click();
  await expect(page.getByText("$18,000").first()).toBeVisible();

  await page.getByRole("button", { name: "Item", exact: true }).click();
  await page.getByLabel("Item", { exact: true }).fill("Laser projector");
  await page.getByLabel("Category").fill("Video");
  await page.getByLabel("Quantity").fill("1");
  await page.getByLabel("Unit cost ($)").fill("5200");
  await page.getByRole("button", { name: "Add item" }).click();
  const bom = page.getByRole("table", { name: "Bill of materials" });
  await expect(bom.getByRole("row", { name: /Laser projector/ })).toContainText("Needed");

  await page.getByRole("button", { name: "Purchase order", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Vendor").fill("B&H");
  await dialog.getByLabel("Status").selectOption("ordered");
  await dialog.getByLabel("Line 1 BOM item").selectOption({ label: "Laser projector" });
  await expect(dialog.getByLabel("Line 1 description")).toHaveValue("Laser projector");
  await expect(dialog.getByText("$5,200")).toBeVisible();
  await dialog.getByRole("button", { name: "Create purchase order" }).click();
  const pos = page.getByRole("table", { name: "Purchase orders" });
  await expect(pos.getByRole("row", { name: /B&H/ })).toContainText("Ordered");
  await expect(bom.getByRole("row", { name: /Laser projector/ })).toContainText("Ordered");

  await pos.getByRole("row", { name: /B&H/ }).getByRole("button", { name: "Receive" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "All" }).click();
  await page.getByRole("button", { name: "Save receipt" }).click();
  await expect(pos.getByRole("row", { name: /B&H/ })).toContainText("Received");
  await expect(bom.getByRole("row", { name: /Laser projector/ })).toContainText("Received");
  await expect(page.getByText("$12,800")).toBeVisible(); // remaining

  await page.goto("/purchasing");
  await expect(page.getByRole("row", { name: /B&H.*Youth Room Install/ })).toBeVisible();
});
