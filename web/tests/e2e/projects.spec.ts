import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("create a project, then plan and track its tasks", async ({ page }) => {
  await signIn(page);
  await page.goto("/projects");
  await expect(page.getByRole("link", { name: /Sanctuary AV Refresh/ }).first()).toBeVisible();

  await page.getByRole("button", { name: "New project" }).click();
  await page.getByLabel("Name").fill("Lobby Screens");
  await page.getByLabel("Summary").fill("Two welcome displays in the lobby.");
  await page.getByLabel("Status").selectOption("active");
  await Promise.all([page.waitForURL(/\/projects\/[\w-]+$/), page.getByRole("button", { name: "Create project" }).click()]);
  await expect(page.getByRole("heading", { level: 1, name: /Lobby Screens/ })).toBeVisible();

  await page.getByRole("navigation", { name: "Project" }).getByRole("link", { name: "Tasks", exact: true }).click();
  await page.getByLabel("New task title").fill("Mount the displays");
  await page.getByLabel("New task title").press("Enter");
  await expect(page.getByRole("button", { name: "Mount the displays" })).toBeVisible();

  // The drawer: assign, prioritise, comment, add a subtask.
  await page.getByRole("button", { name: "Mount the displays" }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("button", { name: /E2E Admin/ }).click();
  await expect(drawer.getByRole("button", { name: /E2E Admin/ })).toHaveAttribute("aria-pressed", "true");
  await drawer.getByLabel("Priority").selectOption("urgent");
  await drawer.getByLabel("New subtask").fill("Find the wall studs");
  await drawer.getByRole("button", { name: "Add", exact: true }).click();
  await expect(drawer.getByRole("button", { name: "Find the wall studs" })).toBeVisible();
  await drawer.getByPlaceholder(/Write a comment/).fill("Brackets arrive Tuesday");
  await drawer.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(drawer.getByText("Brackets arrive Tuesday")).toBeVisible();
  await drawer.getByRole("tab", { name: "History" }).click();
  await expect(drawer.getByText(/changed priority from “Medium” to “Urgent”/)).toBeVisible();
  await drawer.getByRole("button", { name: "Close" }).click();

  // The board: move the task along a column.
  await page.getByRole("button", { name: "Board" }).click();
  const card = page.getByTestId("board-card").filter({ hasText: "Mount the displays" });
  await card.getByRole("button", { name: "Move to In progress" }).click();
  await expect(page.getByRole("region", { name: "In progress" }).getByText("Mount the displays")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "In progress" }).getByText("Mount the displays")).toBeVisible();

  // Done from the list.
  await page.getByRole("button", { name: "List" }).click();
  await page.getByRole("checkbox", { name: "Mark done: Mount the displays" }).click();
  await expect(page.getByRole("button", { name: "Mount the displays" })).toBeHidden();
  await page.getByLabel("Show done").check();
  await expect(page.getByRole("button", { name: "Mount the displays" })).toBeVisible();

  await page.getByRole("link", { name: "Overview" }).click();
  await expect(page.getByText("1 of 2")).toBeVisible();
});

test("members see the schedule but not the details", async ({ page, browser }) => {
  await signIn(page);
  await page.goto("/admin/people");
  await page.getByRole("button", { name: /Add person/ }).click();
  await page.fill("#name", "E2E Viewer");
  await page.fill("#username", "e2e-viewer");
  await page.selectOption("#role", "viewer");
  await page.fill("#password", "viewer-pass-1");
  await page.locator("form button[type=submit]").click();
  await expect(page.getByText("E2E Viewer")).toBeVisible();

  const viewer = await (await browser.newContext()).newPage();
  await signIn(viewer, { username: "e2e-viewer", password: "viewer-pass-1" });
  await viewer.goto("/projects");
  await expect(viewer.getByText("budget")).toHaveCount(0);
  await viewer.getByRole("link", { name: /Youth Room Install/ }).first().click();
  await expect(viewer.getByText(/visible to production editors only/)).toBeVisible();
  await expect(viewer.getByRole("link", { name: "Tasks" })).toHaveCount(0); // neither the project tab nor the sidebar
  await viewer.goto(viewer.url() + "/tasks");
  await expect(viewer).toHaveURL(/denied=1/);
});

test("general tasks live on the Tasks page, outside any project", async ({ page }) => {
  await signIn(page);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Tasks" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Tasks" })).toBeVisible();
  await page.getByLabel("New task title").fill("Order spare batteries");
  await page.getByLabel("New task title").press("Enter");
  await page.getByRole("button", { name: "Order spare batteries" }).click();
  await expect(page.getByRole("dialog")).toContainText("General tasks");
  await page.reload();
  await expect(page.getByRole("button", { name: "Order spare batteries" })).toBeVisible();
});
