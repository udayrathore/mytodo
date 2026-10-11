import { dateKey, descendants } from "./domain";
import type { Workspace, Task } from "./workspace";
export function effortTotal(task: Task) {
  return task.effort.length
    ? task.effort.reduce((n, e) => n + e.minutes, 0)
    : task.manualActualMinutes || 0;
}
export function analytics(data: Workspace, from: string, to: string) {
  const inRange = (date: string | null) =>
    !!date &&
    dateKey(new Date(date), data.user.timezone) >= from &&
    dateKey(new Date(date), data.user.timezone) <= to;
  const work = data.tasks.flatMap((t) =>
    t.effort
      .filter((e) => inRange(e.occurredOn))
      .map((e) => ({
        task: t,
        minutes: e.minutes,
        date: e.occurredOn.slice(0, 10),
      })),
  );
  const total = work.reduce((n, e) => n + e.minutes, 0);
  const category = data.categories.map((c) => {
    const children = descendants(data.categories, c.id);
    return {
      id: c.id,
      name: c.name,
      parentId: c.parentId,
      minutes: work
        .filter(
          (e) =>
            e.task.primaryCategoryId && children.has(e.task.primaryCategoryId),
        )
        .reduce((n, e) => n + e.minutes, 0),
    };
  });
  const entity = data.entities
    .map((e) => ({
      id: e.id,
      name: e.name,
      minutes: work
        .filter((w) =>
          w.task.entities.some((l) =>
            descendants(
              data.entities.map((n) => ({
                id: n.id,
                parentId: n.parentEntityId,
              })),
              e.id,
            ).has(l.entityId),
          ),
        )
        .reduce((n, w) => n + w.minutes, 0),
    }))
    .sort((a, b) => b.minutes - a.minutes);
  const tags = data.tags
    .map((t) => ({
      id: t.id,
      name: t.name,
      minutes: work
        .filter((w) => w.task.tags.some((l) => l.tagId === t.id))
        .reduce((n, w) => n + w.minutes, 0),
    }))
    .sort((a, b) => b.minutes - a.minutes);
  return {
    total,
    uncategorized: work
      .filter((w) => !w.task.primaryCategoryId)
      .reduce((n, w) => n + w.minutes, 0),
    category,
    entity,
    tags,
    created: data.tasks.filter((t) => inRange(t.createdAt)).length,
    completed: data.events.filter(
      (e) => e.eventType === "COMPLETED" && inRange(e.occurredAt),
    ).length,
    deferred: data.events.filter(
      (e) => e.eventType === "DEFERRED" && inRange(e.occurredAt),
    ).length,
    overdue: data.tasks.filter(
      (t) =>
        !t.archivedAt &&
        !["COMPLETED", "CANCELLED"].includes(t.status) &&
        t.dueAt &&
        t.dueAt.slice(0, 10) < data.today,
    ).length,
    days: Array.from(
      {
        length: Math.min(
          366,
          Math.floor((Date.parse(to) - Date.parse(from)) / 86400000) + 1,
        ),
      },
      (_, i) => {
        const date = new Date(Date.parse(from) + i * 86400000)
          .toISOString()
          .slice(0, 10);
        return {
          date,
          minutes: work
            .filter((w) => w.date === date)
            .reduce((n, w) => n + w.minutes, 0),
        };
      },
    ),
  };
}
