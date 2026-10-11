import { Prisma } from "@/generated/prisma/client";
import { database } from "./db";
import {
  asDate,
  dateKey,
  commandSchema,
  validateFields,
  descendants,
  DomainError,
  type Command,
} from "./domain";
type Tx = Prisma.TransactionClient;
export class ConflictError extends Error {}
const slug = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "item";
async function taskFor(tx: Tx, userId: string, id: string) {
  const t = await tx.task.findFirst({ where: { id, userId } });
  if (!t) throw new DomainError("Task not found.");
  return t;
}
async function saveFields(
  tx: Tx,
  userId: string,
  taskId: string,
  templateId: string | null,
  values: Record<string, unknown>,
) {
  const defs = templateId
    ? await tx.taskTemplateField.findMany({ where: { templateId, userId } })
    : [];
  const checked = validateFields(defs, values);
  for (const f of defs) {
    const v = checked[f.id];
    const data = {
      textValue: null as string | null,
      numberValue: null as number | null,
      booleanValue: null as boolean | null,
      dateValue: null as Date | null,
      datetimeValue: null as Date | null,
      jsonValue: Prisma.DbNull as Prisma.InputJsonValue | typeof Prisma.DbNull,
    };
    if (v != null) {
      switch (f.fieldType) {
        case "NUMBER":
          data.numberValue = v as number;
          break;
        case "BOOLEAN":
          data.booleanValue = v as boolean;
          break;
        case "DATE":
          data.dateValue = asDate(v as string);
          break;
        case "DATETIME":
          data.datetimeValue = asDate(v as string);
          break;
        case "MULTI_SELECT":
          data.jsonValue = v as string[];
          break;
        default:
          data.textValue = v as string;
      }
    }
    await tx.taskFieldValue.upsert({
      where: { taskId_templateFieldId: { taskId, templateFieldId: f.id } },
      create: { userId, taskId, templateFieldId: f.id, ...data },
      update: data,
    });
  }
}
async function links(
  tx: Tx,
  userId: string,
  taskId: string,
  c: Extract<Command, { type: "task.create" | "task.update" }>,
) {
  await tx.taskTag.deleteMany({ where: { taskId, userId } });
  await tx.taskEntityLink.deleteMany({ where: { taskId, userId } });
  if (c.tagIds.length)
    await tx.taskTag.createMany({
      data: [...new Set(c.tagIds)].map((tagId) => ({ userId, taskId, tagId })),
    });
  if (c.entityIds.length)
    await tx.taskEntityLink.createMany({
      data: [...new Set(c.entityIds)].map((entityId) => ({
        userId,
        taskId,
        entityId,
        relationshipType: c.relationshipType,
      })),
    });
}
function transition(previous: string, next: string) {
  return next === "COMPLETED"
    ? "COMPLETED"
    : next === "DEFERRED"
      ? "DEFERRED"
      : next === "CANCELLED"
        ? "CANCELLED"
        : ["COMPLETED", "CANCELLED"].includes(previous)
          ? "REOPENED"
          : "STATUS_CHANGED";
}
export async function executeCommand(userId: string, input: unknown) {
  const c = commandSchema.parse(input);
  return database().$transaction(
    async (tx) => {
      const event = async (
        taskId: string,
        eventType: Parameters<
          Tx["taskEvent"]["create"]
        >[0]["data"]["eventType"],
        from?: unknown,
        to?: unknown,
      ) =>
        tx.taskEvent.create({
          data: {
            userId,
            taskId,
            eventType,
            ...(from === undefined
              ? {}
              : { fromValue: JSON.parse(JSON.stringify(from)) }),
            ...(to === undefined
              ? {}
              : { toValue: JSON.parse(JSON.stringify(to)) }),
          },
        });
      switch (c.type) {
        case "activity.log": {
          const owner = await tx.user.findUniqueOrThrow({
            where: { id: userId },
          });
          if (c.occurredOn > dateKey(new Date(), owner.timezone))
            throw new DomainError(
              "Future work belongs in a plan. Log activity for today or an earlier date.",
            );
          const category = await tx.category.findFirst({
            where: { id: c.primaryCategoryId, userId, isActive: true },
          });
          if (!category) throw new DomainError("Category unavailable.");
          if (!c.taskId && !c.title)
            throw new DomainError("Give this activity a title.");
          const task = c.taskId
            ? await taskFor(tx, userId, c.taskId)
            : await tx.task.create({
                data: {
                  userId,
                  title: c.title!,
                  primaryCategoryId: category.id,
                  status: "IN_PROGRESS",
                },
              });
          if (task.archivedAt || task.status === "CANCELLED")
            throw new DomainError("Choose an active task.");
          if (task.primaryCategoryId !== category.id)
            throw new DomainError("The activity category must match its task.");
          if (!c.taskId)
            await event(task.id, "CREATED", undefined, {
              title: task.title,
              status: task.status,
            });
          const effort =
            c.minutes === null
              ? null
              : await tx.taskEffortEntry.create({
                  data: {
                    userId,
                    taskId: task.id,
                    minutes: c.minutes,
                    occurredOn: asDate(c.occurredOn)!,
                    note: c.note,
                  },
                });
          await event(task.id, "EFFORT_RECORDED", undefined, {
            occurredOn: c.occurredOn,
            note: c.note,
            minutes: c.minutes,
            effortEntryId: effort?.id ?? null,
          });
          if (c.complete && task.status !== "COMPLETED") {
            await tx.task.update({
              where: { id: task.id },
              data: {
                status: "COMPLETED",
                completedAt: new Date(),
                version: { increment: 1 },
              },
            });
            await event(
              task.id,
              "COMPLETED",
              { status: task.status },
              { status: "COMPLETED" },
            );
          }
          return { id: task.id };
        }
        case "task.create": {
          if (
            c.templateId &&
            !(await tx.taskTemplate.findFirst({
              where: { id: c.templateId, userId, isActive: true },
            }))
          )
            throw new DomainError("Template unavailable.");
          const t = await tx.task.create({
            data: {
              userId,
              title: c.title,
              description: c.description,
              primaryCategoryId: c.primaryCategoryId,
              templateId: c.templateId,
              priority: c.priority,
              plannedDate: asDate(c.plannedDate),
              dueAt: asDate(c.dueAt),
              estimatedMinutes: c.estimatedMinutes,
              status: c.plannedDate ? "PLANNED" : "INBOX",
            },
          });
          await links(tx, userId, t.id, c);
          await saveFields(tx, userId, t.id, c.templateId, c.fields);
          await event(t.id, "CREATED", undefined, {
            title: t.title,
            status: t.status,
            plannedDate: c.plannedDate,
          });
          return { id: t.id };
        }
        case "task.update":
        case "task.status":
        case "task.archive": {
          const old = await taskFor(tx, userId, c.id);
          if (old.version !== c.version)
            throw new ConflictError(
              "This task changed in another tab. Refresh and try again.",
            );
          if (c.type === "task.archive") {
            await tx.task.update({
              where: { id: old.id },
              data: {
                archivedAt: c.archived ? new Date() : null,
                version: { increment: 1 },
              },
            });
            await event(
              old.id,
              "ARCHIVED",
              { archived: !!old.archivedAt },
              { archived: c.archived },
            );
            return { id: old.id };
          }
          const statusData = {
            status: c.status,
            completedAt:
              c.status === "COMPLETED" ? old.completedAt || new Date() : null,
            cancelledAt:
              c.status === "CANCELLED" ? old.cancelledAt || new Date() : null,
            version: { increment: 1 },
          };
          if (c.type === "task.update") {
            await tx.task.update({
              where: { id: old.id },
              data: {
                ...statusData,
                title: c.title,
                description: c.description,
                primaryCategoryId: c.primaryCategoryId,
                priority: c.priority,
                plannedDate: asDate(c.plannedDate),
                dueAt: asDate(c.dueAt),
                estimatedMinutes: c.estimatedMinutes,
              },
            });
            await links(tx, userId, old.id, c);
            if (
              old.plannedDate?.toISOString().slice(0, 10) !==
              (c.plannedDate || undefined)
            )
              await event(
                old.id,
                old.plannedDate ? "RESCHEDULED" : "PLANNED",
                { date: old.plannedDate },
                { date: c.plannedDate },
              );
            if (old.primaryCategoryId !== c.primaryCategoryId)
              await event(
                old.id,
                "CATEGORY_CHANGED",
                { id: old.primaryCategoryId },
                { id: c.primaryCategoryId },
              );
            await event(
              old.id,
              "UPDATED",
              {
                title: old.title,
                description: old.description,
                priority: old.priority,
                dueAt: old.dueAt,
                estimatedMinutes: old.estimatedMinutes,
              },
              {
                title: c.title,
                description: c.description,
                priority: c.priority,
                dueAt: c.dueAt,
                estimatedMinutes: c.estimatedMinutes,
                tagIds: c.tagIds,
                entityIds: c.entityIds,
              },
            );
          } else
            await tx.task.update({ where: { id: old.id }, data: statusData });
          if (old.status !== c.status)
            await event(
              old.id,
              transition(old.status, c.status),
              { status: old.status },
              { status: c.status },
            );
          return { id: old.id };
        }
        case "task.effort": {
          const t = await taskFor(tx, userId, c.id);
          const entry = await tx.taskEffortEntry.create({
            data: {
              userId,
              taskId: t.id,
              minutes: c.minutes,
              occurredOn: asDate(c.occurredOn)!,
              note: c.note,
            },
          });
          return { id: entry.id };
        }
        case "task.fields": {
          const t = await taskFor(tx, userId, c.id);
          await saveFields(tx, userId, t.id, t.templateId, c.fields);
          await event(t.id, "FIELDS_UPDATED", undefined, c.fields);
          return { id: t.id };
        }
        case "task.relate": {
          await taskFor(tx, userId, c.id);
          await taskFor(tx, userId, c.targetId);
          if (c.id === c.targetId)
            throw new DomainError("A task cannot relate to itself.");
          await tx.taskRelation.upsert({
            where: {
              sourceTaskId_targetTaskId_relationType: {
                sourceTaskId: c.id,
                targetTaskId: c.targetId,
                relationType: c.relationType,
              },
            },
            create: {
              userId,
              sourceTaskId: c.id,
              targetTaskId: c.targetId,
              relationType: c.relationType,
            },
            update: {},
          });
          await event(c.id, "RELATION_ADDED", undefined, {
            targetId: c.targetId,
            type: c.relationType,
          });
          return { id: c.id };
        }
        case "category.save": {
          if (
            c.id &&
            c.parentId &&
            descendants(
              await tx.category.findMany({
                where: { userId },
                select: { id: true, parentId: true },
              }),
              c.id,
            ).has(c.parentId)
          )
            throw new DomainError("A category cannot be its own ancestor.");
          const data = {
            name: c.name,
            parentId: c.parentId,
            sortOrder: c.sortOrder,
            isActive: c.isActive,
          };
          if (c.id) {
            if (!(await tx.category.findFirst({ where: { id: c.id, userId } })))
              throw new DomainError("Category not found.");
            return tx.category.update({ where: { id: c.id }, data });
          }
          return tx.category.create({
            data: { userId, ...data, slug: slug(c.name) },
          });
        }
        case "tag.save": {
          const data = {
            name: c.name,
            description: c.description,
            slug: slug(c.name),
          };
          if (c.id) {
            if (!(await tx.tag.findFirst({ where: { id: c.id, userId } })))
              throw new DomainError("Tag not found.");
            return tx.tag.update({ where: { id: c.id }, data });
          }
          return tx.tag.create({ data: { userId, ...data } });
        }
        case "entity.save": {
          if (
            c.id &&
            c.parentEntityId &&
            descendants(
              (
                await tx.entity.findMany({
                  where: { userId },
                  select: { id: true, parentEntityId: true },
                })
              ).map((e) => ({ id: e.id, parentId: e.parentEntityId })),
              c.id,
            ).has(c.parentEntityId)
          )
            throw new DomainError("An entity cannot be its own ancestor.");
          const data = {
            name: c.name,
            type: c.entityType,
            description: c.description,
            parentEntityId: c.parentEntityId,
            isActive: c.isActive,
          };
          if (c.id) {
            if (!(await tx.entity.findFirst({ where: { id: c.id, userId } })))
              throw new DomainError("Entity not found.");
            return tx.entity.update({ where: { id: c.id }, data });
          }
          return tx.entity.create({ data: { userId, ...data } });
        }
        case "period.create": {
          if (c.startsOn > c.endsOn)
            throw new DomainError("End date must follow the start date.");
          return tx.planningPeriod.create({
            data: {
              userId,
              title: c.title,
              startsOn: asDate(c.startsOn)!,
              endsOn: asDate(c.endsOn)!,
            },
          });
        }
        case "period.assign":
        case "period.remove": {
          await taskFor(tx, userId, c.id);
          const period = await tx.planningPeriod.findFirst({
            where: { id: c.periodId, userId },
          });
          if (!period) throw new DomainError("Planning period not found.");
          if (period.status === "CLOSED")
            throw new DomainError("Reopen this plan before changing it.");
          if (c.type === "period.remove") {
            await tx.taskPeriod.updateMany({
              where: {
                taskId: c.id,
                userId,
                planningPeriodId: c.periodId,
                removedAt: null,
              },
              data: { removedAt: new Date() },
            });
            await event(c.id, "PLANNED", undefined, {
              periodId: c.periodId,
              removed: true,
            });
          } else if (
            !(await tx.taskPeriod.findFirst({
              where: {
                taskId: c.id,
                planningPeriodId: c.periodId,
                removedAt: null,
              },
            }))
          ) {
            await tx.taskPeriod.create({
              data: { userId, taskId: c.id, planningPeriodId: c.periodId },
            });
            await event(c.id, "PLANNED", undefined, {
              periodId: c.periodId,
              title: period.title,
            });
          }
          return { id: c.id };
        }
        case "period.close": {
          const p = await tx.planningPeriod.findFirst({
            where: { id: c.id, userId },
          });
          if (!p) throw new DomainError("Plan not found.");
          return tx.planningPeriod.update({
            where: { id: c.id },
            data: { status: c.closed ? "CLOSED" : "OPEN" },
          });
        }
        case "journal.save": {
          if (
            c.id &&
            !(await tx.journalEntry.findFirst({ where: { id: c.id, userId } }))
          )
            throw new DomainError("Journal entry not found.");
          const data = {
            title: c.title,
            content: c.content,
            occurredAt: new Date(c.occurredAt),
          };
          const j = c.id
            ? await tx.journalEntry.update({ where: { id: c.id }, data })
            : await tx.journalEntry.create({ data: { userId, ...data } });
          await tx.journalCategoryLink.deleteMany({
            where: { journalEntryId: j.id, userId },
          });
          await tx.journalEntityLink.deleteMany({
            where: { journalEntryId: j.id, userId },
          });
          if (c.categoryIds.length)
            await tx.journalCategoryLink.createMany({
              data: [...new Set(c.categoryIds)].map((categoryId) => ({
                userId,
                journalEntryId: j.id,
                categoryId,
              })),
            });
          if (c.entityIds.length)
            await tx.journalEntityLink.createMany({
              data: [...new Set(c.entityIds)].map((entityId) => ({
                userId,
                journalEntryId: j.id,
                entityId,
              })),
            });
          return { id: j.id };
        }
        case "journal.archive": {
          const j = await tx.journalEntry.findFirst({
            where: { id: c.id, userId },
          });
          if (!j) throw new DomainError("Journal entry not found.");
          return tx.journalEntry.update({
            where: { id: j.id },
            data: { archivedAt: new Date() },
          });
        }
        case "reminder.create": {
          await taskFor(tx, userId, c.id);
          if (new Date(c.scheduledFor) <= new Date())
            throw new DomainError("Choose a future reminder time.");
          return tx.reminder.create({
            data: {
              userId,
              taskId: c.id,
              scheduledFor: new Date(c.scheduledFor),
            },
          });
        }
        case "reminder.dismiss": {
          const r = await tx.reminder.findFirst({
            where: { id: c.id, userId },
          });
          if (!r) throw new DomainError("Reminder not found.");
          return tx.reminder.update({
            where: { id: r.id },
            data: { status: "CANCELLED", cancelledAt: new Date() },
          });
        }
        case "template.create": {
          if (new Set(c.fields.map((f) => f.key)).size !== c.fields.length)
            throw new DomainError("Field keys must be unique.");
          if (
            c.fields.some(
              (f) =>
                ["SELECT", "MULTI_SELECT"].includes(f.fieldType) &&
                f.options.length === 0,
            )
          )
            throw new DomainError("Select fields need options.");
          const previous = await tx.taskTemplate.findFirst({
            where: { userId, name: c.name },
            orderBy: { revision: "desc" },
          });
          if (previous)
            await tx.taskTemplate.updateMany({
              where: { userId, name: c.name },
              data: { isActive: false },
            });
          return tx.taskTemplate.create({
            data: {
              userId,
              name: c.name,
              description: c.description,
              revision: (previous?.revision || 0) + 1,
              fields: {
                create: c.fields.map((f, i) => ({
                  userId,
                  key: f.key,
                  label: f.label,
                  fieldType: f.fieldType,
                  required: f.required,
                  sortOrder: i,
                  configuration: { options: f.options },
                })),
              },
            },
          });
        }
      }
    },
    { isolationLevel: "Serializable", timeout: 15000 },
  );
}
