"use client";
import { Plus, CalendarArrowUp } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { Workspace, Task } from "@/lib/workspace";
import { TaskForm, type Save } from "./task-form";
import { Field, human, inputToIso } from "./ui";
import { TaskChallenges } from "./challenges";
import { TaskGoals } from "./goals";
import { SeriesSettings } from "./task-options";
import { RemoteHistory } from "./remote-history";
import { TaskComments } from "./task-comments";
import { addDays } from "@/lib/domain";
import { TaskPicker } from "./task-picker";

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
  const [extra, setExtra] = useState("");
  const [fields, setFields] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
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
      <div className="task-detail-tools">
        <details className="challenge-add-menu">
          <summary
            className="icon-button"
            aria-label="Task actions"
            data-tooltip="Task actions"
          >
            <Plus size={20} />
          </summary>
          <div>
            {[
              ["notes", "Add notes"],
              ["entities", "Link entities"],
              ["tags", "Add tags"],
              ["date", "Change planned date"],
              ["due", "Due date"],
              ["estimate", "Time estimate"],
              ["series", "Edit repeat occurrences"],
              ["comment", "Add comment"],
              ["goal", "Link goal"],
              ["challenge", "Link challenge"],
              ["repeat", "Repeat settings"],
              ["related", "Link task"],
              ["effort", "Record effort"],
              ["reminder", "Add reminder"],
              ["history", "Activity history"],
            ].map(([id, label]) => (
              <button
                key={id}
                onClick={(e) => {
                  setExtra(id);
                  setFields((previous) =>
                    previous.includes(id) ? previous : [...previous, id],
                  );
                  setTab(
                    ["effort", "reminder", "history"].includes(id)
                      ? "Activity"
                      : "Details",
                  );
                  e.currentTarget.closest("details")?.removeAttribute("open");
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </details>
      </div>
      <TaskForm
        key={task.id}
        compact
        visibleFields={fields}
        task={task}
        data={data}
        save={save}
        onDone={() => {}}
      />
      {extra && (
        <button
          className="text-button"
          onClick={() => {
            setExtra("");
            setFields([]);
            setTab("Details");
          }}
        >
          Done
        </button>
      )}
      {tab === "Details" && (
        <>
          <TaskComments
            showEditor={extra === "comment"}
            key={task.id}
            taskId={task.id}
            timezone={data.user.timezone}
            save={save}
          />
          <TaskGoals
            showEditor={extra === "goal"}
            key={task.id}
            taskId={task.id}
          />
          <TaskChallenges
            showEditor={extra === "challenge"}
            key={`challenges-${task.id}`}
            taskId={task.id}
          />
          {extra === "repeat" && <SeriesSettings task={task} save={save} />}

          {(extra === "related" || task.relationsFrom.length > 0) && (
            <section className="subsection">
              <h3>Related work</h3>
              {task.relationsFrom.map((r) => (
                <p key={r.targetTaskId + r.relationType} className="meta-line">
                  {human(r.relationType)} →{" "}
                  {(() => {
                    const target =
                      r.target ||
                      data.tasks.find((t) => t.id === r.targetTaskId);
                    return target
                      ? target.title +
                          (target.seriesId
                            ? ` · ${target.plannedDate?.slice(0, 10) || "Unscheduled"}`
                            : "")
                      : "Archived task";
                  })()}
                </p>
              ))}
              {extra === "related" && (
                <form
                  className="form-stack"
                  onSubmit={(e) => submit(e, "task.relate")}
                >
                  <TaskPicker
                    excludeIds={[task.id]}
                    key={task.relationsFrom.length}
                    tasks={data.tasks.filter(
                      (t) => t.id !== task.id && !t.archivedAt,
                    )}
                    required
                  />
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
              )}
            </section>
          )}
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
          {extra === "effort" && (
            <section className="subsection first">
              <h3>Record effort</h3>

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
          )}
          {extra === "reminder" && (
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
          )}
          {extra === "history" && (
            <section className="subsection">
              <h3>History</h3>
              <RemoteHistory
                taskId={task.id}
                timezone={data.user.timezone}
                revision={data}
              />
            </section>
          )}
        </>
      )}
      {!task.archivedAt &&
        !["COMPLETED", "CANCELLED"].includes(task.status) && (
          <footer className="task-detail-footer">
            <button
              type="button"
              className="button"
              disabled={busy}
              title={`Move to ${addDays(data.today, 1)} and extend the due date by one day`}
              onClick={async () => {
                if (busy) return;
                setBusy(true);
                try {
                  if (
                    await save({
                      type: "task.tomorrow",
                      id: task.id,
                      version: task.version,
                    })
                  )
                    onClose();
                } finally {
                  setBusy(false);
                }
              }}
            >
              <CalendarArrowUp size={16} />
              {busy ? "Moving…" : "Move to tomorrow"}
            </button>
          </footer>
        )}
    </>
  );
}
