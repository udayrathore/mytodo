import { NextResponse } from "next/server";
import { z } from "zod";
import { database } from "@/lib/db";
import { AuthError, requireUser } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const q = z.object({ task: z.uuid(), cursor: z.uuid().optional() })
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    const db = database();
    if (!await db.task.findFirst({ where: { id: q.task, userId: user.id }, select: { id: true } }))
      return NextResponse.json({ error: "Task not found." }, { status: 404 });
    if (q.cursor && !await db.taskComment.findFirst({ where: { id: q.cursor, taskId: q.task, userId: user.id } }))
      return NextResponse.json({ error: "Invalid cursor." }, { status: 400 });
    const rows = await db.taskComment.findMany({
      where: { taskId: q.task, userId: user.id },
      select: { id: true, body: true, createdAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 51,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const items = rows.slice(0, 50);
    return NextResponse.json({ items, nextCursor: rows.length > 50 ? items.at(-1)!.id : null },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof AuthError ? "Sign in to continue." : "Could not load comments." },
      { status: e instanceof AuthError ? 401 : e instanceof z.ZodError ? 400 : 503 });
  }
}
