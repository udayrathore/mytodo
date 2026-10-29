import "dotenv/config";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createECDH } from "node:crypto";
import { database } from "../src/lib/db";
import { executeCommand } from "../src/lib/commands";
import { addDays, dateKey } from "../src/lib/domain";
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
test("bulk overdue rescheduling covers every page and preserves scope, closed tasks, dates and history", async () => {
  const { getWorkspace } = await import("../src/lib/workspace");
  const owner = await db.user.create({
    data: {
      email: `bulk-overdue-${run}@example.test`,
      name: "Bulk overdue regression",
      timezone: "Asia/Kolkata",
    },
  });
  const today = dateKey(new Date(), owner.timezone);
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, 1);
  const parent = await db.category.create({
    data: { userId: owner.id, name: "Work", slug: "work" },
  });
  const child = await db.category.create({
    data: {
      userId: owner.id,
      name: "Work child",
      slug: "work-child",
      parentId: parent.id,
    },
  });
  const personal = await db.category.create({
    data: { userId: owner.id, name: "Personal", slug: "personal" },
  });
  const hiddenWork = await db.category.create({
    data: {
      userId: owner.id,
      name: "Hidden work",
      slug: "hidden-work",
      parentId: parent.id,
      isActive: false,
    },
  });
  const tag = await db.tag.create({
    data: { userId: owner.id, name: "Bulk label", slug: "bulk-label" },
  });
  const project = await db.entity.create({
    data: {
      userId: owner.id,
      name: "Bulk project",
      type: "PROJECT",
    },
  });
  const entity = await db.entity.create({
    data: {
      userId: owner.id,
      name: "Bulk entity",
      type: "PERSON",
    },
  });
  const workOwner = await db.user.update({
    where: { id: owner.id },
    data: { workModeEnabled: true, workCategoryIds: [parent.id] },
  });
  const dueAt = new Date(`${yesterday}T07:30:00Z`);
  const create = async (
    title: string,
    extra: Record<string, unknown> = {},
    omit: "tag" | "entity" | "project" | null = null,
  ) =>
    db.task.create({
      data: {
        userId: owner.id,
        title,
        plannedDate: new Date(yesterday),
        dueAt,
        primaryCategoryId: child.id,
        status: "PLANNED",
        ...extra,
        tags:
          omit === "tag"
            ? undefined
            : { create: { userId: owner.id, tagId: tag.id } },
        entities: {
          create: [
            ...(omit === "project"
              ? []
              : [
                  {
                    userId: owner.id,
                    entityId: project.id,
                    relationshipType: "CONTRIBUTES_TO",
                  },
                ]),
            ...(omit === "entity"
              ? []
              : [
                  {
                    userId: owner.id,
                    entityId: entity.id,
                    relationshipType: "RELATED_TO",
                  },
                ]),
          ],
        },
      },
    });
  const matching = [];
  // More than one workspace page, with different open statuses.
  for (let index = 0; index < 105; index++)
    matching.push(
      await create(`Bulk matching ${index}`, {
        status: index % 2 ? "INBOX" : "PLANNED",
      }),
    );
  const exceptions = [
    await create("Bulk matching completed", {
      status: "COMPLETED",
      completedAt: new Date(),
    }),
    await create("Bulk matching cancelled", {
      status: "CANCELLED",
      cancelledAt: new Date(),
    }),
    await create("Bulk matching archived", { archivedAt: new Date() }),
    await create("Bulk matching today", { plannedDate: new Date(today) }),
    await create("Bulk matching future", { plannedDate: new Date(tomorrow) }),
    await create("Bulk matching undated", { plannedDate: null }),
    await create("Bulk matching personal", { primaryCategoryId: personal.id }),
    await create("Bulk matching hidden work", {
      primaryCategoryId: hiddenWork.id,
    }),
    await create("Unrelated text"),
    await create("Bulk matching without tag", {}, "tag"),
    await create("Bulk matching without entity", {}, "entity"),
    await create("Bulk matching without project", {}, "project"),
  ];
  const foreign = await db.task.create({
    data: {
      userId: other.id,
      title: "Bulk matching foreign",
      plannedDate: new Date(yesterday),
      status: "PLANNED",
    },
  });
  const query = {
    view: "today" as const,
    dashboard: "execute" as const,
    category: parent.id,
    search: "bulk matching",
    tag: tag.id,
    entity: entity.id,
    project: project.id,
    status: "OPEN" as const,
  };
  const page = await getWorkspace(workOwner, query);
  assert.equal(page.tasks.length, 100);
  assert.ok(page.page?.nextCursor);
  assert.equal(page.page?.overdueCount, 105);
  assert.deepEqual(page.page?.scope, {
    category: parent.id,
    search: "bulk matching",
    tag: tag.id,
    entity: entity.id,
    project: project.id,
    status: "OPEN",
  });
  const secondPage = await getWorkspace(workOwner, {
    ...query,
    cursor: page.page!.nextCursor!,
  });
  assert.equal(secondPage.page?.overdueCount, 105);
  assert.deepEqual(secondPage.page?.scope, page.page?.scope);
  const command = {
    type: "tasks.rescheduleOverdue",
    plannedDate: tomorrow,
    scope: {
      category: parent.id,
      tag: tag.id,
      entity: entity.id,
      project: project.id,
      search: "bulk MATCHING",
      status: "OPEN",
    },
  };
  const key = randomUUID();
  const result = await executeCommand(owner.id, command, key);
  assert.equal(result && "count" in result ? result.count : undefined, 105);
  const afterBulk = await getWorkspace(workOwner, query);
  assert.equal(afterBulk.page?.overdueCount, 0);
  assert.deepEqual(afterBulk.page?.scope, page.page?.scope);
  const moved = await db.task.findMany({
    where: { id: { in: matching.map((task) => task.id) } },
  });
  assert.equal(moved.length, 105);
  assert.ok(
    moved.every(
      (task) =>
        task.plannedDate?.toISOString().slice(0, 10) === tomorrow &&
        task.version === 1 &&
        task.status === "PLANNED" &&
        task.dueAt?.toISOString() === dueAt.toISOString(),
    ),
  );
  const history = await db.taskEvent.findMany({
    where: { userId: owner.id, eventType: "RESCHEDULED" },
  });
  assert.equal(history.length, 105);
  assert.ok(
    history.every(
      (event) =>
        (event.toValue as { plannedDate: string }).plannedDate === tomorrow,
    ),
  );
  assert.deepEqual(await executeCommand(owner.id, command, key), result);
  assert.equal(
    await db.taskEvent.count({
      where: { userId: owner.id, eventType: "RESCHEDULED" },
    }),
    105,
  );
  for (const task of [...exceptions, foreign])
    assert.deepEqual(
      await db.task.findUniqueOrThrow({ where: { id: task.id } }),
      task,
      task.title,
    );
  // Invalid target/scope fails before any part of the operation commits.
  await assert.rejects(
    executeCommand(owner.id, { ...command, plannedDate: yesterday }),
    /today or a future/,
  );
  await assert.rejects(
    executeCommand(other.id, command),
    /Category unavailable/,
  );
  assert.deepEqual(
    await db.task.findMany({
      where: { id: { in: matching.map((task) => task.id) } },
    }),
    moved,
  );
  const statusSelected = await create("Status scope selected", {
    status: "DEFERRED",
  });
  const statusExcluded = await create("Status scope excluded", {
    status: "IN_PROGRESS",
  });
  await executeCommand(owner.id, {
    type: "tasks.rescheduleOverdue",
    plannedDate: today,
    scope: { status: "DEFERRED", search: "Status scope" },
  });
  assert.equal(
    (
      await db.task.findUniqueOrThrow({ where: { id: statusSelected.id } })
    ).plannedDate
      ?.toISOString()
      .slice(0, 10),
    today,
  );
  assert.deepEqual(
    await db.task.findUniqueOrThrow({ where: { id: statusExcluded.id } }),
    statusExcluded,
  );
});
test("bulk rescheduling keeps recurring identities and future occurrences unchanged", async () => {
  const { getWorkspace } = await import("../src/lib/workspace");
  const owner = await db.user.create({
    data: {
      email: `bulk-repeat-${run}@example.test`,
      name: "Bulk repeat regression",
      timezone: "Asia/Kolkata",
    },
  });
  const today = dateKey(new Date(), owner.timezone);
  const yesterday = addDays(today, -1);
  const target = addDays(today, 2);
  await executeCommand(owner.id, {
    type: "task.create",
    title: "Bulk recurring occurrence",
    plannedDate: yesterday,
    dueAt: `${yesterday}T12:00:00Z`,
    repeat: { unit: "DAY", interval: 1, endsOn: target },
  });
  const before = await db.task.findMany({
    where: { userId: owner.id },
    orderBy: { recurrenceDate: "asc" },
  });
  const overdue = before.filter((task) => task.plannedDate! < new Date(today));
  assert.ok(overdue.length > 0);
  const beforeWorkspace = await getWorkspace(owner, {
    view: "today",
    dashboard: "execute",
  });
  assert.equal(beforeWorkspace.page?.overdueCount, overdue.length);
  await executeCommand(owner.id, {
    type: "tasks.rescheduleOverdue",
    plannedDate: target,
  });
  const afterWorkspace = await getWorkspace(owner, {
    view: "today",
    dashboard: "execute",
  });
  assert.equal(afterWorkspace.page?.overdueCount, 0);
  for (const task of before) {
    const after = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    if (overdue.some((old) => old.id === task.id)) {
      assert.equal(after.plannedDate?.toISOString().slice(0, 10), target);
      assert.equal(
        after.recurrenceDate?.toISOString(),
        task.recurrenceDate?.toISOString(),
      );
      assert.equal(after.isException, true);
      assert.equal(after.dueAt?.toISOString(), task.dueAt?.toISOString());
      assert.equal(after.version, task.version + 1);
    } else assert.deepEqual(after, task);
  }
  const { ensureRecurringTasks } =
    await import("../src/lib/recurrence-service");
  await ensureRecurringTasks(owner.id, today, target, yesterday);
  assert.equal(
    await db.task.count({ where: { userId: owner.id } }),
    before.length,
  );
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
  const { ensureRecurringTasks } =
    await import("../src/lib/recurrence-service");
  const today = dateKey(new Date(), "Asia/Kolkata");
  const created = await executeCommand(uid, {
    type: "task.create",
    title: "Repeat test",
    plannedDate: today,

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
  });
  const all = await db.task.findMany({ where: { seriesId: sid } });
  assert.ok(all.every((t) => t.title === "Whole series"));
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
    ).every((t) => t.title === "Whole series"),
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

test("repeat occurrences copy links, while manually archived occurrences stay archived", async () => {
  const { addDays, dateKey } = await import("../src/lib/domain");
  const { ensureRecurringTasks } =
    await import("../src/lib/recurrence-service");
  const today = dateKey(new Date(), "Asia/Kolkata");
  const tag = await db.tag.create({
    data: { userId: uid, name: "repeat test", slug: "repeat-test" },
  });
  const result = await executeCommand(uid, {
    type: "task.create",
    title: "Typed repeat",
    plannedDate: today,
    tagIds: [tag.id],
    repeat: { unit: "DAY", interval: 1, endsOn: addDays(today, 2) },
  });
  const first = await db.task.findUniqueOrThrow({ where: { id: result!.id } });
  const generated = await db.task.findFirstOrThrow({
    where: { seriesId: first.seriesId, id: { not: first.id } },
    include: { fieldValues: true, tags: true },
  });
  assert.equal(generated.fieldValues.length, 0);
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

test("project links can be added from task creation and editing, retained on edits, and removed", async () => {
  const category = await executeCommand(uid, {
    type: "category.save",
    name: "Project link regression",
    parentId: null,
    sortOrder: 0,
    isActive: true,
  });
  const project = await executeCommand(uid, {
    type: "project.save",
    name: "Linked project",
    categoryIds: [category!.id],
    description: "",
  });
  const task = await executeCommand(uid, {
    type: "task.create",
    title: "Project-linked task",
    entityIds: [project!.id],
    primaryCategoryId: category!.id,
  });
  assert.equal(
    await db.taskEntityLink.count({
      where: { taskId: task!.id, entityId: project!.id },
    }),
    1,
  );
  const current = await db.task.findUniqueOrThrow({ where: { id: task!.id } });
  await executeCommand(uid, {
    type: "task.update",
    id: current.id,
    version: current.version,
    title: "Edited linked task",
    status: current.status,
    primaryCategoryId: category!.id,
    entityIds: [project!.id],
    urgency: 8,
    importance: 3,
  });
  assert.equal(
    await db.taskEntityLink.count({
      where: { taskId: current.id, entityId: project!.id },
    }),
    1,
  );
  await executeCommand(uid, {
    type: "project.linkTask",
    id: project!.id,
    taskId: current.id,
    linked: false,
  });
  assert.equal(
    await db.taskEntityLink.count({
      where: { taskId: current.id, entityId: project!.id },
    }),
    0,
  );
  await executeCommand(uid, {
    type: "project.linkTask",
    id: project!.id,
    taskId: current.id,
    linked: true,
  });
  assert.equal(
    await db.taskEntityLink.count({
      where: { taskId: current.id, entityId: project!.id },
    }),
    1,
  );
  await assert.rejects(
    executeCommand(other.id, {
      type: "project.linkTask",
      id: project!.id,
      taskId: current.id,
      linked: true,
    }),
    /unavailable/,
  );
});
test("Execute keeps completed tasks after open tasks and sorts priorities across page boundaries", async () => {
  const { getWorkspace } = await import("../src/lib/workspace");
  const { dateKey } = await import("../src/lib/domain");
  const owner = await db.user.findUniqueOrThrow({ where: { id: uid } }),
    today = dateKey(new Date(), owner.timezone);
  const category = await executeCommand(uid, {
    type: "category.save",
    name: "Priority page regression",
    parentId: null,
    sortOrder: 0,
    isActive: true,
  });
  await db.task.createMany({
    data: Array.from({ length: 105 }, (_, i) => ({
      userId: uid,
      title: `Priority ${i}`,
      plannedDate: new Date(today),
      status: "PLANNED",
      primaryCategoryId: category!.id,
      urgency: i % 11,
      importance: 10 - (i % 11),
    })),
  });
  const done = await db.task.create({
    data: {
      userId: uid,
      title: "Completed priority task",
      plannedDate: new Date(today),
      status: "COMPLETED",
      completedAt: new Date(),
      primaryCategoryId: category!.id,
      urgency: 10,
      importance: 10,
    },
  });
  const read = (input: Record<string, unknown>) =>
    getWorkspace(owner, {
      view: "today",
      dashboard: "execute",
      category: category!.id,
      ...input,
    });
  const first = await read({ sort: "urgency", direction: "desc" });
  assert.equal(first.tasks.length, 100);
  assert.ok(first.tasks.every((t) => t.status !== "COMPLETED"));
  assert.ok(
    first.tasks.every((t, i, a) => i === 0 || a[i - 1].urgency >= t.urgency),
  );
  const next = await read({
    sort: "urgency",
    direction: "desc",
    cursor: first.page!.nextCursor,
  });
  assert.equal(next.tasks.length, 6);
  assert.equal(next.tasks.at(-1)!.id, done.id);
  assert.equal(
    new Set([...first.tasks, ...next.tasks].map((t) => t.id)).size,
    106,
  );
  assert.ok(first.tasks.at(-1)!.urgency >= next.tasks[0].urgency);
  const low = await read({ sort: "importance", direction: "asc" });
  assert.ok(
    low.tasks.every(
      (t, i, a) => i === 0 || a[i - 1].importance <= t.importance,
    ),
  );
  const todayView = await getWorkspace(owner, {
    view: "today",
    dashboard: "execute",
    search: "Completed priority task",
  });
  assert.ok(todayView.tasks.some((t) => t.id === done.id));
});
test("move to tomorrow extends the due date, rejects stale writes, and preserves other repeat occurrences", async () => {
  const { tomorrowDate, nextDayDueDate } =
    await import("../src/lib/task-scheduling");
  const { dateKey } = await import("../src/lib/domain");
  const owner = await db.user.findUniqueOrThrow({ where: { id: uid } });
  const today = dateKey(new Date(), owner.timezone);
  const created = await executeCommand(uid, {
    type: "task.create",
    title: "Tomorrow regression",
    plannedDate: today,
    dueAt: new Date().toISOString(),
    repeat: { unit: "DAY", interval: 1, endsOn: null },
  });
  const task = await db.task.findUniqueOrThrow({ where: { id: created!.id } });
  const before = await db.task.findMany({
    where: { seriesId: task.seriesId!, id: { not: task.id } },
    orderBy: { id: "asc" },
  });
  await executeCommand(uid, {
    type: "task.tomorrow",
    id: task.id,
    version: task.version,
  });
  const moved = await db.task.findUniqueOrThrow({ where: { id: task.id } });
  assert.equal(
    moved.plannedDate?.toISOString().slice(0, 10),
    tomorrowDate(owner.timezone),
  );
  assert.equal(
    moved.dueAt?.toISOString(),
    nextDayDueDate(task.dueAt, owner.timezone)?.toISOString(),
  );
  assert.equal(moved.isException, true);
  assert.equal(
    moved.recurrenceDate?.toISOString(),
    task.recurrenceDate?.toISOString(),
  );
  assert.deepEqual(
    await db.task.findMany({
      where: { seriesId: task.seriesId!, id: { not: task.id } },
      orderBy: { id: "asc" },
    }),
    before,
  );
  await assert.rejects(
    executeCommand(uid, {
      type: "task.tomorrow",
      id: task.id,
      version: task.version,
    }),
    /changed/,
  );
  const event = await db.taskEvent.findFirstOrThrow({
    where: { taskId: task.id, eventType: "RESCHEDULED" },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(event.toValue);
  const undated = await executeCommand(uid, {
    type: "task.create",
    title: "Unscheduled tomorrow regression",
  });
  await executeCommand(uid, {
    type: "task.tomorrow",
    id: undated!.id,
    version: 0,
  });
  const scheduled = await db.task.findUniqueOrThrow({
    where: { id: undated!.id },
  });
  assert.equal(scheduled.status, "PLANNED");
  assert.equal(scheduled.dueAt, null);
});

test("Execute includes the full pending backlog across pages without moving Plan dates", async () => {
  const { getWorkspace } = await import("../src/lib/workspace");
  const { addDays, dateKey } = await import("../src/lib/domain");
  const owner = await db.user.create({
    data: {
      email: `pending-${run}@example.test`,
      name: "Pending regression",
      timezone: "Asia/Kolkata",
    },
  });
  const today = dateKey(new Date(), owner.timezone);
  const category = await db.category.create({
    data: { userId: owner.id, name: "Work pending", slug: "work-pending" },
  });
  const personal = await db.category.create({
    data: { userId: owner.id, name: "Other pending", slug: "other-pending" },
  });
  const make = (
    title: string,
    plannedDate: string | null,
    status:
      | "PLANNED"
      | "INBOX"
      | "IN_PROGRESS"
      | "COMPLETED"
      | "CANCELLED" = "PLANNED",
    extra = {},
  ) =>
    db.task.create({
      data: {
        userId: owner.id,
        title,
        primaryCategoryId: category.id,
        plannedDate: plannedDate ? new Date(plannedDate) : null,
        status,
        ...(status === "COMPLETED" ? { completedAt: new Date() } : {}),
        ...(status === "CANCELLED" ? { cancelledAt: new Date() } : {}),
        ...extra,
      },
    });
  const overdue = await make("Old pending task", addDays(today, -30));
  const current = await make("Current pending task", today, "IN_PROGRESS");
  const undated = await make("Undated pending task", null, "INBOX");
  const future = await make("Future task", addDays(today, 1));
  const done = await make("Completed today", today, "COMPLETED");
  const oldDone = await make(
    "Completed earlier",
    addDays(today, -1),
    "COMPLETED",
    { completedAt: new Date(`${addDays(today, -1)}T12:00:00Z`) },
  );
  const undatedDone = await make("Completed undated", null, "COMPLETED", {
    completedAt: new Date(`${addDays(today, -1)}T12:00:00Z`),
  });
  const cancelled = await make(
    "Cancelled pending",
    addDays(today, -1),
    "CANCELLED",
  );
  const archived = await make(
    "Archived pending",
    addDays(today, -1),
    "PLANNED",
    { archivedAt: new Date() },
  );
  const excluded = await make(
    "Outside Work mode",
    addDays(today, -1),
    "PLANNED",
    { primaryCategoryId: personal.id },
  );
  await db.task.createMany({
    data: Array.from({ length: 101 }, (_, i) => ({
      userId: owner.id,
      title: `Earlier backlog ${i}`,
      primaryCategoryId: category.id,
      plannedDate: new Date(addDays(today, -2)),
      status: "PLANNED" as const,
    })),
  });
  const workOwner = {
    ...owner,
    workModeEnabled: true,
    workCategoryIds: [category.id],
  };
  const first = await getWorkspace(workOwner, {
    view: "today",
    dashboard: "execute",
  });
  assert.equal(first.tasks.length, 100);
  assert.ok(first.tasks.every((t) => t.status !== "COMPLETED"));
  assert.ok(first.page?.nextCursor);
  const second = await getWorkspace(workOwner, {
    view: "today",
    dashboard: "execute",
    cursor: first.page!.nextCursor!,
  });
  const loaded = [...first.tasks, ...second.tasks];
  assert.equal(loaded.length, 104);
  assert.equal(new Set(loaded.map((t) => t.id)).size, 104);
  assert.equal(loaded.at(-1)!.id, done.id);
  for (const task of [overdue, current])
    assert.ok(
      loaded.some((t) => t.id === task.id),
      task.title,
    );
  for (const task of [
    undated,
    future,
    oldDone,
    undatedDone,
    cancelled,
    archived,
    excluded,
  ])
    assert.ok(!loaded.some((t) => t.id === task.id), task.title);
  assert.ok(!second.page?.nextCursor);
  // Explicit collection browsing retains its existing ability to show future work.
  const scoped = await getWorkspace(workOwner, {
    view: "today",
    dashboard: "execute",
    category: category.id,
    search: "Future task",
  });
  assert.equal(scoped.tasks[0]?.id, future.id);
  const original = await db.task.findUniqueOrThrow({
    where: { id: overdue.id },
  });
  const oldPlan = await getWorkspace(workOwner, {
    view: "today",
    dashboard: "plan",
    from: addDays(today, -31),
    through: addDays(today, -25),
    search: "Old pending task",
  });
  assert.equal(
    oldPlan.tasks[0]?.plannedDate?.slice(0, 10),
    addDays(today, -30),
  );
  assert.deepEqual(
    await db.task.findUniqueOrThrow({ where: { id: overdue.id } }),
    original,
  );
  const currentPlan = await getWorkspace(workOwner, {
    view: "today",
    dashboard: "plan",
    from: today,
    through: addDays(today, 6),
  });
  assert.deepEqual(
    new Set(currentPlan.tasks.map((t) => t.id)),
    new Set([current.id, future.id, done.id]),
  );
  for (const task of [overdue, undated]) {
    await executeCommand(owner.id, {
      type: "task.status",
      id: task.id,
      version: task.version,
      status: "COMPLETED",
    });
  }
  const checkedOff = await getWorkspace(workOwner, {
    view: "today",
    dashboard: "execute",
    search: "pending task",
  });
  assert.equal(checkedOff.tasks.length, 2);
  assert.equal(checkedOff.tasks[0].id, current.id);
  assert.ok(
    checkedOff.tasks.slice(1).every((task) => task.status === "COMPLETED"),
  );
  for (const task of [overdue]) {
    const retained = checkedOff.tasks.find((row) => row.id === task.id)!;
    assert.ok(retained, task.title);
    assert.equal(
      retained.plannedDate?.slice(0, 10) ?? null,
      task.plannedDate?.toISOString().slice(0, 10) ?? null,
    );
  }
  const timezoneDone = await make(
    "Completed local day boundary",
    addDays(today, -2),
    "COMPLETED",
    {
      // 19:00 UTC yesterday is 00:30 today in Asia/Kolkata.
      completedAt: new Date(`${addDays(today, -1)}T19:00:00Z`),
    },
  );
  const localDay = await getWorkspace(workOwner, {
    view: "today",
    dashboard: "execute",
    search: "Completed local day boundary",
  });
  assert.equal(
    timezoneDone.completedAt?.toISOString(),
    new Date(`${addDays(today, -1)}T19:00:00Z`).toISOString(),
  );
  assert.equal(localDay.tasks[0]?.id, timezoneDone.id);
});

test("Plan keeps every dated repeat occurrence, while scheduling changes only the selected pending task", async () => {
  const { getWorkspace } = await import("../src/lib/workspace");
  const { addDays, dateKey } = await import("../src/lib/domain");
  const owner = await db.user.create({
    data: {
      email: `plan-position-${run}@example.test`,
      name: "Plan regression",
      timezone: "Asia/Kolkata",
    },
  });
  const today = dateKey(new Date(), owner.timezone);
  const created = await executeCommand(owner.id, {
    type: "task.create",
    title: "Keep dated repeat positions",
    plannedDate: addDays(today, -2),
    dueAt: `${addDays(today, -2)}T12:00:00Z`,
    repeat: { unit: "DAY", interval: 1, endsOn: addDays(today, 2) },
  });
  const before = await db.task.findMany({
    where: { userId: owner.id },
    orderBy: { plannedDate: "asc" },
  });
  // Attaching a repeat schedule to an older task does not invent missed
  // historical occurrences; compare every occurrence actually materialized.
  assert.ok(before.length >= 3);
  assert.ok(
    before.some(
      (t) => t.plannedDate?.toISOString().slice(0, 10) === addDays(today, -2),
    ),
  );
  assert.ok(
    before.some(
      (t) => t.plannedDate?.toISOString().slice(0, 10) === addDays(today, 1),
    ),
  );
  const plan = await getWorkspace(owner, {
    view: "today",
    dashboard: "plan",
    from: addDays(today, -2),
    through: addDays(today, 4),
  });
  assert.deepEqual(
    plan.tasks.map((t) => t.plannedDate?.slice(0, 10)).sort(),
    before.map((t) => t.plannedDate!.toISOString().slice(0, 10)).sort(),
  );
  assert.deepEqual(
    await db.task.findMany({
      where: { userId: owner.id },
      orderBy: { plannedDate: "asc" },
    }),
    before,
  );
  const selected = before.find((t) => t.id === created!.id)!;
  await executeCommand(owner.id, {
    type: "task.schedule",
    id: selected.id,
    version: selected.version,
    plannedDate: today,
  });
  const moved = await db.task.findUniqueOrThrow({ where: { id: selected.id } });
  assert.equal(moved.plannedDate?.toISOString().slice(0, 10), today);
  assert.equal(moved.dueAt?.toISOString(), selected.dueAt?.toISOString());
  assert.equal(
    moved.recurrenceDate?.toISOString(),
    selected.recurrenceDate?.toISOString(),
  );
  assert.equal(moved.isException, true);
  assert.deepEqual(
    await db.task.findMany({
      where: { userId: owner.id, id: { not: selected.id } },
      orderBy: { plannedDate: "asc" },
    }),
    before.filter((t) => t.id !== selected.id),
  );
  await assert.rejects(
    executeCommand(owner.id, {
      type: "task.schedule",
      id: selected.id,
      version: selected.version,
      plannedDate: today,
    }),
    /changed/,
  );
  for (const status of ["COMPLETED", "CANCELLED"] as const) {
    const closed = await db.task.create({
      data: {
        userId: owner.id,
        title: `${status} cannot move`,
        plannedDate: new Date(addDays(today, -1)),
        status,
        ...(status === "COMPLETED"
          ? { completedAt: new Date() }
          : { cancelledAt: new Date() }),
      },
    });
    await assert.rejects(
      executeCommand(owner.id, {
        type: "task.schedule",
        id: closed.id,
        version: closed.version,
        plannedDate: today,
      }),
      /Reopen/,
    );
  }
  const undated = await executeCommand(owner.id, {
    type: "task.create",
    title: "Undated move to today",
  });
  await executeCommand(owner.id, {
    type: "task.schedule",
    id: undated!.id,
    version: 0,
    plannedDate: today,
  });
  const scheduled = await db.task.findUniqueOrThrow({
    where: { id: undated!.id },
  });
  assert.equal(scheduled.status, "PLANNED");
  assert.equal(scheduled.plannedDate?.toISOString().slice(0, 10), today);
  await assert.rejects(
    executeCommand(other.id, {
      type: "task.schedule",
      id: scheduled.id,
      version: scheduled.version,
      plannedDate: today,
    }),
    /not found/,
  );
});

test("task checklist items stay nested, owner checked and versioned without automatic parent completion", async () => {
  const { getWorkspace } = await import("../src/lib/workspace");
  const { dateKey } = await import("../src/lib/domain");
  const owner = await db.user.create({
    data: {
      email: `checklist-${run}@example.test`,
      name: "Checklist owner",
      timezone: "Asia/Kolkata",
    },
  });
  const today = dateKey(new Date(), owner.timezone);
  const parent = await executeCommand(owner.id, {
    type: "task.create",
    title: "Checklist parent",
    description: "Parent description",
    plannedDate: today,
  });
  const second = await executeCommand(owner.id, {
    type: "task.create",
    title: "Other checklist parent",
    plannedDate: today,
  });
  const initialTaskCount = await db.task.count({ where: { userId: owner.id } });
  const first = await executeCommand(owner.id, {
    type: "task.checklist.add",
    id: parent!.id,
    version: 0,
    title: "First child",
  });
  assert.ok(first && "checklistItems" in first && first.checklistItems);
  assert.equal(first.version, 1);
  assert.equal(first.checklistItems.length, 1);
  const firstId = first.checklistItems[0].id;
  const added = await executeCommand(owner.id, {
    type: "task.checklist.add",
    id: parent!.id,
    version: first.version,
    title: "Second child",
  });
  assert.ok(added && "checklistItems" in added && added.checklistItems);
  const secondId = added.checklistItems[1].id;
  assert.deepEqual(
    added.checklistItems.map((item) => [
      item.title,
      item.isCompleted,
      item.sortOrder,
    ]),
    [
      ["First child", false, 0],
      ["Second child", false, 1],
    ],
  );
  assert.equal(
    await db.task.count({ where: { userId: owner.id } }),
    initialTaskCount,
  );
  const listed = await getWorkspace(owner, {
    view: "today",
    dashboard: "execute",
  });
  assert.ok(
    !listed.tasks.some((task) =>
      ["First child", "Second child"].includes(task.title),
    ),
  );
  const detail = await getWorkspace(owner, { view: "task", task: parent!.id });
  assert.equal(detail.tasks[0].description, "Parent description");
  assert.deepEqual(
    detail.tasks[0].checklistItems?.map((item) => item.id),
    [firstId, secondId],
  );
  await assert.rejects(
    executeCommand(other.id, {
      type: "task.checklist.update",
      id: parent!.id,
      version: 2,
      itemId: firstId,
      isCompleted: true,
    }),
    /not found/,
  );
  await assert.rejects(
    executeCommand(owner.id, {
      type: "task.checklist.update",
      id: second!.id,
      version: 0,
      itemId: firstId,
      title: "Moved illegally",
    }),
    /not found/,
  );
  await assert.rejects(
    executeCommand(owner.id, {
      type: "task.checklist.remove",
      id: parent!.id,
      version: 0,
      itemId: firstId,
    }),
    /changed/,
  );
  const checked = await executeCommand(owner.id, {
    type: "task.checklist.update",
    id: parent!.id,
    version: 2,
    itemId: firstId,
    title: "First child renamed",
    isCompleted: true,
  });
  assert.ok(checked && "checklistItems" in checked && checked.checklistItems);
  assert.equal(checked.version, 3);
  assert.equal(checked.checklistItems[0].title, "First child renamed");
  const checkedBoth = await executeCommand(owner.id, {
    type: "task.checklist.update",
    id: parent!.id,
    version: 3,
    itemId: secondId,
    isCompleted: true,
  });
  assert.ok(
    checkedBoth &&
      "checklistItems" in checkedBoth &&
      checkedBoth.checklistItems,
  );
  const stillOpen = await db.task.findUniqueOrThrow({
    where: { id: parent!.id },
  });
  assert.equal(stillOpen.status, "PLANNED");
  assert.equal(stillOpen.description, "Parent description");
  assert.equal(stillOpen.plannedDate?.toISOString().slice(0, 10), today);
  await executeCommand(owner.id, {
    type: "task.status",
    id: parent!.id,
    version: 4,
    status: "COMPLETED",
  });
  const unchecked = await executeCommand(owner.id, {
    type: "task.checklist.update",
    id: parent!.id,
    version: 5,
    itemId: firstId,
    isCompleted: false,
  });
  assert.ok(
    unchecked && "checklistItems" in unchecked && unchecked.checklistItems,
  );
  assert.equal(
    (await db.task.findUniqueOrThrow({ where: { id: parent!.id } })).status,
    "COMPLETED",
  );
  const removed = await executeCommand(owner.id, {
    type: "task.checklist.remove",
    id: parent!.id,
    version: 6,
    itemId: secondId,
  });
  assert.ok(removed && "checklistItems" in removed && removed.checklistItems);
  assert.deepEqual(
    removed.checklistItems.map((item) => item.id),
    [firstId],
  );
  await assert.rejects(
    executeCommand(owner.id, {
      type: "task.checklist.update",
      id: parent!.id,
      version: 7,
      itemId: firstId,
    }),
    /Choose a checklist change/,
  );
  const foreignParent = await executeCommand(other.id, {
    type: "task.create",
    title: "Foreign parent",
    plannedDate: today,
  });
  await assert.rejects(
    db.taskChecklistItem.create({
      data: {
        userId: owner.id,
        parentTaskId: foreignParent!.id,
        title: "Cross owner child",
      },
    }),
  );
});

test("undated tasks preserve description and remain retrievable without appearing in task lists", async () => {
  const { getWorkspace } = await import("../src/lib/workspace");
  const { dateKey } = await import("../src/lib/domain");
  const owner = await db.user.create({
    data: {
      email: `undated-hidden-${run}@example.test`,
      name: "Hidden date owner",
      timezone: "Asia/Kolkata",
    },
  });
  const category = await db.category.create({
    data: {
      userId: owner.id,
      name: "Hidden task category",
      slug: "hidden-task-category",
    },
  });
  const made = await executeCommand(owner.id, {
    type: "task.create",
    title: "Saved without a date",
    description: "Description is retained",
    primaryCategoryId: category.id,
  });
  const before = await db.task.findUniqueOrThrow({ where: { id: made!.id } });
  assert.equal(before.plannedDate, null);
  assert.equal(before.description, "Description is retained");
  for (const input of [
    { view: "today", dashboard: "execute" },
    { view: "today", dashboard: "plan" },
    { view: "tasks" },
    { view: "category", category: category.id },
    { view: "week" },
    { view: "projects" },
  ] as const) {
    const workspace = await getWorkspace(owner, input);
    assert.ok(
      !workspace.tasks.some((task) => task.id === made!.id),
      JSON.stringify(input),
    );
    assert.ok(!workspace.sidebarCounts?.some((count) => count.pending > 0));
  }
  const detail = await getWorkspace(owner, { view: "task", task: made!.id });
  assert.equal(detail.tasks[0].id, made!.id);
  assert.equal(detail.tasks[0].description, "Description is retained");
  const picker = await getWorkspace(owner, {
    view: "picker",
    search: "Saved without a date",
  });
  assert.equal(picker.tasks[0].id, made!.id);
  const foreign = await getWorkspace(other, { view: "task", task: made!.id });
  assert.equal(foreign.tasks.length, 0);
  await executeCommand(owner.id, {
    type: "task.schedule",
    id: made!.id,
    version: before.version,
    plannedDate: dateKey(new Date(), owner.timezone),
  });
  const dated = await getWorkspace(owner, {
    view: "today",
    dashboard: "execute",
  });
  assert.equal(dated.tasks[0].id, made!.id);
});

test("weekday and annual repeat presets persist and materialize their expected dates", async () => {
  const { addDays, dateKey } = await import("../src/lib/domain");
  const { ensureRecurringTasks } =
    await import("../src/lib/recurrence-service");
  const owner = await db.user.create({
    data: {
      email: `repeat-presets-${run}@example.test`,
      name: "Repeat presets",
      timezone: "Asia/Kolkata",
    },
  });
  const today = dateKey(new Date(), owner.timezone);
  const weekday = new Date(today + "T00:00:00Z").getUTCDay();
  const monday = addDays(today, (8 - weekday) % 7);
  const recurring = await executeCommand(owner.id, {
    type: "task.create",
    title: "Weekday routine",
    plannedDate: monday,
    repeat: { unit: "WEEKDAY", interval: 1, endsOn: addDays(monday, 10) },
  });
  const first = await db.task.findUniqueOrThrow({
    where: { id: recurring!.id },
    include: { series: true },
  });
  assert.equal(first.series?.unit, "WEEKDAY");
  assert.equal(first.series?.interval, 1);
  const weekdayRows = await db.task.findMany({
    where: { seriesId: first.seriesId },
    orderBy: { plannedDate: "asc" },
  });
  assert.deepEqual(
    weekdayRows.map((task) => task.plannedDate?.toISOString().slice(0, 10)),
    [0, 1, 2, 3, 4, 7, 8, 9, 10].map((offset) => addDays(monday, offset)),
  );
  assert.ok(
    weekdayRows.every(
      (task) => ![0, 6].includes(task.plannedDate!.getUTCDay()),
    ),
  );
  const annual = await executeCommand(owner.id, {
    type: "task.create",
    title: "Annual review",
    description: "Copied annual description",
    plannedDate: today,
    repeat: { unit: "MONTH", interval: 12, endsOn: null },
  });
  const annualTask = await db.task.findUniqueOrThrow({
    where: { id: annual!.id },
    include: { series: true },
  });
  assert.equal(annualTask.series?.unit, "MONTH");
  assert.equal(annualTask.series?.interval, 12);
  const anchor = new Date(today + "T00:00:00Z");
  const target = new Date(
    Date.UTC(anchor.getUTCFullYear() + 1, anchor.getUTCMonth(), 1),
  );
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(anchor.getUTCDate(), lastDay));
  const anniversary = target.toISOString().slice(0, 10);
  await ensureRecurringTasks(owner.id, today, anniversary, anniversary);
  const annualRows = await db.task.findMany({
    where: { seriesId: annualTask.seriesId },
    orderBy: { plannedDate: "asc" },
  });
  assert.deepEqual(
    annualRows.map((task) => task.plannedDate?.toISOString().slice(0, 10)),
    [today, anniversary],
  );
  assert.ok(
    annualRows.every(
      (task) => task.description === "Copied annual description",
    ),
  );
  assert.equal(
    new Set(annualRows.map((task) => task.recurrenceDate?.toISOString())).size,
    2,
  );
});

test("daily push counts include all open tasks and account-local completions without counting checklist items", async () => {
  const { dailyTaskCounts } = await import("../src/lib/push-service");
  const owner = await db.user.create({
    data: {
      email: `push-counts-${run}@example.test`,
      name: "Push counts",
      timezone: "Asia/Kolkata",
      workModeEnabled: true,
    },
  });
  const category = await db.category.create({
    data: { userId: owner.id, name: "Visible work", slug: "visible-work" },
  });
  await db.user.update({
    where: { id: owner.id },
    data: { workCategoryIds: [category.id] },
  });
  const records = await db.task.createManyAndReturn({
    data: [
      {
        userId: owner.id,
        title: "Past plan",
        status: "PLANNED",
        plannedDate: new Date("2026-10-29"),
        primaryCategoryId: category.id,
      },
      {
        userId: owner.id,
        title: "Future personal plan",
        status: "IN_PROGRESS",
        plannedDate: new Date("2026-11-03"),
      },
      {
        userId: owner.id,
        title: "Undated inbox",
        status: "INBOX",
        plannedDate: null,
      },
      {
        userId: owner.id,
        title: "Deferred",
        status: "DEFERRED",
        plannedDate: new Date("2026-10-01"),
      },
      {
        userId: owner.id,
        title: "Archived pending",
        status: "PLANNED",
        archivedAt: new Date("2026-10-29"),
      },
      {
        userId: owner.id,
        title: "Cancelled",
        status: "CANCELLED",
        cancelledAt: new Date("2026-10-29"),
      },
      {
        userId: owner.id,
        title: "Local midnight completion",
        status: "COMPLETED",
        completedAt: new Date("2026-10-29T18:30:00Z"),
      },
      {
        userId: owner.id,
        title: "Archived completion still done",
        status: "COMPLETED",
        completedAt: new Date("2026-10-30T12:00:00Z"),
        archivedAt: new Date("2026-10-30T13:00:00Z"),
      },
      {
        userId: owner.id,
        title: "Yesterday local completion",
        status: "COMPLETED",
        completedAt: new Date("2026-10-29T18:29:59Z"),
      },
      {
        userId: owner.id,
        title: "Tomorrow local completion",
        status: "COMPLETED",
        completedAt: new Date("2026-10-30T18:30:00Z"),
      },
    ],
  });
  await db.taskChecklistItem.createMany({
    data: [
      { userId: owner.id, parentTaskId: records[0].id, title: "Nested one" },
      {
        userId: owner.id,
        parentTaskId: records[0].id,
        title: "Nested two",
        isCompleted: true,
      },
    ],
  });
  assert.deepEqual(
    await dailyTaskCounts(owner.id, owner.timezone, "2026-10-30"),
    { completed: 2, pending: 4 },
  );
  const emptyOwner = await db.user.create({
    data: {
      email: `push-empty-${run}@example.test`,
      name: "Empty push account",
    },
  });
  assert.deepEqual(
    await dailyTaskCounts(emptyOwner.id, owner.timezone, "2026-10-30"),
    { completed: 0, pending: 0 },
  );
});

test("daily push claims deduplicate concurrent schedules, retry transient failures and preserve subscription history", async () => {
  const { subscribePush, unsubscribePush, dispatchDailySummaries } =
    await import("../src/lib/push-service");
  const owner = await db.user.create({
    data: {
      email: `push-delivery-${run}@example.test`,
      name: "Push delivery",
      timezone: "Asia/Kolkata",
    },
  });
  const ec = createECDH("prime256v1");
  ec.generateKeys();
  const subscription = (token: string) => ({
    endpoint: `https://fcm.googleapis.com/fcm/send/${run}-${token}`,
    keys: {
      p256dh: ec.getPublicKey().toString("base64url"),
      auth: Buffer.alloc(16, 1).toString("base64url"),
    },
  });
  const morning = new Date("2026-11-03T03:30:00Z");
  await db.task.createMany({
    data: [
      {
        userId: owner.id,
        title: "Pending any date",
        status: "PLANNED",
        plannedDate: new Date("2026-12-01"),
      },
      {
        userId: owner.id,
        title: "Done today",
        status: "COMPLETED",
        completedAt: new Date("2026-11-03T01:00:00Z"),
      },
    ],
  });
  const first = await subscribePush(owner.id, subscription("first"), morning);
  const second = await subscribePush(owner.id, subscription("second"), morning);
  try {
    await assert.rejects(
      subscribePush(other.id, subscription("first"), morning),
      /different account/,
    );
    const sent: { endpoint: string; tag: string; body: string }[] = [];
    const sender = async (
      sub: { endpoint: string },
      payload: { tag: string; body: string },
    ) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      sent.push({
        endpoint: sub.endpoint,
        tag: payload.tag,
        body: payload.body,
      });
    };
    await Promise.all([
      dispatchDailySummaries({ now: morning, sender }),
      dispatchDailySummaries({ now: morning, sender }),
    ]);
    assert.equal(sent.length, 2);
    assert.equal(new Set(sent.map((item) => item.endpoint)).size, 2);
    assert.ok(
      sent.every((item) => item.body === "1 completed today · 1 pending"),
    );
    assert.equal(
      await db.pushSummaryDelivery.count({
        where: { userId: owner.id, status: "SENT" },
      }),
      2,
    );
    await dispatchDailySummaries({
      now: new Date(morning.getTime() + 600000),
      sender,
    });
    assert.equal(sent.length, 2);
    await dispatchDailySummaries({
      now: new Date("2026-11-03T14:30:00Z"),
      sender,
    });
    assert.equal(sent.length, 4);
    assert.ok(sent[2].tag.endsWith("evening"));
    await unsubscribePush(owner.id, subscription("second").endpoint, morning);
    const retryMorning = new Date("2026-11-04T03:30:00Z");
    let attempts = 0;
    const flaky = async () => {
      if (++attempts === 1) throw { statusCode: 503 };
    };
    assert.equal(
      (await dispatchDailySummaries({ now: retryMorning, sender: flaky }))
        .failed,
      1,
    );
    await dispatchDailySummaries({
      now: new Date(retryMorning.getTime() + 20000),
      sender: flaky,
    });
    assert.equal(attempts, 1);
    assert.equal(
      (
        await dispatchDailySummaries({
          now: new Date(retryMorning.getTime() + 31000),
          sender: flaky,
        })
      ).sent,
      1,
    );
    assert.equal(attempts, 2);
    const retry = await db.pushSummaryDelivery.findUniqueOrThrow({
      where: {
        subscriptionId_localDate_slot: {
          subscriptionId: first.id,
          localDate: new Date("2026-11-04"),
          slot: "morning",
        },
      },
    });
    assert.equal(retry.attempts, 2);
    assert.equal(retry.status, "SENT");
    await subscribePush(
      owner.id,
      subscription("second"),
      new Date(retryMorning.getTime() + 600000),
    );
    const gone = await dispatchDailySummaries({
      now: new Date(retryMorning.getTime() + 600000),
      sender: async () => {
        throw { statusCode: 410 };
      },
    });
    assert.equal(gone.failed, 1);
    const disabled = await db.pushSubscription.findUniqueOrThrow({
      where: { id: second.id },
    });
    assert.ok(disabled.disabledAt);
    assert.equal(disabled.lastErrorCode, 410);
    const recoveryDate = new Date("2026-11-05");
    await db.pushSummaryDelivery.create({
      data: {
        userId: owner.id,
        subscriptionId: first.id,
        localDate: recoveryDate,
        slot: "morning",
        status: "SENDING",
        leaseUntil: new Date("2026-11-05T03:20:00Z"),
        leaseToken: randomUUID(),
        nextAttemptAt: new Date("2026-11-05T03:20:00Z"),
        expiresAt: new Date("2026-11-05T04:30:00Z"),
        attempts: 1,
      },
    });
    assert.equal(
      (
        await dispatchDailySummaries({
          now: new Date("2026-11-05T03:30:00Z"),
          sender: async () => {},
        })
      ).sent,
      1,
    );
    const recovered = await db.pushSummaryDelivery.findUniqueOrThrow({
      where: {
        subscriptionId_localDate_slot: {
          subscriptionId: first.id,
          localDate: recoveryDate,
          slot: "morning",
        },
      },
    });
    assert.equal(recovered.attempts, 2);
    assert.equal(recovered.status, "SENT");
    await unsubscribePush(
      owner.id,
      subscription("first").endpoint,
      new Date("2026-11-05T04:00:00Z"),
    );
    assert.equal(
      await db.pushSubscription.count({ where: { userId: owner.id } }),
      2,
    );
    assert.ok(
      (await db.pushSummaryDelivery.count({ where: { userId: owner.id } })) > 0,
    );
  } finally {
    await db.pushSubscription.updateMany({
      where: { userId: owner.id },
      data: { disabledAt: new Date() },
    });
  }
});

test("push dispatch reports queued devices beyond one bounded run so a retry drains the backlog", async () => {
  const { subscribePush, dispatchDailySummaries } =
    await import("../src/lib/push-service");
  const owner = await db.user.create({
    data: {
      email: `push-backlog-${run}@example.test`,
      name: "Push backlog",
      timezone: "Asia/Kolkata",
    },
  });
  const ec = createECDH("prime256v1");
  ec.generateKeys();
  const now = new Date("2026-11-06T03:30:00Z");
  for (let index = 0; index < 6; index++)
    await subscribePush(
      owner.id,
      {
        endpoint: `https://fcm.googleapis.com/fcm/send/${run}-backlog-${index}`,
        keys: {
          p256dh: ec.getPublicKey().toString("base64url"),
          auth: Buffer.alloc(16, 1).toString("base64url"),
        },
      },
      now,
    );
  const sent: string[] = [];
  const sender = async (subscription: { endpoint: string }) => {
    sent.push(subscription.endpoint);
  };
  try {
    const first = await dispatchDailySummaries({ now, sender });
    assert.equal(first.sent, 5);
    assert.equal(first.remaining, 1);
    const next = await dispatchDailySummaries({
      now: new Date(now.getTime() + 30000),
      sender,
    });
    assert.equal(next.sent, 1);
    assert.equal(next.remaining, 0);
    assert.equal(sent.length, 6);
    assert.equal(new Set(sent).size, 6);
    assert.equal(
      (
        await dispatchDailySummaries({
          now: new Date(now.getTime() + 60000),
          sender,
        })
      ).sent,
      0,
    );
  } finally {
    await db.pushSubscription.updateMany({
      where: { userId: owner.id },
      data: { disabledAt: new Date() },
    });
  }
});
