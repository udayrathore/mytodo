"use client";
import { useMemo, useState, type FormEvent } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Check,
  ArrowUpRight,
} from "lucide-react";
import type { Workspace, Task } from "@/lib/workspace";
import { addDays } from "@/lib/domain";
import { trackerColumns, trackerEntries } from "@/lib/tracker";
import { Drawer, duration } from "./ui";
import type { Save } from "./task-form";

export function CategoryGrid({
  data,
  save,
  openTask,
  openCategory,
}: {
  data: Workspace;
  save: Save;
  openTask: (task: Task) => void;
  openCategory: (id: string) => void;
}) {
  const [start, setStart] = useState(addDays(data.today, -2));
  const [cell, setCell] = useState<{
    date: string;
    categoryId: string;
    mode: "plan" | "log";
  } | null>(null);
  const columns = useMemo(() => trackerColumns(data), [data]);
  const entries = useMemo(() => trackerEntries(data), [data]);
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
      (!t.plannedDate ||
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
            onClick={() => setStart(addDays(start, 7))}
          >
            <ChevronRight size={18} />
          </button>
          <button
            className="button"
            onClick={() => setStart(addDays(data.today, -2))}
          >
            Today
          </button>
        </div>
        <div className="tracker-options">
          <label className="tracker-jump">
            Jump to{" "}
            <input
              aria-label="Jump to date"
              type="date"
              value={start}
              onChange={(e) => e.target.value && setStart(e.target.value)}
            />
          </label>
          <span className="grid-legend">
            <i className="planned-dot" /> Planned <i className="logged-dot" />{" "}
            Logged
          </span>
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
                    <td key={c.id}>
                      <div className="sheet-cell">
                        {items.map((e) => (
                          <button
                            key={e.id}
                            className={"sheet-entry " + e.kind}
                            onClick={() => openTask(e.task)}
                          >
                            <span className="entry-label">
                              {e.kind === "logged"
                                ? "Logged"
                                : e.task.status === "COMPLETED"
                                  ? "Planned · done"
                                  : "Planned"}
                              {e.minutes ? ` · ${duration(e.minutes)}` : ""}
                            </span>
                            <strong>{e.task.title}</strong>
                            {e.note && (
                              <span className="entry-note">{e.note}</span>
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
                          </button>
                        ))}
                        <div className="cell-actions">
                          <button
                            aria-label={`Plan in ${c.name} on ${day}`}
                            onClick={() =>
                              setCell({
                                date: day,
                                categoryId: c.id,
                                mode: "plan",
                              })
                            }
                          >
                            <Plus size={12} /> Plan
                          </button>
                          {day <= data.today && (
                            <button
                              aria-label={`Log in ${c.name} on ${day}`}
                              onClick={() =>
                                setCell({
                                  date: day,
                                  categoryId: c.id,
                                  mode: "log",
                                })
                              }
                            >
                              <Check size={12} /> Log
                            </button>
                          )}
                        </div>
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
        <span>
          Subcategories roll up here. Select an entry to see its details.
        </span>
        <span>
          Plans are intentions · Logs are activity · Journal is observation
        </span>
      </div>
      {unplaced.length > 0 && (
        <details className="unplaced-tasks">
          <summary>
            {unplaced.length} tasks waiting for a date or category
          </summary>
          <div>
            {unplaced.map((t) => (
              <button key={t.id} onClick={() => openTask(t)}>
                {t.title}
                <ArrowUpRight size={13} />
              </button>
            ))}
          </div>
        </details>
      )}
      {cell && (
        <Drawer
          title={cell.mode === "plan" ? "Plan a task" : "Log an activity"}
          onClose={() => setCell(null)}
        >
          <CellForm
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
function CellForm({
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
  const [mode, setMode] = useState(cell.mode);
  const [categoryId, setCategoryId] = useState(cell.categoryId);
  const [taskId, setTaskId] = useState("");
  const [busy, setBusy] = useState(false);
  const root = trackerColumns(data).find((c) => c.id === cell.categoryId)!;
  const categories = data.categories
    .filter((c) => c.isActive && root.descendants.has(c.id))
    .sort(
      (a, b) =>
        Number(b.id === root.id) - Number(a.id === root.id) ||
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
            title: f.get("title"),
            description: f.get("note"),
            primaryCategoryId: categoryId,
            plannedDate: f.get("date"),
          }
        : {
            type: "activity.log",
            taskId: taskId || null,
            title: taskId ? undefined : f.get("title"),
            primaryCategoryId: categoryId,
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
        {root.name} · {cell.date}
      </p>
      <div className="tabs">
        <button
          type="button"
          className={mode === "plan" ? "active" : ""}
          onClick={() => setMode("plan")}
        >
          Plan a task
        </button>
        <button
          type="button"
          disabled={cell.date > data.today}
          className={mode === "log" ? "active" : ""}
          onClick={() => setMode("log")}
        >
          Log activity
        </button>
      </div>
      <label className="field">
        Category
        <select
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value);
            setTaskId("");
          }}
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.id === root.id ? c.name : `↳ ${c.name}`}
            </option>
          ))}
        </select>
      </label>
      {mode === "log" && (
        <label className="field">
          Link to a task
          <select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
            <option value="">New activity</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
      )}
      {(mode === "plan" || !taskId) && (
        <label className="field">
          {mode === "plan" ? "What do you plan to do?" : "What did you do?"}
          <input
            autoFocus
            name="title"
            required
            maxLength={240}
            placeholder={
              mode === "plan"
                ? "e.g. Plan next week’s meals"
                : "e.g. Cooked dinner and tidied the kitchen"
            }
          />
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
            Each log is a separate activity. You can log work against the same
            task again.
          </p>
        </>
      )}
      <button type="submit" className="button primary" disabled={busy}>
        {busy ? "Saving…" : mode === "plan" ? "Save plan" : "Save activity"}
      </button>
    </form>
  );
}
