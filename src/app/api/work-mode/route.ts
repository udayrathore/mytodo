import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, checkOrigin, AuthError } from "@/lib/auth";
import { database } from "@/lib/db";
const input = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("configure"),
    categoryIds: z.array(z.uuid()).max(200),
  }),
  z.object({ action: z.literal("toggle"), enabled: z.boolean() }),
]);
const select = { workModeEnabled: true, workCategoryIds: true };
export async function GET() {
  try {
    const user = await requireUser();
    const categories = await database().category.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        name: true,
        parentId: true,
        isActive: true,
        archivedAt: true,
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return NextResponse.json(
      {
        enabled: user.workModeEnabled,
        categoryIds: user.workCategoryIds,
        categories,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof AuthError ? e.message : "Could not load Work mode.",
      },
      { status: e instanceof AuthError ? 401 : 503 },
    );
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    const raw = await request.text();
    if (raw.length > 15000)
      return NextResponse.json(
        { error: "Too many categories." },
        { status: 413 },
      );
    const value = input.parse(JSON.parse(raw));
    const result = await database().$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id=${user.id}::uuid FOR UPDATE`;
      if (value.action === "configure") {
        const ids = [...new Set(value.categoryIds)];
        if (
          (await tx.category.count({
            where: {
              id: { in: ids },
              userId: user.id,
              isActive: true,
              archivedAt: null,
            },
          })) !== ids.length
        )
          throw Error("Choose active categories from your workspace.");
        return tx.user.update({
          where: { id: user.id },
          data: { workCategoryIds: ids },
          select,
        });
      }
      return tx.user.update({
        where: { id: user.id },
        data: { workModeEnabled: value.enabled },
        select,
      });
    });
    return NextResponse.json(
      { enabled: result.workModeEnabled, categoryIds: result.workCategoryIds },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof AuthError
            ? e.message
            : e instanceof z.ZodError
              ? "Check the selected categories."
              : e instanceof Error && !("code" in e)
                ? e.message
                : "Could not save Work mode.",
      },
      { status: e instanceof AuthError ? 401 : 400 },
    );
  }
}
