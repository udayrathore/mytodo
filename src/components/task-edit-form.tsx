"use client";

import {
  useEffect,
  useId,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { AlignLeft, Check } from "lucide-react";
import type { Task, Workspace } from "@/lib/workspace";
import { statuses } from "@/lib/domain";
import { DatePicker } from "./date-picker";
import { TaskPriorityDials } from "./task-priority-dials";
import type { Save } from "./task-form";
import { human, inputToIso, localInput } from "./ui";

export function TaskEditForm({
  task,
  data,
  save,
  disabled = false,
  mainExtra,
  settingsExtra,
}: {
  task: Task;
  data: Workspace;
  save: Save;
  disabled?: boolean;
  mainExtra?: ReactNode;
  settingsExtra?: ReactNode;
}) {
  const formId = useId();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || "");
  const [category, setCategory] = useState(task.primaryCategoryId || "");
  const [plannedDate, setPlannedDate] = useState(
    task.plannedDate?.slice(0, 10) || "",
  );
  const [dueAt, setDueAt] = useState(
    task.dueAt ? localInput(task.dueAt, data.user.timezone) : "",
  );
  const [estimate, setEstimate] = useState(String(task.estimatedMinutes ?? ""));
  const [status, setStatus] = useState(task.status);
  useEffect(() => setStatus(task.status), [task.status]);
  const [tags, setTags] = useState(task.tags.map((tag) => tag.tagId));
  const [entities, setEntities] = useState(
    task.entities.map((entity) => entity.entityId),
  );
  const [relationship, setRelationship] = useState(
    task.entities[0]?.relationshipType || "CONTRIBUTES_TO",
  );
  const [scope, setScope] = useState("ONE");
  const [busy, setBusy] = useState(false);
  const locked = busy || disabled;
  const done = task.status === "COMPLETED";
  const projects = data.entities.filter(
    (entity) =>
      entity.type === "PROJECT" &&
      ((entity.isActive && !entity.archivedAt) || entities.includes(entity.id)),
  );
  const relatedEntities = data.entities.filter(
    (entity) =>
      entity.type !== "PROJECT" &&
      (entity.isActive || entities.includes(entity.id)),
  );
  const availableCategories = data.categories.filter(
    (item) => item.isActive || item.id === category,
  );
  function toggleEntity(id: string, checked: boolean) {
    setEntities((previous) =>
      checked
        ? [...new Set([...previous, id])]
        : previous.filter((value) => value !== id),
    );
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await save({
        type: "task.update",
        id: task.id,
        version: task.version,
        title,
        description,
        primaryCategoryId: category || null,
        plannedDate: plannedDate || null,
        dueAt: dueAt ? inputToIso(dueAt, data.user.timezone) : null,
        urgency: Number(form.get("urgency")),
        importance: Number(form.get("importance")),
        estimatedMinutes: estimate ? Number(estimate) : null,
        status: scope === "ALL" ? task.status : status,
        scope,
        seriesVersion: task.series?.version,
        tagIds: tags,
        entityIds: entities,
        relationshipType: relationship,
      });
    } finally {
      setBusy(false);
    }
  }
  async function toggleCompletion() {
    if (locked) return;
    const next = done ? (task.plannedDate ? "PLANNED" : "INBOX") : "COMPLETED";
    setBusy(true);
    try {
      if (
        await save({
          type: "task.status",
          id: task.id,
          version: task.version,
          status: next,
        })
      )
        setStatus(next);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="task-edit-layout">
      {/* Explicit form association lets the checklist and auxiliary settings keep their own forms. */}
      <form id={formId} onSubmit={submit} aria-label="Edit task" />
      <section className="task-edit-main" aria-label="Task content">
        <fieldset className="task-edit-content-fields" disabled={locked}>
          <div className="task-edit-title-row">
            <button
              type="button"
              className="todo-check"
              role="checkbox"
              aria-checked={done}
              aria-label={done ? "Reopen task" : "Complete task"}
              disabled={locked || !!task.archivedAt}
              onClick={() => void toggleCompletion()}
            >
              {done && <Check size={14} aria-hidden="true" />}
            </button>
            <input
              className={`task-edit-title ${done ? "is-complete" : ""}`}
              form={formId}
              name="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              aria-label="Task name"
              placeholder="Task name"
              required
              maxLength={240}
              disabled={locked}
            />
          </div>
          <label className="task-edit-description-label">
            <AlignLeft size={16} aria-hidden="true" />
            <textarea
              className="task-edit-description"
              form={formId}
              name="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              aria-label="Description"
              placeholder="Description"
              rows={2}
              maxLength={20000}
              disabled={locked}
            />
          </label>
        </fieldset>
        {mainExtra}
      </section>
      <aside className="task-edit-sidebar" aria-label="Task settings">
        <fieldset className="task-edit-setting-fields" disabled={locked}>
          <label className="field task-edit-setting">
            <span>Category</span>
            <select
              name="primaryCategoryId"
              form={formId}
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              disabled={locked}
            >
              <option value="">Uncategorized</option>
              {category &&
                !availableCategories.some((item) => item.id === category) && (
                  <option value={category}>Current category</option>
                )}
              {availableCategories.map((item) => {
                const parent = data.categories.find(
                  (candidate) => candidate.id === item.parentId,
                );
                return (
                  <option key={item.id} value={item.id}>
                    {parent ? `${parent.name} / ` : ""}
                    {item.name}
                  </option>
                );
              })}
            </select>
          </label>
          <details
            className="task-edit-setting"
            open={
              projects.some((project) => entities.includes(project.id)) ||
              undefined
            }
          >
            <summary>
              Projects{" "}
              <span>
                {projects.filter((project) => entities.includes(project.id))
                  .length || "+"}
              </span>
            </summary>
            <div className="task-edit-options">
              {projects.map((project) => (
                <label key={project.id} className="checkbox-label">
                  <input
                    form={formId}
                    type="checkbox"
                    name="projectIds"
                    value={project.id}
                    checked={entities.includes(project.id)}
                    onChange={(event) =>
                      toggleEntity(project.id, event.target.checked)
                    }
                    disabled={locked}
                  />
                  {project.name}
                </label>
              ))}
              {!projects.length && (
                <p className="muted small">
                  Create projects from Menu → Master.
                </p>
              )}
            </div>
          </details>
          <div className="field task-edit-setting">
            <span>Date</span>
            <DatePicker
              label="Planned date"
              form={formId}
              name="plannedDate"
              value={plannedDate}
              onChange={setPlannedDate}
              today={data.today}
              disabled={locked || scope === "ALL"}
            />
          </div>
          <div className="task-edit-setting task-edit-priorities">
            <TaskPriorityDials
              urgency={task.urgency}
              importance={task.importance}
              minValue={1}
              form={formId}
              disabled={locked}
            />
          </div>
          <details
            className="task-edit-setting"
            open={dueAt ? true : undefined}
          >
            <summary>
              Due date <span>{dueAt ? "" : "+"}</span>
            </summary>
            <div className="field task-edit-options">
              <small className="muted">{data.user.timezone}</small>
              <DatePicker
                label="Due date and time"
                form={formId}
                name="dueAt"
                value={dueAt}
                onChange={setDueAt}
                includeTime
                today={data.today}
                disabled={locked || scope === "ALL"}
              />
            </div>
          </details>
          <label className="field task-edit-setting">
            <span>Status</span>
            <select
              form={formId}
              name="status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              disabled={locked || scope === "ALL"}
            >
              {statuses.map((value) => (
                <option key={value} value={value}>
                  {human(value)}
                </option>
              ))}
            </select>
          </label>
          <details className="task-edit-setting">
            <summary>
              Tags <span>{tags.length || "+"}</span>
            </summary>
            <div className="task-edit-options">
              {data.tags.map((tag) => (
                <label key={tag.id} className="checkbox-label">
                  <input
                    form={formId}
                    type="checkbox"
                    name="tagIds"
                    value={tag.id}
                    checked={tags.includes(tag.id)}
                    onChange={(event) =>
                      setTags((previous) =>
                        event.target.checked
                          ? [...new Set([...previous, tag.id])]
                          : previous.filter((id) => id !== tag.id),
                      )
                    }
                    disabled={locked}
                  />
                  {tag.name}
                </label>
              ))}
              {!data.tags.length && <p className="muted small">No tags yet.</p>}
            </div>
          </details>
          <details className="task-edit-setting">
            <summary>
              Entities{" "}
              <span>
                {entities.filter((id) =>
                  relatedEntities.some((entity) => entity.id === id),
                ).length || "+"}
              </span>
            </summary>
            <div className="task-edit-options">
              {relatedEntities.map((entity) => (
                <label key={entity.id} className="checkbox-label">
                  <input
                    form={formId}
                    type="checkbox"
                    name="entityIds"
                    value={entity.id}
                    checked={entities.includes(entity.id)}
                    onChange={(event) =>
                      toggleEntity(entity.id, event.target.checked)
                    }
                    disabled={locked}
                  />
                  {entity.name}
                </label>
              ))}
              {!relatedEntities.length && (
                <p className="muted small">No related entities yet.</p>
              )}
              {entities.length > 0 && (
                <label className="field">
                  <span>Relationship</span>
                  <input
                    form={formId}
                    name="relationshipType"
                    value={relationship}
                    onChange={(event) => setRelationship(event.target.value)}
                    required
                    maxLength={80}
                    disabled={locked}
                  />
                </label>
              )}
            </div>
          </details>
          <details
            className="task-edit-setting"
            open={estimate ? true : undefined}
          >
            <summary>
              Time estimate <span>{estimate ? `${estimate} min` : "+"}</span>
            </summary>
            <label className="field task-edit-options">
              <span>Minutes</span>
              <input
                form={formId}
                name="estimatedMinutes"
                type="number"
                min={0}
                max={100000}
                value={estimate}
                onChange={(event) => setEstimate(event.target.value)}
                placeholder="Optional"
                disabled={locked}
              />
            </label>
          </details>
          {task.seriesId && (
            <label className="field task-edit-setting">
              <span>Apply changes to</span>
              <select
                form={formId}
                name="scope"
                value={scope}
                onChange={(event) => setScope(event.target.value)}
                disabled={locked}
              >
                <option value="ONE">This occurrence only</option>
                <option value="ALL">Every occurrence in this series</option>
              </select>
              {scope === "ALL" && (
                <small className="muted">
                  Shared details update across the series. Individual dates and
                  completion statuses stay intact.
                </small>
              )}
            </label>
          )}
          <button
            type="submit"
            form={formId}
            className="button primary task-edit-save"
            disabled={locked}
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </fieldset>
        {settingsExtra}
      </aside>
    </div>
  );
}
