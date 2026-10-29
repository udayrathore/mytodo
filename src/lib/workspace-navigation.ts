import { workspaceQuery, type WorkspaceQuery } from "./workspace-query";
import { addDays } from "./domain";

const navigationViews = new Set([
  "today",
  "tasks",
  "week",
  "journal",
  "timeline",
  "insights",
  "category",
  "projects",
  "categories",
  "distribution",
  "library",
  "master",
  "account",
  "work-mode",
  "goals",
  "challenges",
  "learnings",
]);
const independentViews = new Set([
  "master",
  "account",
  "work-mode",
  "goals",
  "challenges",
  "learnings",
]);
export type WorkspaceNavigation = {
  view: string;
  query: WorkspaceQuery;
  task: string | null;
};

/** Share a validated request between SSR and hydration instead of fetching Today first. */
export function initialWorkspaceNavigation(
  raw: Record<string, string | string[] | undefined> = {},
  today = new Date().toISOString().slice(0, 10),
): WorkspaceNavigation {
  const value = (key: string) =>
    typeof raw[key] === "string" ? (raw[key] as string) : undefined;
  const candidate = value("view") || "today";
  const view = navigationViews.has(candidate) ? candidate : "today";
  const fields: Record<string, unknown> = {
    view: independentViews.has(view) ? "library" : view,
    status: view === "tasks" ? "OPEN" : "ALL",
  };
  for (const [key, schema] of Object.entries(workspaceQuery.shape)) {
    if (["view", "task", "cursor"].includes(key)) continue;
    const input = value(key);
    if (!input) continue;
    const parsed = schema.safeParse(input);
    if (parsed.success) fields[key] = parsed.data;
  }
  if (view !== "tasks") {
    fields.status = "ALL";
    fields.archive = "false";
  }
  if (!["today", "tasks", "journal"].includes(view)) fields.search = "";
  if (!["today", "tasks"].includes(view)) {
    delete fields.tag;
    delete fields.entity;
  }
  const query = workspaceQuery.parse(fields);
  const task = workspaceQuery.shape.task.safeParse(value("task"));
  // Reject unsupported date windows without breaking an otherwise valid bookmark.
  const through = query.through || addDays(today, 6);
  const from = query.from || (query.through ? addDays(through, -6) : today);
  if (
    from > through ||
    Date.parse(through) - Date.parse(from) > 31 * 86400000 ||
    through > addDays(today, 730)
  ) {
    delete query.from;
    delete query.through;
  }
  return { view, query, task: task.success ? task.data || null : null };
}

/** Only actual request values participate; key order and empty UI state do not. */
export function workspaceRequestKey(query: Record<string, unknown>) {
  return JSON.stringify(
    Object.entries(query)
      .filter(
        ([key, value]) =>
          key !== "journalSearch" &&
          value !== undefined &&
          value !== null &&
          value !== "",
      )
      .map(([key, value]) => [key, String(value)])
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}
