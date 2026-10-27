import { expect, test } from "@playwright/test";
import { openSop, signIn } from "./helpers";

test("create an API key, use the REST API with it, and embed a public SOP", async ({ page, playwright, baseURL }) => {
  await signIn(page);
  await page.goto("/profile");
  await page.fill("#key-name", "e2e");
  await page.selectOption("#key-role", "editor");
  await page.getByRole("button", { name: "Create key" }).click();
  const token = (await page.locator("code", { hasText: "hcc_" }).innerText()).trim();

  const api = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
  expect(await (await api.get("/api/v1/me")).json()).toMatchObject({ username: "e2e-admin", role: "editor" });
  const folders = (await (await api.get("/api/v1/folders")).json()).folders;
  const created = await api.post("/api/v1/sops", {
    data: { title: "Made by the API", folderId: folders[0].id, blocks: [{ id: "a", type: "step", content: { title: [{ text: "First" }] }, children: [] }] },
  });
  expect(created.status()).toBe(201);
  const { id } = await created.json();
  expect((await api.post(`/api/v1/sops/${id}/publish`, { data: { changeSummary: "From the API" } })).ok()).toBe(true);
  const doc = await (await api.get(`/api/v1/sops/${id}`)).json();
  expect(doc.version.number).toBe(1);
  expect(doc.blocks[0].content.title[0].text).toBe("First");
  const bad = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { Authorization: "Bearer hcc_wrong-wrong-wrong-wrong" } });
  expect((await bad.post("/api/v1/sops", { data: { title: "x", folderId: folders[0].id } })).status()).toBe(403);

  // Embed: public folder SOP renders in the embed page; members-only doesn't.
  await openSop(page, "Sunday System Startup");
  const publicId = page.url().split("/").pop();
  const guest = await (await page.context().browser()!.newContext()).newPage();
  await guest.goto(`/embed/${publicId}`);
  await expect(guest.getByRole("heading", { name: "Sunday System Startup" })).toBeVisible();
  await openSop(page, "Livestream Go-Live");
  await guest.goto(`/embed/${page.url().split("/").pop()}`);
  await expect(guest.getByText(/isn't public/)).toBeVisible();
});
