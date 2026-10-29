import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isPendingTask,
  nextDayDueDate,
  tomorrowDate,
} from "../src/lib/task-scheduling";
import { ownerDisplayName } from "../src/lib/owner-name";
test("tomorrow uses the workspace calendar and moves a due date by one local day", () => {
  assert.equal(
    tomorrowDate("Asia/Kolkata", new Date("2026-10-31T20:00:00Z")),
    "2026-11-02",
  );
  assert.equal(
    nextDayDueDate(
      new Date("2026-10-31T12:45:00.123Z"),
      "Asia/Kolkata",
    )?.toISOString(),
    "2026-11-01T12:45:00.123Z",
  );
  assert.equal(nextDayDueDate(null, "Asia/Kolkata"), null);
  assert.equal(
    nextDayDueDate(
      new Date("2026-03-07T17:00:00Z"),
      "America/New_York",
    )?.toISOString(),
    "2026-03-08T16:00:00.000Z",
  );
  assert.equal(
    nextDayDueDate(
      new Date("2026-10-31T16:00:00Z"),
      "America/New_York",
    )?.toISOString(),
    "2026-11-01T17:00:00.000Z",
  );
});
test("the sample name is replaced for existing and new sessions", () => {
  const previous = process.env.OWNER_NAME;
  try {
    process.env.OWNER_NAME = "Alex";
    assert.equal(ownerDisplayName("Alex"), "Uday");
    process.env.OWNER_NAME = "Uday";
    assert.equal(ownerDisplayName("Alex"), "Uday");
    delete process.env.OWNER_NAME;
    assert.equal(ownerDisplayName("Alex"), "Uday");
    assert.equal(ownerDisplayName(), "Uday");
  } finally {
    if (previous === undefined) delete process.env.OWNER_NAME;
    else process.env.OWNER_NAME = previous;
  }
});

test("pending tasks include earlier, today and undated open work, excluding future and finished work", () => {
  const today = "2026-10-29";
  const task = {
    status: "PLANNED",
    archivedAt: null,
    plannedDate: "2026-10-26T00:00:00.000Z",
  };
  assert.equal(isPendingTask(task, today), true);
  assert.equal(isPendingTask({ ...task, plannedDate: today }, today), true);
  assert.equal(
    isPendingTask({ ...task, status: "INBOX", plannedDate: null }, today),
    true,
  );
  assert.equal(isPendingTask({ ...task, status: "IN_PROGRESS" }, today), true);
  assert.equal(
    isPendingTask(
      { ...task, plannedDate: new Date("2026-10-30T00:00:00Z") },
      today,
    ),
    false,
  );
  assert.equal(isPendingTask({ ...task, archivedAt: today }, today), false);
  assert.equal(isPendingTask({ ...task, status: "COMPLETED" }, today), false);
  assert.equal(isPendingTask({ ...task, status: "CANCELLED" }, today), false);
  assert.equal(task.plannedDate, "2026-10-26T00:00:00.000Z");
});
