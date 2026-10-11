import { test } from "node:test";
import assert from "node:assert/strict";
import { trackerEntries, trackerColumns } from "../src/lib/tracker";
import type { Task, TaskEvent } from "../src/lib/workspace";
test("tracker separates plans from dated logs and does not count effort twice", () => {
  const task = {
    id: "t",
    status: "PLANNED",
    plannedDate: "2026-10-12T00:00:00Z",
    archivedAt: null,
    effort: [
      {
        id: "effort",
        minutes: 20,
        occurredOn: "2026-10-10T00:00:00Z",
        note: "first",
      },
    ],
  } as Task;
  const events = [
    {
      id: "timed",
      taskId: "t",
      eventType: "EFFORT_RECORDED",
      occurredAt: "2026-10-11T00:00:00Z",
      fromValue: null,
      toValue: { occurredOn: "2026-10-10", effortEntryId: "effort" },
    },
    {
      id: "untimed",
      taskId: "t",
      eventType: "EFFORT_RECORDED",
      occurredAt: "2026-10-11T00:00:00Z",
      fromValue: null,
      toValue: { occurredOn: "2026-10-11", note: "again", effortEntryId: null },
    },
  ] as TaskEvent[];
  const rows = trackerEntries({ tasks: [task], events });
  assert.deepEqual(
    rows.map((e) => [e.date, e.kind]),
    [
      ["2026-10-12", "planned"],
      ["2026-10-10", "logged"],
      ["2026-10-11", "logged"],
    ],
  );
  assert.equal(
    trackerEntries({ tasks: [{ ...task, archivedAt: "2026-10-11" }], events })
      .length,
    0,
  );
});
test("parent columns include deeply nested categories without adding extra columns", () => {
  const categories = [
    {
      id: "root",
      name: "Health",
      parentId: null,
      isActive: true,
      sortOrder: 0,
    },
    {
      id: "child",
      name: "Movement",
      parentId: "root",
      isActive: true,
      sortOrder: 0,
    },
    {
      id: "leaf",
      name: "Walk",
      parentId: "child",
      isActive: true,
      sortOrder: 0,
    },
  ];
  const cols = trackerColumns({ categories });
  assert.equal(cols.length, 1);
  assert.ok(cols[0].descendants.has("leaf"));
});
