import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const local = readFileSync(".local/login.txt", "utf8");
const email = local.match(/Email: (.+)/)![1];
const password = local.match(/Password: (.+)/)![1];
test("private routes, sign-in, daily capture, effort, planning, journal, analytics and mobile", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  expect((await request.get("/api/workspace")).status()).toBe(401);
  expect(
    (
      await request.post("/api/commands", {
        headers: { Origin: "https://untrusted.example" },
        data: { type: "task.create", title: "Unauthorized" },
      })
    ).status(),
  ).toBe(401);
  await page.goto("/");
  await expect(page).toHaveURL(/login/);
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Enter your workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Your days, across your life." }),
  ).toBeVisible();
  await page.screenshot({ path: "docs/workspace-preview.png", fullPage: true });
  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  const title = "Browser verification " + Date.now();
  await page
    .getByRole("textbox", { name: "Quick capture", exact: true })
    .fill(title);
  await page.getByRole("button", { name: "Capture ↵", exact: true }).click();
  await expect(
    page.getByRole("button", { name: title + " Uncategorized", exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `Open ${title}`, exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await page.getByLabel("Minutes", { exact: true }).fill("20");
  await page
    .getByRole("button", { name: "Record effort", exact: true })
    .click();
  await expect(
    page.getByText("20m recorded", { exact: true }).last(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close panel" }).click();
  await page
    .getByRole("button", { name: `Complete ${title}`, exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: `Reopen ${title}`, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Weekly plan", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "In this plan", exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Journal", exact: true }).click();
  await page.getByRole("button", { name: "New observation" }).click();
  await page
    .getByLabel("Title · optional")
    .fill("Browser verification observation");
  await page
    .getByLabel("What did you notice?")
    .fill("An independent observation, without a task.");
  await page.getByRole("button", { name: "Save observation" }).click();
  await expect(
    page.getByRole("heading", { name: "Browser verification observation" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  await expect(
    page.getByText("An independent observation, without a task."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Insights", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A record of your attention" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Tasks", exact: true })
    .first()
    .click();
  await page.getByLabel("Status filter").selectOption("ALL");
  await page.getByRole("textbox", { name: "Search tasks" }).fill(title);
  await expect(
    page.getByRole("button", { name: `Open ${title}`, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `Open ${title}`, exact: true })
    .click();
  await page.getByRole("button", { name: "Archive task", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Tracker", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your days, across your life." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "docs/mobile-preview.png", fullPage: true });
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/login/);
  expect((await page.request.get("/api/workspace")).status()).toBe(401);
  expect(errors).toEqual([]);
});
