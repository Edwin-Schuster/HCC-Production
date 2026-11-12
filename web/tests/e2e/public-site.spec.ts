import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("the public site loads signed out, at / and on every section", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/); // the address stays /
  await expect(page.getByRole("heading", { level: 1, name: "HCC Production" })).toBeVisible();
  await expect(page.getByText(/sound, video, livestream, lighting and event support/)).toBeVisible();
  const sections = page.getByRole("list", { name: "Sections" });
  for (const name of ["What we do", "Gear at Hope", "For guest presenters & bands", "SOPs"]) await expect(sections.getByRole("link", { name: new RegExp(name) })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0); // no app sidebar

  await sections.getByRole("link", { name: /What we do/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "What we do" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Services" })).toContainText("Sunday services");

  await page.goto("/gear-at-hope");
  await expect(page.getByRole("heading", { level: 2, name: "Worship Center" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Download tech packet (PDF)" }).first()).toBeVisible();

  await page.goto("/guests");
  await expect(page.getByRole("heading", { name: "Advance checklist" })).toBeVisible();

  await page.goto("/");
  await page.getByRole("list", { name: "Sections" }).getByRole("link", { name: /SOPs/ }).click();
  await expect(page.getByRole("link", { name: /Sunday System Startup/ }).first()).toBeVisible();
});

test("public gear shows only public fields, and the tech packet downloads", async ({ page, browser }) => {
  await signIn(page);
  // An existing gear item with private details.
  await page.goto("/gear");
  await page.getByRole("link", { name: /FOH Console/ }).first().click();
  const facts = page.locator("dl").first();
  const serial = (await facts.locator("dt:text-is('Serial number') + dd").textContent())?.trim();
  const ip = (await facts.locator("dt:text-is('IP address') + dd").textContent())?.trim();
  expect(serial && ip).toBeTruthy();

  const panel = page.getByRole("region", { name: "Public page" });
  await panel.getByLabel("Show on public page").check();
  await panel.getByLabel("Public name").fill("Digital mixing console");
  await panel.getByLabel("Quantity").fill("1");
  await panel.getByLabel("Room").selectOption({ label: "Worship Center" });
  await panel.getByLabel("Public note").fill("48 channels, Dante");
  await panel.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Shown on the public page")).toBeVisible();

  const guest = await (await browser.newContext()).newPage();
  await guest.goto("/gear-at-hope");
  const worship = guest.getByRole("region", { name: "Worship Center Audio" });
  await expect(worship).toContainText("Digital mixing console");
  await expect(worship).toContainText("48 channels, Dante");
  const html = await guest.content();
  expect(html).not.toContain(serial!);
  expect(html).not.toContain(ip!);
  expect(html).not.toContain("FOH Console"); // the internal name stays internal

  const href = await guest.getByRole("link", { name: "Download tech packet (PDF)" }).first().getAttribute("href");
  const res = await guest.request.get(href!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/pdf");
});

test("Sign in goes to the login, and staff land on the app's home with its sidebar", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Sign in" }).first().click();
  await expect(page).toHaveURL(/\/login/);
  await signIn(page);
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "My tasks" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Sections" })).toHaveCount(0);
});

test("editors manage the public site from the app", async ({ page, browser }) => {
  await signIn(page);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Public site" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Public site" })).toBeVisible();
  await page.getByLabel("Intro").fill("We make Sunday sound great.");
  await page.getByRole("region", { name: "Home page" }).getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved").first()).toBeVisible();
  await page.getByRole("region", { name: "What we do" }).getByRole("button", { name: "Service", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Title").fill("Weddings");
  await page.getByRole("dialog").getByLabel("Description").fill("Sound and lighting for ceremonies.");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("region", { name: "What we do" })).toContainText("Weddings");

  const guest = await (await browser.newContext()).newPage();
  await guest.goto("/");
  await expect(guest.getByText("We make Sunday sound great.")).toBeVisible();
  await guest.goto("/what-we-do");
  await expect(guest.getByRole("list", { name: "Services" })).toContainText("Weddings");
});
