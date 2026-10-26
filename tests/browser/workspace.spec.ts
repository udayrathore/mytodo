import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const password =
  process.env.TEST_LOGIN_PASSWORD ||
  readFileSync(".local/login.txt", "utf8").match(/Password: (.+)/)![1];
async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Login code or password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "My day", exact: true }),
  ).toBeVisible();
  const workToggle = page.getByRole("button", {
    name: "Turn off Work mode",
    exact: true,
  });
  if (await workToggle.isVisible()) {
    await workToggle.click();
    await expect(
      page.getByRole("button", { name: "Turn on Work mode", exact: true }),
    ).toBeVisible();
  }
}
test("category saves update immediately without waiting for a workspace reload", async ({
  page,
  request,
}) => {
  expect((await request.get("/api/workspace")).status()).toBe(401);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signIn(page);
  await page.goto("/?view=categories");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "New category", exact: true }).click();
  const name = "Browser category " + Date.now();
  await page.getByLabel("Name", { exact: true }).fill(name);
  // A broken read must not hide or misreport a committed category save.
  await page.route("**/api/workspace?**", (route) => route.abort());
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: `Edit ${name}`, exact: true }),
  ).toBeVisible();
  await page.unroute("**/api/workspace?**");
  await page.reload();
  await expect(
    page.getByRole("button", { name: `Edit ${name}`, exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("learning draft survives application navigation and can be saved after recovery", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/?view=learnings");
  await page.getByRole("button", { name: "New learning", exact: true }).click();
  await page
    .getByLabel("Title", { exact: true })
    .fill("Draft recovery regression");
  await page
    .getByLabel("Category / subcategory", { exact: true })
    .selectOption({ index: 1 });
  await page
    .getByRole("textbox", { name: "Learning body" })
    .fill("Text that must survive navigation.");
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "My day", exact: true }).click();
  await page.getByRole("button", { name: "Learnings", exact: true }).click();
  await page.getByRole("button", { name: "New learning", exact: true }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Draft recovery regression",
  );
  await expect(
    page.getByRole("textbox", { name: "Learning body" }),
  ).toContainText("Text that must survive navigation.");
  await page
    .getByRole("button", { name: "Save learning", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Draft recovery regression",
      exact: true,
    }),
  ).toBeVisible();
});
