import { workCategoryIds } from "@/lib/work-mode-server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser, checkOrigin } from "@/lib/auth";
import { database } from "@/lib/db";
const uuid = z.uuid();
const childInput = z.object({
  title: z.string().trim().min(1).max(240),
  coreLearning: z.string().trim().max(20000).default(""),
  reason: z.string().trim().min(1).max(20000).optional(),
  categoryId: uuid.optional(),
});
const input = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    id: uuid.optional(),
    version: z.number().int().optional(),
    title: z.string().trim().min(1).max(240),
    coreLearning: z.string().trim().max(20000).default(""),
    reason: z.string().trim().min(1).max(20000),
    categoryId: uuid,
    parentId: uuid.nullable(),
    goalId: uuid.nullable().default(null),
    subchallenges: z.array(childInput).max(50).default([]),
  }),
  z.object({
    action: z.enum(["archive", "restore", "delete"]),
    id: uuid,
    version: z.number().int(),
  }),
  z.object({
    action: z.literal("comment"),
    id: uuid,
    kind: z
      .enum(["CHECK_IN", "COMMENT", "UPDATE", "LEARNING"])
      .default("CHECK_IN"),
    journalId: uuid.nullable().default(null),
    body: z.string().trim().min(1).max(20000),
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
    const journalScope =
      allowed === null
        ? {}
        : { categories: { some: { categoryId: { in: allowed } } } };
    if (q.has("journalSearch"))
      return NextResponse.json({
        journals: await db.journalEntry.findMany({
          where: {
            userId: user.id,
            ...journalScope,
            archivedAt: null,
            ...(q.get("journalSearch")
              ? {
                  title: {
                    contains: q.get("journalSearch")!.slice(0, 240),
                    mode: "insensitive" as const,
                  },
                }
              : {}),
          },
          select: { id: true, title: true },
          take: 50,
          orderBy: { updatedAt: "desc" },
        }),
      });
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
        !(await db.challengeComment.findFirst({
          where: { id: cursor, userId: user.id, challengeId: id },
          select: { id: true },
        }))
      )
        throw Error("Invalid comment cursor.");
      const challenge = await db.challenge.findFirst({
        where: { id, userId: user.id, ...categoryScope },
        include: {
          comments: {
            include: {
              journal: { select: { id: true, title: true, content: true } },
            },
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
      if (!challenge)
        return NextResponse.json(
          { error: "Challenge not found." },
          { status: 404 },
        );
      return NextResponse.json({
        challenge: {
          ...challenge,
          comments: challenge.comments.slice(0, 50),
          nextCommentsCursor:
            challenge.comments.length > 50 ? challenge.comments[49].id : null,
        },
      });
    }
    const [challenges, categories, links, goals] = await Promise.all([
      db.challenge.findMany({
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
        ? db.challengeTask.findMany({
            where: {
              userId: user.id,
              taskId: uuid.parse(q.get("taskId")),
              challenge: categoryScope,
              task: taskScope,
            },
            select: { challengeId: true },
          })
        : Promise.resolve([]),
      db.goal.findMany({
        where: { userId: user.id, ...categoryScope },
        select: { id: true, title: true, archivedAt: true },
        orderBy: { title: "asc" },
      }),
    ]);
    return NextResponse.json(
      { challenges, categories, links, goals },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Could not load challenges." },
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
        const challenges = await tx.challenge.findMany({
          where: { userId: user.id },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        });
        const challenge =
          "id" in p && p.id ? challenges.find((g) => g.id === p.id) : undefined;
        if ((p.action !== "save" || p.id) && !challenge)
          throw Error("Challenge not found.");
        if (challenge && "version" in p && p.version !== challenge.version)
          throw Error("This challenge changed. Reopen it before saving.");
        const descendants = (id: string) => {
          const ids = new Set([id]);
          let changed = true;
          while (changed) {
            changed = false;
            for (const g of challenges)
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
            const parent = challenges.find((g) => g.id === p.parentId);
            if (!parent || parent.archivedAt)
              throw Error("Choose an active parent challenge.");
            if (challenge && descendants(challenge.id).includes(p.parentId))
              throw Error("A challenge cannot be its own ancestor.");
          }
          if (
            p.goalId &&
            !(await tx.goal.findFirst({
              where: { id: p.goalId, userId: user.id },
            }))
          )
            throw Error("Goal not found.");
          const values = {
            coreLearning: p.coreLearning,
            title: p.title,
            reason: p.reason,
            categoryId: p.categoryId,
            parentId: p.parentId,
            goalId: p.goalId,
          };
          if (challenge?.archivedAt)
            throw Error("Restore this challenge before editing.");
          const saved = challenge
            ? await tx.challenge.update({
                where: { id: challenge.id },
                data: { ...values, version: { increment: 1 } },
              })
            : await tx.challenge.create({
                data: {
                  ...values,
                  userId: user.id,
                  sortOrder:
                    Math.max(
                      -1,
                      ...challenges
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
              ...challenges
                .filter((g) => g.parentId === saved.id)
                .map((g) => g.sortOrder),
            ) + 1;
          for (const [index, child] of p.subchallenges.entries()) {
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
              throw Error("Choose an active subchallenge category.");
            await tx.challenge.create({
              data: {
                userId: user.id,
                parentId: saved.id,
                categoryId,
                title: child.title,
                coreLearning: child.coreLearning,
                reason: child.reason || saved.reason,
                goalId: saved.goalId,
                sortOrder: nextOrder + index,
              },
            });
          }
          return saved;
        }
        if (
          p.action === "restore" &&
          challenge!.parentId &&
          challenges.find((g) => g.id === challenge!.parentId)?.archivedAt
        )
          throw Error("Restore the parent challenge first.");
        if (p.action === "archive" || p.action === "restore")
          return tx.challenge.updateMany({
            where: { userId: user.id, id: { in: descendants(challenge!.id) } },
            data: {
              archivedAt: p.action === "archive" ? new Date() : null,
              version: { increment: 1 },
            },
          });
        if (p.action === "delete")
          return tx.challenge.delete({ where: { id: challenge!.id } });
        if (challenge!.archivedAt) throw Error("Restore this challenge first.");
        if (p.action === "comment") {
          if (
            p.journalId &&
            !(await tx.journalEntry.findFirst({
              where: { id: p.journalId, userId: user.id },
            }))
          )
            throw Error("Journal not found.");
          await tx.challengeComment.create({
            data: {
              userId: user.id,
              challengeId: p.id,
              body: p.body,
              kind: p.kind,
              journalId: p.journalId,
            },
          });
          return tx.challenge.update({
            where: { id: p.id },
            data: { version: { increment: 1 } },
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
            ? tx.challengeTask.upsert({
                where: {
                  challengeId_taskId: { challengeId: p.id, taskId: p.taskId },
                },
                create: {
                  challengeId: p.id,
                  taskId: p.taskId,
                  userId: user.id,
                },
                update: {},
              })
            : tx.challengeTask.deleteMany({
                where: { challengeId: p.id, taskId: p.taskId, userId: user.id },
              });
        }
        if (p.action === "reorder") {
          const target = challenges.find(
            (g) => g.id === p.beforeId && !g.archivedAt,
          );
          if (
            !target ||
            target.categoryId !== challenge!.categoryId ||
            target.parentId !== challenge!.parentId
          )
            throw Error(
              "Reorder challenges within the same category and parent.",
            );
          const siblings = challenges.filter(
            (g) =>
              !g.archivedAt &&
              g.categoryId === challenge!.categoryId &&
              g.parentId === challenge!.parentId &&
              g.id !== challenge!.id,
          );
          siblings.splice(
            siblings.findIndex((g) => g.id === target.id) +
              (p.placement === "after" ? 1 : 0),
            0,
            challenge!,
          );
          for (const [sortOrder, g] of siblings.entries())
            await tx.challenge.update({
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
            ? "Check the challenge fields. Title, reason and category are required."
            : e instanceof Error && !("code" in e)
              ? e.message
              : "Could not save challenge.",
      },
      { status: 400 },
    );
  }
}
