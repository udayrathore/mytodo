import "dotenv/config";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { database } from "../src/lib/db";
import { executeCommand } from "../src/lib/commands";
if (
  process.env.LOCAL_PGLITE !== "1" &&
  process.env.ALLOW_INTEGRATION_TEST_DATABASE !== "1"
)
  throw new Error(
    "Use an isolated test database and set ALLOW_INTEGRATION_TEST_DATABASE=1.",
  );
const db = database();
const run = randomUUID();
const user = await db.user.create({
  data: { email: `test-${run}@example.test`, name: "Integration test" },
});
const other = await db.user.create({
  data: { email: `other-${run}@example.test`, name: "Other owner" },
});
const uid = user.id;
after(async () => {
  await db.$disconnect();
});
test("capture, completion, reopening and stale-write protection preserve history", async () => {
  const r = await executeCommand(uid, {
    type: "task.create",
    title: "Integration intention",
  });
  const id = r!.id;
  let t = await db.task.findUniqueOrThrow({ where: { id } });
  assert.equal(t.status, "INBOX");
  await executeCommand(uid, {
    type: "task.status",
    id,
    version: t.version,
    status: "COMPLETED",
  });
  t = await db.task.findUniqueOrThrow({ where: { id } });
  assert.ok(t.completedAt);
  await assert.rejects(
    executeCommand(uid, {
      type: "task.status",
      id,
      version: 0,
      status: "INBOX",
    }),
    /changed/,
  );
  await executeCommand(uid, {
    type: "task.status",
    id,
    version: t.version,
    status: "INBOX",
  });
  t = await db.task.findUniqueOrThrow({ where: { id } });
  assert.equal(t.completedAt, null);
  assert.deepEqual(
    (
      await db.taskEvent.findMany({
        where: { taskId: id },
        orderBy: { createdAt: "asc" },
      })
    ).map((e) => e.eventType),
    ["CREATED", "COMPLETED", "REOPENED"],
  );
  await assert.rejects(
    executeCommand(other.id, {
      type: "task.status",
      id,
      version: t.version,
      status: "COMPLETED",
    }),
    /not found/,
  );
});
test("weekly carry-forward preserves both assignments and removal is historical", async () => {
  const task = (await executeCommand(uid, {
    type: "task.create",
    title: "Carry me forward",
  }))!;
  const p1 = await executeCommand(uid, {
    type: "period.create",
    title: "Week one",
    startsOn: "2026-10-05",
    endsOn: "2026-10-11",
  });
  const p2 = await executeCommand(uid, {
    type: "period.create",
    title: "Week two",
    startsOn: "2026-10-12",
    endsOn: "2026-10-18",
  });
  await executeCommand(uid, {
    type: "period.assign",
    id: task.id,
    periodId: p1!.id,
  });
  await executeCommand(uid, {
    type: "period.assign",
    id: task.id,
    periodId: p2!.id,
  });
  await executeCommand(uid, {
    type: "period.assign",
    id: task.id,
    periodId: p2!.id,
  });
  assert.equal(await db.taskPeriod.count({ where: { taskId: task.id } }), 2);
  await executeCommand(uid, {
    type: "period.remove",
    id: task.id,
    periodId: p1!.id,
  });
  assert.equal(await db.taskPeriod.count({ where: { taskId: task.id } }), 2);
  assert.equal(
    await db.taskPeriod.count({ where: { taskId: task.id, removedAt: null } }),
    1,
  );
});
test("required fields roll back capture; template revisions leave original values intact", async () => {
  const template = (await executeCommand(uid, {
    type: "template.create",
    name: "Test template",
    fields: [
      { key: "count", label: "Count", fieldType: "NUMBER", required: true },
    ],
  }))!;
  const def = await db.taskTemplateField.findFirstOrThrow({
    where: { templateId: template.id },
  });
  await assert.rejects(
    executeCommand(uid, {
      type: "task.create",
      title: "Must roll back",
      templateId: template.id,
      fields: {},
    }),
    /required/,
  );
  assert.equal(
    await db.task.count({ where: { userId: uid, title: "Must roll back" } }),
    0,
  );
  const task = (await executeCommand(uid, {
    type: "task.create",
    title: "Typed value",
    templateId: template.id,
    fields: { [def.id]: 0 },
  }))!;
  await executeCommand(uid, {
    type: "template.create",
    name: "Test template",
    fields: [{ key: "notes", label: "Notes", fieldType: "LONG_TEXT" }],
  });
  assert.equal(
    (await db.task.findUniqueOrThrow({ where: { id: task.id } })).templateId,
    template.id,
  );
  assert.equal(
    (
      await db.taskFieldValue.findFirstOrThrow({ where: { taskId: task.id } })
    ).numberValue?.toNumber(),
    0,
  );
});
test("journal is independent and supports owner-checked associations", async () => {
  const journal = (await executeCommand(uid, {
    type: "journal.save",
    title: "A thought",
    content: "No task required.",
    occurredAt: "2026-10-11T09:00:00Z",
  }))!;
  assert.ok(
    await db.journalEntry.findFirst({ where: { id: journal.id, userId: uid } }),
  );
  await assert.rejects(
    executeCommand(other.id, {
      type: "journal.save",
      id: journal.id,
      title: "Overwrite",
      content: "No",
      occurredAt: "2026-10-11T09:00:00Z",
    }),
    /not found/,
  );
});

test("activity logging supports repeated dated entries with optional time and owner validation", async () => {
  const category = await db.category.create({
    data: { userId: uid, name: "Tracker tests", slug: "tracker-tests" },
  });
  const created = await executeCommand(uid, {
    type: "activity.log",
    title: "Practice",
    primaryCategoryId: category.id,
    occurredOn: "2026-01-02",
    note: "First session",
  });
  const id = created!.id;
  await executeCommand(uid, {
    type: "activity.log",
    taskId: id,
    primaryCategoryId: category.id,
    occurredOn: "2026-01-03",
    minutes: 25,
    note: "Second session",
    complete: true,
  });
  const task = await db.task.findUniqueOrThrow({
    where: { id },
    include: { effort: true, events: true },
  });
  assert.equal(task.plannedDate, null);
  assert.equal(task.status, "COMPLETED");
  assert.equal(task.effort.length, 1);
  assert.equal(task.effort[0].minutes, 25);
  const logs = task.events.filter((e) => e.eventType === "EFFORT_RECORDED");
  assert.equal(logs.length, 2);
  assert.equal(
    (
      logs.find(
        (e) =>
          (e.toValue as { occurredOn: string }).occurredOn === "2026-01-02",
      )!.toValue as { minutes: number | null }
    ).minutes,
    null,
  );
  await assert.rejects(
    executeCommand(other.id, {
      type: "activity.log",
      taskId: id,
      primaryCategoryId: category.id,
      occurredOn: "2026-01-03",
    }),
    /Category unavailable/,
  );
  await assert.rejects(
    executeCommand(uid, {
      type: "activity.log",
      title: "Future activity",
      primaryCategoryId: category.id,
      occurredOn: "2999-01-01",
    }),
    /Future work/,
  );
  assert.equal(
    await db.task.count({ where: { userId: uid, title: "Future activity" } }),
    0,
  );
});

test("repeat series preserve occurrence identity and completion while supporting scoped edits and schedule changes", async () => {
  const { addDays, dateKey } = await import("../src/lib/domain");
  const { ensureRecurringTasks } = await import(
    "../src/lib/recurrence-service"
  );
  const today = dateKey(new Date(), "Asia/Kolkata");
  const created = await executeCommand(uid, {
    type: "task.create",
    title: "Repeat test",
    plannedDate: today,
    color: "blue",
    icon: "book",
    repeat: { unit: "DAY", interval: 1, endsOn: addDays(today, 10) },
  });
  let original = await db.task.findUniqueOrThrow({
    where: { id: created!.id },
  });
  const sid = original.seriesId!;
  assert.ok(sid);
  assert.equal(await db.task.count({ where: { seriesId: sid } }), 11);
  await Promise.all([
    ensureRecurringTasks(uid, today),
    ensureRecurringTasks(uid, today),
  ]);
  assert.equal(await db.task.count({ where: { seriesId: sid } }), 11);
  await executeCommand(uid, {
    type: "task.status",
    id: original.id,
    version: original.version,
    status: "COMPLETED",
  });
  const second = await db.task.findFirstOrThrow({
    where: {
      seriesId: sid,
      recurrenceDate: new Date(addDays(today, 1) + "T00:00:00Z"),
    },
  });
  await executeCommand(uid, {
    type: "task.update",
    id: second.id,
    version: second.version,
    title: "Only this one",
    status: "PLANNED",
    plannedDate: addDays(today, 1),
    color: "rose",
    icon: "heart",
  });
  let series = await db.taskSeries.findUniqueOrThrow({ where: { id: sid } });
  original = await db.task.findUniqueOrThrow({ where: { id: original.id } });
  await executeCommand(uid, {
    type: "task.update",
    id: original.id,
    version: original.version,
    scope: "ALL",
    seriesVersion: series.version,
    title: "Whole series",
    status: "PLANNED",
    color: "purple",
    icon: "star",
  });
  const all = await db.task.findMany({ where: { seriesId: sid } });
  assert.ok(
    all.every(
      (t) =>
        t.title === "Whole series" && t.color === "purple" && t.icon === "star",
    ),
  );
  assert.equal(all.find((t) => t.id === original.id)!.status, "COMPLETED");
  assert.equal(
    all
      .find((t) => t.id === second.id)!
      .plannedDate!.toISOString()
      .slice(0, 10),
    addDays(today, 1),
  );
  assert.ok(all.find((t) => t.id === second.id)!.isException);
  series = await db.taskSeries.findUniqueOrThrow({ where: { id: sid } });
  await executeCommand(uid, {
    type: "series.schedule",
    id: sid,
    version: series.version,
    repeat: { unit: "WEEK", interval: 1, endsOn: addDays(today, 120) },
    active: true,
  });
  const remaining = await db.task.findMany({
    where: { seriesId: sid, archivedAt: null },
    orderBy: { plannedDate: "asc" },
  });
  assert.ok(remaining.some((t) => t.id === second.id));
  assert.equal(
    remaining.find((t) => t.id === original.id)!.status,
    "COMPLETED",
  );
  assert.ok(
    remaining
      .filter((t) => t.id !== second.id)
      .every(
        (t) =>
          Math.round(
            (t.plannedDate!.getTime() -
              new Date(today + "T00:00:00Z").getTime()) /
              86400000,
          ) %
            7 ===
          0,
      ),
  );
  await ensureRecurringTasks(uid, today, addDays(today, 120));
  assert.ok(
    (
      await db.task.findMany({ where: { seriesId: sid, archivedAt: null } })
    ).every((t) => t.title === "Whole series" && t.color === "purple"),
  );
  series = await db.taskSeries.findUniqueOrThrow({ where: { id: sid } });
  await executeCommand(uid, {
    type: "series.schedule",
    id: sid,
    version: series.version,
    repeat: { unit: "WEEK", interval: 1, endsOn: addDays(today, 120) },
    active: false,
  });
  assert.equal(
    await db.task.count({ where: { seriesId: sid, archivedAt: null } }),
    2,
  );
  await assert.rejects(
    executeCommand(other.id, {
      type: "series.schedule",
      id: sid,
      version: 0,
      repeat: { unit: "DAY", interval: 1 },
      active: true,
    }),
    /not found/,
  );
  await assert.rejects(
    executeCommand(uid, {
      type: "task.create",
      title: "Bad repeat",
      plannedDate: today,
      repeat: { unit: "DAY", interval: 1, endsOn: addDays(today, -1) },
    }),
    /end/,
  );
  assert.equal(
    await db.task.count({ where: { userId: uid, title: "Bad repeat" } }),
    0,
  );
});

test("repeat occurrences copy typed fields and links, while manually archived occurrences stay archived", async () => {
  const { addDays, dateKey } = await import("../src/lib/domain");
  const { ensureRecurringTasks } = await import(
    "../src/lib/recurrence-service"
  );
  const today = dateKey(new Date(), "Asia/Kolkata");
  const template = await executeCommand(uid, {
    type: "template.create",
    name: "Repeat template",
    fields: [
      { key: "focus", label: "Focus", fieldType: "TEXT", required: true },
    ],
  });
  const field = await db.taskTemplateField.findFirstOrThrow({
    where: { templateId: template!.id },
  });
  const tag = await db.tag.create({
    data: { userId: uid, name: "repeat test", slug: "repeat-test" },
  });
  const result = await executeCommand(uid, {
    type: "task.create",
    title: "Typed repeat",
    plannedDate: today,
    templateId: template!.id,
    fields: { [field.id]: "Breathing" },
    tagIds: [tag.id],
    repeat: { unit: "DAY", interval: 1, endsOn: addDays(today, 2) },
  });
  const first = await db.task.findUniqueOrThrow({ where: { id: result!.id } });
  const generated = await db.task.findFirstOrThrow({
    where: { seriesId: first.seriesId, id: { not: first.id } },
    include: { fieldValues: true, tags: true },
  });
  assert.equal(generated.fieldValues[0].textValue, "Breathing");
  assert.equal(generated.tags[0].tagId, tag.id);
  await executeCommand(uid, {
    type: "task.archive",
    id: generated.id,
    version: generated.version,
    archived: true,
  });
  let series = await db.taskSeries.findUniqueOrThrow({
    where: { id: first.seriesId! },
  });
  await executeCommand(uid, {
    type: "series.schedule",
    id: series.id,
    version: series.version,
    repeat: { unit: "DAY", interval: 1, endsOn: addDays(today, 2) },
    active: false,
  });
  series = await db.taskSeries.findUniqueOrThrow({ where: { id: series.id } });
  await executeCommand(uid, {
    type: "series.schedule",
    id: series.id,
    version: series.version,
    repeat: { unit: "DAY", interval: 1, endsOn: addDays(today, 2) },
    active: true,
  });
  await ensureRecurringTasks(uid, today);
  assert.ok(
    (await db.task.findUniqueOrThrow({ where: { id: generated.id } }))
      .archivedAt,
  );
  assert.equal(
    await db.task.count({ where: { seriesId: series.id, archivedAt: null } }),
    2,
  );
  await assert.rejects(
    executeCommand(uid, {
      type: "series.schedule",
      id: series.id,
      version: series.version,
      repeat: { unit: "DAY", interval: 1 },
      active: false,
    }),
    /changed/,
  );
});

test("whole-series metadata edits do not promote an occurrence’s custom values into future defaults", async () => {
  const { addDays, dateKey } = await import("../src/lib/domain");
  const today = dateKey(new Date(), "Asia/Kolkata");
  const template = await executeCommand(uid, {
    type: "template.create",
    name: "Repeat default isolation",
    fields: [
      { key: "focus", label: "Focus", fieldType: "TEXT", required: true },
    ],
  });
  const field = await db.taskTemplateField.findFirstOrThrow({
    where: { templateId: template!.id },
  });
  const result = await executeCommand(uid, {
    type: "task.create",
    title: "Default isolation",
    plannedDate: today,
    templateId: template!.id,
    fields: { [field.id]: "Original" },
    repeat: { unit: "DAY", interval: 1, endsOn: today },
  });
  const t = await db.task.findUniqueOrThrow({ where: { id: result!.id } });
  await executeCommand(uid, {
    type: "task.fields",
    id: t.id,
    fields: { [field.id]: "One occurrence only" },
  });
  let series = await db.taskSeries.findUniqueOrThrow({
    where: { id: t.seriesId! },
  });
  await executeCommand(uid, {
    type: "task.update",
    id: t.id,
    version: t.version,
    scope: "ALL",
    seriesVersion: series.version,
    title: "Shared new title",
    status: "PLANNED",
  });
  series = await db.taskSeries.findUniqueOrThrow({ where: { id: series.id } });
  await executeCommand(uid, {
    type: "series.schedule",
    id: series.id,
    version: series.version,
    repeat: { unit: "DAY", interval: 1, endsOn: addDays(today, 1) },
    active: true,
  });
  const future = await db.task.findFirstOrThrow({
    where: { seriesId: series.id, id: { not: t.id } },
    include: { fieldValues: true },
  });
  assert.equal(future.title, "Shared new title");
  assert.equal(future.fieldValues[0].textValue, "Original");
});
