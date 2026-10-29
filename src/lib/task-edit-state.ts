import type { CommandResult } from "./command-client";
import type { Task } from "./workspace";

/** Apply only a committed task acknowledgement, keeping checklist and scalar saves on one version. */
export function applyTaskEditResult(
  task: Task,
  command: Record<string, unknown>,
  result: CommandResult,
): Task {
  if (result.id !== task.id) return task;
  let next = {
    ...task,
    ...(result.version === undefined ? {} : { version: result.version }),
  };
  if (result.checklistItems) next.checklistItems = result.checklistItems;
  if (command.type === "task.update") {
    next = {
      ...next,
      title: command.title as string,
      description: command.description as string,
      primaryCategoryId: command.primaryCategoryId as string | null,
      urgency: command.urgency as number,
      importance: command.importance as number,
      estimatedMinutes: command.estimatedMinutes as number | null,
      tags: (command.tagIds as string[]).map((tagId) => ({ tagId })),
      entities: (command.entityIds as string[]).map((entityId) => ({
        entityId,
        relationshipType: command.relationshipType as string,
      })),
      ...(command.scope === "ALL"
        ? {}
        : {
            plannedDate: command.plannedDate as string | null,
            dueAt: command.dueAt as string | null,
            status: command.status as string,
            completedAt:
              command.status === "COMPLETED"
                ? task.completedAt || new Date().toISOString()
                : null,
          }),
    };
  }
  if (command.type === "task.status") {
    next.status = command.status as string;
    next.completedAt =
      command.status === "COMPLETED"
        ? task.completedAt || new Date().toISOString()
        : null;
  }
  if (command.type === "task.archive")
    next.archivedAt = command.archived ? new Date().toISOString() : null;
  if (result.seriesVersion !== undefined && next.series)
    next.series = { ...next.series, version: result.seriesVersion };
  return next;
}
