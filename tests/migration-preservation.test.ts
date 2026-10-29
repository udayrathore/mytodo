import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertPendingMigrationsSafe,
  assertBusinessRowsPreserved,
  destructiveMigrationOperation,
  retiredReset,
  runPreservingMigrations,
} from "../scripts/migration-safety.mjs";

test("populated databases reject destructive pending migration files while retaining ledger-only reset retirement", () => {
  const before = { users: "1", tasks: "42" };
  for (const sql of [
    "DROP TABLE tasks;",
    "ALTER TABLE tasks DROP COLUMN title;",
    'ALTER TABLE tasks DROP "title";',
    "TRUNCATE TABLE tasks;",
    "DELETE/**/FROM tasks;",
    "DO $$ BEGIN EXECUTE 'DELETE FROM tasks'; END $$;",
  ]) {
    assert.throws(
      () =>
        assertPendingMigrationsSafe([{ name: "new-danger", sql }], [], before),
      /Blocked destructive pending migration/,
    );
  }
  assert.doesNotThrow(() =>
    assertPendingMigrationsSafe(
      [
        { name: "old-applied", sql: "ALTER TABLE tasks DROP COLUMN old;" },
        { name: retiredReset, sql: "TRUNCATE TABLE tasks;" },
      ],
      ["old-applied"],
      before,
    ),
  );
  assert.doesNotThrow(() =>
    assertPendingMigrationsSafe(
      [
        {
          name: "new-additive",
          sql: "CREATE TABLE notifications(id UUID); ALTER TABLE task_series DROP CONSTRAINT old_check; ALTER TABLE task_series ADD CONSTRAINT valid_check CHECK(unit IN ('DAY','WEEK'));",
        },
      ],
      [],
      before,
    ),
  );
  assert.equal(
    destructiveMigrationOperation(
      "-- DROP TABLE tasks\n/* nested /* DELETE FROM tasks */ comment */ CREATE INDEX good ON tasks(id);",
    ),
    null,
  );
  assert.equal(
    destructiveMigrationOperation(
      "ALTER TABLE tasks ALTER COLUMN title DROP NOT NULL;",
    ),
    null,
  );
  assert.equal(
    destructiveMigrationOperation(
      "ALTER TABLE tasks DROP  CONSTRAINT old_check;",
    ),
    null,
  );
  assert.equal(
    destructiveMigrationOperation(
      "ALTER TABLE tasks ALTER COLUMN title DROP DEFAULT;",
    ),
    null,
  );
});
test("fresh empty database initialization allows historical schema evolution and row checks retain bigint precision", () => {
  assert.doesNotThrow(() =>
    assertPendingMigrationsSafe(
      [
        {
          name: "historical",
          sql: 'ALTER TABLE tasks DROP COLUMN priority; DROP TYPE "Priority";',
        },
      ],
      [],
      {},
    ),
  );
  assert.doesNotThrow(() =>
    assertPendingMigrationsSafe(
      [{ name: "historical", sql: "ALTER TABLE tasks DROP COLUMN priority;" }],
      [],
      { users: "0", tasks: "0" },
    ),
  );
  assert.doesNotThrow(() =>
    assertBusinessRowsPreserved(
      { tasks: "9007199254740993" },
      { tasks: "9007199254740994", notifications: "1" },
    ),
  );
  assert.throws(
    () =>
      assertBusinessRowsPreserved(
        { tasks: "9007199254740993" },
        { tasks: "9007199254740992" },
      ),
    /decreased/,
  );
  assert.throws(
    () => assertBusinessRowsPreserved({ goals: "2" }, {}),
    /goals decreased from 2 to 0/,
  );
});
function fakeDatabase(
  before: Record<string, string>,
  after: Record<string, string>,
  applied: string[] = [],
) {
  let migrated = false;
  return {
    migrate() {
      migrated = true;
    },
    async query(sql: string) {
      if (sql.includes("pg_catalog.pg_tables"))
        return {
          rows: Object.keys(migrated ? after : before).map((tablename) => ({
            tablename,
          })),
        };
      if (sql.includes("COUNT(*)"))
        return {
          rows: Object.entries(migrated ? after : before).map(
            ([table_name, row_count]) => ({ table_name, row_count }),
          ),
        };
      if (sql.includes("to_regclass"))
        return {
          rows: [{ name: applied.length ? "_prisma_migrations" : null }],
        };
      if (sql.includes("SELECT migration_name"))
        return { rows: applied.map((migration_name) => ({ migration_name })) };
      if (sql.includes("SELECT finished_at"))
        return {
          rows: applied.includes(retiredReset)
            ? [{ finished_at: new Date(), rolled_back_at: null }]
            : [],
        };
      throw Error("Unexpected test query");
    },
  };
}
test("safe migration runner blocks before execution, validates post counts, and logs only aggregate metadata", async () => {
  const calls: string[][] = [],
    logs: unknown[][] = [];
  const blocked = fakeDatabase(
    { users: "1", tasks: "8" },
    { users: "1", tasks: "0" },
    [retiredReset],
  );
  await assert.rejects(
    runPreservingMigrations(
      blocked,
      async (args: string[]) => {
        calls.push(args);
        blocked.migrate();
      },
      [{ name: "unsafe", sql: "DELETE FROM tasks;" }],
      { log: (...args: unknown[]) => logs.push(args) },
    ),
    /Blocked destructive/,
  );
  assert.equal(calls.length, 0);
  assert.equal(logs.length, 0);
  await assert.rejects(
    runPreservingMigrations(
      blocked,
      async (args: string[]) => calls.push(args),
      [{ name: "safe-file", sql: "SELECT 1;" }],
      { dev: true, log: (...args: unknown[]) => logs.push(args) },
    ),
    /Do not run migrate dev against a populated database/,
  );
  assert.equal(calls.length, 0);
  assert.equal(logs.length, 0);
  const db = fakeDatabase(
    { users: "1", tasks: "8" },
    { users: "1", tasks: "8", push_subscriptions: "0" },
    [retiredReset],
  );
  const result = await runPreservingMigrations(
    db,
    async (args: string[]) => {
      calls.push(args);
      db.migrate();
    },
    [{ name: "additive", sql: "CREATE TABLE push_subscriptions(id UUID);" }],
    { log: (...args: unknown[]) => logs.push(args) },
  );
  assert.deepEqual(calls, [["prisma", "migrate", "deploy"]]);
  assert.equal(result.after.tasks, "8");
  assert.deepEqual(logs, [
    ["migration_data_before", { users: "1", tasks: "8" }],
    [
      "migration_data_after",
      { users: "1", tasks: "8", push_subscriptions: "0" },
    ],
  ]);
  const decreasing = fakeDatabase(
    { users: "1", tasks: "8" },
    { users: "1", tasks: "7" },
    [retiredReset],
  );
  await assert.rejects(
    runPreservingMigrations(
      decreasing,
      async () => decreasing.migrate(),
      [{ name: "unexpected", sql: "SELECT 1;" }],
      { log: () => {} },
    ),
    /preservation check failed/,
  );
  const fresh = fakeDatabase({}, { users: "0" }, [retiredReset]);
  const freshCalls: string[][] = [];
  await runPreservingMigrations(
    fresh,
    async (args: string[]) => {
      freshCalls.push(args);
      fresh.migrate();
    },
    [{ name: "historical", sql: "ALTER TABLE tasks DROP COLUMN old;" }],
    { dev: true, log: () => {} },
  );
  assert.deepEqual(freshCalls, [["prisma", "migrate", "dev"]]);
});
