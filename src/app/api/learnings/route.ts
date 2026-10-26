import { workCategoryIds } from "@/lib/work-mode-server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser, checkOrigin } from "@/lib/auth";
import { database } from "@/lib/db";
import { validateJournalDocument } from "@/lib/journal-document";
const input = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    categoryId: z.uuid(),
    id: z.uuid().optional(),
    version: z.number().int().optional(),
    title: z.string().trim().min(1).max(240),
    content: z.string().max(85000),
    document: z.record(z.string(), z.unknown()),
    coreFinding: z.string().trim().max(20000),
  }),
  z.object({
    action: z.literal("finding"),
    id: z.uuid(),
    body: z.string().trim().min(1).max(20000),
  }),
  z.object({
    action: z.enum(["archive", "restore", "delete"]),
    id: z.uuid(),
    version: z.number().int(),
  }),
]);
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
    const categoryScope =
      allowed === null ? {} : { categoryId: { in: allowed } };
    if (q.has("categories"))
      return NextResponse.json({
        categories: await db.category.findMany({
          where: {
            userId: user.id,
            ...(allowed === null ? {} : { id: { in: allowed } }),
          },
          select: {
            id: true,
            name: true,
            parentId: true,
            isActive: true,
            archivedAt: true,
          },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        }),
      });
    if (q.has("id")) {
      const learning = await db.learning.findFirst({
        where: {
          id: z.uuid().parse(q.get("id")),
          userId: user.id,
          ...categoryScope,
        },
        include: {
          updates: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] },
        },
      });
      if (!learning)
        return NextResponse.json(
          { error: "Learning not found." },
          { status: 404 },
        );
      return NextResponse.json({ learning });
    }
    const cursor = q.get("cursor") ? z.uuid().parse(q.get("cursor")) : null;
    if (
      cursor &&
      !(await db.learning.findFirst({
        where: { id: cursor, userId: user.id },
        select: { id: true },
      }))
    )
      throw Error("Invalid cursor.");
    const learnings = await db.learning.findMany({
      where: {
        userId: user.id,
        ...categoryScope,
        archivedAt: q.get("archive") === "true" ? { not: null } : null,
        ...(q.get("search")
          ? {
              OR: [
                {
                  title: {
                    contains: q.get("search")!.slice(0, 240),
                    mode: "insensitive" as const,
                  },
                },
                {
                  content: {
                    contains: q.get("search")!.slice(0, 240),
                    mode: "insensitive" as const,
                  },
                },
                {
                  coreFinding: {
                    contains: q.get("search")!.slice(0, 240),
                    mode: "insensitive" as const,
                  },
                },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        categoryId: true,
        title: true,
        coreFinding: true,
        updatedAt: true,
        archivedAt: true,
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 101,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return NextResponse.json({
      learnings: learnings.slice(0, 100),
      nextCursor: learnings.length > 100 ? learnings[99].id : null,
    });
  } catch {
    return NextResponse.json(
      { error: "Could not load learnings." },
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
    if (raw.length > 200000) throw Error("Document too large.");
    const p = input.parse(JSON.parse(raw));
    if (p.action === "save") validateJournalDocument(p.document);
    const learning = await database().$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id=${user.id}::uuid FOR UPDATE`;
      const old = p.id
        ? await tx.learning.findFirst({ where: { id: p.id, userId: user.id } })
        : null;
      if (p.id && !old) throw Error("Learning not found.");
      if (old && "version" in p && p.version !== old.version)
        throw Error(
          "This learning changed in another tab. Copy your draft before reopening it.",
        );
      if (p.action === "save") {
        if (old?.archivedAt)
          throw Error("Restore this learning before editing.");
        if (
          !(await tx.category.findFirst({
            where: {
              id: p.categoryId,
              userId: user.id,
              ...(old?.categoryId === p.categoryId
                ? {}
                : { isActive: true, archivedAt: null }),
            },
          }))
        )
          throw Error("Choose an active category.");
        const values = {
          categoryId: p.categoryId,
          title: p.title,
          content: p.content,
          document: JSON.parse(JSON.stringify(p.document)),
          coreFinding: p.coreFinding,
        };
        const saved = old
          ? await tx.learning.update({
              where: { id: old.id },
              data: { ...values, version: { increment: 1 } },
            })
          : await tx.learning.create({ data: { ...values, userId: user.id } });
        if ((old?.coreFinding || "") !== p.coreFinding)
          await tx.learningUpdate.create({
            data: {
              userId: user.id,
              learningId: saved.id,
              kind: "BELIEF",
              body: p.coreFinding || "(Core finding cleared)",
            },
          });
        return saved;
      }
      if (!old) throw Error("Learning not found.");
      if (p.action === "finding") {
        if (old.archivedAt) throw Error("Restore this learning first.");
        await tx.learningUpdate.create({
          data: {
            userId: user.id,
            learningId: old.id,
            kind: "FINDING",
            body: p.body,
          },
        });
        return tx.learning.update({
          where: { id: old.id },
          data: { version: { increment: 1 } },
        });
      }
      if (p.action === "delete")
        return tx.learning.delete({ where: { id: old.id } });
      return tx.learning.update({
        where: { id: old.id },
        data: {
          archivedAt: p.action === "archive" ? new Date() : null,
          version: { increment: 1 },
        },
      });
    });
    return NextResponse.json({ learning });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof z.ZodError
            ? "Check the learning fields."
            : e instanceof Error && !("code" in e)
              ? e.message
              : "Could not save learning.",
      },
      { status: 400 },
    );
  }
}
