"use client";
import { TaskComposer } from "./task-composer";
import { DatePicker } from "./date-picker";
import { useMemo, useState, useEffect, type FormEvent } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  ArrowUpRight,
  Plus,
} from "lucide-react";
import type { Workspace, Task } from "@/lib/workspace";
import { isPendingTask } from "@/lib/task-scheduling";
import { addDays } from "@/lib/domain";
import { trackerColumns, trackerEntries, taskEntries } from "@/lib/tracker";
import { Drawer, duration } from "./ui";
import { Repeat2 } from "lucide-react";
import { TaskPicker } from "./task-picker";
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
  const showActivity = false;
  const [pending, setPending] = useState<string | null>(null);
  // Activity dates never assign an undated task a place in the planning grid.
  const todos = useMemo(
    () => taskEntries(data).filter((entry) => entry.task.plannedDate),
    [data],
  );
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
      (!todos.some((e) => e.task.id === t.id) ||
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
                Date
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
                  {c.description && (
                    <span className="category-goal">{c.description}</span>
                  )}
                  <span>
                    {c.descendants.size > 1
                      ? `${c.descendants.size - 1} ${c.descendants.size === 2 ? "subcategory" : "subcategories"}`
                      : ""}
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
                      >
                        <Plus
                          className="cell-add-icon"
                          size={20}
                          aria-hidden="true"
                        />
                      </button>
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
                              onClick={(event) => {
                                if (
                                  (event.target as Element).closest(
                                    ".todo-check",
                                  )
                                )
                                  return;
                                openTask(e.task);
                              }}
                              className={
                                "sheet-entry todo-entry " +
                                (isPendingTask(e.task, data.today)
                                  ? "is-pending "
                                  : "") +
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
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    changeStatus(
                                      e.task,
                                      e.task.status === "COMPLETED"
                                        ? "PLANNED"
                                        : "COMPLETED",
                                    );
                                  }}
                                >
                                  {e.task.status === "COMPLETED" && (
                                    <Check size={13} />
                                  )}
                                </button>
                                <button
                                  className="todo-title"
                                  aria-label={`Open ${e.task.title}`}
                                >
                                  {e.task.title}
                                </button>
                                {e.task.seriesId && (
                                  <span
                                    className="repeat-icon"
                                    data-tooltip="Repeating task"
                                    role="img"
                                    aria-label="Repeating task"
                                  >
                                    <Repeat2 size={13} aria-hidden="true" />
                                  </span>
                                )}
                              </div>
                              {isPendingTask(e.task, data.today) && (
                                <span className="pending-task-label">
                                  Pending
                                </span>
                              )}
                              {e.task.status === "IN_PROGRESS" && (
                                <span className="todo-status status-in_progress">
                                  Ongoing
                                </span>
                              )}
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
        <p className="tracker-help">Add a primary category in Categories.</p>
      )}
      {unplaced.length > 0 && (
        <details className="unplaced-tasks" open>
          <summary>
            {unplaced.length} unfinished tasks without a date or category
          </summary>
          <div>
            {unplaced.map((t) => (
              <div
                className={
                  "backlog-task" +
                  (isPendingTask(t, data.today) ? " is-pending" : "")
                }
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
          popup
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
export function QuickTaskForm(props: {
  data: Workspace;
  cell: { date: string; categoryId: string; mode: "plan" | "log" };
  save: Save;
  onDone: () => void;
}) {
  return props.cell.mode === "plan" ? (
    <TaskComposer
      data={props.data}
      save={props.save}
      onDone={props.onDone}
      defaultDate={props.cell.date}
      defaultCategoryId={props.cell.categoryId}
    />
  ) : (
    <ActivityTaskForm {...props} />
  );
}
function ActivityTaskForm({
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
    const command = {
      type: "activity.log",
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
    <form className="form-stack quick-task-popup-form" onSubmit={submit}>
      {!taskId && (
        <label className="field">
          <span className="sr-only">What did you do?</span>
          <input
            autoFocus
            name="title"
            required
            maxLength={240}
            placeholder="What did you finish?"
          />
        </label>
      )}
      <div className="task-basics-row">
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
      </div>
      <details className="task-options">
        <summary
          className="task-details-toggle"
          aria-label="Task details"
          data-tooltip="Task details"
        >
          <Plus size={20} aria-hidden="true" />
        </summary>
        <div className="form-stack">
          <TaskPicker
            categoryId={categoryId || undefined}
            key={categoryId}
            tasks={tasks}
            label="Link to a task"
            empty="New activity"
            onChange={setTaskId}
          />
          <div className="field">
            <span>Date</span>
            <DatePicker
              name="date"
              label="Activity date"
              today={data.today}
              required
              defaultValue={cell.date}
              max={data.today}
            />
          </div>
          <label className="field">
            Activity notes
            <textarea
              name="note"
              rows={3}
              maxLength={20000}
              placeholder="What happened? What did you work on?"
            />
          </label>
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
            Each log is a separate activity. You can log work against the same
            task again.
          </p>
        </div>
      </details>
      <button type="submit" className="button primary" disabled={busy}>
        {busy ? "Saving…" : "Save activity"}
      </button>
    </form>
  );
}
