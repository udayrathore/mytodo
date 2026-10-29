import { test } from "node:test";
import assert from "node:assert/strict";
import { applyTaskEditResult } from "../src/lib/task-edit-state";
import type { Task } from "../src/lib/workspace";
const parent = {
  id: "parent",
  version: 0,
  title: "Plan the release",
  description: "Keep this description",
  status: "PLANNED",
  plannedDate: "2026-10-29",
  dueAt: "2026-10-30T12:00:00Z",
  completedAt: null,
  primaryCategoryId: "category",
  urgency: 6,
  importance: 7,
  estimatedMinutes: 20,
  tags: [],
  entities: [],
  checklistItems: [],
  series: null,
} as unknown as Task;

test("checklist and manual completion acknowledgements share versions without erasing task content", () => {
  const items = [
    {
      id: "child",
      title: "Review scope",
      isCompleted: true,
      sortOrder: 0,
      createdAt: "2026-10-29",
      updatedAt: "2026-10-29",
    },
  ];
  const checked = applyTaskEditResult(
    parent,
    { type: "task.checklist.add" },
    { ok: true, id: "parent", version: 1, checklistItems: items },
  );
  assert.equal(checked.version, 1);
  assert.equal(checked.description, parent.description);
  assert.equal(checked.status, "PLANNED");
  const done = applyTaskEditResult(
    checked,
    { type: "task.status", status: "COMPLETED" },
    { ok: true, id: "parent", version: 2 },
  );
  assert.equal(done.version, 2);
  assert.equal(done.status, "COMPLETED");
  assert.ok(done.completedAt);
  const removed = applyTaskEditResult(
    done,
    { type: "task.checklist.remove" },
    { ok: true, id: "parent", version: 3, checklistItems: [] },
  );
  assert.equal(removed.status, "COMPLETED");
  assert.equal(removed.title, parent.title);
  assert.equal(removed.plannedDate, parent.plannedDate);
  assert.equal(removed.checklistItems?.length, 0);
  assert.equal(parent.version, 0);
});

test("editing all repeat occurrences updates shared details and both versions while retaining this occurrence date and status", () => {
  const recurring = {
    ...parent,
    status: "COMPLETED",
    completedAt: "2026-10-29T10:00:00Z",
    series: { id: "series", version: 4 },
  } as Task;
  const result = applyTaskEditResult(
    recurring,
    {
      type: "task.update",
      scope: "ALL",
      title: "New title",
      description: "New description",
      primaryCategoryId: "new-category",
      urgency: 3,
      importance: 9,
      estimatedMinutes: null,
      tagIds: ["tag"],
      entityIds: ["project"],
      relationshipType: "CONTRIBUTES_TO",
      plannedDate: null,
      dueAt: null,
      status: "PLANNED",
    },
    { ok: true, id: "parent", version: 1, seriesVersion: 5 },
  );
  assert.equal(result.version, 1);
  assert.equal(result.series?.version, 5);
  assert.equal(result.title, "New title");
  assert.equal(result.plannedDate, recurring.plannedDate);
  assert.equal(result.dueAt, recurring.dueAt);
  assert.equal(result.status, "COMPLETED");
  assert.equal(result.completedAt, recurring.completedAt);
  assert.deepEqual(result.entities, [
    { entityId: "project", relationshipType: "CONTRIBUTES_TO" },
  ]);
  assert.equal(
    applyTaskEditResult(
      result,
      { type: "series.schedule" },
      { ok: true, id: "series", version: 6 },
    ),
    result,
  );
});
