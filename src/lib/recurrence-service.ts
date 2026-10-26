import { randomUUID } from "node:crypto";
import { Prisma, type TaskSeries } from "@/generated/prisma/client";
import { database } from "./db";
import { asDate, addDays, dateKey, DomainError } from "./domain";
import { occurrenceDates, type RepeatRule } from "./recurrence";
type Tx = Prisma.TransactionClient;
type Blueprint = {
  title: string;
  description: string | null;
  primaryCategoryId: string | null;
  templateId: string | null;
  urgency: number;
  importance: number;
  estimatedMinutes: number | null;

  dueOffsetMs: number | null;
  tags: string[];
  entities: { entityId: string; relationshipType: string }[];
  fields: Record<string, unknown>[];
};
const day = (date: Date) => date.toISOString().slice(0, 10);
export async function taskBlueprint(tx: Tx, id: string): Promise<Blueprint> {
  const t = await tx.task.findUniqueOrThrow({
    where: { id },
    include: { tags: true, entities: true, fieldValues: false },
  });
  return JSON.parse(
    JSON.stringify({
      title: t.title,
      description: t.description,
      primaryCategoryId: t.primaryCategoryId,
      templateId: null,
      urgency: t.urgency,
      importance: t.importance,
      estimatedMinutes: t.estimatedMinutes,

      dueOffsetMs:
        t.dueAt && t.plannedDate
          ? t.dueAt.getTime() - t.plannedDate.getTime()
          : null,
      tags: t.tags.map((e) => e.tagId),
      entities: t.entities.map((e) => ({
        entityId: e.entityId,
        relationshipType: e.relationshipType,
      })),
      fields: [],
    }),
  );
}
export async function generateSeries(
  tx: Tx,
  series: TaskSeries,
  through: string,
  windowStart?: string,
) {
  if (!series.active) return;
  const start = day(series.startsOn);
  const from =
    windowStart ||
    (series.generatedThrough
      ? addDays(day(series.generatedThrough), 1)
      : start);
  if (from > through) return;
  const b = series.blueprint as unknown as Blueprint;
  const dates = occurrenceDates(
    start,
    {
      unit: series.unit as RepeatRule["unit"],
      interval: series.interval,
      endsOn: series.endsOn ? day(series.endsOn) : null,
    },
    from,
    through,
  );
  if (dates.length) {
    const existing = await tx.task.findMany({
      where: {
        seriesId: series.id,
        recurrenceDate: { in: dates.map((date) => asDate(date)!) },
      },
      select: {
        id: true,
        recurrenceDate: true,
        scheduleRemoved: true,
        isException: true,
      },
    });
    const byDate = new Map(
      existing.map((task) => [day(task.recurrenceDate!), task]),
    );
    const restore = existing.filter(
      (task) => task.scheduleRemoved && !task.isException,
    );
    const fresh = dates
      .filter((date) => !byDate.has(date))
      .map((date) => ({ id: randomUUID(), date }));
    if (restore.length) {
      await tx.task.updateMany({
        where: { id: { in: restore.map((t) => t.id) } },
        data: {
          archivedAt: null,
          scheduleRemoved: false,
          version: { increment: 1 },
        },
      });
      await tx.taskEvent.createMany({
        data: restore.map((t) => ({
          userId: series.userId,
          taskId: t.id,
          eventType: "ARCHIVED" as const,
          toValue: { archived: false, reason: "Series schedule restored" },
        })),
      });
    }
    if (fresh.length) {
      await tx.task.createMany({
        data: fresh.map(({ id, date }) => ({
          id,
          userId: series.userId,
          seriesId: series.id,
          recurrenceDate: asDate(date),
          plannedDate: asDate(date),
          status: "PLANNED" as const,
          title: b.title,
          description: b.description,
          primaryCategoryId: b.primaryCategoryId,
          urgency: b.urgency,
          importance: b.importance,
          estimatedMinutes: b.estimatedMinutes,
          dueAt:
            b.dueOffsetMs == null
              ? null
              : new Date(asDate(date)!.getTime() + b.dueOffsetMs),
        })),
      });
      if (b.tags.length)
        await tx.taskTag.createMany({
          data: fresh.flatMap((t) =>
            b.tags.map((tagId) => ({
              userId: series.userId,
              taskId: t.id,
              tagId,
            })),
          ),
        });
      if (b.entities.length)
        await tx.taskEntityLink.createMany({
          data: fresh.flatMap((t) =>
            b.entities.map((e) => ({
              userId: series.userId,
              taskId: t.id,
              ...e,
            })),
          ),
        });
      await tx.taskEvent.createMany({
        data: fresh.map((t) => ({
          userId: series.userId,
          taskId: t.id,
          eventType: "CREATED" as const,
          toValue: { title: b.title, plannedDate: t.date, seriesId: series.id },
        })),
      });
    }
  }
  if (!windowStart)
    await tx.taskSeries.update({
      where: { id: series.id },
      data: { generatedThrough: asDate(through) },
    });
}
export async function attachSeries(
  tx: Tx,
  userId: string,
  taskId: string,
  rule: RepeatRule,
) {
  const t = await tx.task.findFirstOrThrow({ where: { id: taskId, userId } });
  if (t.seriesId)
    throw new DomainError(
      "This task already repeats. Edit its repeat schedule instead.",
    );
  if (!t.plannedDate)
    throw new DomainError(
      "Choose a planned date before adding a repeat schedule.",
    );
  if (t.archivedAt)
    throw new DomainError("Restore this task before making it repeat.");
  const start = day(t.plannedDate);
  if (rule.endsOn && rule.endsOn < start)
    throw new DomainError("Repeat end must be on or after the first date.");
  const owner = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  const today = dateKey(new Date(), owner.timezone);
  const series = await tx.taskSeries.create({
    data: {
      generatedThrough: start < today ? asDate(addDays(today, -1)) : null,
      userId,
      unit: rule.unit,
      interval: rule.interval,
      startsOn: t.plannedDate,
      endsOn: asDate(rule.endsOn),
      blueprint: (await taskBlueprint(
        tx,
        t.id,
      )) as unknown as Prisma.InputJsonValue,
    },
  });
  await tx.task.update({
    where: { id: t.id },
    data: {
      seriesId: series.id,
      recurrenceDate: t.plannedDate,
      version: { increment: 1 },
    },
  });
  await tx.taskEvent.create({
    data: {
      userId,
      taskId: t.id,
      eventType: "UPDATED",
      toValue: { seriesId: series.id, repeat: rule },
    },
  });
  await generateSeries(tx, series, addDays(start > today ? start : today, 30));
  return series;
}
export async function ensureRecurringTasks(
  userId: string,
  today: string,
  through?: string,
  from?: string,
) {
  const limit = addDays(today, 730);
  if (through && through > limit)
    throw new DomainError(
      "Recurring tasks can be viewed up to two years ahead.",
    );
  const horizon = through || addDays(today, 6);
  const windowStart = from || addDays(horizon, -6);
  const pending = await database().taskSeries.findFirst({
    where: {
      userId,
      active: true,
      startsOn: { lte: asDate(horizon)! },
      AND: [
        { OR: [{ endsOn: null }, { endsOn: { gte: asDate(windowStart)! } }] },
        {
          OR: [
            { generatedThrough: null },
            { generatedThrough: { lt: asDate(horizon)! } },
          ],
        },
      ],
    },
    select: { id: true },
  });
  if (!pending) return;
  // Recheck inside the lock: another request may have generated the same window.
  // A per-owner row lock serializes concurrent tab refreshes before generation.
  await database().$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const series = await tx.taskSeries.findMany({
        where: {
          userId,
          active: true,
          startsOn: { lte: asDate(horizon)! },
          OR: [{ endsOn: null }, { endsOn: { gte: asDate(windowStart)! } }],
        },
      });
      for (const s of series) {
        if (s.generatedThrough && day(s.generatedThrough) >= horizon) continue;
        const actualFrom = windowStart < today ? today : windowStart;
        await generateSeries(tx, s, horizon, actualFrom);
        // Only advance the contiguous cursor when this window joins the existing prefix.
        if (
          s.generatedThrough &&
          actualFrom <= addDays(day(s.generatedThrough), 1)
        )
          await tx.taskSeries.update({
            where: { id: s.id },
            data: { generatedThrough: asDate(horizon) },
          });
      }
    },
    { timeout: 60000 },
  );
}
export async function changeSchedule(
  tx: Tx,
  userId: string,
  id: string,
  version: number,
  rule: RepeatRule,
  active: boolean,
) {
  const s = await tx.taskSeries.findFirst({ where: { id, userId } });
  if (!s) throw new DomainError("Series not found.");
  if (s.version !== version)
    throw new DomainError("This series changed. Refresh and try again.");
  const start = day(s.startsOn);
  if (rule.endsOn && rule.endsOn < start)
    throw new DomainError("Repeat end must be on or after the first date.");
  const owner = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  const today = dateKey(new Date(), owner.timezone);
  const horizon = [
    addDays(today, 30),
    s.generatedThrough ? day(s.generatedThrough) : start,
  ]
    .sort()
    .at(-1)!;
  const nextDates = new Set(
    active ? occurrenceDates(start, rule, today, horizon) : [],
  );
  const future = await tx.task.findMany({
    where: {
      seriesId: id,
      userId,
      isException: false,
      effort: { none: {} },
      events: { none: { eventType: "EFFORT_RECORDED" } },
      status: { in: ["PLANNED", "INBOX"] },
      recurrenceDate: { gte: asDate(today)! },
      archivedAt: null,
    },
  });
  for (const t of future)
    if (!nextDates.has(day(t.recurrenceDate!))) {
      await tx.task.update({
        where: { id: t.id },
        data: {
          archivedAt: new Date(),
          scheduleRemoved: true,
          version: { increment: 1 },
        },
      });
      await tx.taskEvent.create({
        data: {
          userId,
          taskId: t.id,
          eventType: "ARCHIVED",
          toValue: { archived: true, reason: "Repeat schedule changed" },
        },
      });
    }
  const updated = await tx.taskSeries.update({
    where: { id },
    data: {
      unit: rule.unit,
      interval: rule.interval,
      endsOn: asDate(rule.endsOn),
      active,
      generatedThrough: asDate(addDays(today, -1)),
      version: { increment: 1 },
    },
  });
  const anchor = await tx.task.findFirst({
    where: { seriesId: id, userId },
    orderBy: { recurrenceDate: "asc" },
    select: { id: true },
  });
  if (anchor)
    await tx.taskEvent.create({
      data: {
        userId,
        taskId: anchor.id,
        eventType: "UPDATED",
        fromValue: {
          repeat: {
            unit: s.unit,
            interval: s.interval,
            endsOn: s.endsOn ? day(s.endsOn) : null,
            active: s.active,
          },
        },
        toValue: { repeat: { ...rule, active }, scope: "SERIES_SCHEDULE" },
      },
    });
  await generateSeries(tx, updated, addDays(today, 30));
  return updated;
}
