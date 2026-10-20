import { test } from "node:test";
import assert from "node:assert/strict";
import { groupTasks } from "../src/lib/task-groups";
test("groups by series identity, not matching titles, and dates occurrences", () => {
  const base = { title: "Walk", status: "PLANNED" };
  const tasks = [
    { ...base, id: "b", seriesId: "one", plannedDate: "2026-10-22" },
    { ...base, id: "a", seriesId: "one", plannedDate: "2026-10-21" },
    { ...base, id: "c", seriesId: "two", plannedDate: "2026-10-21" },
    { ...base, id: "d", seriesId: null, plannedDate: null },
    { ...base, id: "e", seriesId: null, plannedDate: null },
  ];
  const groups = groupTasks(tasks);
  assert.equal(groups.length, 4);
  assert.deepEqual(
    groups[0].occurrences.map((t) => t.id),
    ["a", "b"],
  );
  assert.equal(tasks[0].id, "b");
  assert.deepEqual(
    groupTasks(tasks.filter((t) => t.id === "b"))[0].occurrences.map(
      (t) => t.id,
    ),
    ["b"],
  );
});
