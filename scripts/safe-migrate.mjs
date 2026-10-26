import "dotenv/config";
import { Pool } from "pg";
import { execFileSync } from "node:child_process";
import { retireDataReset } from "./migration-safety.mjs";
const url =
  process.env.DIRECT_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_URL;
if (!url) throw Error("Configure a migration database URL first.");
const db = new Pool({ connectionString: url, max: 1 });
const run = (args) => execFileSync("npx", args, { stdio: "inherit" });
try {
  await retireDataReset(db, run);
} finally {
  await db.end();
}
run(["prisma", "migrate", process.argv.includes("--dev") ? "dev" : "deploy"]);
