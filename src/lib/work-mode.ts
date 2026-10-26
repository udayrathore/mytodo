import { descendants } from "./domain";
export type WorkModeUser = {
  id: string;
  workModeEnabled?: boolean;
  workCategoryIds?: string[];
};
export type ScopeCategory = {
  id: string;
  parentId: string | null;
  isActive?: boolean;
  archivedAt?: Date | string | null;
};
export function resolveWorkCategoryIds(
  user: WorkModeUser,
  categories: ScopeCategory[],
): string[] | null {
  if (!user.workModeEnabled) return null;
  const owned = new Set(categories.map((c) => c.id));
  const included = new Set<string>();
  for (const id of user.workCategoryIds || []) {
    if (owned.has(id))
      for (const child of descendants(categories, id)) included.add(child);
  }
  return categories
    .filter((c) => included.has(c.id) && c.isActive !== false && !c.archivedAt)
    .map((c) => c.id);
}

/** Apply the work-hours default only when a new sign-in succeeds. */
export function isWorkLoginTime(now: Date, timezone: string): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );
  return hour >= 10 && hour < 19;
}
