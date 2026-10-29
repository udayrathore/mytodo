import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialWorkspaceNavigation,
  workspaceRequestKey,
} from "../src/lib/workspace-navigation";
const category = "c889c44f-e9c4-4a73-a1d8-06972e7a9c07";
const task = "8d06d3a3-1519-40f4-bff2-4fdcfb9719e3";
test("deep links select their real initial workspace and preserve task detail separately", () => {
  const today = initialWorkspaceNavigation({}, "2026-10-30");
  assert.equal(today.view, "today");
  assert.equal(today.query.status, "ALL");
  const goal = initialWorkspaceNavigation(
    { view: "goals", category, task },
    "2026-10-30",
  );
  assert.equal(goal.view, "goals");
  assert.equal(goal.query.view, "library");
  assert.equal(goal.query.category, category);
  assert.equal(goal.task, task);
  assert.equal(goal.query.task, undefined);
  const tasks = initialWorkspaceNavigation(
    {
      view: "tasks",
      status: "COMPLETED",
      sort: "urgency",
      direction: "asc",
      search: "release",
    },
    "2026-10-30",
  );
  assert.equal(tasks.query.status, "COMPLETED");
  assert.equal(tasks.query.search, "release");
  assert.equal(tasks.query.sort, "urgency");
});
test("bad bookmark fields and invalid windows cannot trigger a workspace error or unintended filter", () => {
  const nav = initialWorkspaceNavigation(
    {
      view: "today",
      category: "invalid",
      task: "invalid",
      status: "COMPLETED",
      archive: "true",
      through: "2030-01-01",
    },
    "2026-10-30",
  );
  assert.equal(nav.query.category, undefined);
  assert.equal(nav.task, null);
  assert.equal(nav.query.status, "ALL");
  assert.equal(nav.query.archive, "false");
  assert.equal(nav.query.through, undefined);
  assert.equal(
    initialWorkspaceNavigation(
      { view: "missing", category: [category] },
      "2026-10-30",
    ).view,
    "today",
  );
  const range = initialWorkspaceNavigation(
    {
      view: "today",
      dashboard: "plan",
      from: "2026-11-01",
      through: "2026-11-07",
    },
    "2026-10-30",
  );
  assert.equal(range.query.from, "2026-11-01");
});
test("request keys ignore order and empty UI values while retaining real filter changes", () => {
  const first = workspaceRequestKey({
    view: "today",
    archive: "false",
    search: "",
    category: undefined,
  });
  assert.equal(
    first,
    workspaceRequestKey({
      category: "",
      search: "",
      archive: "false",
      view: "today",
      journalSearch: "ignored",
    }),
  );
  assert.notEqual(
    first,
    workspaceRequestKey({ view: "today", archive: "false", category }),
  );
});
