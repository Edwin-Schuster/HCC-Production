import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("check in, then add a person to a role", async ({ page }) => {
  await signIn(page);
  await page.goto("/roster");
  const me = page.getByTestId("person-card").filter({ hasText: "(you)" });
  await expect(me).toContainText("On site");

  await page.getByRole("button", { name: "Check in" }).click();
  await page.getByRole("radio", { name: "Away" }).check();
  await page.getByLabel("Note").fill("At the youth retreat");
  await page.getByRole("dialog").getByRole("button", { name: "Check in" }).click();
  await expect(me).toContainText("Away");
  await expect(me).toContainText("At the youth retreat");

  await page.getByRole("button", { name: "Person" }).click();
  await page.getByLabel("Name").fill("Riley Nguyen");
  await page.getByRole("dialog").getByText("Lighting").click();
  await page.getByRole("button", { name: "Add person" }).click();
  await expect(page.getByTestId("person-card").filter({ hasText: "Riley Nguyen" })).toContainText("Lighting");
  await expect(page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Lighting" }) })).toContainText("Riley Nguyen");
});
