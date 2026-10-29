import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import {
  readFileSync,
  readdirSync,
  mkdirSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { spawn } from "node:child_process";
import { randomBytes, scryptSync } from "node:crypto";
import webpush from "web-push";
const password = randomBytes(18).toString("base64url");
const salt = randomBytes(16).toString("hex");
const hash = `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
const vapid = webpush.generateVAPIDKeys();
const env = {
  ...process.env,
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54339/postgres",
  DIRECT_URL: "postgresql://postgres:postgres@127.0.0.1:54339/postgres",
  LOCAL_PGLITE: "1",
  ALLOW_INTEGRATION_TEST_DATABASE: "1",
  APP_URL: "http://127.0.0.1:3107",
  OWNER_EMAIL: "isolated@example.test",
  OWNER_NAME: "Test workspace",
  OWNER_PASSWORD_HASH: hash,
  APP_TIMEZONE: "Asia/Kolkata",
  TEST_LOGIN_PASSWORD: password,
  TEST_ISOLATED: "1",
  PUSH_VAPID_PUBLIC_KEY: vapid.publicKey,
  PUSH_VAPID_PRIVATE_KEY: vapid.privateKey,
  PUSH_CONTACT: "mailto:isolated@example.test",
  CRON_SECRET: randomBytes(32).toString("base64url"),
  PLAYWRIGHT_CHROME_PATH:
    process.env.PLAYWRIGHT_CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
};
const db = await PGlite.create();
// The socket preview does not honor pg's startup timezone option. Match the
// production adapter explicitly so DateTime parameters round-trip as UTC.
await db.exec("SET TIME ZONE 'UTC'");
for (const name of readdirSync("prisma/migrations")
  .filter((n) => /^\d/.test(n))
  .sort()) {
  if (name !== "202610240009_clean_start")
    await db.exec(
      readFileSync(`prisma/migrations/${name}/migration.sql`, "utf8"),
    );
}
const socket = new PGLiteSocketServer({
  db,
  port: 54339,
  host: "127.0.0.1",
  maxConnections: 10,
});
await socket.start();
const app = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3107",
  ],
  { env, stdio: "inherit" },
);
function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(Error(`Test process exited ${code}`)),
    );
  });
}
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(env.APP_URL + "/login")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!ready) throw Error("Test app did not start.");
  await run(["--import", "tsx", "--test", "tests/database.integration.ts"]);
  await run([
    "--import",
    "tsx",
    "--test",
    "tests/stability.http.ts",
    "tests/push.http.ts",
  ]);
  if (process.argv.includes("--manual")) {
    mkdirSync("work", { recursive: true });
    writeFileSync("work/isolated-login.json", JSON.stringify({ password }), {
      mode: 0o600,
    });
    console.log(
      "Isolated app ready for browser verification on http://127.0.0.1:3107",
    );
    await new Promise((resolve) => {
      process.once("SIGTERM", resolve);
      process.once("SIGINT", resolve);
    });
    unlinkSync("work/isolated-login.json");
  } else if (!process.argv.includes("--api-only"))
    await run(["node_modules/@playwright/test/cli.js", "test"]);
} finally {
  app.kill("SIGTERM");
  await new Promise((r) => (app.exitCode !== null ? r() : app.once("exit", r)));
  await socket.stop();
  // The socket adapter can finish an already-started protocol callback after
  // its server closes. Drain exclusive work before tearing down the WASM DB.
  await db.runExclusive(async () => {});
  await db.close();
}
