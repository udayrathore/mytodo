import { test } from "node:test";
import assert from "node:assert/strict";
import { pushNotificationsEnabled } from "../src/lib/notification-feature";

test("notifications stay paused unless explicitly enabled", () => {
  const previous = process.env.ENABLE_PUSH_NOTIFICATIONS;
  try {
    delete process.env.ENABLE_PUSH_NOTIFICATIONS;
    assert.equal(pushNotificationsEnabled(), false);
    process.env.ENABLE_PUSH_NOTIFICATIONS = "false";
    assert.equal(pushNotificationsEnabled(), false);
    process.env.ENABLE_PUSH_NOTIFICATIONS = "true";
    assert.equal(pushNotificationsEnabled(), true);
  } finally {
    if (previous === undefined) delete process.env.ENABLE_PUSH_NOTIFICATIONS;
    else process.env.ENABLE_PUSH_NOTIFICATIONS = previous;
  }
});
