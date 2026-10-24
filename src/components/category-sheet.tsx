"use client";
import { Fragment, useEffect, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, Plus, Check } from "lucide-react";
import { addDays, descendants } from "@/lib/domain";
import type { Task, Workspace } from "@/lib/workspace";
import { Drawer, human } from "./ui";
import { groupTasks } from "@/lib/task-groups";
import type { Save } from "./task-form";

export function CategorySheet({
  data,
  categoryId,
  projectId,
  save,
  openTask,
  onRange,
}: {
  data: Workspace;
  categoryId?: string;
  projectId?: string;
  save: Save;
  openTask: (task: Task) => void;
  onRange: (through: string) => Promise<void>;
}) {
  const [start, setStart] = useState(data.today);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [capture, setCapture] = useState<{
    categoryId: string;
    date: string;
  } | null>(null);
  const [move, setMove] = useState<{ task: Task; date: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  useEffect(() => {
    void onRange(addDays(start, 6));
  }, [start, onRange]);
  const category = data.categories.find((c) => c.id === categoryId);
  const project = data.entities.find((e) => e.id === projectId);
  const allowed = categoryId ? descendants(data.categories, categoryId) : null;
  const tasks = data.tasks.filter(
    (t) =>
      !t.archivedAt &&
      (!allowed ||
        (!!t.primaryCategoryId && allowed.has(t.primaryCategoryId))) &&
      (!projectId || t.entities.some((e) => e.entityId === projectId)),
  );
  const linked = new Set(project?.metadata?.categoryIds || []);
  const projectCategoryIds = new Set(
    [...linked].flatMap((id) => [...descendants(data.categories, id)]),
  );
  tasks.forEach((t) => {
    if (t.primaryCategoryId) projectCategoryIds.add(t.primaryCategoryId);
  });
  const categories = data.categories
    .filter((c) => (allowed ? allowed.has(c.id) : projectCategoryIds.has(c.id)))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const ordered: typeof categories = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const c = categories.find((c) => c.id === id);
    if (c) ordered.push(c);
    categories.filter((c) => c.parentId === id).forEach((c) => visit(c.id));
  };
  categories
    .filter((c) => !c.parentId || !categories.some((p) => p.id === c.parentId))
    .forEach((c) => visit(c.id));
  categories.forEach((c) => visit(c.id));
  const groups = [
    ...ordered.map((c) => ({
      id: c.id,
      name: c.name,
      goal: c.description,
      active: c.isActive,
    })),
    ...(tasks.some((t) => !t.primaryCategoryId)
      ? [{ id: "", name: "Uncategorized", goal: null, active: false }]
      : []),
  ];
  async function schedule() {
    if (!move || busy) return;
    setBusy(true);
    if (
      await save({
        type: "task.schedule",
        id: move.task.id,
        version: move.task.version,
        plannedDate: move.date,
      })
    )
      setMove(null);
    setBusy(false);
  }
  return (
    <section className="category-workspace">
      <div className="section-toolbar">
        <div>
          <h2>{category?.name || project?.name || "Category workspace"}</h2>
          {(category?.description || project?.description) && (
            <p className="muted">
              {category?.description || project?.description}
            </p>
          )}
        </div>
        <div className="date-range">
          <button
            className="icon-button"
            aria-label="Previous seven days"
            onClick={() => setStart(addDays(start, -7))}
          >
            <ChevronLeft size={18} />
          </button>
          <input
            aria-label="Timeline start date"
            type="date"
            value={start}
            max={addDays(data.today, 724)}
            onChange={(e) => {
              if (e.target.value && e.target.value <= addDays(data.today, 724))
                setStart(e.target.value);
            }}
          />
          <button
            className="icon-button"
            aria-label="Next seven days"
            disabled={start >= addDays(data.today, 717)}
            onClick={() => setStart(addDays(start, 7))}
          >
            <ChevronRight size={18} />
          </button>
          <button className="button" onClick={() => setStart(data.today)}>
            Today
          </button>
          <button
            className="button primary"
            disabled={!categories.some((c) => c.isActive)}
            onClick={() =>
              setCapture({
                categoryId: categories.find((c) => c.isActive)!.id,
                date: start,
              })
            }
          >
            <Plus size={15} /> Add tasks
          </button>
        </div>
      </div>
      <p className="muted small">
        Click a category/date cell to add tasks. Click an empty task cell to
        move a one-off task. For repeats, open the dated occurrence to edit its
        date. Open a task’s name for details.
      </p>
      <div
        className="category-sheet-scroll"
        role="region"
        aria-label="Category task timeline"
        tabIndex={0}
      >
        <table className="category-sheet">
          <thead>
            <tr>
              <th scope="col">Categories & tasks</th>
              {days.map((day) => (
                <th
                  scope="col"
                  key={day}
                  className={day === data.today ? "sheet-today" : ""}
                >
                  {new Date(day + "T00:00:00Z").toLocaleDateString("en", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    timeZone: "UTC",
                  })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const rows = tasks
                .filter((t) => (t.primaryCategoryId || "") === group.id)
                .sort(
                  (a, b) =>
                    (a.plannedDate || "").localeCompare(b.plannedDate || "") ||
                    a.title.localeCompare(b.title),
                );
              return (
                <Fragment key={group.id}>
                  <tr className="sheet-category">
                    <th scope="row">
                      <button
                        aria-expanded={!collapsed.includes(group.id)}
                        onClick={() =>
                          setCollapsed((ids) =>
                            ids.includes(group.id)
                              ? ids.filter((id) => id !== group.id)
                              : [...ids, group.id],
                          )
                        }
                      >
                        {collapsed.includes(group.id) ? "▸" : "▾"} {group.name}{" "}
                        · {rows.length}
                      </button>
                      {group.goal && <small>{group.goal}</small>}
                    </th>
                    {days.map((day) => (
                      <td key={day}>
                        <button
                          disabled={!group.active}
                          className="sheet-add"
                          aria-label={`Add tasks in ${group.name} on ${day}`}
                          onClick={() =>
                            setCapture({ categoryId: group.id, date: day })
                          }
                        >
                          +
                        </button>
                      </td>
                    ))}
                  </tr>
                  {!collapsed.includes(group.id) &&
                    groupTasks(rows).map((taskGroup) => {
                      const task =
                        taskGroup.occurrences.find((t) =>
                          days.includes(t.plannedDate?.slice(0, 10) || ""),
                        ) || taskGroup.occurrences[0];
                      return (
                        <tr key={taskGroup.key}>
                          <th scope="row">
                            <button
                              className="sheet-task-title"
                              onClick={() => openTask(task)}
                            >
                              {task.title}

                            </button>
                            <small>
                              {task.seriesId
                                ? "Repeating · each date is independent"
                                : task.plannedDate?.slice(0, 10) ||
                                  "Unscheduled"}
                            </small>
                          </th>
                          {days.map((day) => {
                            const occurrences = taskGroup.occurrences.filter(
                              (t) => t.plannedDate?.slice(0, 10) === day,
                            );
                            return (
                              <td
                                key={day}
                                className={
                                  day === data.today ? "sheet-today" : ""
                                }
                              >
                                {occurrences.length ? (
                                  occurrences.map((occurrence) => (
                                    <div
                                      key={occurrence.id}
                                      className={
                                        "sheet-task"
                                      }
                                    >
                                      <button
                                        className={
                                          "task-check " +
                                          (occurrence.status === "COMPLETED"
                                            ? "checked"
                                            : "")
                                        }
                                        aria-label={`${occurrence.status === "COMPLETED" ? "Reopen" : "Complete"} ${occurrence.title} on ${day}`}
                                        disabled={busy}
                                        onClick={async () => {
                                          setBusy(true);
                                          await save({
                                            type: "task.status",
                                            id: occurrence.id,
                                            version: occurrence.version,
                                            status:
                                              occurrence.status === "COMPLETED"
                                                ? "PLANNED"
                                                : "COMPLETED",
                                          });
                                          setBusy(false);
                                        }}
                                      >
                                        {occurrence.status === "COMPLETED" && (
                                          <Check size={12} />
                                        )}
                                      </button>
                                      <button
                                        onClick={() => openTask(occurrence)}
                                      >
                                        {human(occurrence.status)}
                                        {occurrence.title !== task.title
                                          ? ` · ${occurrence.title}`
                                          : ""}
                                      </button>
                                    </div>
                                  ))
                                ) : task.seriesId ? (
                                  <span className="muted small">—</span>
                                ) : (
                                  <button
                                    className="sheet-empty"
                                    disabled={
                                      busy ||
                                      ["COMPLETED", "CANCELLED"].includes(
                                        task.status,
                                      )
                                    }
                                    aria-label={`Move ${task.title} to ${day}`}
                                    onClick={() => setMove({ task, date: day })}
                                  />
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {!groups.length && (
        <p className="empty">
          Link categories to this project to start planning.
        </p>
      )}
      {capture && (
        <Drawer popup
          title="Add tasks to the timeline"
          onClose={() => setCapture(null)}
        >
          <TimelineCapture
            categories={categories.filter((c) => c.isActive)}
            initial={capture}
            projectId={projectId}
            save={save}
            onDone={() => setCapture(null)}
          />
        </Drawer>
      )}
      {move && (
        <Drawer popup title="Move this task" onClose={() => setMove(null)}>
          <p>
            Move “{move.task.title}” to {move.date}?
          </p>
          {move.task.seriesId && (
            <p className="muted">
              Only this occurrence moves. The repeat schedule stays the same.
            </p>
          )}
          <button className="button primary" disabled={busy} onClick={schedule}>
            {busy ? "Moving…" : "Move task"}
          </button>
        </Drawer>
      )}
    </section>
  );
}
function TimelineCapture({
  categories,
  initial,
  projectId,
  save,
  onDone,
}: {
  categories: Workspace["categories"];
  initial: { categoryId: string; date: string };
  projectId?: string;
  save: Save;
  onDone: () => void;
}) {
  const [rows, setRows] = useState([
    {
      title: "",
      primaryCategoryId: initial.categoryId,
      plannedDate: initial.date,
    },
  ]);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    if (await save({ type: "tasks.capture", projectId, tasks: rows })) onDone();
    setBusy(false);
  }
  return (
    <form className="form-stack" onSubmit={submit}>
      <p className="muted">
        Add up to 50 tasks, each with its own category and date. They save
        together.
      </p>
      {rows.map((row, i) => (
        <fieldset className="timeline-capture-row" key={i}>
          <legend>Task {i + 1}</legend>
          <label className="field">
            Task
            <input
              autoFocus={i === 0}
              required
              maxLength={240}
              value={row.title}
              onChange={(e) =>
                setRows(
                  rows.map((r, n) =>
                    n === i ? { ...r, title: e.target.value } : r,
                  ),
                )
              }
            />
          </label>
          <div className="form-grid">
            <label className="field">
              Category
              <select
                value={row.primaryCategoryId}
                onChange={(e) =>
                  setRows(
                    rows.map((r, n) =>
                      n === i ? { ...r, primaryCategoryId: e.target.value } : r,
                    ),
                  )
                }
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Date
              <input
                type="date"
                required
                value={row.plannedDate}
                onChange={(e) =>
                  setRows(
                    rows.map((r, n) =>
                      n === i ? { ...r, plannedDate: e.target.value } : r,
                    ),
                  )
                }
              />
            </label>
          </div>
          {rows.length > 1 && (
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => setRows(rows.filter((_, n) => n !== i))}
            >
              Remove row
            </button>
          )}
        </fieldset>
      ))}
      <button
        type="button"
        className="button"
        disabled={busy || rows.length >= 50}
        onClick={() =>
          setRows([
            ...rows,
            {
              title: "",
              primaryCategoryId: rows.at(-1)!.primaryCategoryId,
              plannedDate: rows.at(-1)!.plannedDate,
            },
          ])
        }
      >
        + Another task
      </button>
      <button className="button primary" disabled={busy}>
        {busy
          ? "Saving…"
          : `Add ${rows.length === 1 ? "task" : `${rows.length} tasks`}`}
      </button>
    </form>
  );
}
