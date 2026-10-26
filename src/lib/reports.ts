import { workCategoryIds, categorySql } from "./work-mode-server";
import type { WorkModeUser } from "./work-mode";
import { Prisma } from "@/generated/prisma/client";
import { database } from "./db";
import { addDays, dateKey } from "./domain";
export async function reports(
  user: { id: string; timezone: string } & WorkModeUser,
  from: string,
  to: string,
  metric: string,
  kind: string,
) {
  const db = database(),
    uid = user.id;
  const allowed = await workCategoryIds(user);
  const taskScope = categorySql("t.primary_category_id", allowed);
  const bareTaskScope = categorySql("primary_category_id", allowed);
  const eventScope =
    allowed === null
      ? Prisma.sql`TRUE`
      : Prisma.sql`EXISTS (SELECT 1 FROM tasks t WHERE t.id=task_events.task_id AND t.user_id=task_events.user_id AND ${taskScope})`;
  const start = Prisma.sql`(${from}::date::timestamp AT TIME ZONE ${user.timezone})`;
  const end = Prisma.sql`((${to}::date + 1)::timestamp AT TIME ZONE ${user.timezone})`;
  if (kind === "balance") {
    const rows = await db.$queryRaw<
      { categoryId: string | null; count: number }[]
    >(Prisma.sql`
      WITH touched AS (
        SELECT task_id AS id FROM task_events WHERE user_id=${uid}::uuid
          AND event_type='COMPLETED' AND occurred_at >= ${start} AND occurred_at < ${end}
        UNION SELECT id FROM tasks WHERE user_id=${uid}::uuid AND completed_at >= ${start} AND completed_at < ${end}
        UNION SELECT task_id FROM task_effort_entries WHERE user_id=${uid}::uuid AND ${metric === "activity"}
          AND occurred_on BETWEEN ${from}::date AND ${to}::date
        UNION SELECT task_id FROM task_events WHERE user_id=${uid}::uuid AND ${metric === "activity"}
          AND event_type='EFFORT_RECORDED' AND COALESCE(to_value->>'occurredOn', to_char(occurred_at AT TIME ZONE ${user.timezone},'YYYY-MM-DD')) BETWEEN ${from} AND ${to}
      ) SELECT t.primary_category_id AS "categoryId", count(*)::int AS count FROM tasks t JOIN touched ON touched.id=t.id
      WHERE t.user_id=${uid}::uuid AND ${taskScope} GROUP BY t.primary_category_id`);
    return { rows };
  }
  const scope = Prisma.sql`SELECT e.id,e.task_id,e.minutes,e.occurred_on,t.primary_category_id FROM task_effort_entries e JOIN tasks t ON t.id=e.task_id AND t.user_id=e.user_id WHERE e.user_id=${uid}::uuid AND ${taskScope} AND e.occurred_on BETWEEN ${from}::date AND ${to}::date`;
  const [daily, category, entity, tags, metrics] = await Promise.all([
    db.$queryRaw<{ date: string; minutes: number }[]>(
      Prisma.sql`SELECT to_char(occurred_on,'YYYY-MM-DD') AS date,sum(minutes)::int AS minutes FROM (${scope}) w GROUP BY occurred_on`,
    ),
    db.$queryRaw<
      { id: string; name: string; parentId: string | null; minutes: number }[]
    >(Prisma.sql`
      WITH RECURSIVE tree(root,id) AS (SELECT id,id FROM categories WHERE user_id=${uid}::uuid UNION SELECT tree.root,c.id FROM tree JOIN categories c ON c.parent_id=tree.id WHERE c.user_id=${uid}::uuid), work AS (${scope})
      SELECT c.id,c.name,c.parent_id AS "parentId",COALESCE(sum(w.minutes),0)::int AS minutes FROM categories c LEFT JOIN tree ON tree.root=c.id LEFT JOIN work w ON w.primary_category_id=tree.id WHERE c.user_id=${uid}::uuid AND ${categorySql("c.id", allowed)} GROUP BY c.id`),
    db.$queryRaw<{ id: string; name: string; minutes: number }[]>(Prisma.sql`
      WITH RECURSIVE tree(root,id) AS (SELECT id,id FROM entities WHERE user_id=${uid}::uuid UNION SELECT tree.root,e.id FROM tree JOIN entities e ON e.parent_entity_id=tree.id WHERE e.user_id=${uid}::uuid), work AS (${scope}), attributed AS (SELECT DISTINCT tree.root,w.id,w.minutes FROM tree JOIN task_entity_links l ON l.entity_id=tree.id AND l.user_id=${uid}::uuid JOIN work w ON w.task_id=l.task_id)
      SELECT e.id,e.name,COALESCE(sum(a.minutes),0)::int AS minutes FROM entities e LEFT JOIN attributed a ON a.root=e.id WHERE e.user_id=${uid}::uuid GROUP BY e.id ORDER BY minutes DESC`),
    db.$queryRaw<{ id: string; name: string; minutes: number }[]>(
      Prisma.sql`WITH work AS (${scope}) SELECT t.id,t.name,COALESCE(sum(w.minutes),0)::int AS minutes FROM tags t LEFT JOIN task_tags l ON l.tag_id=t.id AND l.user_id=${uid}::uuid LEFT JOIN work w ON w.task_id=l.task_id WHERE t.user_id=${uid}::uuid GROUP BY t.id ORDER BY minutes DESC`,
    ),
    db.$queryRaw<
      {
        created: number;
        completed: number;
        deferred: number;
        overdue: number;
        uncategorized: number;
      }[]
    >(Prisma.sql`SELECT
      (SELECT count(*)::int FROM tasks WHERE user_id=${uid}::uuid AND ${bareTaskScope} AND created_at>=${start} AND created_at<${end}) AS created,
      (SELECT count(*)::int FROM task_events WHERE user_id=${uid}::uuid AND ${eventScope} AND event_type='COMPLETED' AND occurred_at>=${start} AND occurred_at<${end}) AS completed,
      (SELECT count(*)::int FROM task_events WHERE user_id=${uid}::uuid AND ${eventScope} AND event_type='DEFERRED' AND occurred_at>=${start} AND occurred_at<${end}) AS deferred,
      (SELECT count(*)::int FROM tasks WHERE user_id=${uid}::uuid AND ${bareTaskScope} AND archived_at IS NULL AND status NOT IN ('COMPLETED','CANCELLED') AND due_at < (${dateKey(new Date(), user.timezone)}::date::timestamp AT TIME ZONE ${user.timezone})) AS overdue,
      (SELECT COALESCE(sum(minutes),0)::int FROM (${scope}) w WHERE primary_category_id IS NULL) AS uncategorized`),
  ]);
  return {
    ...metrics[0],
    total: daily.reduce((n, d) => n + d.minutes, 0),
    category,
    entity,
    tags,
    days: Array.from(
      {
        length: Math.min(
          366,
          Math.floor((Date.parse(to) - Date.parse(from)) / 86400000) + 1,
        ),
      },
      (_, i) => ({
        date: addDays(from, i),
        minutes: daily.find((d) => d.date === addDays(from, i))?.minutes || 0,
      }),
    ),
  };
}
