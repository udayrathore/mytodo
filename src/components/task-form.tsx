"use client";
import { TaskCreateExtras, readTaskCreateExtras } from "./task-create-extras";
import { TaskPriorityDials } from "./task-priority-dials";
import { RepeatFields, readRepeat } from "./task-options";
import { useState, type FormEvent } from "react";
import type { Workspace, Task } from "@/lib/workspace";
import { Field, Chips, human, localInput, inputToIso } from "./ui";
export type Save = (command: Record<string, unknown>) => Promise<boolean>;
export function TaskForm({
  data,
  task,
  save,
  onDone,
  compact = false,
  visibleFields = [],
}: {
  compact?: boolean;
  visibleFields?: string[];
  data: Workspace;
  task?: Task;
  save: Save;
  onDone: () => void;
}) {
  const [tags, setTags] = useState(task?.tags.map((t) => t.tagId) || []);
  const [entities, setEntities] = useState(
    task?.entities.map((e) => e.entityId) || [],
  );
  const projects = data.entities.filter(
    (e) =>
      e.type === "PROJECT" &&
      ((e.isActive && !e.archivedAt) || entities.includes(e.id)),
  );
  const projectIds = new Set(
    data.entities.filter((e) => e.type === "PROJECT").map((e) => e.id),
  );
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState("ONE");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const dt = String(f.get("dueAt") || "");
    const ok = await save({
      type: task ? "task.update" : "task.create",
      ...(task
        ? {
            id: task.id,
            version: task.version,
            status: f.get("status") || task.status,
            scope,
            seriesVersion: task.series?.version,
          }
        : {
            repeat: readRepeat(f),
            ...readTaskCreateExtras(f, data.user.timezone),
          }),

      title: f.get("title"),
      description: f.get("description"),
      primaryCategoryId: f.get("primaryCategoryId") || null,
      urgency: Number(f.get("urgency")),
      importance: Number(f.get("importance")),
      plannedDate: f.get("plannedDate") || null,
      dueAt: dt ? inputToIso(dt, data.user.timezone) : null,
      estimatedMinutes: f.get("estimatedMinutes")
        ? Number(f.get("estimatedMinutes"))
        : null,
      tagIds: tags,
      entityIds: entities,
      relationshipType: f.get("relationshipType") || "CONTRIBUTES_TO",
    });
    setBusy(false);
    if (ok) onDone();
  }
  return (
    <form onSubmit={submit} className="form-stack">
      {task?.seriesId && (
        <div hidden={compact && !visibleFields.includes("series")}>
          <label className="field">
            Apply changes to
            <select value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="ONE">This occurrence only</option>
              <option value="ALL">Every occurrence in this series</option>
            </select>
            <small>
              {scope === "ALL"
                ? "Updates title, notes, category, urgency, importance, estimate, tags and entities across the series, including future tasks. Individual dates and completion statuses are preserved."
                : "Other occurrences will stay unchanged."}
            </small>
          </label>
        </div>
      )}

      {!task && <RepeatFields />}
      <Field label="Task name">
        <input
          name="title"
          autoFocus
          required
          maxLength={240}
          defaultValue={task?.title}
          placeholder="What do you need to do?"
          className="title-input"
        />
      </Field>
      <fieldset className="task-project-links">
        <legend>Projects</legend>
        {projects.length ? (
          projects.map((project) => (
            <label key={project.id} className="checkbox-label">
              <input
                type="checkbox"
                name="projectIds"
                value={project.id}
                checked={entities.includes(project.id)}
                onChange={(event) =>
                  setEntities((previous) =>
                    event.target.checked
                      ? [...previous, project.id]
                      : previous.filter((id) => id !== project.id),
                  )
                }
              />
              {project.name}
            </label>
          ))
        ) : (
          <p className="muted small">
            Create a project in Master → Projects, then link it here.
          </p>
        )}
      </fieldset>
      <div
        hidden={
          compact && !visibleFields.includes("notes") && !task?.description
        }
      >
        <Field label="Notes">
          <textarea
            name="description"
            rows={3}
            defaultValue={task?.description || ""}
            placeholder="Notes"
          />
        </Field>
      </div>
      <div className="form-grid">
        <div className="task-basics-row">
          <Field label="Category">
            <select
              name="primaryCategoryId"
              defaultValue={task?.primaryCategoryId || ""}
            >
              <option value="">Uncategorized</option>
              {data.categories
                .filter((c) => c.isActive || c.id === task?.primaryCategoryId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {data.categories.find((p) => p.id === c.parentId)?.name
                      ? data.categories.find((p) => p.id === c.parentId)?.name +
                        " / "
                      : ""}
                    {c.name}
                  </option>
                ))}
            </select>
          </Field>
          <TaskPriorityDials
            urgency={task?.urgency}
            importance={task?.importance}
          />
        </div>
        <div hidden={compact && !visibleFields.includes("date")}>
          {" "}
          <Field label="Planned date">
            <input
              type="date"
              name="plannedDate"
              disabled={scope === "ALL"}
              defaultValue={task?.plannedDate?.slice(0, 10)}
            />
          </Field>
        </div>
        <div hidden={compact && !visibleFields.includes("due")}>
          <Field label={`Due · ${data.user.timezone}`}>
            <input
              type="datetime-local"
              name="dueAt"
              disabled={scope === "ALL"}
              defaultValue={
                task?.dueAt ? localInput(task.dueAt, data.user.timezone) : ""
              }
            />
          </Field>
        </div>
        <div hidden={compact && !visibleFields.includes("estimate")}>
          <Field label="Estimate · minutes">
            <input
              name="estimatedMinutes"
              type="number"
              min={0}
              max={100000}
              defaultValue={task?.estimatedMinutes ?? ""}
              placeholder="Optional"
            />
          </Field>
        </div>
        {task && !compact ? (
          <Field label="Status">
            <select
              name="status"
              disabled={scope === "ALL"}
              defaultValue={task.status}
            >
              {[
                "INBOX",
                "PLANNED",
                "IN_PROGRESS",
                "COMPLETED",
                "DEFERRED",
                "CANCELLED",
              ].map((s) => (
                <option value={s} key={s}>
                  {human(s)}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
      </div>
      <div hidden={compact && !visibleFields.includes("tags")}>
        {" "}
        <div className="field">
          <span>Tags</span>
          <Chips items={data.tags} selected={tags} onChange={setTags} />
        </div>
      </div>
      <div hidden={compact && !visibleFields.includes("entities")}>
        {" "}
        <div className="field">
          <span>Related entities</span>
          <Chips
            items={data.entities.filter(
              (e) =>
                e.type !== "PROJECT" && (e.isActive || entities.includes(e.id)),
            )}
            selected={entities}
            onChange={(ids) =>
              setEntities((previous) => [
                ...previous.filter((id) => projectIds.has(id)),
                ...ids.filter((id) => !projectIds.has(id)),
              ])
            }
          />
        </div>
        {entities.length > 0 && (
          <Field label="Entity relationship">
            <input
              name="relationshipType"
              defaultValue={
                task?.entities[0]?.relationshipType || "CONTRIBUTES_TO"
              }
              maxLength={80}
              required
            />
          </Field>
        )}
      </div>
      {!task && <TaskCreateExtras data={data} includeFields={false} />}
      <button className="button primary" disabled={busy}>
        {busy ? "Saving…" : task ? "Save changes" : "Add task"}
      </button>
    </form>
  );
}
