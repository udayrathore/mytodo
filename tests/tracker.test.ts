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

test("task view shows each task once, keeps completed tasks, and dates unplanned activity",async()=>{
  const {taskEntries}=await import('../src/lib/tracker');
  const base={id:'planned',status:'COMPLETED',archivedAt:null,plannedDate:'2026-10-20',effort:[{id:'e1',occurredOn:'2026-10-19',minutes:20},{id:'e2',occurredOn:'2026-10-20',minutes:30}]} as Task;
  const rows=taskEntries({tasks:[base,{...base,id:'unplanned',plannedDate:null},{...base,id:'cancelled',status:'CANCELLED'}],events:[]});
  assert.deepEqual(rows.map(e=>[e.task.id,e.date]),[['planned','2026-10-20'],['unplanned','2026-10-19']]);
});

test("Work mode keeps selected child categories as Plan columns when their parent is outside the view", () => {
  const categories = [
    {
      id: "selected-child",
      name: "Client work",
      parentId: "hidden-parent",
      isActive: true,
      sortOrder: 1,
    },
    {
      id: "leaf",
      name: "Delivery",
      parentId: "selected-child",
      isActive: true,
      sortOrder: 0,
    },
    {
      id: "other",
      name: "Operations",
      parentId: "another-hidden-parent",
      isActive: true,
      sortOrder: 0,
    },
    {
      id: "inactive",
      name: "Inactive",
      parentId: "hidden-parent",
      isActive: false,
      sortOrder: 0,
    },
  ];
  const cols = trackerColumns({ categories });
  assert.deepEqual(
    cols.map((c) => c.id),
    ["other", "selected-child"],
  );
  assert.deepEqual([...cols[1].descendants].sort(), ["leaf", "selected-child"]);
  assert.ok(!cols.some((c) => c.id === "leaf" || c.id === "inactive"));
});
