"use client";
import { mayLeaveEditor } from "./navigation-guard";
import {
  postCommand,
  applyCommandPatch,
  type CommandResult,
} from "@/lib/command-client";
import dynamic from "next/dynamic";
import { useState, useEffect, useCallback } from "react";
import type { Workspace } from "@/lib/workspace";
import { Drawer, human } from "./ui";
import { useRemote } from "./use-remote";
const openingRecord = () => <p role="status">Opening records…</p>;
const Library = dynamic(
  () => import("./library").then((module) => module.Library),
  { loading: openingRecord },
);
const Projects = dynamic(
  () => import("./projects").then((module) => module.Projects),
  { loading: openingRecord },
);
const JournalView = dynamic(
  () => import("./journal").then((module) => module.JournalView),
  { loading: openingRecord },
);
const TaskDetail = dynamic(
  () => import("./task-detail").then((module) => module.TaskDetail),
  { loading: openingRecord },
);
const TaskComposer = dynamic(
  () => import("./task-composer").then((module) => module.TaskComposer),
  { loading: openingRecord },
);
const Learnings = dynamic(
  () => import("./learnings").then((module) => module.Learnings),
  { loading: openingRecord },
);
const Challenges = dynamic(
  () => import("./challenges").then((module) => module.Challenges),
  { loading: openingRecord },
);
const Goals = dynamic(() => import("./goals").then((module) => module.Goals), {
  loading: openingRecord,
});
const tabs = [
  "Tasks",
  "Projects",
  "Categories",
  "Journals",
  "Entities",
  "Tags",
  "Goals",
  "Challenges",
  "Learnings",
];
export function Master() {
  const [tab, setTab] = useState("Tasks");
  return (
    <section className="master-screen">
      <div className="tabs" role="tablist" aria-label="Master records">
        {tabs.map((t) => (
          <button
            role="tab"
            aria-selected={t === tab}
            className={t === tab ? "active" : ""}
            key={t}
            onClick={() => {
              if (mayLeaveEditor()) setTab(t);
            }}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Learnings" ? (
        <Learnings />
      ) : tab === "Challenges" ? (
        <Challenges />
      ) : tab === "Goals" ? (
        <Goals />
      ) : (
        <MasterRecords key={tab} tab={tab} />
      )}
    </section>
  );
}
function MasterRecords({ tab }: { tab: string }) {
  const [data, setData] = useState<Workspace | null>(null);
  const [scope, setScopeState] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [archived, setArchived] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const view =
    tab === "Tasks"
      ? "tasks"
      : tab === "Projects"
        ? "projects"
        : tab === "Journals"
          ? "journal"
          : "library";
  const setScope = useCallback(
    (key: string, value: string) =>
      setScopeState((old) =>
        old[key] === value ? old : { ...old, [key]: value },
      ),
    [],
  );
  const url = `/api/workspace?${new URLSearchParams({ view, status: "ALL", archive: String(archived), search, ...scope, ...(scope.journalSearch ? { search: scope.journalSearch } : {}) })}`;
  const remote = useRemote<Workspace>(url);
  useEffect(() => {
    if (remote.data) setData(remote.data);
  }, [remote.data]);
  const detail = useRemote<Workspace>(
    editing && editing !== "new"
      ? `/api/workspace?view=task&task=${editing}`
      : null,
    data,
    true,
  );
  async function refresh(through?: string) {
    if (through) {
      setScope("through", through);
      return;
    }
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error("Could not refresh records.");
    setData(await r.json());
  }
  const onRange = useCallback(
    async (through: string) => {
      setScope("through", through);
    },
    [setScope],
  );
  async function save(
    command: Record<string, unknown>,
    onResult?: (result: CommandResult) => void,
  ) {
    setError("");
    try {
      const result = await postCommand(command);
      onResult?.(result);
      if (
        result.patch &&
        !(data?.workMode?.enabled && result.patch.collection === "categories")
      )
        setData((old) => (old ? applyCommandPatch(old, result) : old));
      else
        void refresh().catch(() =>
          setError("Saved. Could not refresh records; reload the view."),
        );
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
      return false;
    }
  }
  if (!data) return <p role="status">{remote.error || "Loading records…"}</p>;
  return (
    <>
      {(error || remote.error) && <p role="alert">{error || remote.error}</p>}
      {tab === "Tasks" && (
        <>
          <div className="section-toolbar">
            <input
              aria-label="Search tasks"
              placeholder="Search tasks…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={archived}
                onChange={(e) => setArchived(e.target.checked)}
              />
              Archived
            </label>
            <button
              className="button primary"
              onClick={() => setEditing("new")}
            >
              New task
            </button>
          </div>
          <div className="master-table-scroll">
            <table className="master-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Category</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.tasks.map((task) => (
                  <tr key={task.id}>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => setEditing(task.id)}
                      >
                        {task.title}
                      </button>
                    </td>
                    <td>
                      {data.categories.find(
                        (c) => c.id === task.primaryCategoryId,
                      )?.name || "—"}
                    </td>
                    <td>{task.plannedDate?.slice(0, 10) || "—"}</td>
                    <td>{human(task.status)}</td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => setEditing(task.id)}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {tab === "Projects" && (
        <Projects
          data={data}
          save={save}
          setScope={setScope}
          onRange={onRange}
          openTask={(t) => setEditing(t.id)}
        />
      )}
      {tab === "Journals" && (
        <JournalView data={data} save={save} setScope={setScope} />
      )}
      {["Categories", "Entities", "Tags"].includes(tab) && (
        <Library data={data} save={save} initialTab={tab} singleTab />
      )}
      {data.page?.nextCursor && (
        <button
          className="button"
          disabled={loading || remote.loading}
          onClick={async () => {
            setLoading(true);
            setError("");
            try {
              const r = await fetch(`${url}&cursor=${data.page!.nextCursor}`);
              if (!r.ok) throw new Error("Could not load more records.");
              const more: Workspace = await r.json();
              setData({
                ...more,
                tasks: [...data.tasks, ...more.tasks],
                journals: [...data.journals, ...more.journals],
              });
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Could not load records.",
              );
            } finally {
              setLoading(false);
            }
          }}
        >
          Load more
        </button>
      )}
      {editing && (
        <Drawer
          popup
          hideTitle={editing === "new"}
          title={editing === "new" ? "New task" : "Task details"}
          onClose={() => setEditing(null)}
        >
          {editing === "new" ? (
            <TaskComposer
              data={data}
              save={save}
              onDone={() => setEditing(null)}
            />
          ) : detail.data?.tasks[0] ? (
            <TaskDetail
              key={detail.data.tasks[0].id}
              task={detail.data.tasks[0]}
              data={detail.data}
              save={save}
              onClose={() => setEditing(null)}
              refreshError={detail.error}
            />
          ) : (
            <p>{detail.error || "Loading task…"}</p>
          )}
        </Drawer>
      )}
    </>
  );
}
