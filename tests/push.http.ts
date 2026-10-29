import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createECDH } from "node:crypto";
import { database } from "../src/lib/db";
if (process.env.TEST_ISOLATED !== "1")
  throw Error("Run only in the disposable isolated test app.");
const base = process.env.APP_URL!,
  db = database();
after(() => db.$disconnect());
test("push settings require authentication, validate provider endpoints and disable without deleting records", async () => {
  assert.equal((await fetch(base + "/api/push")).status, 401);
  const login = await fetch(base + "/api/login", {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({ password: process.env.TEST_LOGIN_PASSWORD }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")!.split(";")[0];
  const request = (body: unknown, origin = base) =>
    fetch(base + "/api/push", {
      method: "POST",
      headers: {
        Origin: origin,
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  const endpoint = `https://fcm.googleapis.com/fcm/send/test-${randomUUID()}`;
  const ec = createECDH("prime256v1");
  ec.generateKeys();
  const subscription = {
    endpoint,
    expirationTime: null,
    keys: {
      p256dh: ec.getPublicKey().toString("base64url"),
      auth: Buffer.alloc(16, 1).toString("base64url"),
    },
  };
  assert.equal(
    (
      await request(
        { action: "subscribe", subscription },
        "https://wrong-origin.example",
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await request({
        action: "subscribe",
        subscription: {
          ...subscription,
          endpoint: "https://127.0.0.1/internal",
        },
      })
    ).status,
    400,
  );
  const before = await fetch(base + "/api/push", {
    headers: { Cookie: cookie },
  });
  assert.equal(before.status, 200);
  assert.match(before.headers.get("cache-control")!, /no-store/);
  const config = await before.json();
  assert.equal(config.configured, true);
  assert.deepEqual(config.schedule, [9, 20]);
  assert.equal(config.pendingScope, "ALL");
  assert.equal(
    (await request({ action: "subscribe", subscription })).status,
    200,
  );
  const enabled = await (
    await fetch(base + "/api/push", { headers: { Cookie: cookie } })
  ).json();
  assert.equal(enabled.enabled, true);
  assert.equal(
    enabled.subscriptionHashes.length,
    config.subscriptionHashes.length + 1,
  );
  const row = await db.pushSubscription.findFirstOrThrow({
    where: { endpoint },
  });
  assert.equal(
    (await request({ action: "unsubscribe", endpoint })).status,
    200,
  );
  const preserved = await db.pushSubscription.findUniqueOrThrow({
    where: { id: row.id },
  });
  assert.ok(preserved.disabledAt);
  const disabled = await (
    await fetch(base + "/api/push", { headers: { Cookie: cookie } })
  ).json();
  assert.equal(
    disabled.subscriptionHashes.length,
    config.subscriptionHashes.length,
  );
  assert.equal(
    (
      await fetch(base + "/api/cron/daily-summary", {
        headers: { Authorization: "Bearer invalid" },
      })
    ).status,
    401,
  );
  assert.equal((await request({ action: "test", endpoint })).status, 404);
});
