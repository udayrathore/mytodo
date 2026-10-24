"use client";
import { useState, useEffect, useCallback } from "react";
import type { Workspace, Task } from "@/lib/workspace";
import { Library } from "./library";
import { Projects } from "./projects";
import { JournalView } from "./journal";
import { TaskDetail } from "./task-detail";
import { TaskForm } from "./task-form";
import { Drawer, human } from "./ui";
import { useRemote } from "./use-remote";
const tabs = ["Tasks", "Projects", "Categories", "Journals", "Entities", "Tags"];
export function Master() {
  const [tab, setTab] = useState("Tasks");
  return <section className="master-screen"><div className="tabs" role="tablist" aria-label="Master records">{tabs.map(t => <button role="tab" aria-selected={t === tab} className={t === tab ? "active" : ""} key={t} onClick={() => setTab(t)}>{t}</button>)}</div><MasterRecords key={tab} tab={tab} /></section>;
}
function MasterRecords({ tab }: { tab: string }) {
  const [data, setData] = useState<Workspace | null>(null);
  const [scope, setScopeState] = useState<Record<string,string>>({});
  const [search, setSearch] = useState("");
  const [archived, setArchived] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const view = tab === "Tasks" ? "tasks" : tab === "Projects" ? "projects" : tab === "Journals" ? "journal" : "library";
  const setScope = useCallback((key: string, value: string) => setScopeState(old => old[key] === value ? old : {...old, [key]: value}), []);
  const url = `/api/workspace?${new URLSearchParams({ view, status: "ALL", archive: String(archived), search, ...scope, ...(scope.journalSearch ? { search: scope.journalSearch } : {}) })}`;
  const remote = useRemote<Workspace>(url);
  useEffect(() => { if (remote.data) setData(remote.data); }, [remote.data]);
  const detail = useRemote<Workspace>(editing && editing !== "new" ? `/api/workspace?view=task&task=${editing}` : null, data);
  async function refresh(through?: string) {
    if (through) { setScope("through", through); return; }
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error("Could not refresh records.");
    setData(await r.json());
  }
  const onRange = useCallback(async (through: string) => { setScope("through", through); }, [setScope]);
  async function save(command: Record<string,unknown>) {
    setError("");
    try {
      const r = await fetch("/api/commands", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) });
      const result = await r.json(); if (!r.ok) throw new Error(result.error || "Could not save.");
      await refresh(); return true;
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save."); return false; }
  }
  if (!data) return <p role="status">{remote.error || "Loading records…"}</p>;
  return <>
    {(error || remote.error) && <p role="alert">{error || remote.error}</p>}
    {tab === "Tasks" && <>
      <div className="section-toolbar"><input aria-label="Search tasks" placeholder="Search tasks…" value={search} onChange={e => setSearch(e.target.value)} /><label className="checkbox-label"><input type="checkbox" checked={archived} onChange={e => setArchived(e.target.checked)} />Archived</label><button className="button primary" onClick={() => setEditing("new")}>New task</button></div>
      <div className="master-table-scroll"><table className="master-table"><thead><tr><th>Task</th><th>Category</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead><tbody>{data.tasks.map(task => <tr key={task.id}><td><button className="text-button" onClick={() => setEditing(task.id)}>{task.title}</button></td><td>{data.categories.find(c => c.id === task.primaryCategoryId)?.name || "—"}</td><td>{task.plannedDate?.slice(0,10) || "—"}</td><td>{human(task.status)}</td><td><button className="text-button" onClick={() => setEditing(task.id)}>Edit</button></td></tr>)}</tbody></table></div>
    </>}
    {tab === "Projects" && <Projects data={data} save={save} setScope={setScope} onRange={onRange} openTask={t => setEditing(t.id)} />}
    {tab === "Journals" && <JournalView data={data} save={save} setScope={setScope} />}
    {["Categories", "Entities", "Tags"].includes(tab) && <Library data={data} save={save} initialTab={tab} singleTab />}
    {data.page?.nextCursor && <button className="button" disabled={loading || remote.loading} onClick={async () => {
      setLoading(true); setError("");
      try { const r = await fetch(`${url}&cursor=${data.page!.nextCursor}`); if (!r.ok) throw new Error("Could not load more records."); const more: Workspace = await r.json(); setData({...more, tasks:[...data.tasks,...more.tasks], journals:[...data.journals,...more.journals]}); }
      catch(e) { setError(e instanceof Error ? e.message : "Could not load records."); } finally { setLoading(false); }
    }}>Load more</button>}
    {editing && <Drawer title={editing === "new" ? "New task" : "Edit task"} onClose={() => setEditing(null)}>{editing === "new" ? <TaskForm data={data} save={save} onDone={() => setEditing(null)} /> : detail.data?.tasks[0] ? <TaskDetail task={detail.data.tasks[0]} data={detail.data} save={save} onClose={() => setEditing(null)} /> : <p>{detail.error || "Loading task…"}</p>}</Drawer>}
  </>;
}
