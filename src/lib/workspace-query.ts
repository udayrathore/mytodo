import { z } from "zod";
import { dateOnly } from "./domain";
export const workspaceQuery = z.object({
  view: z
    .enum([
      "today",
      "tasks",
      "category",
      "projects",
      "week",
      "journal",
      "timeline",
      "insights",
      "distribution",
      "categories",
      "library",
      "task",
      "picker",
    ])
    .default("today"),
  dashboard: z.enum(["execute", "manage", "plan"]).default("execute"),
  from: dateOnly.optional(),
  through: dateOnly.optional(),
  category: z.uuid().optional(),
  project: z.uuid().optional(),
  task: z.uuid().optional(),
  series: z.uuid().optional(),
  period: z.uuid().optional(),
  cursor: z.uuid().optional(),
  search: z.string().max(240).default(""),
  status: z
    .enum([
      "ALL",
      "OPEN",
      "INBOX",
      "PLANNED",
      "IN_PROGRESS",
      "COMPLETED",
      "DEFERRED",
      "CANCELLED",
    ])
    .default("ALL"),
  archive: z.enum(["true", "false"]).default("false"),
  tag: z.uuid().optional(),
  entity: z.uuid().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
});
export type WorkspaceQuery = z.infer<typeof workspaceQuery>;
