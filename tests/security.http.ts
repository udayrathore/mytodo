import "dotenv/config";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { database } from "../src/lib/db";
if (process.env.LOCAL_PGLITE !== "1")
  throw new Error(
    "HTTP tests require the local preview database and .local/login.txt.",
  );
const base = process.env.APP_URL!;
const login = readFileSync(".local/login.txt", "utf8");
const email = login.match(/Email: (.+)/)![1],
  password = login.match(/Password: (.+)/)![1];
const db = database();
after(() => db.$disconnect());
async function post(
  path: string,
  body: unknown,
  cookie?: string,
  origin = base,
) {
  return fetch(base + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}
test("HTTP authentication, origin checks, validation, reminder delivery, revocation and rate limits", async () => {
  assert.equal((await fetch(base + "/api/workspace")).status, 401);
  assert.equal(
    (
      await post("/api/commands", {
        type: "task.create",
        title: "Unauthorized",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await post(
        "/api/login",
        { email, password },
        undefined,
        "https://untrusted.invalid",
      )
    ).status,
    400,
  );
  assert.equal(
    (await post("/api/login", { email, password: "incorrect" })).status,
    400,
  );
  const signed = await post("/api/login", { email, password });
  assert.equal(signed.status, 200);
  const setCookie = signed.headers.get("set-cookie")!;
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=lax/i);
  const cookie = setCookie.split(";")[0];
  assert.equal(
    (
      await post(
        "/api/commands",
        { type: "task.create", title: "Wrong origin" },
        cookie,
        "https://untrusted.invalid",
      )
    ).status,
    401,
  );
  assert.equal(
    (await post("/api/commands", { type: "task.create", title: "  " }, cookie))
      .status,
    400,
  );
  const before = await fetch(base + "/api/workspace", {
    headers: { Cookie: cookie },
  });
  assert.equal(before.status, 200);
  assert.match(before.headers.get("cache-control")!, /no-store/);
  const snapshot = await before.json();
  assert.ok(snapshot.tasks.length > 0);
  const owner = await db.user.findUniqueOrThrow({ where: { email } });
  const taskId = snapshot.tasks[0].id;
  const reminder = await db.reminder.create({
    data: {
      userId: owner.id,
      taskId,
      scheduledFor: new Date(Date.now() - 1000),
    },
  });
  await fetch(base + "/api/workspace", { headers: { Cookie: cookie } });
  await fetch(base + "/api/workspace", { headers: { Cookie: cookie } });
  assert.equal(
    await db.reminderDelivery.count({ where: { reminderId: reminder.id } }),
    1,
  );
  await post(
    "/api/commands",
    { type: "reminder.dismiss", id: reminder.id },
    cookie,
  );
  const signedOut = await post("/api/logout", {}, cookie);
  assert.equal(signedOut.status, 200);
  assert.equal(
    (await fetch(base + "/api/workspace", { headers: { Cookie: cookie } }))
      .status,
    401,
  );
  // The throttle is durable in the database, rather than an in-memory per-instance counter.
  await db.$executeRaw`INSERT INTO login_buckets(key,attempts,resets_at) VALUES('owner',10,NOW()+INTERVAL '15 minutes') ON CONFLICT(key) DO UPDATE SET attempts=10,resets_at=NOW()+INTERVAL '15 minutes'`;
  const blocked = await post("/api/login", { email, password });
  assert.equal(blocked.status, 400);
  assert.match((await blocked.json()).error, /Too many/);
  await db.loginBucket.deleteMany({ where: { key: "owner" } });
});
