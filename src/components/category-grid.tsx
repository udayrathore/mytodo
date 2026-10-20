"use client";
import { useMemo, useState, useEffect, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, Check, ArrowUpRight } from "lucide-react";
import type { Workspace, Task } from "@/lib/workspace";
import { addDays } from "@/lib/domain";
import { trackerColumns, trackerEntries, taskEntries } from "@/lib/tracker";
import { Drawer, duration } from "./ui";
import {
  AppearanceFields,
  RepeatFields,
  readRepeat,
  TaskIcon,
} from "./task-options";
import { Repeat2 } from "lucide-react";
import type { Save } from "./task-form";

export function CategoryGrid({
  data,
  save,
  openTask,
  openCategory,
  onRange,
}: {
  data: Workspace;
  save: Save;
  openTask: (task: Task) => void;
  openCategory: (id: string) => void;
  onRange: (through: string) => Promise<void>;
}) {
  const [start, setStart] = useState(data.today);
  useEffect(() => {
    void onRange(addDays(start, 6));
  }, [start, onRange]);
  const [cell, setCell] = useState<{
    date: string;
    categoryId: string;
    mode: "plan" | "log";
  } | null>(null);
  const columns = useMemo(() => trackerColumns(data), [data]);
  const [showActivity, setShowActivity] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const todos = useMemo(() => taskEntries(data), [data]);
  const entries = useMemo(
    () =>
      showActivity
        ? trackerEntries(data).filter((e) => e.kind === "logged")
        : todos,
    [data, showActivity, todos],
  );
  async function changeStatus(task: Task, status: string) {
    if (pending) return;
    setPending(task.id);
    try {
      await save({
        type: "task.status",
        id: task.id,
        version: task.version,
        status,
      });
    } finally {
      setPending(null);
    }
  }
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const month = (day: string) =>
    new Date(day + "T00:00:00Z").toLocaleDateString("en", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  const unplaced = data.tasks.filter(
    (t) =>
      !t.archivedAt &&
      !["COMPLETED", "CANCELLED"].includes(t.status) &&
      ((t.plannedDate && t.plannedDate.slice(0, 10) < data.today) ||
        !todos.some((e) => e.task.id === t.id) ||
        !columns.some(
          (c) => t.primaryCategoryId && c.descendants.has(t.primaryCategoryId),
        )),
  );
  return (
    <section className="tracker" aria-label="Date and category tracker">
      <div className="tracker-toolbar">
        <div className="tracker-range">
          <button
            className="icon-button"
            aria-label="Previous week"
            onClick={() => setStart(addDays(start, -7))}
          >
            <ChevronLeft size={18} />
          </button>
          <strong>
            {month(start)} — {month(days[6])}, {start.slice(0, 4)}
          </strong>
          <button
            className="icon-button"
            aria-label="Next week"
            disabled={addDays(start, 13) > addDays(data.today, 730)}
            onClick={() => setStart(addDays(start, 7))}
          >
            <ChevronRight size={18} />
          </button>
          <button className="button" onClick={() => setStart(data.today)}>
            Today
          </button>
        </div>
        <div className="tracker-options">
          <label className="tracker-jump">
            Jump to{" "}
            <input
              aria-label="Jump to date"
              type="date"
              max={addDays(data.today, 724)}
              value={start}
              onChange={(e) => e.target.value && setStart(e.target.value)}
            />
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={showActivity}
              onChange={(e) => setShowActivity(e.target.checked)}
            />{" "}
            Show activity history
          </label>
        </div>
      </div>
      <div
        className="sheet-scroll"
        tabIndex={0}
        role="region"
        aria-label="Weekly tracker, scroll horizontally for more categories"
      >
        <table className="tracker-table">
          <caption className="sr-only">
            Tasks and activity by date and parent category. Subcategories are
            included in each column.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="date-column">
                Date<span>One day at a time</span>
              </th>
              {columns.map((c, i) => (
                <th
                  scope="col"
                  key={c.id}
                  className={"area-heading area-" + (i % 7)}
                >
                  <button onClick={() => openCategory(c.id)}>
                    {c.name}
                    <ArrowUpRight size={13} />
                  </button>
                  <span>
                    {c.descendants.size > 1
                      ? `${c.descendants.size - 1} ${c.descendants.size === 2 ? "subcategory" : "subcategories"}`
                      : "Tasks & activity"}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day} className={day === data.today ? "is-today" : ""}>
                <th scope="row" className="date-column">
                  <span className="weekday">
                    {new Date(day + "T00:00:00Z").toLocaleDateString("en", {
                      weekday: "short",
                      timeZone: "UTC",
                    })}
                  </span>
                  <strong>{new Date(day + "T00:00:00Z").getUTCDate()}</strong>
                  <span>
                    {day === data.today ? "Today" : month(day).split(" ")[0]}
                  </span>
                </th>
                {columns.map((c) => {
                  const items = entries.filter(
                    (e) =>
                      e.date === day &&
                      e.task.primaryCategoryId &&
                      c.descendants.has(e.task.primaryCategoryId),
                  );
                  return (
                    <td key={c.id} className="clickable-sheet-cell">
                      <button
                        className="cell-target"
                        aria-label={`${day < data.today ? "Log" : "Add task"} in ${c.name} on ${day}`}
                        onClick={() =>
                          setCell({
                            date: day,
                            categoryId: c.id,
                            mode: day < data.today ? "log" : "plan",
                          })
                        }
                      />
                      <div className="sheet-cell">
                        {items.map((e) =>
                          showActivity ? (
                            <button
                              key={e.id}
                              className="sheet-entry logged"
                              onClick={() => openTask(e.task)}
                            >
                              <span className="entry-label">
                                Activity
                                {e.minutes ? ` · ${duration(e.minutes)}` : ""}
                              </span>
                              <strong>{e.task.title}</strong>
                              {e.note && (
                                <span className="entry-note">{e.note}</span>
                              )}
                            </button>
                          ) : (
                            <article
                              key={e.id}
                              className={
                                "sheet-entry todo-entry color-" +
                                (e.task.color || "sage") +
                                " " +
                                (e.task.status === "COMPLETED"
                                  ? "is-complete"
                                  : "")
                              }
                            >
                              <div className="todo-title-row">
                                <button
                                  className="todo-check"
                                  role="checkbox"
                                  aria-checked={e.task.status === "COMPLETED"}
                                  aria-label={`${e.task.status === "COMPLETED" ? "Reopen" : "Complete"} ${e.task.title}`}
                                  disabled={pending !== null}
                                  onClick={() =>
                                    changeStatus(
                                      e.task,
                                      e.task.status === "COMPLETED"
                                        ? "PLANNED"
                                        : "COMPLETED",
                                    )
                                  }
                                >
                                  {e.task.status === "COMPLETED" && (
                                    <Check size={13} />
                                  )}
                                </button>
                                <button
                                  className="todo-title"
                                  onClick={() => openTask(e.task)}
                                >
                                  <TaskIcon name={e.task.icon} />
                                  {e.task.title}
                                </button>
                              </div>
                              {e.task.seriesId && (
                                <span
                                  className="repeat-badge"
                                  title="Repeating task"
                                >
                                  <Repeat2 size={11} /> Repeats
                                </span>
                              )}
                              <select
                                className={
                                  "todo-status status-" +
                                  e.task.status.toLowerCase()
                                }
                                aria-label={`Status of ${e.task.title}`}
                                disabled={pending !== null}
                                value={
                                  e.task.status === "COMPLETED"
                                    ? "COMPLETED"
                                    : e.task.status === "IN_PROGRESS"
                                      ? "IN_PROGRESS"
                                      : "PLANNED"
                                }
                                onChange={(ev) =>
                                  changeStatus(e.task, ev.target.value)
                                }
                              >
                                <option value="PLANNED">Upcoming</option>
                                <option value="IN_PROGRESS">Ongoing</option>
                                <option value="COMPLETED">Completed</option>
                              </select>
                              {e.task.primaryCategoryId !== c.id && (
                                <span className="entry-category">
                                  {
                                    data.categories.find(
                                      (x) => x.id === e.task.primaryCategoryId,
                                    )?.name
                                  }
                                </span>
                              )}
                            </article>
                          ),
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!columns.length && (
        <p className="tracker-help">
          Add a parent category in Library to start your tracker.
        </p>
      )}
      <div className="tracker-footnote">
        <span>Click a cell to add a task. Check it off when you’re done.</span>
        <span>Upcoming → Ongoing → Completed</span>
      </div>
      {unplaced.length > 0 && (
        <details className="unplaced-tasks" open>
          <summary>
            {unplaced.length} unfinished tasks from earlier or without a place
          </summary>
          <div>
            {unplaced.map((t) => (
              <div
                className={"backlog-task color-" + (t.color || "sage")}
                key={t.id}
              >
                <button
                  className="todo-check"
                  role="checkbox"
                  aria-checked={false}
                  aria-label={`Complete ${t.title}`}
                  disabled={pending !== null}
                  onClick={() => changeStatus(t, "COMPLETED")}
                />
                <button onClick={() => openTask(t)}>
                  <TaskIcon name={t.icon} />
                  {t.title}
                  <ArrowUpRight size={13} />
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
      {cell && (
        <Drawer
          title={cell.mode === "plan" ? "Add a task" : "Record what you did"}
          onClose={() => setCell(null)}
        >
          <QuickTaskForm
            key={cell.date + cell.categoryId + cell.mode}
            data={data}
            cell={cell}
            save={save}
            onDone={() => setCell(null)}
          />
        </Drawer>
      )}
    </section>
  );
}
export function QuickTaskForm({
  data,
  cell,
  save,
  onDone,
}: {
  data: Workspace;
  cell: { date: string; categoryId: string; mode: "plan" | "log" };
  save: Save;
  onDone: () => void;
}) {
  const mode = cell.mode;
  const [categoryId, setCategoryId] = useState(cell.categoryId);
  const [taskId, setTaskId] = useState("");
  const [busy, setBusy] = useState(false);
  const root = trackerColumns(data).find((c) => c.id === cell.categoryId);
  const categories = data.categories
    .filter((c) => c.isActive && (!root || root.descendants.has(c.id)))
    .sort(
      (a, b) =>
        Number(b.id === root?.id) - Number(a.id === root?.id) ||
        a.sortOrder - b.sortOrder ||
        a.name.localeCompare(b.name),
    );
  const tasks = data.tasks.filter(
    (t) =>
      !t.archivedAt &&
      t.status !== "CANCELLED" &&
      t.primaryCategoryId === categoryId,
  );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const command =
      mode === "plan"
        ? {
            type: "task.create",
            color: f.get("color") || "sage",
            icon: f.get("icon") || "none",
            repeat: readRepeat(f),
            title: f.get("title"),
            description: f.get("note") || "",
            primaryCategoryId: categoryId || null,
            plannedDate: f.get("date"),
          }
        : {
            type: "activity.log",
            color: f.get("color") || "sage",
            icon: f.get("icon") || "none",
            taskId: taskId || null,
            title: taskId ? undefined : f.get("title"),
            primaryCategoryId: categoryId || null,
            occurredOn: f.get("date"),
            note: f.get("note"),
            minutes: f.get("minutes") ? Number(f.get("minutes")) : null,
            complete: f.get("complete") === "on",
          };
    if (await save(command)) onDone();
    setBusy(false);
  }
  return (
    <form className="form-stack" onSubmit={submit}>
      <p className="muted">
        {root?.name || "New task"} · {cell.date}
      </p>
      {(mode === "plan" || !taskId) && (
        <label className="field">
          {mode === "plan" ? "Task" : "What did you do?"}
          <input
            autoFocus
            name="title"
            required
            maxLength={240}
            placeholder={
              mode === "plan" ? "What needs doing?" : "What did you finish?"
            }
          />
        </label>
      )}
      <details className="task-options">
        <summary>Add details (optional)</summary>
        <div className="form-stack">
          <AppearanceFields />
          {mode === "plan" && <RepeatFields />}
          <label className="field">
            Category
            <select
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setTaskId("");
              }}
            >
              {!root && <option value="">Choose a category</option>}
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id === root?.id ? c.name : `↳ ${c.name}`}
                </option>
              ))}
            </select>
          </label>
          {mode === "log" && (
            <label className="field">
              Link to a task
              <select
                value={taskId}
                onChange={(e) => setTaskId(e.target.value)}
              >
                <option value="">New activity</option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            Date
            <input
              name="date"
              type="date"
              required
              defaultValue={cell.date}
              max={mode === "log" ? data.today : undefined}
            />
          </label>
          <label className="field">
            {mode === "plan" ? "Notes" : "Activity notes"}
            <textarea
              name="note"
              rows={3}
              maxLength={20000}
              placeholder={
                mode === "plan"
                  ? "A little context for later…"
                  : "What happened? What did you work on?"
              }
            />
          </label>
          {mode === "log" && (
            <>
              <label className="field">
                Minutes <span className="muted">(optional)</span>
                <input
                  name="minutes"
                  type="number"
                  min={1}
                  max={1440}
                  placeholder="Leave blank if you’re not tracking time"
                />
              </label>
              <label className="checkbox-label">
                <input
                  key={taskId}
                  type="checkbox"
                  name="complete"
                  defaultChecked={!taskId}
                />{" "}
                Mark this task complete
              </label>
              <p className="muted small">
                Each log is a separate activity. You can log work against the
                same task again.
              </p>
            </>
          )}
        </div>
      </details>
      <button type="submit" className="button primary" disabled={busy}>
        {busy ? "Saving…" : mode === "plan" ? "Add task" : "Save activity"}
      </button>
    </form>
  );
}
