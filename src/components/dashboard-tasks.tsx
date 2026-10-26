"use client";
import { TaskPriorityDials } from "./task-priority-dials";
import { useState, useEffect } from "react";
import { addDays, dateKey } from "@/lib/domain";
import { Check, Repeat2, ChevronLeft, ChevronRight } from "lucide-react";
import type { Task, Workspace } from "@/lib/workspace";
import type { Save } from "./task-form";

export function DashboardTasks({
  mode,
  data,
  save,
  openTask,
  onAdd,
  scope,
  onManageRange,
  onSort,
}: {
  onSort: (
    key: "plannedDate" | "urgency" | "importance",
    direction: "asc" | "desc",
  ) => void;
  onAdd: (date?: string) => void;
  onManageRange: (from: string, through: string) => void;
  mode: "execute" | "manage";
  data: Workspace;
  save: Save;
  openTask: (task: Task) => void;
  scope: { category: string; entity: string; tag: string };
}) {
  const [start, setStart] = useState(data.today);
  const [laneCount, setLaneCount] = useState(3);
  useEffect(() => {
    if (mode === "manage") onManageRange(start, addDays(start, laneCount - 1));
  }, [mode, start, laneCount, onManageRange]);
  const sort = data.page?.sort || "plannedDate";
  const direction = data.page?.direction || "desc";
  function sortBy(key: "urgency" | "importance") {
    onSort(key, sort === key && direction === "desc" ? "asc" : "desc");
  }
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const todayOnly =
    mode === "execute" && !scope.category && !scope.entity && !scope.tag;
  const tasks = data.tasks.filter(
    (t) =>
      !t.archivedAt &&
      (mode === "execute"
        ? t.status !== "CANCELLED"
        : !["COMPLETED", "CANCELLED"].includes(t.status)) &&
      (!todayOnly || t.plannedDate?.slice(0, 10) === data.today),
  );
  const dateLabel = (date: string) =>
    date === "undated"
      ? "Unscheduled"
      : (date === data.today ? "Today · " : "") +
        new Date(date + "T00:00:00Z").toLocaleDateString("en", {
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        });
  async function reschedule(task: Task, plannedDate: string) {
    if (busy || plannedDate === task.plannedDate?.slice(0, 10)) return;
    setBusy(true);
    try {
      await save({
        type: "task.schedule",
        id: task.id,
        version: task.version,
        plannedDate,
      });
    } finally {
      setBusy(false);
    }
  }
  async function move(task: Task, status: string) {
    if (busy || task.status === status) return;
    setBusy(true);
    try {
      await save({
        type: "task.status",
        id: task.id,
        version: task.version,
        status,
      });
    } finally {
      setBusy(false);
    }
  }
  function card(task: Task) {
    const done = task.status === "COMPLETED";
    const date = task.plannedDate?.slice(0, 10);
    const expected = task.dueAt
      ? dateKey(new Date(task.dueAt), data.user.timezone)
      : date;
    const daysLate = expected
      ? Math.max(
          0,
          Math.round(
            (Date.parse(data.today) - Date.parse(expected)) / 86400000,
          ),
        )
      : 0;
    const weeks = Math.floor(daysLate / 7);
    const remainder = daysLate % 7;
    const delay = weeks
      ? `${weeks} ${weeks === 1 ? "week" : "weeks"}${remainder ? ` ${remainder} ${remainder === 1 ? "day" : "days"}` : ""}`
      : `${daysLate} ${daysLate === 1 ? "day" : "days"}`;
    return (
      <article
        key={task.id}
        className={`dashboard-task ${done ? "is-complete" : ""}`}
        draggable={mode === "manage" && !busy}
        onDragStart={(e) => {
          setDragging(task.id);
          e.dataTransfer.setData("text/plain", task.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => {
          setDragging(null);
          setOver(null);
        }}
        onClick={(e) => {
          if (
            !(e.target as Element).closest(
              "button,input,select,label,form,summary",
            )
          )
            openTask(task);
        }}
      >
        {mode === "manage" && task.primaryCategoryId && (
          <div className="board-card-category">
            {data.categories.find((c) => c.id === task.primaryCategoryId)?.name}
          </div>
        )}
        <div className="dashboard-task-main">
          <button
            className="todo-check"
            role="checkbox"
            aria-checked={done}
            aria-label={`${done ? "Reopen" : "Complete"} ${task.title}`}
            data-tooltip={`${task.title} · ${done ? "Reopen" : "Complete"}`}
            disabled={busy}
            onClick={() => move(task, done ? "PLANNED" : "COMPLETED")}
          >
            {done ? <Check size={13} /> : null}
          </button>
          {
            <button
              className="dashboard-task-title"
              onClick={() => openTask(task)}
            >
              {task.title}{" "}
            </button>
          }
          {task.seriesId && (
            <span aria-label="Repeating task" data-tooltip="Repeating task">
              <Repeat2 size={13} />
            </span>
          )}
          {mode === "execute" && (
            <TaskPriorityDials
              urgency={task.urgency}
              importance={task.importance}
              readOnly
            />
          )}
          {mode !== "manage" && daysLate > 0 && !done && (
            <span className="task-date overdue execute-overdue">
              {daysLate && !done ? (
                <>
                  Due{" "}
                  {new Date(expected! + "T00:00:00Z").toLocaleDateString("en", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    timeZone: "UTC",
                  })}
                  <span className="overdue-delay">{delay} overdue</span>
                </>
              ) : date ? (
                date === data.today ? (
                  "Today"
                ) : (
                  new Date(date + "T00:00:00Z").toLocaleDateString("en", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    timeZone: "UTC",
                  })
                )
              ) : (
                ""
              )}
            </span>
          )}
        </div>
        {mode === "manage" && (
          <>
            {task.description && (
              <p className="board-card-description">{task.description}</p>
            )}
          </>
        )}
      </article>
    );
  }
  const openTasks = tasks.filter((t) => t.status !== "COMPLETED");
  const completedTasks = tasks.filter((t) => t.status === "COMPLETED");
  const dates = [
    ...new Set(openTasks.map((t) => t.plannedDate?.slice(0, 10) || "undated")),
  ].sort();
  const laneDates = Array.from({ length: laneCount }, (_, i) =>
    addDays(start, i),
  );
  return (
    <section aria-label={mode === "execute" ? "Execute tasks" : "Manage tasks"}>
      {mode === "manage" && (
        <div className="dashboard-filters">
          {mode === "manage" && (
            <div className="lane-navigation">
              <label>
                Lanes{" "}
                <select
                  aria-label="Number of lanes"
                  value={laneCount}
                  onChange={(e) => setLaneCount(Number(e.target.value))}
                >
                  <option value={3}>3</option>
                  <option value={5}>5</option>
                </select>
              </label>
              <button
                className="icon-button"
                aria-label="Previous day"
                onClick={() => setStart(addDays(start, -1))}
              >
                <ChevronLeft size={18} />
              </button>
              <span>
                {dateLabel(start)} — {dateLabel(laneDates[laneCount - 1])}
              </span>
              <button
                className="icon-button"
                aria-label="Next day"
                disabled={addDays(start, laneCount) > addDays(data.today, 730)}
                onClick={() => setStart(addDays(start, 1))}
              >
                <ChevronRight size={18} />
              </button>
              <button className="button" onClick={() => setStart(data.today)}>
                Today
              </button>
            </div>
          )}
        </div>
      )}
      <div className="task-browser compact-filters">
        <div className="task-browser-content">
          {mode === "execute" ? (
            <div className="execute-list">
              <header className="execute-heading">
                <h1>
                  {scope.category
                    ? data.categories.find((c) => c.id === scope.category)?.name
                    : scope.entity
                      ? data.entities.find((e) => e.id === scope.entity)?.name
                      : scope.tag
                        ? data.tags.find((t) => t.id === scope.tag)?.name
                        : "Today"}
                </h1>
                <p>
                  {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
                </p>
              </header>
              <div className="execute-sort-heading">
                <span>
                  {sort === "plannedDate" ? (
                    "Tasks"
                  ) : (
                    <button
                      className="text-button"
                      onClick={() => onSort("plannedDate", "asc")}
                    >
                      Sort by date
                    </button>
                  )}
                </span>
                <div className="execute-priority-sort">
                  {(["urgency", "importance"] as const).map((key) => (
                    <button
                      type="button"
                      key={key}
                      className="text-button"
                      aria-label={`Sort by ${key}${sort === key ? `, ${direction === "desc" ? "highest first" : "lowest first"}` : ""}`}
                      aria-pressed={sort === key}
                      onClick={() => sortBy(key)}
                    >
                      {key === "urgency" ? "Urgency" : "Importance"}
                      {sort === key ? (direction === "desc" ? " ↓" : " ↑") : ""}
                    </button>
                  ))}
                </div>
              </div>
              {sort === "plannedDate"
                ? dates.map((date) => (
                    <section key={date}>
                      <h2>{dateLabel(date)}</h2>
                      {openTasks
                        .filter(
                          (t) =>
                            (t.plannedDate?.slice(0, 10) || "undated") === date,
                        )
                        .map(card)}
                    </section>
                  ))
                : openTasks.map(card)}
              {completedTasks.length > 0 && (
                <section className="execute-completed">
                  <h2>Completed · {completedTasks.length}</h2>
                  {completedTasks.map(card)}
                </section>
              )}
              <button className="inline-add-task" onClick={() => onAdd()}>
                <span aria-hidden="true">+</span>Add task
              </button>
              {!tasks.length && (
                <p className="empty">
                  {todayOnly ? "No tasks for today." : "No tasks."}
                </p>
              )}
            </div>
          ) : (
            <div
              className="kanban-board consecutive-lanes"
              style={{
                gridTemplateColumns: `repeat(${laneCount}, minmax(260px, 1fr))`,
              }}
            >
              {laneDates.map((date) => {
                const items = tasks.filter(
                  (t) => (t.plannedDate?.slice(0, 10) || "undated") === date,
                );
                return (
                  <section
                    key={date}
                    className={`kanban-lane ${over === date ? "drag-over" : ""}`}
                    onDragOver={(e) => {
                      if (dragging && !busy && date !== "undated") {
                        e.preventDefault();
                        setOver(date);
                      }
                    }}
                    onDragLeave={() => setOver(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      const task = tasks.find((t) => t.id === dragging);
                      setDragging(null);
                      setOver(null);
                      if (task && date !== "undated")
                        void reschedule(task, date);
                    }}
                  >
                    <h2>
                      {new Date(date + "T00:00:00Z").toLocaleDateString("en", {
                        day: "numeric",
                        month: "short",
                        timeZone: "UTC",
                      })}
                      {date === data.today ? " · Today" : ""}
                      <span>{items.length}</span>
                    </h2>
                    {items.map(card)}
                    <button
                      className="inline-add-task"
                      onClick={() => onAdd(date)}
                    >
                      <span aria-hidden="true">+</span>Add task
                    </button>
                  </section>
                );
              })}
            </div>
          )}
          {data.page?.nextCursor && (
            <p className="muted small">Load more below to see later tasks.</p>
          )}
        </div>
      </div>
    </section>
  );
}
