import { test } from "node:test";
import assert from "node:assert/strict";
import {
  commandSchema,
  dateKey,
  weekOf,
  descendants,
  validateFields,
} from "../src/lib/domain";
import { hashPassword, verifyPassword, tokenHash } from "../src/lib/password";
import { analytics } from "../src/lib/analytics";
import type { Workspace, Task } from "../src/lib/workspace";
test("dates respect the workspace timezone at midnight and Monday boundaries", () => {
  assert.equal(
    dateKey(new Date("2026-10-11T20:00:00Z"), "Asia/Kolkata"),
    "2026-10-12",
  );
  assert.deepEqual(weekOf("2026-10-11"), {
    start: "2026-10-05",
    end: "2026-10-11",
  });
  assert.deepEqual(weekOf("2026-10-12"), {
    start: "2026-10-12",
    end: "2026-10-18",
  });
});
test("category traversal includes arbitrary depth and terminates on malformed cycles", () => {
  assert.deepEqual(
    [
      ...descendants(
        [
          { id: "a", parentId: "c" },
          { id: "b", parentId: "a" },
          { id: "c", parentId: "b" },
        ],
        "a",
      ),
    ],
    ["a", "b", "c"],
  );
});
test("capture is optional except title, effort rejects nonpositive values, dates are validated", () => {
  const parsed = commandSchema.parse({ type: "task.create", title: "Read" });
  assert.equal(parsed.type, "task.create");
  assert.ok(
    !commandSchema.safeParse({ type: "task.create", title: "  " }).success,
  );
  assert.ok(
    !commandSchema.safeParse({
      type: "task.create",
      title: "Read",
      plannedDate: "2026-02-31",
    }).success,
  );
  assert.ok(
    !commandSchema.safeParse({
      type: "task.effort",
      id: "dd84c234-cd8b-48d5-8130-d58b54fcafba",
      minutes: 0,
      occurredOn: "2026-10-11",
    }).success,
  );
});
test("typed fields reject unknown fields, missing required values, and invalid options; false and zero survive", () => {
  const defs = [
    {
      id: "bool",
      label: "Tried",
      required: true,
      fieldType: "BOOLEAN",
      configuration: null,
    },
    {
      id: "n",
      label: "Count",
      required: true,
      fieldType: "NUMBER",
      configuration: null,
    },
    {
      id: "select",
      label: "Technique",
      required: false,
      fieldType: "SELECT",
      configuration: { options: ["Bends"] },
    },
  ];
  assert.deepEqual(validateFields(defs, { bool: false, n: 0 }), {
    bool: false,
    n: 0,
    select: null,
  });
  assert.throws(() => validateFields(defs, { n: 1 }), /required/);
  assert.throws(
    () => validateFields(defs, { bool: false, n: 1, select: "Invalid" }),
    /Invalid/,
  );
  assert.throws(
    () => validateFields(defs, { bool: true, n: 1, rogue: 1 }),
    /Unknown/,
  );
});
test("salted password hashes verify safely and session hashes do not store raw tokens", async () => {
  const a = await hashPassword("correct horse battery staple");
  const b = await hashPassword("correct horse battery staple");
  assert.notEqual(a, b);
  assert.ok(await verifyPassword("correct horse battery staple", a));
  assert.ok(!(await verifyPassword("wrong", a)));
  assert.ok(!(await verifyPassword("wrong", "bad")));
  assert.equal(tokenHash("token").length, 64);
  assert.notEqual(tokenHash("token"), "token");
});
test("analytics count effort once across duplicate links and include category/entity descendants", () => {
  const task = {
    id: "task",
    createdAt: "2026-10-11T00:00:00Z",
    primaryCategoryId: "child",
    effort: [{ id: "e", occurredOn: "2026-10-11T00:00:00Z", minutes: 30 }],
    entities: [{ entityId: "project" }, { entityId: "project" }],
    tags: [{ tagId: "tag" }, { tagId: "tag" }],
    status: "PLANNED",
  } as Task;
  const data = {
    today: "2026-10-11",
    user: { timezone: "Asia/Kolkata" },
    tasks: [task],
    categories: [
      { id: "root", parentId: null, name: "Root" },
      { id: "child", parentId: "root", name: "Child" },
    ],
    entities: [
      { id: "org", parentEntityId: null, name: "Org" },
      { id: "project", parentEntityId: "org", name: "Project" },
    ],
    tags: [{ id: "tag", name: "Tag" }],
    events: [],
  } as unknown as Workspace;
  const result = analytics(data, "2026-10-11", "2026-10-11");
  assert.equal(result.total, 30);
  assert.equal(result.category.find((c) => c.id === "root")?.minutes, 30);
  assert.equal(result.entity.find((e) => e.id === "org")?.minutes, 30);
  assert.equal(result.tags[0].minutes, 30);
  assert.equal(result.days[0].minutes, 30);
});
