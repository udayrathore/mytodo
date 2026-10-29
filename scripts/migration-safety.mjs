export const retiredReset = "202610240009_clean_start";
// Ledger only: never modify a migration file already deployed to a database.
export async function retireDataReset(db, run) {
  const exists = await db.query(
    "SELECT to_regclass('public._prisma_migrations') AS name",
  );
  const records = exists.rows[0].name
    ? (
        await db.query(
          "SELECT finished_at, rolled_back_at FROM _prisma_migrations WHERE migration_name=$1",
          [retiredReset],
        )
      ).rows
    : [];
  if (records.some((r) => !r.finished_at && !r.rolled_back_at))
    throw Error(
      "The historical reset has an unresolved failed migration. Inspect it before continuing.",
    );
  if (!records.some((r) => r.finished_at && !r.rolled_back_at)) {
    await run(["prisma", "migrate", "resolve", "--applied", retiredReset]);
  }
}

// Data records only: exclude expiring login/session/idempotency bookkeeping.
export const businessTables = [
  "users",
  "categories",
  "tasks",
  "task_events",
  "tags",
  "task_tags",
  "entities",
  "task_entity_links",
  "planning_periods",
  "task_periods",
  "task_templates",
  "task_template_fields",
  "task_field_values",
  "task_effort_entries",
  "task_relations",
  "journal_entries",
  "journal_category_links",
  "journal_entity_links",
  "reminders",
  "reminder_deliveries",
  "task_series",
  "task_comments",
  "goals",
  "goal_comments",
  "goal_tasks",
  "challenges",
  "challenge_comments",
  "challenge_tasks",
  "learnings",
  "learning_updates",
  "task_checklist_items",
  "push_subscriptions",
  "push_summary_deliveries",
];

// Preserve quoted/dollar-quoted content conservatively, including dynamic SQL,
// while ignoring actual comments. This is a release guard, not a SQL rewriter.
export function stripSqlComments(sql) {
  let out = "",
    index = 0;
  while (index < sql.length) {
    if (sql[index] === "-" && sql[index + 1] === "-") {
      index = sql.indexOf("\n", index + 2);
      if (index < 0) break;
      out += "\n";
      continue;
    }
    if (sql[index] === "/" && sql[index + 1] === "*") {
      let depth = 1;
      index += 2;
      while (index < sql.length && depth) {
        if (sql[index] === "/" && sql[index + 1] === "*") {
          depth++;
          index += 2;
        } else if (sql[index] === "*" && sql[index + 1] === "/") {
          depth--;
          index += 2;
        } else index++;
      }
      out += " ";
      continue;
    }
    if (sql[index] === "'" || sql[index] === '"') {
      const quote = sql[index];
      out += sql[index++];
      while (index < sql.length) {
        const value = sql[index++];
        out += value;
        if (value === "\\" && index < sql.length) {
          out += sql[index++];
          continue;
        }
        if (value === quote) {
          if (sql[index] === quote) {
            out += sql[index++];
            continue;
          }
          break;
        }
      }
      continue;
    }
    if (sql[index] === "$") {
      const tag = sql
        .slice(index)
        .match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/)?.[0];
      if (tag) {
        const end = sql.indexOf(tag, index + tag.length);
        if (end < 0) {
          out += sql.slice(index);
          break;
        }
        out += sql.slice(index, end + tag.length);
        index = end + tag.length;
        continue;
      }
    }
    out += sql[index++];
  }
  return out;
}
export function destructiveMigrationOperation(sql) {
  const text = stripSqlComments(sql);
  if (/\bTRUNCATE\b/i.test(text)) return "TRUNCATE";
  if (/\bDELETE\s+FROM\b/i.test(text)) return "DELETE FROM";
  if (/\bDROP\s+(?:TABLE|SCHEMA|DATABASE|TYPE|DOMAIN|SEQUENCE)\b/i.test(text))
    return "DROP data object";
  if (
    /\bDROP\s+COLUMN\b/i.test(text) ||
    /\bALTER\s+TABLE\b[^;]*\bDROP\s+(?!(?:CONSTRAINT|DEFAULT|NOT|IDENTITY|EXPRESSION)\b)\S/i.test(
      text,
    )
  )
    return "DROP COLUMN";
  return null;
}
export function assertPendingMigrationsSafe(migrations, applied, before) {
  if (!Object.values(before).some((count) => BigInt(count) > 0n)) return;
  const finished = new Set(applied);
  for (const migration of migrations) {
    if (migration.name === retiredReset || finished.has(migration.name))
      continue;
    const operation = destructiveMigrationOperation(migration.sql);
    if (operation)
      throw Error(
        `Blocked destructive pending migration ${migration.name}: ${operation}. Existing application data must be preserved.`,
      );
  }
}
export async function readAppliedMigrations(db) {
  const exists = await db.query(
    "SELECT to_regclass('public._prisma_migrations') AS name",
  );
  if (!exists.rows[0]?.name) return [];
  return (
    await db.query(
      "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL",
    )
  ).rows.map((row) => row.migration_name);
}
export async function readBusinessRowCounts(db) {
  const existing = (
    await db.query(
      "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' AND tablename=ANY($1::text[])",
      [businessTables],
    )
  ).rows.map((row) => row.tablename);
  const tables = businessTables.filter((table) => existing.includes(table));
  if (!tables.length) return {};
  const sql = tables
    .map(
      (table) =>
        `SELECT '${table}' AS table_name,COUNT(*)::text AS row_count FROM "public"."${table}"`,
    )
    .join(" UNION ALL ");
  return Object.fromEntries(
    (await db.query(sql)).rows.map((row) => [
      row.table_name,
      String(row.row_count),
    ]),
  );
}
export function assertBusinessRowsPreserved(before, after) {
  for (const [table, count] of Object.entries(before)) {
    const next = after[table] || "0";
    if (BigInt(next) < BigInt(count))
      throw Error(
        `Migration preservation check failed: ${table} decreased from ${count} to ${next} rows.`,
      );
  }
}
export async function runPreservingMigrations(
  db,
  run,
  migrations,
  { dev = false, log = console.info } = {},
) {
  const before = await readBusinessRowCounts(db);
  const applied = await readAppliedMigrations(db);
  assertPendingMigrationsSafe(migrations, applied, before);
  // `migrate dev` may generate new, unreviewed SQL or request a reset after
  // this preflight. Existing records require reviewed deployment migrations.
  if (dev && Object.values(before).some((count) => BigInt(count) > 0n))
    throw Error(
      "Do not run migrate dev against a populated database. Create and review migrations on a disposable empty database, then use migrate deploy.",
    );
  log("migration_data_before", before);
  await retireDataReset(db, run);
  await run(["prisma", "migrate", dev ? "dev" : "deploy"]);
  const after = await readBusinessRowCounts(db);
  assertBusinessRowsPreserved(before, after);
  log("migration_data_after", after);
  return { before, after };
}
