import type { Workspace, TaskChecklistItem } from "./workspace";
type Patch = {
  collection: "categories" | "tags" | "entities";
  record: { id: string };
};
export type CommandResult = {
  ok: boolean;
  id?: string;
  version?: number;
  seriesVersion?: number;
  checklistItems?: TaskChecklistItem[];
  patch?: Patch;
};
// Keep a key for ambiguous network failures so Retry cannot duplicate a committed write.
const pendingKeys = new Map<string, string>();
export async function postCommand(
  command: Record<string, unknown>,
): Promise<CommandResult> {
  const body = JSON.stringify(command);
  const key = pendingKeys.get(body) || crypto.randomUUID();
  pendingKeys.set(body, key);
  let response: Response;
  try {
    response = await fetch("/api/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body,
    });
    const result = await response.json();
    if (!response.ok) {
      if (response.status < 500) pendingKeys.delete(body);
      throw new Error(result.error || "Could not save. Retry this change.");
    }
    pendingKeys.delete(body);
    return result;
  } catch (error) {
    throw error instanceof Error
      ? error
      : new Error("Connection interrupted. Retry this change safely.");
  }
}
// A saved undated task remains retrievable through detail/pickers, but must not
// be reintroduced into a standalone list by an in-memory refresh or patch.
export function visibleWorkspaceTasks(data: Workspace): Workspace {
  if (!data.page || ["task", "picker"].includes(data.page.view)) return data;
  const tasks = data.tasks.filter((task) => task.plannedDate !== null);
  return tasks.length === data.tasks.length ? data : { ...data, tasks };
}
export function applyCommandPatch(
  data: Workspace,
  result: CommandResult,
): Workspace {
  if (!result.patch) return visibleWorkspaceTasks(data);
  const { collection, record } = result.patch;
  return visibleWorkspaceTasks({
    ...data,
    [collection]: [
      ...data[collection].filter((item) => item.id !== record.id),
      record,
    ],
  } as Workspace);
}
