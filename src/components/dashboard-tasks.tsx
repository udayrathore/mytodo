"use client";
import { CollectionAvatar } from "./collection-settings";
import { useState } from "react";
import { addDays, dateKey } from "@/lib/domain";
import { Check, Repeat2, PanelLeft } from "lucide-react";
import type { Task, Workspace } from "@/lib/workspace";
import type { Save } from "./task-form";
import { TaskIcon } from "./task-options";

export function DashboardTasks({ mode, data, save, openTask, scope, onScope, search, onSearch }: {
  mode: "execute" | "manage"; data: Workspace; save: Save; openTask: (task: Task) => void;
  scope: { category: string; entity: string; tag: string };
  onScope: (kind: string, id: string) => void; search: string; onSearch: (value: string) => void;
}) {
  const [sidebar, setSidebar] = useState(true);
  const [start, setStart] = useState(data.today);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const tasks = data.tasks.filter(t => !t.archivedAt && !["COMPLETED", "CANCELLED"].includes(t.status));
  const dateLabel = (date: string) => date === "undated" ? "Unscheduled" :
    (date === data.today ? "Today · " : "") + new Date(date + "T00:00:00Z").toLocaleDateString("en", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  async function reschedule(task: Task, plannedDate: string) {
    if (busy || plannedDate === task.plannedDate?.slice(0,10)) return;
    setBusy(true);
    try { await save({ type: "task.schedule", id: task.id, version: task.version, plannedDate }); }
    finally { setBusy(false); }
  }
  async function move(task: Task, status: string) {
    if (busy || task.status === status) return;
    setBusy(true);
    try { await save({ type: "task.status", id: task.id, version: task.version, status }); }
    finally { setBusy(false); }
  }
  function card(task: Task) {
    const done = task.status === "COMPLETED";
    const date = task.plannedDate?.slice(0, 10);
    const expected = task.dueAt ? dateKey(new Date(task.dueAt), data.user.timezone) : date;
    const daysLate = expected ? Math.max(0, Math.round((Date.parse(data.today) - Date.parse(expected)) / 86400000)) : 0;
    const weeks = Math.floor(daysLate / 7);
    const remainder = daysLate % 7;
    const delay = weeks ? `${weeks} ${weeks === 1 ? "week" : "weeks"}${remainder ? ` ${remainder} ${remainder === 1 ? "day" : "days"}` : ""}` : `${daysLate} ${daysLate === 1 ? "day" : "days"}`;
    return <article key={task.id}
      className={`dashboard-task color-${task.color || "sage"} ${done ? "is-complete" : ""}`}
      draggable={mode === "manage" && !busy}
      onDragStart={e => { setDragging(task.id); e.dataTransfer.setData("text/plain", task.id); e.dataTransfer.effectAllowed = "move"; }}
      onDragEnd={() => { setDragging(null); setOver(null); }}
      onClick={e => { if (!(e.target as Element).closest("button,input,select,label,form")) openTask(task); }}>
      <div className="dashboard-task-main">
        <button className="todo-check"
          role="checkbox" aria-checked={done} aria-label={`${done ? "Reopen" : "Complete"} ${task.title}`}
          data-tooltip={`${task.title} · ${done ? "Reopen" : "Complete"}`} disabled={busy}
          onClick={() => move(task, done ? "PLANNED" : "COMPLETED")}>
          {done ? <Check size={13} /> : null}
        </button>
        {<button className="dashboard-task-title" onClick={() => openTask(task)}><TaskIcon name={task.icon} />{task.title}</button>}
        {task.seriesId && <span aria-label="Repeating task" data-tooltip="Repeating task"><Repeat2 size={13} /></span>}
        <span className={daysLate && !done ? "task-date overdue" : "task-date"}>
          {daysLate && !done ? <>Due {new Date(expected! + "T00:00:00Z").toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}<span className="overdue-delay">{delay} overdue</span></> : date ? date === data.today ? "Today" : new Date(date + "T00:00:00Z").toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : ""}
        </span>
      </div>
      {mode === "manage" && <div className="kanban-controls">
        <form key={date || "undated"} onSubmit={async e => {
          e.preventDefault(); if (busy) return;
          const plannedDate = new FormData(e.currentTarget).get("date");
          if (!plannedDate || plannedDate === date) return;
          setBusy(true);
          try { await save({ type: "task.schedule", id: task.id, version: task.version, plannedDate }); }
          finally { setBusy(false); }
        }}>
          <input aria-label={`Reschedule ${task.title}`} type="date" name="date" defaultValue={date || ""} required disabled={busy || done || task.status === "CANCELLED"} />
          <button className="text-button" disabled={busy || done || task.status === "CANCELLED"} data-tooltip={done || task.status === "CANCELLED" ? "Reopen the task to reschedule" : "Reschedule this occurrence"}>Move date</button>
        </form>
      </div>}
    </article>;
  }
  const dates = [...new Set(tasks.map(t => t.plannedDate?.slice(0,10) || "undated"))].sort();
  const laneDates = [...new Set([...dates, ...Array.from({ length: 5 }, (_, i) => addDays(start, i))])].sort();
  function counts(kind: string, id: string) {
    const count = data.sidebarCounts?.find(c => c.kind === kind && c.id === id);
    return <span className="sidebar-counts" aria-label={`${count?.pending ?? 0} pending, ${count?.upcoming ?? 0} upcoming`} data-tooltip="Pending: today, overdue or unscheduled. Upcoming: future dates. Each repeat occurrence counts separately."><span>{data.sidebarCounts ? count?.pending ?? 0 : "—"}</span><span>{data.sidebarCounts ? count?.upcoming ?? 0 : "—"}</span></span>;
  }
  function scopeButton(kind: "category" | "entity" | "tag", id: string, name: string) {
    return <button key={id} className={scope[kind] === id ? "active" : ""} onClick={() => onScope(kind, id)}><span className="sidebar-item-name">{kind !== "tag" && <CollectionAvatar item={(kind === "category" ? data.categories : data.entities).find(i => i.id === id)!} project={kind === "entity"} />}{name}</span>{counts(kind, id)}</button>;
  }
  return <section aria-label={mode === "execute" ? "Execute tasks" : "Manage tasks"}>
    <div className="dashboard-filters">
      <button className="icon-button" aria-label={sidebar ? "Collapse sidebar" : "Expand sidebar"} aria-expanded={sidebar} onClick={() => setSidebar(!sidebar)}><PanelLeft size={19} /></button>
      <input aria-label="Search tasks" placeholder="Filter tasks…" value={search} onChange={e => onSearch(e.target.value)} />
      {mode === "manage" && <label className="tracker-jump">Add date lanes <input type="date" aria-label="Add date lanes starting from" value={start} onChange={e => e.target.value && setStart(e.target.value)} /></label>}
    </div>
    <div className={"task-browser " + (sidebar ? "with-sidebar" : "")}>
      {sidebar && <aside className="task-sidebar" aria-label="Task collections">
        <div className="sidebar-count-heading"><span>Pending</span><span>Upcoming</span></div>
        <button className={!scope.category && !scope.entity && !scope.tag ? "active" : ""} onClick={() => onScope("all", "")}><span>All tasks</span>{counts("all", "")}</button>
        <details open><summary>Projects</summary>{data.entities.filter(e => e.type === "PROJECT" && e.isActive && !e.archivedAt).map(e => scopeButton("entity", e.id, e.name))}</details>
        <details open><summary>Categories</summary>{data.categories.filter(c => c.isActive && !c.archivedAt).map(c => scopeButton("category", c.id, (c.parentId ? "↳ " : "") + c.name))}</details>
        <details open><summary>Entities</summary>{data.entities.filter(e => e.type !== "PROJECT" && e.isActive && !e.archivedAt).map(e => scopeButton("entity", e.id, e.name))}</details>
        <details><summary>Tags</summary>{data.tags.map(t => scopeButton("tag", t.id, t.name))}</details>
      </aside>}
      <div className="task-browser-content">
        {mode === "execute" ? <div className="execute-list">
          {dates.map(date => <section key={date}><h2>{dateLabel(date)}</h2>{tasks.filter(t => (t.plannedDate?.slice(0,10) || "undated") === date).map(card)}</section>)}
          {!tasks.length && <p className="empty">No pending tasks.</p>}
        </div> : <div className="kanban-board">{laneDates.map(date => {
          const items = tasks.filter(t => (t.plannedDate?.slice(0,10) || "undated") === date);
          return <section key={date} className={`kanban-lane ${over === date ? "drag-over" : ""}`}
            onDragOver={e => { if (dragging && !busy && date !== "undated") { e.preventDefault(); setOver(date); } }}
            onDragLeave={() => setOver(null)}
            onDrop={e => { e.preventDefault(); const task = tasks.find(t => t.id === dragging); setDragging(null); setOver(null); if (task && date !== "undated") void reschedule(task, date); }}>
            <h2>{dateLabel(date)}<span>{items.length}</span></h2>
            {items.map(card)}
            {!items.length && <p className="muted small">Drop tasks here</p>}
          </section>;
        })}</div>}
        {data.page?.nextCursor && <p className="muted small">Load more below to see later tasks.</p>}
      </div>
    </div>
  </section>;
}
