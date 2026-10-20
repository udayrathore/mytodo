export type GroupableTask = {
  id: string;
  title: string;
  seriesId: string | null;
  plannedDate: string | null;
  status: string;
};
export function groupTasks<T extends GroupableTask>(tasks: T[]) {
  const groups = new Map<string, T[]>();
  for (const task of tasks) {
    const key = task.seriesId ? `series:${task.seriesId}` : `task:${task.id}`;
    const group = groups.get(key) || [];
    group.push(task);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, occurrences]) => ({
    key,
    occurrences: [...occurrences].sort(
      (a, b) =>
        (a.plannedDate || "9999").localeCompare(b.plannedDate || "9999") ||
        a.id.localeCompare(b.id),
    ),
  }));
}
