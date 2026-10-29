import { test } from "node:test";
import { createECDH } from "node:crypto";
import assert from "node:assert/strict";
import {
  dueSummarySlot,
  localSummaryClock,
  pushRetryDelay,
  summaryPayload,
} from "../src/lib/push-scheduling";
import {
  pushSubscriptionInput,
  trustedPushEndpoint,
  validCronAuthorization,
  validVapidConfiguration,
} from "../src/lib/push-input";
test("push schedules use account-local 9am/8pm, including half-hour offsets and daylight saving", () => {
  assert.equal(
    dueSummarySlot("Asia/Kolkata", new Date("2026-10-30T03:30:00Z"))?.slot,
    "morning",
  );
  assert.equal(
    dueSummarySlot("Asia/Kolkata", new Date("2026-10-30T14:30:00Z"))?.slot,
    "evening",
  );
  assert.equal(
    dueSummarySlot("Asia/Kolkata", new Date("2026-10-30T03:29:59Z")),
    null,
  );
  assert.equal(
    dueSummarySlot("Asia/Kolkata", new Date("2026-10-30T03:44:59Z"))?.slot,
    "morning",
  );
  assert.equal(
    dueSummarySlot("Asia/Kolkata", new Date("2026-10-30T03:45:00Z")),
    null,
  );
  assert.equal(
    dueSummarySlot("Asia/Kolkata", new Date("2026-10-30T04:29:59Z"), 60)?.slot,
    "morning",
  );
  assert.equal(
    dueSummarySlot("Asia/Kolkata", new Date("2026-10-30T04:30:00Z"), 60),
    null,
  );
  assert.equal(
    dueSummarySlot("America/New_York", new Date("2026-03-07T14:00:00Z"))?.slot,
    "morning",
  );
  assert.equal(
    dueSummarySlot("America/New_York", new Date("2026-03-08T13:00:00Z"))?.slot,
    "morning",
  );
  assert.equal(
    localSummaryClock("Asia/Kolkata", new Date("2026-10-29T20:00:00Z")).date,
    "2026-10-30",
  );
  assert.equal(
    dueSummarySlot(
      "Asia/Kolkata",
      new Date("2026-10-30T03:35:21Z"),
    )?.expiresAt.toISOString(),
    "2026-10-30T04:35:21.000Z",
  );
});
test("push subscriptions restrict outbound requests to browser push services and valid encryption keys", () => {
  for (const url of [
    "https://fcm.googleapis.com/fcm/send/token",
    "https://updates.push.services.mozilla.com/wpush/v2/token",
    "https://web.push.apple.com/token",
    "https://abc.notify.windows.com/w/?token=one",
  ])
    assert.equal(trustedPushEndpoint(url), true, url);
  for (const url of [
    "http://fcm.googleapis.com/token",
    "https://127.0.0.1/token",
    "https://fcm.googleapis.com.evil.test/token",
    "https://fcm.googleapis.com@evil.test/token",
    "https://fcm.googleapis.com:444/token",
    "https://fcm.googleapis.com/token#fragment",
    "https://evilnotify.windows.com/token",
  ])
    assert.equal(trustedPushEndpoint(url), false, url);
  const ec = createECDH("prime256v1");
  ec.generateKeys();
  const value = {
    endpoint: "https://fcm.googleapis.com/fcm/send/valid",
    keys: {
      p256dh: ec.getPublicKey().toString("base64url"),
      auth: Buffer.alloc(16, 1).toString("base64url"),
    },
  };
  assert.equal(pushSubscriptionInput.safeParse(value).success, true);
  assert.equal(
    pushSubscriptionInput.safeParse({
      ...value,
      keys: { ...value.keys, auth: "bad" },
    }).success,
    false,
  );
  assert.equal(
    pushSubscriptionInput.safeParse({
      ...value,
      keys: {
        ...value.keys,
        p256dh: Buffer.alloc(65, 1).toString("base64url"),
      },
    }).success,
    false,
  );
});
test("cron authentication and summary payloads are bounded and contain counts instead of private task titles", () => {
  const secret = "x".repeat(48);
  assert.equal(validCronAuthorization("Bearer " + secret, secret), true);
  for (const header of [
    null,
    "Bearer wrong",
    "Basic " + secret,
    "Bearer " + secret + "x",
  ])
    assert.equal(validCronAuthorization(header, secret), false);
  assert.equal(validCronAuthorization("Bearer short", "short"), false);
  const payload = summaryPayload(
    { completed: 3, pending: 8 },
    "2026-10-30",
    "evening",
  );
  assert.equal(payload.body, "3 completed today · 8 pending");
  assert.equal(payload.tag, "task-summary-2026-10-30-evening");
  assert.equal(payload.url, "/?view=today");
  assert.equal(pushRetryDelay(1), 30000);
  assert.equal(pushRetryDelay(20), 900000);
});

test("VAPID configuration rejects mismatched public and private keys before enabling push", () => {
  const first = createECDH("prime256v1"),
    second = createECDH("prime256v1");
  first.generateKeys();
  second.generateKeys();
  const publicKey = first.getPublicKey().toString("base64url"),
    privateKey = first.getPrivateKey().toString("base64url");
  assert.equal(
    validVapidConfiguration(publicKey, privateKey, "mailto:owner@example.test"),
    true,
  );
  assert.equal(
    validVapidConfiguration(
      publicKey,
      second.getPrivateKey().toString("base64url"),
      "mailto:owner@example.test",
    ),
    false,
  );
  assert.equal(
    validVapidConfiguration(publicKey, privateKey, "not-a-contact"),
    false,
  );
  assert.equal(
    validVapidConfiguration(publicKey, "invalid", "mailto:owner@example.test"),
    false,
  );
});
