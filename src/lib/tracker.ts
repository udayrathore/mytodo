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
  return data.categories
    .filter((c) => !c.parentId && c.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((c) => ({ ...c, descendants: descendants(data.categories, c.id) }));
}
