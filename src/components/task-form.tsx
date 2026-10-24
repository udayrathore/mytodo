"use client";
import { AppearanceFields, RepeatFields, readRepeat } from "./task-options";
import { useState, type FormEvent } from "react";
import type { Workspace, Task } from "@/lib/workspace";
import { Field, Chips, human, localInput, inputToIso } from "./ui";
export type Save = (command: Record<string, unknown>) => Promise<boolean>;
export function TaskForm({
  data,
  task,
  save,
  onDone,
}: {
  data: Workspace;
  task?: Task;
  save: Save;
  onDone: () => void;
}) {
  const [tags, setTags] = useState(task?.tags.map((t) => t.tagId) || []);
  const [entities, setEntities] = useState(
    task?.entities.map((e) => e.entityId) || [],
  );
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState("ONE");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
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
          }),
      isMicro: f.get("isMicro") === "on",
      color: f.get("color") || "sage",
      icon: f.get("icon") || "none",
      title: f.get("title"),
      description: f.get("description"),
      primaryCategoryId: f.get("primaryCategoryId") || null,
      priority: f.get("priority"),
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
        <label className="field">
          Apply changes to
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="ONE">This occurrence only</option>
            <option value="ALL">Every occurrence in this series</option>
          </select>
          <small>
            {scope === "ALL"
              ? "Updates title, notes, category, priority, estimate, tags, entities, color and icon across the series, including future tasks. Individual dates and completion statuses are preserved."
              : "Other occurrences will stay unchanged."}
          </small>
        </label>
      )}
      <AppearanceFields
        isMicro={task?.isMicro}
        color={task?.color}
        icon={task?.icon}
      />
      {!task && <RepeatFields />}
      <Field label="What’s on your mind?">
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
      <Field label="Notes">
        <textarea
          name="description"
          rows={3}
          defaultValue={task?.description || ""}
          placeholder="Notes"
        />
      </Field>
      <div className="form-grid">
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
        <Field label="Priority">
          <select name="priority" defaultValue={task?.priority || "MEDIUM"}>
            {["LOW", "MEDIUM", "HIGH"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Planned date">
          <input
            type="date"
            name="plannedDate"
            disabled={scope === "ALL"}
            defaultValue={task?.plannedDate?.slice(0, 10)}
          />
        </Field>
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
        {task ? (
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
      <div className="field">
        <span>Tags</span>
        <Chips items={data.tags} selected={tags} onChange={setTags} />
      </div>
      <div className="field">
        <span>Related entities</span>
        <Chips
          items={data.entities.filter(
            (e) => e.isActive || entities.includes(e.id),
          )}
          selected={entities}
          onChange={setEntities}
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
      <button className="button primary" disabled={busy}>
        {busy ? "Saving…" : task ? "Save changes" : "Add task"}
      </button>
    </form>
  );
}
