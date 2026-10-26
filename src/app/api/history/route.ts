import { workCategoryIds, categorySql } from "@/lib/work-mode-server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { database } from "@/lib/db";
import { AuthError, requireUser } from "@/lib/auth";
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const q = z
      .object({
        task: z.uuid().optional(),
        filter: z
          .enum(["All", "Task planning", "Action", "Observation"])
          .default("All"),
        cursor: z.string().max(1000).optional(),
      })
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    let cursor: { at: string; id: string } | null = null;
    if (q.cursor) {
      try {
        cursor = z
          .object({
            at: z.iso.datetime({ offset: true }),
            id: z.string().max(80),
          })
          .parse(JSON.parse(Buffer.from(q.cursor, "base64url").toString()));
      } catch {
        return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
      }
    }
    const allowed = await workCategoryIds(user);
    const taskScope = categorySql("t.primary_category_id", allowed);
    const journalScope =
      allowed === null
        ? Prisma.sql`TRUE`
        : Prisma.sql`EXISTS (SELECT 1 FROM journal_category_links l WHERE l.journal_entry_id=j.id AND l.user_id=j.user_id AND ${categorySql("l.category_id", allowed)})`;
    const taskFilter = q.task
      ? Prisma.sql`AND task_id=${q.task}::uuid`
      : Prisma.empty;
    const rows = await database().$queryRaw<
      {
        id: string;
        at: Date;
        day: string;
        dateOnly: boolean;
        kind: string;
        title: string;
        text: string;
        taskId: string | null;
      }[]
    >(Prisma.sql`
      WITH entries AS (
        SELECT 'event:'||e.id AS id,
          CASE WHEN e.to_value->>'occurredOn' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN ((e.to_value->>'occurredOn')::date::timestamp AT TIME ZONE ${user.timezone}) ELSE e.occurred_at END AS at,
          (e.to_value->>'occurredOn' IS NOT NULL) AS "dateOnly",
          CASE WHEN e.event_type IN ('CREATED','PLANNED','RESCHEDULED') THEN 'Task planning' ELSE 'Action' END AS kind,
          replace(initcap(e.event_type::text),'_',' ') AS title,
          t.title || COALESCE(' · '||(e.from_value->>'status')||' → '||(e.to_value->>'status'), ' · '||(e.to_value->>'status'), '') || COALESCE(' · '||(e.to_value->>'note'),'') AS text, e.task_id AS "taskId"
        FROM task_events e JOIN tasks t ON t.id=e.task_id AND t.user_id=e.user_id
        WHERE e.user_id=${user.id}::uuid AND ${taskScope} ${taskFilter} AND NOT (e.event_type='EFFORT_RECORDED' AND e.to_value->>'effortEntryId' IS NOT NULL)
        UNION ALL
        SELECT 'effort:'||e.id, e.occurred_on::timestamp AT TIME ZONE ${user.timezone},true,'Action',e.minutes||'m · '||t.title,COALESCE(e.note,''),e.task_id
        FROM task_effort_entries e JOIN tasks t ON t.id=e.task_id AND t.user_id=e.user_id WHERE e.user_id=${user.id}::uuid AND ${taskScope} ${taskFilter}
        UNION ALL
        SELECT 'journal:'||j.id,j.occurred_at,false,'Observation',COALESCE(j.title,'Journal entry'),j.content,NULL::uuid FROM journal_entries j WHERE j.user_id=${user.id}::uuid AND ${journalScope} AND j.archived_at IS NULL AND ${!q.task}
      ) SELECT *,to_char(at AT TIME ZONE ${user.timezone},'YYYY-MM-DD') AS day FROM entries
      WHERE (${q.filter === "All"} OR kind=${q.filter})
      ${cursor ? Prisma.sql`AND (at,id) < (${cursor.at}::timestamptz,${cursor.id})` : Prisma.empty}
      ORDER BY at DESC,id DESC LIMIT 61`);
    const items = rows.slice(0, 60),
      last = items.at(-1);
    return NextResponse.json(
      {
        items,
        nextCursor:
          rows.length > 60 && last
            ? Buffer.from(
                JSON.stringify({ at: last.at.toISOString(), id: last.id }),
              ).toString("base64url")
            : null,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof AuthError
            ? "Sign in to continue."
            : "Could not load history.",
      },
      {
        status:
          e instanceof AuthError ? 401 : e instanceof z.ZodError ? 400 : 503,
      },
    );
  }
}
