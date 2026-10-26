import { z } from "zod";
import { repeatRule } from "./recurrence";
export class DomainError extends Error {}
export const statuses = [
  "INBOX",
  "PLANNED",
  "IN_PROGRESS",
  "COMPLETED",
  "DEFERRED",
  "CANCELLED",
] as const;
export const fieldTypes = [
  "TEXT",
  "LONG_TEXT",
  "NUMBER",
  "BOOLEAN",
  "DATE",
  "DATETIME",
  "SELECT",
  "MULTI_SELECT",
] as const;
export const activeStatuses = new Set<string>([
  "INBOX",
  "PLANNED",
  "IN_PROGRESS",
  "DEFERRED",
]);
export const id = z.uuid();
const text = z.string().trim().max(20000);
const title = z.string().trim().min(1).max(240);
export const dateOnly = z.iso.date();
const nullableId = id.nullable().default(null);
const ids = z.array(id).max(50).default([]);
const taskFields = {
  title,
  description: text.default(""),
  primaryCategoryId: nullableId,
  urgency: z.number().int().min(0).max(10).default(5),
  importance: z.number().int().min(0).max(10).default(5),
  plannedDate: dateOnly.nullable().default(null),
  dueAt: z.iso.datetime({ offset: true }).nullable().default(null),
  estimatedMinutes: z
    .number()
    .int()
    .min(0)
    .max(100000)
    .nullable()
    .default(null),
  tagIds: ids,
  entityIds: ids,
  relationshipType: z.string().trim().min(1).max(80).default("CONTRIBUTES_TO"),
};
export const commandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("master.remove"),
    id: z.uuid(),
    kind: z.literal("tag"),
  }),
  z.object({
    type: z.literal("collection.settings"),
    id: z.uuid(),
    kind: z.enum(["category", "project"]),
    status: z.enum(["ACTIVE", "CLOSED", "ARCHIVED"]).optional(),
    imageData: z
      .string()
      .max(65000)
      .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/)
      .nullable()
      .optional(),
  }),
  z.object({
    type: z.literal("task.comment"),
    id: z.uuid(),
    body: z.string().trim().min(1).max(5000),
  }),
  z.object({
    type: z.literal("project.save"),
    id: id.optional(),
    name: title,
    description: text.default(""),
    categoryIds: z.array(id).min(1).max(100),
  }),
  z.object({
    type: z.literal("project.linkTask"),
    id,
    taskId: id,
    linked: z.boolean(),
  }),
  z.object({
    type: z.literal("task.tomorrow"),
    id,
    version: z.number().int().min(0),
  }),
  z.object({
    type: z.literal("task.schedule"),
    id,
    version: z.number().int().min(0),
    plannedDate: dateOnly,
  }),
  z.object({
    type: z.literal("tasks.capture"),
    projectId: id.optional(),
    tasks: z
      .array(z.object({ title, primaryCategoryId: id, plannedDate: dateOnly }))
      .min(1)
      .max(50),
  }),
  z.object({
    type: z.literal("series.create"),
    id,
    version: z.number().int(),
    repeat: repeatRule,
  }),
  z.object({
    type: z.literal("series.schedule"),
    id,
    version: z.number().int(),
    repeat: repeatRule,
    active: z.boolean(),
  }),

  z.object({
    type: z.literal("activity.log"),

    taskId: id.nullable().default(null),
    title: title.optional(),
    primaryCategoryId: id,
    occurredOn: dateOnly,
    minutes: z.number().int().min(1).max(1440).nullable().default(null),
    note: text.default(""),
    complete: z.boolean().default(false),
  }),
  z.object({
    type: z.literal("task.create"),
    goalIds: ids,
    challengeIds: ids,
    relatedTaskId: nullableId,
    relationType: z
      .enum([
        "RELATED_TO",
        "SUBTASK_OF",
        "DEPENDS_ON",
        "BLOCKS",
        "FOLLOW_UP_TO",
      ])
      .default("RELATED_TO"),
    initialComment: z.string().trim().max(5000).default(""),
    reminderAt: z.iso.datetime({ offset: true }).nullable().default(null),
    repeat: repeatRule.nullable().default(null),
    ...taskFields,
  }),
  z.object({
    type: z.literal("task.update"),
    scope: z.enum(["ONE", "ALL"]).default("ONE"),
    seriesVersion: z.number().int().optional(),
    id,
    version: z.number().int().min(0),
    ...taskFields,
    status: z.enum(statuses),
  }),
  z.object({
    type: z.literal("task.status"),
    id,
    version: z.number().int().min(0),
    status: z.enum(statuses),
  }),
  z.object({
    type: z.literal("task.archive"),
    id,
    version: z.number().int().min(0),
    archived: z.boolean(),
  }),
  z.object({
    type: z.literal("task.effort"),
    id,
    minutes: z.number().int().min(1).max(1440),
    occurredOn: dateOnly,
    note: text.default(""),
  }),
  z.object({
    type: z.literal("task.relate"),
    id,
    targetId: id,
    relationType: z.enum([
      "DEPENDS_ON",
      "BLOCKS",
      "RELATED_TO",
      "FOLLOW_UP_TO",
      "SUBTASK_OF",
    ]),
  }),
  z.object({
    type: z.literal("category.save"),
    description: text.optional(),
    id: id.optional(),
    name: title,
    parentId: nullableId,
    sortOrder: z.number().int().min(0).max(10000).default(0),
    isActive: z.boolean().default(true),
  }),
  z.object({
    type: z.literal("tag.save"),
    id: id.optional(),
    name: title,
    description: text.default(""),
  }),
  z.object({
    type: z.literal("entity.save"),
    id: id.optional(),
    name: title,
    description: text.default(""),
    entityType: z.enum([
      "PERSON",
      "ORGANIZATION",
      "CLIENT",
      "PROJECT",
      "OTHER",
    ]),
    parentEntityId: nullableId,
    isActive: z.boolean().default(true),
  }),
  z.object({
    type: z.literal("period.create"),
    title,
    startsOn: dateOnly,
    endsOn: dateOnly,
  }),
  z.object({ type: z.literal("period.assign"), id, periodId: id }),
  z.object({ type: z.literal("period.remove"), id, periodId: id }),
  z.object({ type: z.literal("period.close"), id, closed: z.boolean() }),
  z.object({
    type: z.literal("journal.save"),
    id: id.optional(),
    title: z.string().trim().max(240).default(""),
    content: z.string().max(50000),
    document: z.record(z.string(), z.unknown()).optional(),
    version: z.number().int().min(0).optional(),
    occurredAt: z.iso.datetime({ offset: true }),
    categoryIds: ids,
    entityIds: ids,
  }),
  z.object({ type: z.literal("journal.archive"), id }),
  z.object({
    type: z.literal("reminder.create"),
    id,
    scheduledFor: z.iso.datetime({ offset: true }),
  }),
  z.object({ type: z.literal("reminder.dismiss"), id }),
]);
export type Command = z.infer<typeof commandSchema>;
export function dateKey(
  date = new Date(),
  timezone = process.env.APP_TIMEZONE || "Asia/Kolkata",
) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function addDays(date: string, days: number) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function weekOf(date: string) {
  const day = new Date(date + "T00:00:00Z").getUTCDay();
  const start = addDays(date, -((day + 6) % 7));
  return { start, end: addDays(start, 6) };
}
export const asDate = (value: string | null) =>
  value ? new Date(value.length === 10 ? value + "T00:00:00Z" : value) : null;
export function descendants(
  categories: { id: string; parentId: string | null }[],
  root: string,
): Set<string> {
  const found = new Set([root]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of categories)
      if (c.parentId && found.has(c.parentId) && !found.has(c.id)) {
        found.add(c.id);
        changed = true;
      }
  }
  return found;
}
export type FieldDefinition = {
  id: string;
  fieldType: string;
  required: boolean;
  label: string;
  configuration: unknown;
};
export function validateFields(
  defs: FieldDefinition[],
  values: Record<string, unknown>,
) {
  for (const key of Object.keys(values))
    if (!defs.some((d) => d.id === key))
      throw new DomainError("Unknown custom field.");
  const result: Record<string, unknown> = {};
  for (const f of defs) {
    const v = values[f.id];
    const empty = v == null || v === "" || (Array.isArray(v) && v.length === 0);
    if (empty) {
      if (f.required) throw new DomainError(`${f.label} is required.`);
      result[f.id] = null;
      continue;
    }
    let schema: z.ZodType;
    const options =
      (f.configuration as { options?: string[] } | null)?.options || [];
    switch (f.fieldType) {
      case "NUMBER":
        schema = z.number().finite().min(-99999999999999).max(99999999999999);
        break;
      case "BOOLEAN":
        schema = z.boolean();
        break;
      case "DATE":
        schema = dateOnly;
        break;
      case "DATETIME":
        schema = z.iso.datetime({ offset: true });
        break;
      case "SELECT":
        schema = z.string().refine((v) => options.includes(v));
        break;
      case "MULTI_SELECT":
        schema = z
          .array(z.string())
          .max(50)
          .refine((v) => v.every((s) => options.includes(s)));
        break;
      default:
        schema = z.string().max(20000);
    }
    const parsed = schema.safeParse(v);
    if (!parsed.success) throw new DomainError(`Invalid value for ${f.label}.`);
    result[f.id] = parsed.data;
  }
  return result;
}
