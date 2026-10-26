import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { retireDataReset, retiredReset } from "../scripts/migration-safety.mjs";
import { credential, newCredential } from "../src/lib/credentials";
import { postCommand, applyCommandPatch } from "../src/lib/command-client";
import type { Workspace } from "../src/lib/workspace";
test("legacy codes remain usable; new credentials and local bootstrap passwords agree", () => {
  assert.equal(credential.safeParse("1234").success, true);
  assert.equal(credential.safeParse("a-long-bootstrap-password").success, true);
  assert.equal(newCredential.safeParse("1234").success, false);
  assert.equal(
    newCredential.safeParse("a-long-bootstrap-password").success,
    true,
  );
});
test("retired reset is marked without running its SQL, and an unresolved failure stops migration", async () => {
  for (const [exists, rows, expected] of [
    [false, [], 1],
    [true, [], 1],
    [true, [{ finished_at: new Date(), rolled_back_at: null }], 0],
  ] as const) {
    const calls: string[][] = [];
    await retireDataReset(
      {
        query: async (sql: string) => ({
          rows: sql.includes("to_regclass")
            ? [{ name: exists ? "_prisma_migrations" : null }]
            : rows,
        }),
      },
      async (args: string[]) => {
        calls.push(args);
      },
    );
    assert.equal(calls.length, expected);
    if (expected)
      assert.deepEqual(calls[0], [
        "prisma",
        "migrate",
        "resolve",
        "--applied",
        retiredReset,
      ]);
  }
  await assert.rejects(
    retireDataReset(
      {
        query: async (sql: string) => ({
          rows: sql.includes("to_regclass")
            ? [{ name: "_prisma_migrations" }]
            : [{ finished_at: null, rolled_back_at: null }],
        }),
      },
      () => assert.fail("Must not continue"),
    ),
    /unresolved/,
  );
  assert.doesNotMatch(
    readFileSync("scripts/vercel-build.mjs", "utf8"),
    /execFileSync\([^\n]*migrate/,
  );
});
test("ambiguous network failure reuses the retry key; an intentional second create gets a new key", async () => {
  const original = globalThis.fetch;
  const keys: string[] = [];
  let attempt = 0;
  globalThis.fetch = async (_url, options) => {
    keys.push(new Headers(options?.headers).get("Idempotency-Key")!);
    if (attempt++ === 0) throw Error("Response lost after commit");
    return Response.json({ ok: true, id: "created" });
  };
  try {
    const command = { type: "task.create", title: "Retry regression" };
    await assert.rejects(postCommand(command), /Response lost/);
    await postCommand({ ...command });
    await postCommand({ ...command });
    assert.equal(keys[0], keys[1]);
    assert.notEqual(keys[1], keys[2]);
  } finally {
    globalThis.fetch = original;
  }
});
test("collection patches replace the saved row while retaining unrelated records", () => {
  const data = {
    categories: [
      { id: "one", name: "Old" },
      { id: "two", name: "Keep" },
    ],
    tasks: [{ id: "task" }],
  } as unknown as Workspace;
  const updated = applyCommandPatch(data, {
    ok: true,
    patch: {
      collection: "categories",
      record: { id: "one", name: "New" } as { id: string },
    },
  });
  assert.equal(updated.categories.length, 2);
  assert.equal(updated.categories.find((r) => r.id === "one")?.name, "New");
  assert.equal(updated.tasks, data.tasks);
  assert.equal(data.categories[0].name, "Old");
});
