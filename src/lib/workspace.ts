import { resolveWorkCategoryIds, type WorkModeUser } from "./work-mode";
import { categorySql } from "./work-mode-server";
import { database } from "./db";
import { ensureRecurringTasks } from "./recurrence-service";
import { Prisma } from "@/generated/prisma/client";
import { workspaceQuery, type WorkspaceQuery } from "./workspace-query";
import { addDays, descendants, dateKey } from "./domain";
export async function getWorkspace(
  user: {
    id: string;
    name: string;
    timezone: string;
  } & WorkModeUser,
  input?: string | Partial<WorkspaceQuery>,
) {
  const db = database();
  const userId = user.id;
  const q = workspaceQuery.parse(
    typeof input === "string" ? { through: input } : input || {},
  );
  if (q.view === "task" && !q.task) throw new Error("Task required.");
  let completedCursor = false;
  if (q.cursor) {
    const owner =
      q.view === "journal"
        ? await db.journalEntry.findFirst({
            where: { id: q.cursor, userId },
            select: { id: true },
          })
        : await db.task.findFirst({
            where: { id: q.cursor, userId },
            select: { id: true, status: true },
          });
    if (!owner) throw new Error("Invalid cursor.");
    completedCursor = "status" in owner && owner.status === "COMPLETED";
  }
  const today = dateKey(new Date(), user.timezone);
  const through = q.through || addDays(today, 6);
  const from = q.from || (q.through ? addDays(through, -6) : today);
  if (from > through || Date.parse(through) - Date.parse(from) > 31 * 86400000)
    throw new Error("Choose at most 31 days.");
  if (["today", "category", "projects", "week", "tasks"].includes(q.view))
    await ensureRecurringTasks(userId, today, through, from);
  const allCategoryRows = await db.category.findMany({
    where: { userId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const allowed = resolveWorkCategoryIds(user, allCategoryRows);
  const categoryRows =
    allowed === null
      ? allCategoryRows
      : allCategoryRows.filter((c) => allowed.includes(c.id));
  const workMode = {
    enabled: !!user.workModeEnabled,
    categoryIds: user.workCategoryIds || [],
  };
  const taskScope =
    allowed === null ? {} : { primaryCategoryId: { in: allowed } };
  const journalScope =
    allowed === null
      ? {}
      : { categories: { some: { categoryId: { in: allowed } } } };
  if (["library", "categories"].includes(q.view)) {
    const [tags, entities] = await Promise.all([
      db.tag.findMany({ where: { userId }, orderBy: { name: "asc" } }),
      db.entity.findMany({ where: { userId }, orderBy: { name: "asc" } }),
    ]);
    return JSON.parse(
      JSON.stringify({
        user: { name: user.name, timezone: user.timezone },
        today,
        workMode,
        categories: categoryRows,
        tags,
        entities,
        tasks: [],
        periods: [],
        templates: [],
        journals: [],
        events: [],
        reminders: [],
        page: { nextCursor: null, view: q.view, from, through },
      }),
    ) as Workspace;
  }
  const filters: Prisma.TaskWhereInput[] = [{ userId }, taskScope];
  if (q.view === "task")
    filters.push({ id: q.task || "00000000-0000-0000-0000-000000000000" });
  else {
    filters.push({ archivedAt: q.archive === "true" ? { not: null } : null });
    if (q.category)
      filters.push({
        primaryCategoryId: { in: [...descendants(categoryRows, q.category)] },
      });
    if (q.project)
      filters.push({ entities: { some: { entityId: q.project, userId } } });
    if (q.series) filters.push({ seriesId: q.series });
    if (q.search)
      filters.push({
        OR: [
          { title: { contains: q.search, mode: "insensitive" } },
          { description: { contains: q.search, mode: "insensitive" } },
        ],
      });
    if (q.status === "OPEN")
      filters.push({ status: { notIn: ["COMPLETED", "CANCELLED"] } });
    else if (q.status !== "ALL") filters.push({ status: q.status });
    if (q.tag) filters.push({ tags: { some: { tagId: q.tag, userId } } });
    if (q.entity)
      filters.push({ entities: { some: { entityId: q.entity, userId } } });
    if (
      (q.view === "today" && q.dashboard === "plan") ||
      ["category", "projects"].includes(q.view)
    )
      filters.push({
        OR: [
          { plannedDate: { gte: new Date(from), lte: new Date(through) } },
          { plannedDate: null, status: { notIn: ["COMPLETED", "CANCELLED"] } },
          {
            plannedDate: { lt: new Date(from) },
            status: { notIn: ["COMPLETED", "CANCELLED"] },
          },
          {
            effort: {
              some: {
                occurredOn: { gte: new Date(from), lte: new Date(through) },
              },
            },
          },
          {
            events: {
              some: {
                eventType: "EFFORT_RECORDED",
                toValue: { path: ["occurredOn"], gte: from, lte: through },
              },
            },
          },
        ],
      });
    if (q.view === "week")
      filters.push(
        q.period
          ? {
              OR: [
                {
                  periods: {
                    some: { planningPeriodId: q.period, removedAt: null },
                  },
                },
                { status: { notIn: ["COMPLETED", "CANCELLED"] } },
              ],
            }
          : { status: { notIn: ["COMPLETED", "CANCELLED"] } },
      );
    if (
      [
        "journal",
        "timeline",
        "insights",
        "distribution",
        "categories",
        "library",
      ].includes(q.view)
    )
      filters.push({ id: "00000000-0000-0000-0000-000000000000" });
  }
  if (
    q.view === "today" &&
    q.dashboard === "plan" &&
    !q.category &&
    !q.entity &&
    !q.tag
  ) {
    const next = await db.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT DISTINCT ON (series_id) id FROM tasks WHERE user_id=${userId}::uuid AND series_id IS NOT NULL AND archived_at IS NULL AND status NOT IN ('COMPLETED','CANCELLED') ORDER BY series_id,planned_date ASC NULLS LAST,id`,
    );
    filters.push({
      OR: [
        { seriesId: null },
        { status: "COMPLETED" },
        { id: { in: next.map((t) => t.id) } },
      ],
    });
  }
  if (q.view === "today" && q.dashboard !== "plan")
    filters.push({
      status: {
        notIn:
          q.dashboard === "execute"
            ? ["CANCELLED"]
            : ["COMPLETED", "CANCELLED"],
      },
    });
  if (
    q.view === "today" &&
    q.dashboard === "execute" &&
    !q.category &&
    !q.entity &&
    !q.tag
  )
    filters.push({ plannedDate: new Date(today) });
  if (q.view === "today" && q.dashboard === "manage")
    filters.push({
      plannedDate: { gte: new Date(from), lte: new Date(through) },
    });
  const pageSize = q.view === "task" ? 1 : 100;
  // In-app delivery is access-driven, not a background promise. Claim and log atomically.
  if (q.view === "today" && !q.cursor) {
    await db.$executeRaw`
      WITH due AS (
        SELECT id FROM reminders WHERE user_id=${userId}::uuid
          AND channel='IN_APP' AND status='PENDING' AND scheduled_for<=now()
        ORDER BY scheduled_for LIMIT 100 FOR UPDATE SKIP LOCKED
      ), claimed AS (
        UPDATE reminders SET status='DELIVERED', updated_at=now()
        WHERE id IN (SELECT id FROM due) RETURNING id,user_id
      ) INSERT INTO reminder_deliveries(id,user_id,reminder_id,status,provider,updated_at)
        SELECT gen_random_uuid(),user_id,id,'DELIVERED','in-app',now() FROM claimed`;
  }
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
    (async () => {
      const args = {
        where: { AND: filters },
        orderBy:
          q.view === "today" && q.dashboard !== "plan"
            ? [
                ...(q.sort !== "plannedDate"
                  ? [
                      {
                        [q.sort]: q.direction,
                      } as Prisma.TaskOrderByWithRelationInput,
                    ]
                  : []),
                { plannedDate: { sort: "asc", nulls: "first" } },
                { id: "asc" },
              ]
            : [{ createdAt: "desc" }, { id: "desc" }],
        take: pageSize + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
        include: {
          series: {
            select: {
              id: true,
              unit: true,
              interval: true,
              startsOn: true,
              endsOn: true,
              active: true,
              version: true,
            },
          },
          tags: true,
          entities: true,
          periods: true,
          effort:
            q.view === "task"
              ? { take: 100, orderBy: [{ occurredOn: "desc" }, { id: "desc" }] }
              : {
                  where: {
                    occurredOn: { gte: new Date(from), lte: new Date(through) },
                  },
                  take: 100,
                  orderBy: { occurredOn: "desc" },
                },
          fieldValues: false,
          relationsFrom: {
            include: {
              target: {
                select: { title: true, plannedDate: true, seriesId: true },
              },
            },
          },
        },
      } satisfies Prisma.TaskFindManyArgs;
      if (q.view !== "today" || q.dashboard !== "execute")
        return db.task.findMany(args);
      // Page open tasks before completed tasks, without a completion timestamp
      // overriding the selected priority order within either group.
      const open = completedCursor
        ? []
        : await db.task.findMany({
            ...args,
            where: { AND: [...filters, { status: { not: "COMPLETED" } }] },
          });
      if (open.length === pageSize + 1) return open;
      const completed = await db.task.findMany({
        ...args,
        where: { AND: [...filters, { status: "COMPLETED" }] },
        take: pageSize + 1 - open.length,
        cursor: completedCursor && q.cursor ? { id: q.cursor } : undefined,
        skip: completedCursor ? 1 : undefined,
      });
      return [...open, ...completed];
    })(),
    Promise.resolve(categoryRows),
    db.tag.findMany({ where: { userId }, orderBy: { name: "asc" } }),
    db.entity.findMany({ where: { userId }, orderBy: { name: "asc" } }),
    db.planningPeriod.findMany({
      where: { userId },
      orderBy: { startsOn: "desc" },
    }),
    Promise.resolve([]),
    db.journalEntry.findMany({
      where: {
        userId,
        ...journalScope,
        ...(q.view === "journal"
          ? {
              archivedAt: null,
              ...(q.search
                ? {
                    OR: [
                      {
                        title: {
                          contains: q.search,
                          mode: "insensitive" as const,
                        },
                      },
                      {
                        content: {
                          contains: q.search,
                          mode: "insensitive" as const,
                        },
                      },
                    ],
                  }
                : {}),
            }
          : { id: "00000000-0000-0000-0000-000000000000" }),
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: 101,
      ...(q.view === "journal" && q.cursor
        ? { cursor: { id: q.cursor }, skip: 1 }
        : {}),
      include: { categories: true, entities: true },
    }),
    db.taskEvent.findMany({
      where: {
        userId,
        ...(q.view === "task"
          ? { taskId: q.task }
          : { taskId: "00000000-0000-0000-0000-000000000000" }),
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: 100,
    }),
    db.reminder.findMany({
      where: {
        userId,
        status: "DELIVERED",
        ...(allowed === null
          ? {}
          : { OR: [{ task: taskScope }, { journal: journalScope }] }),
      },
      take: 100,
      orderBy: { scheduledFor: "asc" },
      include: { deliveries: true },
    }),
  ]);
  const ids = tasks.slice(0, pageSize).map((t) => t.id);
  const totals = ids.length
    ? await db.taskEffortEntry.groupBy({
        by: ["taskId"],
        where: { userId, taskId: { in: ids } },
        _sum: { minutes: true },
      })
    : [];
  const activityEvents =
    ["today", "category", "projects"].includes(q.view) && ids.length
      ? await db.taskEvent.findMany({
          where: {
            userId,
            taskId: { in: ids },
            eventType: "EFFORT_RECORDED",
            toValue: { path: ["occurredOn"], gte: from, lte: through },
          },
          orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
          take: 1000,
        })
      : events;
  const sidebarCounts =
    q.view === "today"
      ? await db.$queryRaw<
          { kind: string; id: string; pending: number; upcoming: number }[]
        >(Prisma.sql`
    WITH RECURSIVE category_tree(root, id) AS (
      SELECT id, id FROM categories WHERE user_id=${userId}::uuid
      UNION
      SELECT tree.root, c.id FROM category_tree tree JOIN categories c ON c.parent_id=tree.id WHERE c.user_id=${userId}::uuid
    ), open_tasks AS (
      SELECT id, primary_category_id, planned_date FROM tasks
      WHERE user_id=${userId}::uuid AND ${categorySql("primary_category_id", allowed)} AND archived_at IS NULL AND status NOT IN ('COMPLETED','CANCELLED')
    ), memberships AS (
      SELECT 'all' AS kind, '' AS scope_id, id, planned_date FROM open_tasks
      UNION
      SELECT 'category', tree.root::text, t.id, t.planned_date FROM open_tasks t JOIN category_tree tree ON tree.id=t.primary_category_id
      UNION
      SELECT 'entity', l.entity_id::text, t.id, t.planned_date FROM open_tasks t JOIN task_entity_links l ON l.task_id=t.id WHERE l.user_id=${userId}::uuid
      UNION
      SELECT 'tag', l.tag_id::text, t.id, t.planned_date FROM open_tasks t JOIN task_tags l ON l.task_id=t.id WHERE l.user_id=${userId}::uuid
    ) SELECT kind, scope_id AS id,
      (COUNT(*) FILTER (WHERE planned_date IS NULL OR planned_date <= ${today}::date))::int AS pending,
      (COUNT(*) FILTER (WHERE planned_date > ${today}::date))::int AS upcoming
    FROM memberships GROUP BY kind, scope_id
  `)
      : undefined;
  return JSON.parse(
    JSON.stringify({
      sidebarCounts,
      workMode,
      user: { name: user.name, timezone: user.timezone },
      today: dateKey(new Date(), user.timezone),
      tasks: tasks.slice(0, pageSize).map((t) => ({
        ...t,
        fieldValues: [],
        totalEffortMinutes:
          totals.find((e) => e.taskId === t.id)?._sum.minutes ??
          t.manualActualMinutes ??
          0,
      })),
      page: {
        sort: q.sort,
        direction: q.direction,
        nextCursor:
          q.view === "journal"
            ? journals.length > 100
              ? journals[99].id
              : null
            : tasks.length > pageSize
              ? tasks[pageSize - 1].id
              : null,
        view: q.view,
        from,
        through,
      },
      categories,
      tags,
      entities,
      periods,
      templates,
      journals: journals.slice(0, 100),
      events: activityEvents,
      reminders,
    }),
  ) as Workspace;
}
// Wire types explicitly document the serialization boundary (dates/decimals become strings).
export type Category = {
  imageData?: string | null;
  archivedAt?: string | null;
  description?: string | null;
  id: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
  sortOrder: number;
};
export type Tag = { id: string; name: string; description: string | null };
export type Entity = {
  imageData?: string | null;
  archivedAt?: string | null;
  metadata?: { categoryIds?: string[] } | null;
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
  totalEffortMinutes?: number;
  id: string;

  seriesId: string | null;
  recurrenceDate: string | null;
  isException: boolean;
  series: {
    id: string;
    unit: "DAY" | "WEEK" | "MONTH";
    interval: number;
    startsOn: string;
    endsOn: string | null;
    active: boolean;
    version: number;
  } | null;
  title: string;
  description: string | null;
  status: string;
  urgency: number;
  importance: number;
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
  relationsFrom: {
    targetTaskId: string;
    relationType: string;
    target?: {
      title: string;
      plannedDate: string | null;
      seriesId: string | null;
    };
  }[];
};
export type Journal = {
  document?: Record<string, unknown> | null;
  version?: number;
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
  workMode?: { enabled: boolean; categoryIds: string[] };
  page?: {
    sort?: "plannedDate" | "urgency" | "importance";
    direction?: "asc" | "desc";
    nextCursor: string | null;
    view: string;
    from: string;
    through: string;
  };
  sidebarCounts?: {
    kind: string;
    id: string;
    pending: number;
    upcoming: number;
  }[];
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
