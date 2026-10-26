import { database } from "./db";
import { Prisma } from "@/generated/prisma/client";
import { resolveWorkCategoryIds, type WorkModeUser } from "./work-mode";
export async function workCategoryIds(user: WorkModeUser) {
  if (!user.workModeEnabled) return null;
  return resolveWorkCategoryIds(
    user,
    await database().category.findMany({
      where: { userId: user.id },
      select: { id: true, parentId: true, isActive: true, archivedAt: true },
    }),
  );
}
export function categorySql(column: string, ids: string[] | null) {
  if (ids === null) return Prisma.sql`TRUE`;
  if (!ids.length) return Prisma.sql`FALSE`;
  // All column identifiers are static call-site constants, never request values.
  return Prisma.sql`${Prisma.raw(column)} IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})`;
}
