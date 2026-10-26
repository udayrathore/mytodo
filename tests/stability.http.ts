import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { isWorkLoginTime } from "../src/lib/work-mode";
import { database } from "../src/lib/db";
if (process.env.TEST_ISOLATED !== "1")
  throw Error("Run with npm run test:isolated, never against real data.");
const base = process.env.APP_URL!,
  db = database();
let cookie = "";
async function post(path: string, body: unknown, key?: string) {
  const r = await fetch(base + path, {
    method: "POST",
    headers: {
      Origin: base,
      "Content-Type": "application/json",
      Cookie: cookie,
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  assert.equal(r.status, 200, JSON.stringify(data));
  return data;
}
async function get(path: string) {
  const r = await fetch(base + path, { headers: { Cookie: cookie } });
  const data = await r.json();
  assert.equal(r.status, 200, JSON.stringify(data));
  return data;
}
after(() => db.$disconnect());
test("save, retry, history, ordering, pagination, reminder and authentication regressions", async () => {
  assert.equal((await fetch(base + "/api/workspace")).status, 401);
  const loginStartedAt = new Date();
  const signed = await fetch(base + "/api/login", {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({ password: process.env.TEST_LOGIN_PASSWORD }),
  });
  assert.equal(signed.status, 200);
  cookie = signed.headers.get("set-cookie")!.split(";")[0];
  const user = await db.user.findUniqueOrThrow({
    where: { email: process.env.OWNER_EMAIL! },
  });
  assert.ok(
    [loginStartedAt, new Date()].some(
      (now) => user.workModeEnabled === isWorkLoginTime(now, user.timezone),
    ),
  );
  await post("/api/work-mode", { action: "toggle", enabled: false });
  const key = randomUUID(),
    body = {
      type: "category.save",
      name: "Concurrent category",
      parentId: null,
      sortOrder: 1,
      isActive: true,
    };
  const start = performance.now();
  const responses = await Promise.all(
    Array.from({ length: 5 }, () => post("/api/commands", body, key)),
  );
  assert.equal(new Set(responses.map((r) => r.id)).size, 1);
  assert.equal(
    await db.category.count({ where: { userId: user.id, name: body.name } }),
    1,
  );
  assert.equal(responses[0].patch.collection, "categories");
  console.log(
    `Five concurrent category requests (one record): ${Math.round(performance.now() - start)}ms on isolated local database`,
  );
  const categoryId = responses[0].id;
  const unauthorized = await fetch(base + "/api/commands", {
    method: "POST",
    headers: {
      Origin: "https://invalid.example",
      Cookie: cookie,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  assert.equal(unauthorized.status, 401);
  const tasks = [];
  for (const minutes of [null, 15])
    tasks.push(
      (
        await post("/api/commands", {
          type: "activity.log",
          primaryCategoryId: categoryId,
          title: minutes === null ? "Untimed activity" : "Timed activity",
          occurredOn: "2026-10-01",
          minutes,
          note: "history regression",
          complete: false,
        })
      ).id,
    );
  const history = await get("/api/history?filter=Action");
  for (const taskId of tasks)
    assert.equal(
      history.items.filter((r: { taskId: string }) => r.taskId === taskId)
        .length,
      1,
    );
  const reminder = await db.reminder.create({
    data: {
      userId: user.id,
      taskId: tasks[0],
      scheduledFor: new Date(Date.now() - 1000),
    },
  });
  await get("/api/workspace");
  await get("/api/workspace");
  assert.equal(
    await db.reminderDelivery.count({ where: { reminderId: reminder.id } }),
    1,
  );
  for (const module of ["goals", "challenges"]) {
    const ids: string[] = [];
    for (const title of ["First", "Second", "Third"])
      ids.push(
        (
          await post("/api/" + module, {
            action: "save",
            title,
            reason: "test",
            categoryId,
            parentId: null,
            status: "NOT_STARTED",
            progress: 0,
            estimatedMinutes: null,
          })
        ).result.id,
      );
    await post("/api/" + module, {
      action: "reorder",
      id: ids[2],
      beforeId: ids[0],
      placement: "before",
    });
    await post("/api/" + module, {
      action: "reorder",
      id: ids[1],
      beforeId: ids[2],
      placement: "before",
    });
    const rows = (await get("/api/" + module))[module];
    assert.deepEqual(
      rows.map((r: { id: string }) => r.id),
      [ids[1], ids[2], ids[0]],
    );
    const comments = Array.from({ length: 55 }, (_, i) => ({
      userId: user.id,
      body: `Comment ${i}`,
      ...(module === "goals" ? { goalId: ids[0] } : { challengeId: ids[0] }),
    }));
    if (module === "goals")
      await db.goalComment.createMany({
        data: comments as NonNullable<
          Parameters<typeof db.goalComment.createMany>[0]
        >["data"],
      });
    else
      await db.challengeComment.createMany({
        data: comments as NonNullable<
          Parameters<typeof db.challengeComment.createMany>[0]
        >["data"],
      });
    const name = module === "goals" ? "goal" : "challenge";
    const first = (await get(`/api/${module}?id=${ids[0]}`))[name];
    assert.equal(first.comments.length, 50);
    const second = (
      await get(
        `/api/${module}?id=${ids[0]}&commentsCursor=${first.nextCommentsCursor}`,
      )
    )[name];
    assert.equal(second.comments.length, 5);
  }
  await db.learning.createMany({
    data: Array.from({ length: 105 }, (_, i) => ({
      userId: user.id,
      categoryId,
      title: `Learning ${i}`,
      content: "",
      document: { type: "doc", content: [] },
      coreFinding: "",
    })),
  });
  const first = await get("/api/learnings");
  assert.equal(first.learnings.length, 100);
  assert.ok(first.nextCursor);
  const second = await get("/api/learnings?cursor=" + first.nextCursor);
  assert.equal(second.learnings.length, 5);
  assert.equal(second.nextCursor, null);
});

test("Work mode persists, includes child categories, and scopes paged reads, linked content and reports", async () => {
  const user = await db.user.findUniqueOrThrow({
    where: { email: process.env.OWNER_EMAIL! },
  });
  const today = (await get("/api/workspace")).today;
  const work = await post("/api/commands", {
    type: "category.save",
    name: "Work focus",
    parentId: null,
    sortOrder: 0,
    isActive: true,
  });
  const child = await post("/api/commands", {
    type: "category.save",
    name: "Client projects",
    parentId: work.id,
    sortOrder: 0,
    isActive: true,
  });
  const personal = await post("/api/commands", {
    type: "category.save",
    name: "Personal focus",
    parentId: null,
    sortOrder: 0,
    isActive: true,
  });
  const workTask = await post("/api/commands", {
    type: "task.create",
    title: "Work focus task",
    primaryCategoryId: work.id,
    plannedDate: today,
  });
  const childTask = await post("/api/commands", {
    type: "task.create",
    title: "Client focus task",
    primaryCategoryId: child.id,
    plannedDate: today,
  });
  const personalTask = await post("/api/commands", {
    type: "task.create",
    title: "Personal focus task",
    primaryCategoryId: personal.id,
    plannedDate: today,
  });
  await db.task.createMany({
    data: Array.from({ length: 110 }, (_, i) => ({
      userId: user.id,
      title: `Personal backlog ${i}`,
      primaryCategoryId: personal.id,
      plannedDate: new Date(today),
      status: "PLANNED",
    })),
  });
  await post("/api/commands", {
    type: "task.effort",
    id: workTask.id,
    minutes: 20,
    occurredOn: today,
    note: "",
  });
  await post("/api/commands", {
    type: "task.effort",
    id: personalTask.id,
    minutes: 60,
    occurredOn: today,
    note: "",
  });
  for (const [title, categoryId] of [
    ["Work goal", work.id],
    ["Personal goal", personal.id],
  ])
    await post("/api/goals", {
      action: "save",
      title,
      categoryId,
      reason: "Mode regression",
      parentId: null,
      status: "NOT_STARTED",
      progress: 0,
      estimatedMinutes: null,
    });
  for (const [title, categoryId] of [
    ["Work challenge", work.id],
    ["Personal challenge", personal.id],
  ])
    await post("/api/challenges", {
      action: "save",
      title,
      categoryId,
      reason: "Mode regression",
      parentId: null,
    });
  await db.learning.createMany({
    data: [
      {
        userId: user.id,
        title: "Work learning",
        categoryId: child.id,
        content: "",
        coreFinding: "",
        document: {},
      },
      {
        userId: user.id,
        title: "Personal learning",
        categoryId: personal.id,
        content: "",
        coreFinding: "",
        document: {},
      },
    ],
  });
  await post("/api/commands", {
    type: "journal.save",
    title: "Work journal",
    content: "Work observation",
    occurredAt: new Date().toISOString(),
    categoryIds: [work.id],
    entityIds: [],
  });
  await post("/api/commands", {
    type: "journal.save",
    title: "Personal journal",
    content: "Personal observation",
    occurredAt: new Date().toISOString(),
    categoryIds: [personal.id],
    entityIds: [],
  });
  const other = await db.user.create({
    data: { email: `scope-${randomUUID()}@example.test`, name: "Other" },
  });
  const foreign = await db.category.create({
    data: { userId: other.id, name: "Foreign", slug: "foreign" },
  });
  const forbidden = await fetch(base + "/api/work-mode", {
    method: "POST",
    headers: {
      Origin: base,
      Cookie: cookie,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "configure", categoryIds: [foreign.id] }),
  });
  assert.equal(forbidden.status, 400);
  await post("/api/work-mode", { action: "configure", categoryIds: [work.id] });
  await post("/api/work-mode", { action: "toggle", enabled: true });
  const persisted = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(persisted.workModeEnabled, true);
  assert.deepEqual(persisted.workCategoryIds, [work.id]);
  const workspace = await get("/api/workspace");
  assert.equal(workspace.workMode.enabled, true);
  assert.deepEqual(
    new Set(workspace.tasks.map((t: { id: string }) => t.id)),
    new Set([workTask.id, childTask.id]),
  );
  assert.deepEqual(
    new Set(workspace.categories.map((c: { id: string }) => c.id)),
    new Set([work.id, child.id]),
  );
  assert.equal(workspace.page.nextCursor, null);
  const picker = await get("/api/workspace?view=picker&search=Personal");
  assert.equal(picker.tasks.length, 0);
  const hidden = await get("/api/workspace?view=task&task=" + personalTask.id);
  assert.equal(hidden.tasks.length, 0);
  const goals = await get("/api/goals");
  assert.deepEqual(
    goals.goals.map((g: { title: string }) => g.title),
    ["Work goal"],
  );
  const challenges = await get("/api/challenges");
  assert.deepEqual(
    challenges.challenges.map((g: { title: string }) => g.title),
    ["Work challenge"],
  );
  const learnings = await get("/api/learnings");
  assert.deepEqual(
    learnings.learnings.map((g: { title: string }) => g.title),
    ["Work learning"],
  );
  const journals = await get("/api/workspace?view=journal");
  assert.deepEqual(
    journals.journals.map((g: { title: string }) => g.title),
    ["Work journal"],
  );
  const history = await get("/api/history");
  assert.ok(history.items.length > 0);
  assert.ok(
    history.items.every(
      (i: { text: string; title: string }) =>
        !i.text.includes("Personal") && !i.title.includes("Personal"),
    ),
  );
  const report = await get(
    `/api/reports?kind=insights&from=${today}&to=${today}`,
  );
  assert.equal(report.total, 20);
  assert.ok(
    report.category.every((c: { id: string }) =>
      [work.id, child.id].includes(c.id),
    ),
  );
  const balance = await get(
    `/api/reports?kind=balance&from=${today}&to=${today}`,
  );
  assert.ok(
    balance.rows.every((r: { categoryId: string }) =>
      [work.id, child.id].includes(r.categoryId),
    ),
  );
  const settings = await get("/api/work-mode");
  assert.ok(
    settings.categories.some((c: { id: string }) => c.id === personal.id),
  );
  await post("/api/work-mode", { action: "configure", categoryIds: [] });
  assert.equal((await get("/api/workspace")).tasks.length, 0);
  assert.equal((await get("/api/goals")).goals.length, 0);
  assert.equal((await get("/api/learnings")).learnings.length, 0);
  assert.equal(
    (await get("/api/reports?kind=insights&from=" + today + "&to=" + today))
      .total,
    0,
  );
  await post("/api/work-mode", { action: "configure", categoryIds: [work.id] });
  await post("/api/work-mode", { action: "toggle", enabled: false });
  const personalAgain = await get(
    "/api/workspace?view=picker&search=Personal%20focus%20task",
  );
  assert.ok(
    personalAgain.tasks.some((t: { id: string }) => t.id === personalTask.id),
  );
  assert.ok(await db.task.findUnique({ where: { id: personalTask.id } }));
});
