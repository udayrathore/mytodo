import "dotenv/config";
import { Pool } from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
if (
  process.env.LOCAL_PGLITE !== "1" ||
  !process.env.DATABASE_URL?.includes("127.0.0.1:54329")
)
  throw new Error(
    "Only for the isolated local PGlite development database. Use npm run db:migrate on Neon.",
  );
const db = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
await db.query(
  "CREATE TABLE IF NOT EXISTS local_migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz DEFAULT now())",
);
for (const name of readdirSync("prisma/migrations")
  .filter((n) => /^\d/.test(n))
  .sort()) {
  const sql = readFileSync(`prisma/migrations/${name}/migration.sql`, "utf8");
  const checksum = createHash("sha256").update(sql).digest("hex");
  const previous = await db.query(
    "SELECT checksum FROM local_migrations WHERE name=$1",
    [name],
  );
  if (previous.rowCount) {
    if (previous.rows[0].checksum !== checksum)
      throw new Error("Applied migration changed. Start a new local database.");
    continue;
  }
  await db.query("BEGIN");
  try {
    if (name !== "202610240009_clean_start") await db.query(sql);
    await db.query(
      "INSERT INTO local_migrations(name,checksum) VALUES($1,$2)",
      [name, checksum],
    );
    await db.query("COMMIT");
    console.log(`Applied ${name}`);
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  }
}
await db.end();
