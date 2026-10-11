"use client";
import { useState, type FormEvent } from "react";
import type { Workspace, Task } from "@/lib/workspace";
import { TaskForm, CustomFields, type Save } from "./task-form";
import {
  Field,
  human,
  duration,
  displayDate,
  inputToIso,
  localInput,
} from "./ui";
import { effortTotal } from "@/lib/analytics";
export function TaskDetail({
  task,
  data,
  save,
  onClose,
}: {
  task: Task;
  data: Workspace;
  save: Save;
  onClose: () => void;
}) {
  const [tab, setTab] = useState("Details");
  const [busy, setBusy] = useState(false);
  const template = data.templates.find((t) => t.id === task.templateId);
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(
      task.fieldValues.map((v) => [
        v.templateFieldId,
        v.textValue ??
          (v.numberValue !== null ? Number(v.numberValue) : null) ??
          v.booleanValue ??
          v.dateValue?.slice(0, 10) ??
          (v.datetimeValue
            ? localInput(v.datetimeValue, data.user.timezone)
            : null) ??
          v.jsonValue ??
          null,
      ]),
    ),
  );
  async function submit(e: FormEvent<HTMLFormElement>, type: string) {
    e.preventDefault();
    setBusy(true);
    const form = e.currentTarget;
    const f = new FormData(form);
    let command: Record<string, unknown> = { type, id: task.id };
    if (type === "task.effort")
      command = {
        ...command,
        minutes: Number(f.get("minutes")),
        occurredOn: f.get("occurredOn"),
        note: f.get("note"),
      };
    if (type === "reminder.create")
      command = {
        ...command,
        scheduledFor: inputToIso(
          String(f.get("scheduledFor")),
          data.user.timezone,
        ),
      };
    if (type === "task.relate")
      command = {
        ...command,
        targetId: f.get("targetId"),
        relationType: f.get("relationType"),
      };
    if (await save(command)) form.reset();
    setBusy(false);
  }
  return (
    <>
      <div className="detail-heading">
        <span className={"status " + task.status.toLowerCase()}>
          {human(task.status)}
        </span>
        <h2>{task.title}</h2>
        <p>
          {duration(effortTotal(task))} recorded
          {task.estimatedMinutes
            ? ` · ${duration(task.estimatedMinutes)} estimated`
            : ""}
        </p>
      </div>
      <div className="tabs">
        {["Details", "Activity", "Custom fields"].map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Details" && (
        <>
          <TaskForm task={task} data={data} save={save} onDone={() => {}} />
          <section className="subsection">
            <h3>Related work</h3>
            {task.relationsFrom.map((r) => (
              <p key={r.targetTaskId + r.relationType} className="meta-line">
                {human(r.relationType)} →{" "}
                {data.tasks.find((t) => t.id === r.targetTaskId)?.title}
              </p>
            ))}
            <form
              className="form-stack"
              onSubmit={(e) => submit(e, "task.relate")}
            >
              <Field label="Task">
                <select name="targetId" required>
                  <option value="">Choose a task</option>
                  {data.tasks
                    .filter((t) => t.id !== task.id && !t.archivedAt)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Relationship">
                <select name="relationType">
                  {[
                    "DEPENDS_ON",
                    "BLOCKS",
                    "RELATED_TO",
                    "FOLLOW_UP_TO",
                    "SUBTASK_OF",
                  ].map((r) => (
                    <option key={r} value={r}>
                      {human(r)}
                    </option>
                  ))}
                </select>
              </Field>
              <button className="button" disabled={busy}>
                Link task
              </button>
            </form>
          </section>
          <button
            className="text-button danger"
            onClick={async () => {
              if (
                await save({
                  type: "task.archive",
                  id: task.id,
                  version: task.version,
                  archived: !task.archivedAt,
                })
              )
                onClose();
            }}
          >
            {task.archivedAt ? "Restore from archive" : "Archive task"}
          </button>
        </>
      )}
      {tab === "Activity" && (
        <>
          <section className="subsection first">
            <h3>Record a little effort</h3>
            <p className="muted">
              No timer. Just a useful note about what happened.
            </p>
            <form
              className="form-stack"
              onSubmit={(e) => submit(e, "task.effort")}
            >
              <div className="form-grid">
                <Field label="Minutes">
                  <input
                    name="minutes"
                    type="number"
                    min={1}
                    max={1440}
                    required
                    placeholder="25"
                  />
                </Field>
                <Field label="Occurred on">
                  <input
                    name="occurredOn"
                    type="date"
                    defaultValue={data.today}
                    required
                  />
                </Field>
              </div>
              <Field label="Note">
                <textarea
                  name="note"
                  rows={2}
                  placeholder="What did you work on?"
                />
              </Field>
              <button className="button primary" disabled={busy}>
                Record effort
              </button>
            </form>
          </section>
          <section className="subsection">
            <h3>In-app reminder</h3>
            <p className="muted">
              Appears when you open or refresh the workspace after this time.
            </p>
            <form
              className="inline-form"
              onSubmit={(e) => submit(e, "reminder.create")}
            >
              <Field label={data.user.timezone}>
                <input name="scheduledFor" type="datetime-local" required />
              </Field>
              <button className="button" disabled={busy}>
                Set reminder
              </button>
            </form>
          </section>
          <section className="subsection">
            <h3>History</h3>
            {task.effort.map((e) => (
              <div className="history-row" key={e.id}>
                <span className="history-dot action" />
                <div>
                  <strong>{duration(e.minutes)} recorded</strong>
                  <p>{e.note}</p>
                  <small>{displayDate(e.occurredOn, "UTC")}</small>
                </div>
              </div>
            ))}
            {data.events
              .filter(
                (e) =>
                  e.taskId === task.id &&
                  !(
                    e.eventType === "EFFORT_RECORDED" &&
                    e.toValue?.effortEntryId
                  ),
              )
              .map((e) => (
                <div className="history-row" key={e.id}>
                  <span className="history-dot" />
                  <div>
                    <strong>
                      {e.eventType === "EFFORT_RECORDED"
                        ? "Activity logged"
                        : human(e.eventType)}
                    </strong>
                    <p>
                      {e.fromValue?.status
                        ? human(String(e.fromValue.status)) + " → "
                        : ""}
                      {e.toValue?.status
                        ? human(String(e.toValue.status))
                        : e.toValue?.title
                          ? String(e.toValue.title)
                          : ""}
                    </p>
                    {typeof e.toValue?.note === "string" && (
                      <p>{e.toValue.note}</p>
                    )}
                    {typeof e.toValue?.occurredOn === "string" && (
                      <p>{displayDate(e.toValue.occurredOn, "UTC")}</p>
                    )}
                    <small>
                      {new Date(e.occurredAt).toLocaleString("en", {
                        timeZone: data.user.timezone,
                      })}
                    </small>
                  </div>
                </div>
              ))}
          </section>
        </>
      )}
      {tab === "Custom fields" &&
        (template ? (
          <div className="form-stack">
            <p className="muted">
              {template.name} · revision {template.revision}. Historical
              definitions are preserved.
            </p>
            <CustomFields
              fields={template.fields}
              values={values}
              setValues={setValues}
            />
            <button
              className="button primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const fields = { ...values };
                for (const f of template.fields)
                  if (f.fieldType === "DATETIME" && fields[f.id])
                    fields[f.id] = inputToIso(
                      String(fields[f.id]),
                      data.user.timezone,
                    );
                await save({ type: "task.fields", id: task.id, fields });
                setBusy(false);
              }}
            >
              Save custom fields
            </button>
          </div>
        ) : (
          <p className="empty">
            This intention has no template. Choose a template when capturing a
            new task.
          </p>
        ))}
    </>
  );
}
