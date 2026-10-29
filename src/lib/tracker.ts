import type { Workspace, Task } from "./workspace";
import { descendants } from "./domain";
export type TrackerEntry = {
  id: string;
  task: Task;
  date: string;
  kind: "planned" | "logged";
  note?: string | null;
  minutes?: number | null;
};
export function trackerEntries(
  data: Pick<Workspace, "tasks" | "events">,
): TrackerEntry[] {
  return data.tasks
    .filter((t) => !t.archivedAt)
    .flatMap((t) => {
      const entries: TrackerEntry[] = [];
      if (t.plannedDate && t.status !== "CANCELLED")
        entries.push({
          id: `plan-${t.id}`,
          task: t,
          date: t.plannedDate.slice(0, 10),
          kind: "planned",
        });
      for (const effort of t.effort)
        entries.push({
          id: effort.id,
          task: t,
          date: effort.occurredOn.slice(0, 10),
          kind: "logged",
          note: effort.note,
          minutes: effort.minutes,
        });
      for (const event of data.events.filter(
        (e) =>
          e.taskId === t.id &&
          e.eventType === "EFFORT_RECORDED" &&
          typeof e.toValue?.occurredOn === "string" &&
          !e.toValue?.effortEntryId,
      )) {
        entries.push({
          id: event.id,
          task: t,
          date: event.toValue!.occurredOn as string,
          kind: "logged",
          note:
            typeof event.toValue?.note === "string" ? event.toValue.note : null,
        });
      }
      return entries;
    });
}
export function trackerColumns(data: Pick<Workspace, "categories">) {
  const visibleIds = new Set(data.categories.map((c) => c.id));
  return data.categories
    .filter((c) => c.isActive && (!c.parentId || !visibleIds.has(c.parentId)))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((c) => ({ ...c, descendants: descendants(data.categories, c.id) }));
}

// A task appears once in the task view. Session logs remain optional history.
export function taskEntries(data: Pick<Workspace, "tasks" | "events">): TrackerEntry[] {
  const activity = trackerEntries(data).filter(e => e.kind === "logged");
  return data.tasks.filter(t => !t.archivedAt && t.status !== "CANCELLED").flatMap(task => {
    const date = task.plannedDate?.slice(0, 10) || activity.filter(e => e.task.id === task.id).map(e => e.date).sort()[0];
    return date ? [{ id: task.id, task, date, kind: "planned" as const }] : [];
  });
}
