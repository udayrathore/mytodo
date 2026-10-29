import "dotenv/config";
import { Pool } from "pg";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runPreservingMigrations } from "./migration-safety.mjs";
const url =
  process.env.DIRECT_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_URL;
if (!url) throw Error("Configure a migration database URL first.");
const directory = "prisma/migrations";
const migrations = readdirSync(directory)
  .filter((name) => /^\d/.test(name))
  .sort()
  .map((name) => ({
    name,
    sql: readFileSync(join(directory, name, "migration.sql"), "utf8"),
  }));
const db = new Pool({ connectionString: url, max: 1 });
const run = (args) => execFileSync("npx", args, { stdio: "inherit" });
try {
  await runPreservingMigrations(db, run, migrations, {
    dev: process.argv.includes("--dev"),
  });
} finally {
  await db.end();
}
