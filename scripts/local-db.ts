import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { hashPassword } from "../src/lib/password";
if (process.env.VERCEL)
  throw new Error("Local database helper cannot run on Vercel.");
mkdirSync(".local", { recursive: true });
const db = await PGlite.create(".local/pglite");
await db.exec("SET TIME ZONE 'UTC'");
const server = new PGLiteSocketServer({
  db,
  port: 54329,
  host: "127.0.0.1",
  maxConnections: 8,
});
await server.start();
if (!existsSync(".env")) {
  const password = randomBytes(18).toString("base64url");
  const url = "postgresql://postgres:postgres@127.0.0.1:54329/postgres";
  writeFileSync(
    ".env",
    `DATABASE_URL="${url}"\nDIRECT_URL="${url}"\nAPP_URL="http://localhost:3000"\nOWNER_EMAIL="owner@example.test"\nOWNER_NAME="Alex"\nAPP_TIMEZONE="Asia/Kolkata"\nLOCAL_PGLITE="1"\nOWNER_PASSWORD_HASH="${await hashPassword(password)}"\n`,
    { mode: 0o600 },
  );
  writeFileSync(
    ".local/login.txt",
    `Email: owner@example.test\nPassword: ${password}\n`,
    { mode: 0o600 },
  );
  console.log("Created local .env and .local/login.txt (ignored by Git).");
}
console.log(
  "Development-only PGlite ready on 127.0.0.1:54329. Keep this terminal running.",
);
const shutdown = async () => {
  await server.stop();
  await db.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
await new Promise(() => {});
