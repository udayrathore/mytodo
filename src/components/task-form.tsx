"use client";
import { useState, type FormEvent } from "react";
import type { Workspace, Task, Field as CustomField } from "@/lib/workspace";
import { Field, Chips, human, localInput, inputToIso } from "./ui";
export type Save = (command: Record<string, unknown>) => Promise<boolean>;
export function CustomFields({
  fields,
  values,
  setValues,
}: {
  fields: CustomField[];
  values: Record<string, unknown>;
  setValues: (v: Record<string, unknown>) => void;
}) {
  return (
    <div className="form-stack">
      {fields.map((f) => (
        <Field key={f.id} label={f.label + (f.required ? " *" : "")}>
          {f.fieldType === "LONG_TEXT" ? (
            <textarea
              rows={3}
              value={String(values[f.id] ?? "")}
              required={f.required}
              onChange={(e) => setValues({ ...values, [f.id]: e.target.value })}
            />
          ) : f.fieldType === "BOOLEAN" ? (
            <select
              value={values[f.id] == null ? "" : String(values[f.id])}
              required={f.required}
              onChange={(e) =>
                setValues({
                  ...values,
                  [f.id]:
                    e.target.value === "" ? null : e.target.value === "true",
                })
              }
            >
              <option value="">Not recorded</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          ) : ["SELECT", "MULTI_SELECT"].includes(f.fieldType) ? (
            <select
              multiple={f.fieldType === "MULTI_SELECT"}
              required={f.required}
              value={
                f.fieldType === "MULTI_SELECT"
                  ? (values[f.id] as string[]) || []
                  : String(values[f.id] ?? "")
              }
              onChange={(e) =>
                setValues({
                  ...values,
                  [f.id]:
                    f.fieldType === "MULTI_SELECT"
                      ? Array.from(e.target.selectedOptions, (o) => o.value)
                      : e.target.value,
                })
              }
            >
              {f.fieldType === "SELECT" && (
                <option value="">Select an option</option>
              )}
              {f.configuration?.options?.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={
                f.fieldType === "NUMBER"
                  ? "number"
                  : f.fieldType === "DATE"
                    ? "date"
                    : f.fieldType === "DATETIME"
                      ? "datetime-local"
                      : "text"
              }
              step={f.fieldType === "NUMBER" ? "any" : undefined}
              required={f.required}
              value={String(values[f.id] ?? "")}
              onChange={(e) =>
                setValues({
                  ...values,
                  [f.id]:
                    f.fieldType === "NUMBER"
                      ? e.target.value === ""
                        ? null
                        : Number(e.target.value)
                      : e.target.value,
                })
              }
            />
          )}
        </Field>
      ))}
    </div>
  );
}
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
  const [templateId, setTemplateId] = useState(task?.templateId || "");
  const [fields, setFields] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const template = data.templates.find((t) => t.id === templateId);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const dt = String(f.get("dueAt") || "");
    const values = { ...fields };
    for (const def of template?.fields || [])
      if (def.fieldType === "DATETIME" && values[def.id])
        values[def.id] = inputToIso(String(values[def.id]), data.user.timezone);
    const ok = await save({
      type: task ? "task.update" : "task.create",
      ...(task
        ? { id: task.id, version: task.version, status: f.get("status") }
        : { templateId: templateId || null, fields: values }),
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
      <Field label="What’s on your mind?">
        <input
          name="title"
          autoFocus
          required
          maxLength={240}
          defaultValue={task?.title}
          placeholder="An intention, big or small…"
          className="title-input"
        />
      </Field>
      <Field label="Notes">
        <textarea
          name="description"
          rows={3}
          defaultValue={task?.description || ""}
          placeholder="A little context for your future self"
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
            defaultValue={task?.plannedDate?.slice(0, 10)}
          />
        </Field>
        <Field label={`Due · ${data.user.timezone}`}>
          <input
            type="datetime-local"
            name="dueAt"
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
            <select name="status" defaultValue={task.status}>
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
        ) : (
          <Field label="Template">
            <select
              value={templateId}
              onChange={(e) => {
                setTemplateId(e.target.value);
                setFields({});
              }}
            >
              <option value="">No template</option>
              {data.templates
                .filter((t) => t.isActive)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · v{t.revision}
                  </option>
                ))}
            </select>
          </Field>
        )}
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
      {!task && template && (
        <section className="subsection">
          <h3>{template.name}</h3>
          <CustomFields
            fields={template.fields}
            values={fields}
            setValues={setFields}
          />
        </section>
      )}
      <button className="button primary" disabled={busy}>
        {busy ? "Saving…" : task ? "Save changes" : "Capture intention"}
      </button>
      <p className="form-note">
        Dates and effort are optional. There’s room for an unfinished thought.
      </p>
    </form>
  );
}
