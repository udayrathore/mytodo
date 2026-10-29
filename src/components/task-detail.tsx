"use client";
import { DatePicker } from "./date-picker";
import { Archive, CalendarArrowUp } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { Workspace, Task } from "@/lib/workspace";
import type { Save } from "./task-form";
import { TaskEditForm } from "./task-edit-form";
import { TaskChecklist } from "./task-checklist";
import { Field, human, inputToIso } from "./ui";
import dynamic from "next/dynamic";
import { SeriesSettings } from "./task-options";
import { RemoteHistory } from "./remote-history";
import { TaskComments } from "./task-comments";
import { addDays } from "@/lib/domain";
import { applyTaskEditResult } from "@/lib/task-edit-state";
import { TaskPicker } from "./task-picker";

const TaskGoals = dynamic(
  () => import("./goals").then((module) => module.TaskGoals),
  { loading: () => <p role="status">Loading goals…</p> },
);
const TaskChallenges = dynamic(
  () => import("./challenges").then((module) => module.TaskChallenges),
  { loading: () => <p role="status">Loading challenges…</p> },
);

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const [visited, setVisited] = useState(false);
  return (
    <details
      className="task-edit-setting task-edit-extra"
      onToggle={(event) => {
        if (event.currentTarget.open) setVisited(true);
      }}
    >
      <summary>
        {title}
        <span aria-hidden="true">+</span>
      </summary>
      {visited && <div className="task-edit-options">{children}</div>}
    </details>
  );
}

export function TaskDetail({
  task: incomingTask,
  data,
  save,
  onClose,
  refreshError,
}: {
  task: Task;
  data: Workspace;
  save: Save;
  onClose: () => void;
  refreshError?: string | null;
}) {
  const [task, setTask] = useState(incomingTask);
  const current = useRef(incomingTask);
  const saving = useRef(false);
  const conflicted = useRef(false);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function publish(next: Task) {
    current.current = next;
    setTask(next);
  }
  useEffect(() => {
    if (incomingTask.version === current.current.version) {
      current.current = incomingTask;
      setTask(incomingTask);
    } else if (
      incomingTask.version > current.current.version &&
      !saving.current
    ) {
      conflicted.current = true;
      setConflict(true);
      setError(
        "This task changed elsewhere. Your draft is kept here; reopen the task to load the latest version before saving.",
      );
    }
  }, [incomingTask]);

  const saveDetail: Save = async (input, onResult) => {
    if (saving.current || conflicted.current) return false;
    saving.current = true;
    setBusy(true);
    setError("");
    const latest = current.current;
    const command: Record<string, unknown> = {
      ...input,
      ...(input.id === latest.id && typeof input.version === "number"
        ? { version: latest.version }
        : {}),
      ...(input.type === "task.update" && input.scope === "ALL"
        ? { seriesVersion: latest.series?.version }
        : {}),
      ...(input.type === "series.schedule" &&
      latest.series &&
      input.id === latest.series.id
        ? { version: latest.series.version }
        : {}),
    };
    try {
      const ok = await save(command, (result) => {
        publish(applyTaskEditResult(current.current, command, result));
        onResult?.(result);
      });
      // Repeat commands can change both the series and selected occurrence.
      if (ok && String(command.type).startsWith("series.")) {
        try {
          const response = await fetch(
            `/api/workspace?view=task&task=${latest.id}`,
            { cache: "no-store" },
          );
          if (!response.ok)
            throw Error(
              "Could not refresh repeat settings. Reopen the task to reload them.",
            );
          const fresh: Workspace = await response.json();
          const record = fresh.tasks.find((item) => item.id === latest.id);
          if (record && record.version >= current.current.version)
            publish(record);
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Repeat settings saved. Reopen this task to refresh.",
          );
        }
      }
      return ok;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  async function submit(event: FormEvent<HTMLFormElement>, type: string) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget,
      fields = new FormData(form);
    let command: Record<string, unknown> = { type, id: task.id };
    if (type === "task.effort")
      command = {
        ...command,
        minutes: Number(fields.get("minutes")),
        occurredOn: fields.get("occurredOn"),
        note: fields.get("note"),
      };
    if (type === "reminder.create")
      command = {
        ...command,
        scheduledFor: inputToIso(
          String(fields.get("scheduledFor")),
          data.user.timezone,
        ),
      };
    if (type === "task.relate")
      command = {
        ...command,
        targetId: fields.get("targetId"),
        relationType: fields.get("relationType"),
      };
    if (await saveDetail(command)) form.reset();
  }
  return (
    <div className="task-detail-screen" aria-busy={busy}>
      {(error || refreshError) && (
        <p className="form-error task-edit-error" role="alert">
          {error || refreshError}
        </p>
      )}
      <TaskEditForm
        task={task}
        data={data}
        save={saveDetail}
        disabled={busy || conflict || !!task.archivedAt}
        mainExtra={
          <TaskChecklist
            task={task}
            save={saveDetail}
            disabled={busy || conflict}
          />
        }
        settingsExtra={
          <>
            <fieldset
              className="task-edit-auxiliary"
              disabled={busy || conflict}
            >
              <div className="task-edit-setting task-edit-repeat">
                <SeriesSettings
                  task={task}
                  save={saveDetail}
                  today={data.today}
                />
              </div>
              <DetailSection title="Comments">
                <TaskComments
                  taskId={task.id}
                  timezone={data.user.timezone}
                  save={saveDetail}
                />
              </DetailSection>
              <DetailSection title="Goals">
                <TaskGoals taskId={task.id} />
              </DetailSection>
              <DetailSection title="Challenges">
                <TaskChallenges taskId={task.id} />
              </DetailSection>
              <DetailSection title="Related tasks">
                {task.relationsFrom.map((relation) => (
                  <p
                    key={relation.targetTaskId + relation.relationType}
                    className="task-edit-related"
                  >
                    {human(relation.relationType)} →{" "}
                    {relation.target?.title ||
                      data.tasks.find(
                        (item) => item.id === relation.targetTaskId,
                      )?.title ||
                      "Archived task"}
                  </p>
                ))}
                <form
                  className="form-stack"
                  onSubmit={(event) => void submit(event, "task.relate")}
                >
                  <TaskPicker
                    excludeIds={[task.id]}
                    tasks={data.tasks.filter(
                      (item) => item.id !== task.id && !item.archivedAt,
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
                      ].map((value) => (
                        <option key={value} value={value}>
                          {human(value)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <button className="button" disabled={busy}>
                    Link task
                  </button>
                </form>
              </DetailSection>
              <DetailSection title="Reminders">
                <p className="muted small">
                  Shown when you open or refresh the app after the reminder
                  time.
                </p>
                {data.reminders
                  .filter((reminder) => reminder.taskId === task.id)
                  .map((reminder) => (
                    <p key={reminder.id} className="muted small">
                      {new Date(reminder.scheduledFor).toLocaleString("en", {
                        timeZone: data.user.timezone,
                      })}
                    </p>
                  ))}
                <form
                  className="form-stack"
                  onSubmit={(event) => void submit(event, "reminder.create")}
                >
                  <div className="field">
                    <span>{data.user.timezone}</span>
                    <DatePicker
                      label="Reminder date and time"
                      name="scheduledFor"
                      today={data.today}
                      includeTime
                      required
                    />
                  </div>
                  <button className="button" disabled={busy}>
                    Set reminder
                  </button>
                </form>
              </DetailSection>
              <DetailSection title="Record effort">
                <form
                  className="form-stack"
                  onSubmit={(event) => void submit(event, "task.effort")}
                >
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
                  <div className="field">
                    <span>Occurred on</span>
                    <DatePicker
                      label="Occurred on"
                      name="occurredOn"
                      today={data.today}
                      defaultValue={data.today}
                      required
                    />
                  </div>
                  <Field label="Note">
                    <textarea
                      name="note"
                      rows={2}
                      placeholder="What did you work on?"
                    />
                  </Field>
                  <button className="button" disabled={busy}>
                    Record effort
                  </button>
                </form>
              </DetailSection>
              <DetailSection title="Activity history">
                <RemoteHistory
                  taskId={task.id}
                  timezone={data.user.timezone}
                  revision={task}
                />
              </DetailSection>
              <button
                className="text-button task-edit-archive"
                disabled={busy}
                onClick={async () => {
                  if (
                    await saveDetail({
                      type: "task.archive",
                      id: task.id,
                      version: task.version,
                      archived: !task.archivedAt,
                    })
                  )
                    onClose();
                }}
              >
                <Archive size={15} />
                {task.archivedAt ? "Restore from archive" : "Archive task"}
              </button>
            </fieldset>
            {!task.archivedAt &&
              !["COMPLETED", "CANCELLED"].includes(task.status) && (
                <footer className="task-edit-footer">
                  <button
                    type="button"
                    className="button"
                    disabled={busy || conflict}
                    title={`Move to ${addDays(data.today, 1)} and extend the due date by one day`}
                    onClick={async () => {
                      if (
                        await saveDetail({
                          type: "task.tomorrow",
                          id: task.id,
                          version: task.version,
                        })
                      )
                        onClose();
                    }}
                  >
                    <CalendarArrowUp size={16} />
                    Move to tomorrow
                  </button>
                </footer>
              )}
          </>
        }
      />
    </div>
  );
}
