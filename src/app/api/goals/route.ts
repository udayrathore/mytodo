import { workCategoryIds } from "@/lib/work-mode-server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser, checkOrigin } from "@/lib/auth";
import { database } from "@/lib/db";
const uuid = z.uuid();
const childInput = z.object({
  title: z.string().trim().min(1).max(240),
  reason: z.string().trim().min(1).max(20000).optional(),
  categoryId: uuid.optional(),
  estimatedMinutes: z.number().int().min(1).max(10000000).nullable(),
  progress: z.number().int().min(0).max(100).default(0),
});
const input = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    id: uuid.optional(),
    version: z.number().int().optional(),
    title: z.string().trim().min(1).max(240),
    reason: z.string().trim().min(1).max(20000),
    categoryId: uuid,
    parentId: uuid.nullable(),
    status: z.enum(["NOT_STARTED", "STARTED", "COMPLETED"]),
    progress: z.number().int().min(0).max(100),
    estimatedMinutes: z.number().int().min(1).max(10000000).nullable(),
    subgoals: z.array(childInput).max(50).default([]),
  }),
  z.object({
    action: z.enum(["archive", "restore", "delete"]),
    id: uuid,
    version: z.number().int(),
  }),
  z.object({
    action: z.literal("comment"),
    id: uuid,
    body: z.string().trim().min(1).max(20000),
    progress: z.number().int().min(0).max(100).optional(),
    version: z.number().int(),
  }),
  z.object({ action: z.enum(["link", "unlink"]), id: uuid, taskId: uuid }),
  z.object({
    action: z.literal("reorder"),
    id: uuid,
    beforeId: uuid,
    placement: z.enum(["before", "after"]).default("before"),
  }),
]);
const taskSelect = {
  id: true,
  title: true,
  status: true,
  plannedDate: true,
  dueAt: true,
  completedAt: true,
  archivedAt: true,
};
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json(
      { error: "Sign in to continue." },
      { status: 401 },
    );
  try {
    const db = database(),
      q = new URL(request.url).searchParams;
    const allowed = await workCategoryIds(user);
    const taskScope =
      allowed === null ? {} : { primaryCategoryId: { in: allowed } };
    const categoryScope =
      allowed === null ? {} : { categoryId: { in: allowed } };
    const categoryRecords = allowed === null ? {} : { id: { in: allowed } };
    if (q.has("search"))
      return NextResponse.json({
        tasks: await db.task.findMany({
          where: {
            userId: user.id,
            ...taskScope,
            archivedAt: null,
            title: {
              contains: q.get("search")!.slice(0, 240),
              mode: "insensitive",
            },
          },
          select: taskSelect,
          take: 50,
          orderBy: [{ plannedDate: "asc" }, { id: "asc" }],
        }),
      });
    if (q.has("id")) {
      const id = uuid.parse(q.get("id"));
      const cursor = q.get("commentsCursor")
        ? uuid.parse(q.get("commentsCursor"))
        : null;
      if (
        cursor &&
        !(await db.goalComment.findFirst({
          where: { id: cursor, userId: user.id, goalId: id },
          select: { id: true },
        }))
      )
        throw Error("Invalid comment cursor.");
      const goal = await db.goal.findFirst({
        where: { id, userId: user.id, ...categoryScope },
        include: {
          comments: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 51,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          },
          tasks: {
            where: { task: { ...taskScope, plannedDate: { not: null } } },
            include: { task: { select: taskSelect } },
          },
        },
      });
      if (!goal)
        return NextResponse.json({ error: "Goal not found." }, { status: 404 });
      return NextResponse.json({
        goal: {
          ...goal,
          comments: goal.comments.slice(0, 50),
          nextCommentsCursor:
            goal.comments.length > 50 ? goal.comments[49].id : null,
        },
      });
    }
    const [goals, categories, links] = await Promise.all([
      db.goal.findMany({
        where: { userId: user.id, ...categoryScope },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      }),
      db.category.findMany({
        where: { userId: user.id, ...categoryRecords },
        select: {
          id: true,
          name: true,
          parentId: true,
          isActive: true,
          archivedAt: true,
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      q.has("taskId")
        ? db.goalTask.findMany({
            where: {
              userId: user.id,
              taskId: uuid.parse(q.get("taskId")),
              goal: categoryScope,
              task: taskScope,
            },
            select: { goalId: true },
          })
        : Promise.resolve([]),
    ]);
    return NextResponse.json(
      { goals, categories, links },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Could not load goals." },
      { status: 400 },
    );
  }
}
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json(
      { error: "Sign in to continue." },
      { status: 401 },
    );
  try {
    checkOrigin(request);
    const raw = await request.text();
    if (raw.length > 50000) throw Error("Request too large.");
    const p = input.parse(JSON.parse(raw));
    const db = database();
    const result = await db.$transaction(
      async (tx) => {
        // Serialize hierarchy mutations for this owner to prevent concurrent cycles/reorders.
        await tx.$queryRaw`SELECT id FROM users WHERE id=${user.id}::uuid FOR UPDATE`;
        const goals = await tx.goal.findMany({
          where: { userId: user.id },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        });
        const goal =
          "id" in p && p.id ? goals.find((g) => g.id === p.id) : undefined;
        if ((p.action !== "save" || p.id) && !goal)
          throw Error("Goal not found.");
        if (goal && "version" in p && p.version !== goal.version)
          throw Error("This goal changed. Reopen it before saving.");
        const descendants = (id: string) => {
          const ids = new Set([id]);
          let changed = true;
          while (changed) {
            changed = false;
            for (const g of goals)
              if (g.parentId && ids.has(g.parentId) && !ids.has(g.id)) {
                ids.add(g.id);
                changed = true;
              }
          }
          return [...ids];
        };
        if (p.action === "save") {
          const category = await tx.category.findFirst({
            where: {
              id: p.categoryId,
              userId: user.id,
              isActive: true,
              archivedAt: null,
            },
          });
          if (!category) throw Error("Choose an active category.");
          if (p.parentId) {
            const parent = goals.find((g) => g.id === p.parentId);
            if (!parent || parent.archivedAt)
              throw Error("Choose an active parent goal.");
            if (goal && descendants(goal.id).includes(p.parentId))
              throw Error("A goal cannot be its own ancestor.");
          }
          const progress = p.status === "COMPLETED" ? 100 : p.progress;
          const values = {
            title: p.title,
            reason: p.reason,
            categoryId: p.categoryId,
            parentId: p.parentId,
            status:
              progress === 100
                ? "COMPLETED"
                : progress > 0
                  ? "STARTED"
                  : p.status,
            progress,
            estimatedMinutes: p.estimatedMinutes,
          };
          if (goal?.archivedAt)
            throw Error("Restore this goal before editing.");
          const saved = goal
            ? await tx.goal.update({
                where: { id: goal.id },
                data: { ...values, version: { increment: 1 } },
              })
            : await tx.goal.create({
                data: {
                  ...values,
                  userId: user.id,
                  sortOrder:
                    Math.max(
                      -1,
                      ...goals
                        .filter(
                          (g) =>
                            g.parentId === p.parentId &&
                            g.categoryId === p.categoryId,
                        )
                        .map((g) => g.sortOrder),
                    ) + 1,
                },
              });
          const nextOrder =
            Math.max(
              -1,
              ...goals
                .filter((g) => g.parentId === saved.id)
                .map((g) => g.sortOrder),
            ) + 1;
          for (const [index, child] of p.subgoals.entries()) {
            const categoryId = child.categoryId || saved.categoryId;
            if (
              !(await tx.category.findFirst({
                where: {
                  id: categoryId,
                  userId: user.id,
                  isActive: true,
                  archivedAt: null,
                },
              }))
            )
              throw Error("Choose an active subgoal category.");
            await tx.goal.create({
              data: {
                userId: user.id,
                parentId: saved.id,
                categoryId,
                title: child.title,
                reason: child.reason || saved.reason,
                estimatedMinutes: child.estimatedMinutes,
                progress: child.progress,
                status:
                  child.progress === 100
                    ? "COMPLETED"
                    : child.progress > 0
                      ? "STARTED"
                      : "NOT_STARTED",
                sortOrder: nextOrder + index,
              },
            });
          }
          return saved;
        }
        if (
          p.action === "restore" &&
          goal!.parentId &&
          goals.find((g) => g.id === goal!.parentId)?.archivedAt
        )
          throw Error("Restore the parent goal first.");
        if (p.action === "archive" || p.action === "restore")
          return tx.goal.updateMany({
            where: { userId: user.id, id: { in: descendants(goal!.id) } },
            data: {
              archivedAt: p.action === "archive" ? new Date() : null,
              version: { increment: 1 },
            },
          });
        if (p.action === "delete")
          return tx.goal.delete({ where: { id: goal!.id } });
        if (goal!.archivedAt) throw Error("Restore this goal first.");
        if (p.action === "comment") {
          await tx.goalComment.create({
            data: {
              userId: user.id,
              goalId: p.id,
              body: p.body,
              progress: p.progress,
            },
          });
          return tx.goal.update({
            where: { id: p.id },
            data: {
              version: { increment: 1 },
              ...(p.progress !== undefined
                ? {
                    progress: p.progress,
                    status:
                      p.progress === 100
                        ? "COMPLETED"
                        : p.progress > 0
                          ? "STARTED"
                          : "NOT_STARTED",
                  }
                : {}),
            },
          });
        }
        if (p.action === "link" || p.action === "unlink") {
          if (
            !(await tx.task.findFirst({
              where: { id: p.taskId, userId: user.id },
            }))
          )
            throw Error("Task not found.");
          return p.action === "link"
            ? tx.goalTask.upsert({
                where: { goalId_taskId: { goalId: p.id, taskId: p.taskId } },
                create: { goalId: p.id, taskId: p.taskId, userId: user.id },
                update: {},
              })
            : tx.goalTask.deleteMany({
                where: { goalId: p.id, taskId: p.taskId, userId: user.id },
              });
        }
        if (p.action === "reorder") {
          const target = goals.find(
            (g) => g.id === p.beforeId && !g.archivedAt,
          );
          if (
            !target ||
            target.categoryId !== goal!.categoryId ||
            target.parentId !== goal!.parentId
          )
            throw Error("Reorder goals within the same category and parent.");
          const siblings = goals.filter(
            (g) =>
              !g.archivedAt &&
              g.categoryId === goal!.categoryId &&
              g.parentId === goal!.parentId &&
              g.id !== goal!.id,
          );
          siblings.splice(
            siblings.findIndex((g) => g.id === target.id) +
              (p.placement === "after" ? 1 : 0),
            0,
            goal!,
          );
          for (const [sortOrder, g] of siblings.entries())
            await tx.goal.update({
              where: { id: g.id },
              data: { sortOrder, version: { increment: 1 } },
            });
          return { ok: true };
        }
      },
      { timeout: 20000 },
    );
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof z.ZodError
            ? "Check the goal fields. Title, reason and category are required."
            : e instanceof Error && !("code" in e)
              ? e.message
              : "Could not save goal.",
      },
      { status: 400 },
    );
  }
}
