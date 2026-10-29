import { randomUUID } from "node:crypto";
import webpush from "web-push";
import { database } from "./db";
import {
  pushEndpointHash,
  pushSubscriptionInput,
  validVapidConfiguration,
} from "./push-input";
import {
  dueSummarySlot,
  localSummaryClock,
  pushRetryDelay,
  summaryPayload,
  type SummaryCounts,
  type SummarySlot,
} from "./push-scheduling";
import type { z } from "zod";

type Subscription = { endpoint: string; p256dh: string; auth: string };
export type PushSender = (
  subscription: Subscription,
  payload: ReturnType<typeof summaryPayload>,
) => Promise<void>;
export class PushError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function pushConfigured() {
  return validVapidConfiguration(
    process.env.PUSH_VAPID_PUBLIC_KEY || "",
    process.env.PUSH_VAPID_PRIVATE_KEY || "",
    process.env.PUSH_CONTACT || "",
  );
}
export const sendPush: PushSender = async (subscription, payload) => {
  if (!pushConfigured())
    throw new PushError("Push notifications are not configured.", 503);
  await webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    },
    JSON.stringify(payload),
    {
      TTL: 3600,
      urgency: "normal",
      timeout: 10000,
      vapidDetails: {
        subject: process.env.PUSH_CONTACT!,
        publicKey: process.env.PUSH_VAPID_PUBLIC_KEY!,
        privateKey: process.env.PUSH_VAPID_PRIVATE_KEY!,
      },
    },
  );
};
const active = (now: Date) => ({
  disabledAt: null,
  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
});
export async function pushStatus(
  userId: string,
  timezone: string,
  now = new Date(),
) {
  const subscriptions = await database().pushSubscription.findMany({
    where: { userId, ...active(now) },
    select: { endpointHash: true },
  });
  return {
    configured: pushConfigured(),
    publicKey: pushConfigured() ? process.env.PUSH_VAPID_PUBLIC_KEY! : null,
    timezone,
    schedule: [9, 20],
    pendingScope: "ALL",
    enabled: subscriptions.length > 0,
    subscriptionHashes: subscriptions.map((item) => item.endpointHash),
  };
}
export async function subscribePush(
  userId: string,
  input: z.infer<typeof pushSubscriptionInput>,
  now = new Date(),
) {
  const subscription = pushSubscriptionInput.parse(input);
  if (
    subscription.expirationTime &&
    subscription.expirationTime <= now.getTime()
  )
    throw new PushError(
      "This browser subscription expired. Enable notifications again.",
    );
  const endpointHash = pushEndpointHash(subscription.endpoint),
    db = database();
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id=${userId}::uuid FOR UPDATE`;
    const existing = await tx.pushSubscription.findUnique({
      where: { endpointHash },
    });
    if (existing && existing.userId !== userId)
      throw new PushError(
        "This subscription belongs to a different account.",
        409,
      );
    const fields = {
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      expiresAt: subscription.expirationTime
        ? new Date(subscription.expirationTime)
        : null,
      disabledAt: null,
      lastErrorCode: null,
    };
    return tx.pushSubscription.upsert({
      where: { endpointHash },
      create: { userId, endpointHash, ...fields },
      update: fields,
      select: { id: true },
    });
  });
}
export async function unsubscribePush(
  userId: string,
  endpoint: string,
  now = new Date(),
) {
  await database().pushSubscription.updateMany({
    where: { userId, endpointHash: pushEndpointHash(endpoint) },
    data: { disabledAt: now },
  });
}
export async function dailyTaskCounts(
  userId: string,
  timezone: string,
  date: string,
): Promise<SummaryCounts> {
  const [counts] = await database().$queryRaw<
    { completed: number; pending: number }[]
  >`
    SELECT (COUNT(*) FILTER (WHERE status='COMPLETED' AND (completed_at AT TIME ZONE ${timezone})::date=${date}::date))::int AS completed,
      (COUNT(*) FILTER (WHERE archived_at IS NULL AND status NOT IN ('COMPLETED','CANCELLED')))::int AS pending
    FROM tasks WHERE user_id=${userId}::uuid`;
  return counts || { completed: 0, pending: 0 };
}
const errorCode = (cause: unknown) =>
  typeof (cause as { statusCode?: unknown })?.statusCode === "number"
    ? (cause as { statusCode: number }).statusCode
    : null;
async function recordSubscriptionResult(
  id: string,
  now: Date,
  code: number | null,
  success: boolean,
) {
  await database().pushSubscription.updateMany({
    where: { id },
    data: success
      ? { lastSuccessAt: now, lastErrorCode: null }
      : {
          lastErrorAt: now,
          lastErrorCode: code,
          ...([404, 410].includes(code || 0) ? { disabledAt: now } : {}),
        },
  });
}
export async function testPush(
  userId: string,
  timezone: string,
  endpoint: string,
  sender: PushSender = sendPush,
  now = new Date(),
) {
  const db = database(),
    subscription = await db.pushSubscription.findFirst({
      where: {
        userId,
        endpointHash: pushEndpointHash(endpoint),
        ...active(now),
      },
    });
  if (!subscription)
    throw new PushError("Enable notifications on this browser first.", 404);
  const claim = await db.pushSubscription.updateMany({
    where: {
      id: subscription.id,
      userId,
      OR: [
        { lastTestAt: null },
        { lastTestAt: { lte: new Date(now.getTime() - 60_000) } },
      ],
    },
    data: { lastTestAt: now },
  });
  if (!claim.count)
    throw new PushError("Wait a minute before sending another test.", 429);
  const counts = await dailyTaskCounts(
    userId,
    timezone,
    localSummaryClock(timezone, now).date,
  );
  try {
    await sender(subscription, {
      ...summaryPayload(counts, localSummaryClock(timezone, now).date, "test"),
      tag: `task-summary-test-${randomUUID()}`,
    });
    await recordSubscriptionResult(subscription.id, now, null, true);
  } catch (cause) {
    const code = errorCode(cause);
    await recordSubscriptionResult(subscription.id, now, code, false);
    throw new PushError(
      [404, 410].includes(code || 0)
        ? "This browser subscription expired. Disable and enable notifications again."
        : "The push service could not accept this test. Try again shortly.",
      502,
    );
  }
}

/** Durable claims prevent concurrent schedulers from sending the same device/slot twice. */
export async function dispatchDailySummaries({
  now = new Date(),
  sender = sendPush,
  limit = 5,
}: { now?: Date; sender?: PushSender; limit?: number } = {}) {
  const db = database(),
    summary = { enqueued: 0, sent: 0, failed: 0, expired: 0, skipped: 0 };
  const subscriptions = await db.pushSubscription.findMany({
    where: active(now),
    include: { user: { select: { timezone: true } } },
  });
  for (const subscription of subscriptions) {
    let due: ReturnType<typeof dueSummarySlot>;
    try {
      due = dueSummarySlot(
        subscription.user.timezone,
        now,
        Number(process.env.PUSH_SCHEDULE_WINDOW_MINUTES) || 15,
      );
    } catch {
      continue;
    }
    if (!due) continue;
    const created = await db.pushSummaryDelivery.createMany({
      data: [
        {
          userId: subscription.userId,
          subscriptionId: subscription.id,
          localDate: new Date(due.date),
          slot: due.slot,
          nextAttemptAt: now,
          expiresAt: due.expiresAt,
        },
      ],
      skipDuplicates: true,
    });
    summary.enqueued += created.count;
  }
  const expired = await db.pushSummaryDelivery.updateMany({
    where: {
      expiresAt: { lte: now },
      status: { in: ["PENDING", "FAILED", "SENDING"] },
    },
    data: { status: "EXPIRED", leaseUntil: null, leaseToken: null },
  });
  summary.expired = expired.count;
  const candidates = await db.pushSummaryDelivery.findMany({
    where: {
      expiresAt: { gt: now },
      nextAttemptAt: { lte: now },
      attempts: { lt: 5 },
      OR: [
        { status: { in: ["PENDING", "FAILED"] } },
        { status: "SENDING", leaseUntil: { lt: now } },
      ],
      subscription: active(now),
    },
    orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }],
    take: Math.max(1, Math.min(limit, 100)),
    include: {
      subscription: { include: { user: { select: { timezone: true } } } },
    },
  });
  const countsByUser = new Map<string, Promise<SummaryCounts>>();
  for (const delivery of candidates) {
    const token = randomUUID();
    const claim = await db.pushSummaryDelivery.updateMany({
      where: {
        id: delivery.id,
        expiresAt: { gt: now },
        nextAttemptAt: { lte: now },
        attempts: { lt: 5 },
        OR: [
          { status: { in: ["PENDING", "FAILED"] } },
          { status: "SENDING", leaseUntil: { lt: now } },
        ],
        subscription: active(now),
      },
      data: {
        status: "SENDING",
        leaseToken: token,
        leaseUntil: new Date(now.getTime() + 120_000),
        attempts: { increment: 1 },
      },
    });
    if (!claim.count) {
      summary.skipped++;
      continue;
    }
    const date = delivery.localDate.toISOString().slice(0, 10),
      countsKey = `${delivery.userId}:${date}`;
    if (!countsByUser.has(countsKey))
      countsByUser.set(
        countsKey,
        dailyTaskCounts(
          delivery.userId,
          delivery.subscription.user.timezone,
          date,
        ),
      );
    try {
      const counts = await countsByUser.get(countsKey)!;
      await sender(
        delivery.subscription,
        summaryPayload(counts, date, delivery.slot as SummarySlot),
      );
      await db.pushSummaryDelivery.updateMany({
        where: { id: delivery.id, leaseToken: token, status: "SENDING" },
        data: {
          status: "SENT",
          sentAt: now,
          leaseUntil: null,
          leaseToken: null,
          completedCount: counts.completed,
          pendingCount: counts.pending,
          lastErrorCode: null,
        },
      });
      await recordSubscriptionResult(delivery.subscriptionId, now, null, true);
      summary.sent++;
    } catch (cause) {
      const code = errorCode(cause),
        gone = [404, 410].includes(code || 0);
      await db.pushSummaryDelivery.updateMany({
        where: { id: delivery.id, leaseToken: token, status: "SENDING" },
        data: {
          status: gone ? "EXPIRED" : "FAILED",
          nextAttemptAt: new Date(
            now.getTime() + pushRetryDelay(delivery.attempts + 1),
          ),
          leaseUntil: null,
          leaseToken: null,
          lastErrorCode: code,
        },
      });
      await recordSubscriptionResult(delivery.subscriptionId, now, code, false);
      summary.failed++;
    }
  }
  const remaining = await db.pushSummaryDelivery.count({
    where: {
      expiresAt: { gt: now },
      attempts: { lt: 5 },
      status: { in: ["PENDING", "FAILED", "SENDING"] },
      subscription: active(now),
    },
  });
  return { ...summary, remaining };
}
