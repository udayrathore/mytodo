import { database } from "./db";
import { dateKey } from "./domain";
export async function getWorkspace(user: {
  id: string;
  name: string;
  timezone: string;
}) {
  const db = database();
  const userId = user.id;
  // In-app delivery is access-driven, not a background promise. Claim and log atomically.
  await db.$transaction(async (tx) => {
    const due = await tx.reminder.findMany({
      where: {
        userId,
        channel: "IN_APP",
        status: "PENDING",
        scheduledFor: { lte: new Date() },
      },
      take: 100,
    });
    for (const r of due) {
      const claimed = await tx.reminder.updateMany({
        where: { id: r.id, status: "PENDING" },
        data: { status: "DELIVERED" },
      });
      if (claimed.count)
        await tx.reminderDelivery.create({
          data: {
            userId,
            reminderId: r.id,
            status: "DELIVERED",
            provider: "in-app",
          },
        });
    }
  });
  const [
    tasks,
    categories,
    tags,
    entities,
    periods,
    templates,
    journals,
    events,
    reminders,
  ] = await Promise.all([
    db.task.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        tags: true,
        entities: true,
        periods: true,
        effort: true,
        fieldValues: true,
        relationsFrom: true,
      },
    }),
    db.category.findMany({
      where: { userId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    db.tag.findMany({ where: { userId }, orderBy: { name: "asc" } }),
    db.entity.findMany({ where: { userId }, orderBy: { name: "asc" } }),
    db.planningPeriod.findMany({
      where: { userId },
      orderBy: { startsOn: "desc" },
    }),
    db.taskTemplate.findMany({
      where: { userId },
      include: { fields: { orderBy: { sortOrder: "asc" } } },
      orderBy: { name: "asc" },
    }),
    db.journalEntry.findMany({
      where: { userId },
      orderBy: { occurredAt: "desc" },
      include: { categories: true, entities: true },
    }),
    db.taskEvent.findMany({
      where: { userId },
      orderBy: { occurredAt: "desc" },
    }),
    db.reminder.findMany({
      where: { userId, status: { not: "CANCELLED" } },
      orderBy: { scheduledFor: "asc" },
      include: { deliveries: true },
    }),
  ]);
  return JSON.parse(
    JSON.stringify({
      user: { name: user.name, timezone: user.timezone },
      today: dateKey(new Date(), user.timezone),
      tasks,
      categories,
      tags,
      entities,
      periods,
      templates,
      journals,
      events,
      reminders,
    }),
  ) as Workspace;
}
// Wire types explicitly document the serialization boundary (dates/decimals become strings).
export type Category = {
  id: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
  sortOrder: number;
};
export type Tag = { id: string; name: string; description: string | null };
export type Entity = {
  id: string;
  name: string;
  type: string;
  description: string | null;
  parentEntityId: string | null;
  isActive: boolean;
};
export type Field = {
  id: string;
  key: string;
  label: string;
  fieldType: string;
  required: boolean;
  configuration: { options?: string[] } | null;
};
export type Template = {
  id: string;
  name: string;
  description: string | null;
  revision: number;
  isActive: boolean;
  fields: Field[];
};
export type Period = {
  id: string;
  title: string;
  startsOn: string;
  endsOn: string;
  status: string;
};
export type Effort = {
  id: string;
  minutes: number;
  occurredOn: string;
  note: string | null;
};
export type FieldValue = {
  templateFieldId: string;
  textValue: string | null;
  numberValue: string | null;
  booleanValue: boolean | null;
  dateValue: string | null;
  datetimeValue: string | null;
  jsonValue: string[] | null;
};
export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  primaryCategoryId: string | null;
  templateId: string | null;
  plannedDate: string | null;
  dueAt: string | null;
  estimatedMinutes: number | null;
  manualActualMinutes: number | null;
  completedAt: string | null;
  createdAt: string;
  archivedAt: string | null;
  version: number;
  tags: { tagId: string }[];
  entities: { entityId: string; relationshipType: string }[];
  periods: {
    planningPeriodId: string;
    removedAt: string | null;
    plannedAt: string;
  }[];
  effort: Effort[];
  fieldValues: FieldValue[];
  relationsFrom: { targetTaskId: string; relationType: string }[];
};
export type Journal = {
  id: string;
  title: string | null;
  content: string;
  occurredAt: string;
  archivedAt: string | null;
  categories: { categoryId: string }[];
  entities: { entityId: string }[];
};
export type TaskEvent = {
  id: string;
  taskId: string;
  eventType: string;
  occurredAt: string;
  fromValue: Record<string, unknown> | null;
  toValue: Record<string, unknown> | null;
};
export type Reminder = {
  id: string;
  taskId: string | null;
  scheduledFor: string;
  status: string;
};
export type Workspace = {
  user: { name: string; timezone: string };
  today: string;
  tasks: Task[];
  categories: Category[];
  tags: Tag[];
  entities: Entity[];
  periods: Period[];
  templates: Template[];
  journals: Journal[];
  events: TaskEvent[];
  reminders: Reminder[];
};
