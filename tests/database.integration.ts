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
