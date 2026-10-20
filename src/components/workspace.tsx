"use client";
import { useEffect, useState, useCallback, type FormEvent } from "react";
import {
  Aperture,
  Sun,
  CalendarDays,
  Inbox,
  BookOpen,
  History,
  ChartNoAxesCombined,
  LibraryBig,
  Plus,
  Search,
  ChevronRight,
  Check,
  LogOut,
  X,
  RefreshCw,
  Bell,
} from "lucide-react";
import type { Workspace as Data, Task } from "@/lib/workspace";
import { activeStatuses, descendants } from "@/lib/domain";
import {
  NoticeContext,
  Drawer,
  Empty,
  human,
  duration,
  displayDate,
} from "./ui";
import { CategoryGrid, QuickTaskForm } from "./category-grid";
import { TaskDetail } from "./task-detail";
import { JournalView } from "./journal";
import { Library } from "./library";
import { Planning } from "./planning";
import { Insights, Timeline } from "./insights";
const nav = [
  { id: "today", name: "My day", icon: Sun },
  { id: "week", name: "Weekly plan", icon: CalendarDays },
  { id: "tasks", name: "Tasks", icon: Inbox },
  { id: "journal", name: "Journal", icon: BookOpen },
  { id: "timeline", name: "Timeline", icon: History },
  { id: "insights", name: "Insights", icon: ChartNoAxesCombined },
];
const headings: Record<
  string,
  { title: string; subtitle: string; eyebrow: string }
> = {
  today: {
    title: "What needs doing?",
    subtitle: "Add a task. Take it one step at a time. Check it off.",
    eyebrow: "Your daily to-dos",
  },
  week: {
    title: "A week, thoughtfully considered.",
    subtitle: "Choose what belongs here. Let the rest wait.",
    eyebrow: "Planning & review",
  },
  tasks: {
    title: "Every intention has a place.",
    subtitle: "Keep the unfinished, find the relevant, follow the thread.",
    eyebrow: "Your intentions",
  },
  journal: {
    title: "Pay attention. Leave a note.",
    subtitle: "The things you notice are part of the story.",
    eyebrow: "Your observations",
  },
  timeline: {
    title: "The days, as they happened.",
    subtitle: "Intentions, actions, and observations in one continuous record.",
    eyebrow: "Your timeline",
  },
  insights: {
    title: "Find the patterns worth noticing.",
    subtitle: "A clearer picture of where your attention goes.",
    eyebrow: "Your insights",
  },
  library: {
    title: "A structure that grows with you.",
    subtitle: "Organize around the way you see your world.",
    eyebrow: "Your library",
  },
};
export function Workspace({ initial }: { initial: Data }) {
  const [data, setData] = useState(initial);
  const [view, setView] = useState("today");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("OPEN");
  const [tag, setTag] = useState("");
  const [entity, setEntity] = useState("");
  const [archive, setArchive] = useState(false);
  const [priority, setPriority] = useState("");
  const [drawer, setDrawer] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [capture, setCapture] = useState("");
  const [visible, setVisible] = useState(60);
  const refresh = useCallback(async () => {
    const response = await fetch("/api/workspace", { cache: "no-store" });
    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!response.ok) throw new Error("Could not refresh the workspace.");
    setData(await response.json());
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get("view");
    if (v && headings[v]) setView(v);
    const t = params.get("task");
    if (t) setDrawer(t);
  }, []);
  useEffect(() => {
    function keys(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (
        e.key === "n" &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) &&
        !target.isContentEditable &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !document.querySelector("dialog[open]")
      ) {
        e.preventDefault();
        setDrawer("new");
      }
    }
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(
      () => setNotice(null),
      notice.error ? 12000 : 3500,
    );
    return () => clearTimeout(timeout);
  }, [notice]);
  async function save(command: Record<string, unknown>) {
    setSaving(true);
    try {
      const r = await fetch("/api/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error || "Could not save.");
      await refresh();
      setNotice({ text: "Saved to your workspace.", error: false });
      return true;
    } catch (e) {
      setNotice({
        text: e instanceof Error ? e.message : "Could not save.",
        error: true,
      });
      return false;
    } finally {
      setSaving(false);
    }
  }
  function navigate(next: string, cat = "") {
    setView(next);
    setCategory(cat);
    setVisible(60);
    window.history.replaceState({}, "", `/?view=${next}`);
  }
  function openTask(t: Task) {
    setDrawer(t.id);
    window.history.replaceState({}, "", `/?view=${view}&task=${t.id}`);
  }
  function closeDrawer() {
    setDrawer(null);
    window.history.replaceState({}, "", `/?view=${view}`);
  }
  async function quickCapture(e: FormEvent) {
    e.preventDefault();
    if (!capture.trim()) return;
    if (
      await save({
        type: "task.create",
        title: capture,
        plannedDate: view === "today" ? data.today : null,
        primaryCategoryId: category || null,
      })
    )
      setCapture("");
  }
  const categoryIds = category ? descendants(data.categories, category) : null;
  const filtered = data.tasks.filter(
    (t) =>
      !!t.archivedAt === archive &&
      (!categoryIds ||
        (t.primaryCategoryId && categoryIds.has(t.primaryCategoryId))) &&
      (!search ||
        `${t.title} ${t.description || ""}`
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (status === "ALL" ||
        (status === "OPEN" && activeStatuses.has(t.status)) ||
        t.status === status) &&
      (!tag || t.tags.some((l) => l.tagId === tag)) &&
      (!entity || t.entities.some((l) => l.entityId === entity)) &&
      (!priority || t.priority === priority),
  );
  const selected = data.tasks.find((t) => t.id === drawer);
  const heading = headings[view];
  const taskRows = (tasks: Task[], empty = "Nothing here, for now.") => (
    <div className="task-list">
      {tasks.map((t) => (
        <div
          className={
            "task-row " + (t.status === "COMPLETED" ? "completed" : "")
          }
          key={t.id}
        >
          <button
            className={
              "task-check " + (t.status === "COMPLETED" ? "checked" : "")
            }
            aria-label={`${t.status === "COMPLETED" ? "Reopen" : "Complete"} ${t.title}`}
            disabled={saving}
            onClick={() =>
              save({
                type: "task.status",
                id: t.id,
                version: t.version,
                status: t.status === "COMPLETED" ? "INBOX" : "COMPLETED",
              })
            }
          >
            {t.status === "COMPLETED" && <Check size={14} />}
          </button>
          <button className="task-main" onClick={() => openTask(t)}>
            <span className="task-title">{t.title}</span>
            <span className="task-meta">
              {data.categories.find((c) => c.id === t.primaryCategoryId)
                ?.name || "Uncategorized"}
              {t.entities[0] && (
                <>
                  <i />{" "}
                  {
                    data.entities.find((e) => e.id === t.entities[0].entityId)
                      ?.name
                  }
                </>
              )}
              {t.dueAt && (
                <span
                  className={
                    new Date(t.dueAt) < new Date() &&
                    activeStatuses.has(t.status)
                      ? "overdue"
                      : ""
                  }
                >
                  {" "}
                  · Due {displayDate(t.dueAt, data.user.timezone)}
                </span>
              )}
            </span>
          </button>
          <div className="task-trailing">
            <span
              className={"priority-dot " + t.priority.toLowerCase()}
              title={`${human(t.priority)} priority`}
            />
            {t.status === "IN_PROGRESS" ? (
              <span className="status in_progress">In progress</span>
            ) : t.estimatedMinutes ? (
              <span className="task-estimate">
                {duration(t.estimatedMinutes)}
              </span>
            ) : null}
            <button
              className="icon-button"
              aria-label={`Open ${t.title}`}
              onClick={() => openTask(t)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      ))}
      {!tasks.length && (
        <Empty title={empty}>
          Capture something new, or leave a little space.
        </Empty>
      )}
    </div>
  );
  const due = data.reminders.filter((r) => r.status === "DELIVERED");
  return (
    <NoticeContext.Provider value={notice}>
      <div className="app-shell tracker-shell">
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <div className="main-shell">
          <header className="tracker-topbar">
            <a className="brand" href="/">
              <span className="brand-mark">
                <Aperture size={24} strokeWidth={1.6} />
              </span>
              <div>
                Still<span>PERSONAL INTELLIGENCE</span>
              </div>
            </a>
            <nav aria-label="Main navigation" className="top-navigation">
              {nav.filter(n=>["today","tasks"].includes(n.id)).map(n=><button key={n.id} className={view===n.id?"active":""} onClick={()=>navigate(n.id)}><n.icon size={16}/><span>{n.name}</span></button>)}
              <details className="more-tools"><summary>More</summary><div>{[...nav.filter(n=>!["today","tasks"].includes(n.id)),{id:"library",name:"Library",icon:LibraryBig}].map(n=><button key={n.id} className={view===n.id?"active":""} onClick={e=>{navigate(n.id);e.currentTarget.closest("details")?.removeAttribute("open");}}><n.icon size={16}/><span>{n.name}</span></button>)}</div></details>
            </nav>
            <div className="top-actions">
              <button
                className="icon-button"
                aria-label="Refresh workspace"
                onClick={() =>
                  refresh().catch(() =>
                    setNotice({ text: "Could not refresh.", error: true }),
                  )
                }
              >
                <RefreshCw size={16} className={saving ? "spin" : ""} />
              </button>
              <button
                className="button primary"
                onClick={() => setDrawer("new")}
              >
                <Plus size={16} /> New task
              </button>
              <button
                className="icon-button"
                aria-label="Sign out"
                onClick={async () => {
                  await fetch("/api/logout", { method: "POST" });
                  window.location.href = "/login";
                }}
              >
                <LogOut size={16} />
              </button>
            </div>
          </header>
          <main id="main">
            <div className="page-heading">
              <div>
                <span className="eyebrow">{heading.eyebrow}</span>
                <h1>
                  {category
                    ? data.categories.find((c) => c.id === category)?.name
                    : heading.title}
                </h1>
                <p>{heading.subtitle}</p>
              </div>
              {view === "today" && (
                <div className="date-badge">
                  <Sun size={21} />
                  <span>
                    {new Date(data.today + "T00:00:00Z").toLocaleDateString(
                      "en",
                      { weekday: "long", timeZone: "UTC" },
                    )}
                    <strong>{displayDate(data.today, "UTC")}</strong>
                  </span>
                </div>
              )}
            </div>
            {due.length > 0 && (
              <div className="reminders">
                <Bell size={18} />
                <div>
                  {due.map((r) => (
                    <div key={r.id}>
                      <button
                        className="text-button"
                        onClick={() => {
                          const t = data.tasks.find((t) => t.id === r.taskId);
                          if (t) openTask(t);
                        }}
                      >
                        {data.tasks.find((t) => t.id === r.taskId)?.title ||
                          "A reminder"}
                      </button>
                      <button
                        className="icon-button"
                        aria-label="Dismiss reminder"
                        onClick={() =>
                          save({ type: "reminder.dismiss", id: r.id })
                        }
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {view === "tasks" && (
              <form className="quick-capture" onSubmit={quickCapture}>
                <Plus size={21} />
                <input
                  aria-label="Quick capture"
                  maxLength={240}
                  value={capture}
                  onChange={(e) => setCapture(e.target.value)}
                  placeholder="Capture an intention…"
                  required
                />
                <button disabled={saving} type="submit">
                  Capture <span>↵</span>
                </button>
              </form>
            )}
            {view === "today" && (
              <CategoryGrid
                data={data}
                save={save}
                openTask={openTask}
                openCategory={(id) => navigate("tasks", id)}
              />
            )}
            {view === "tasks" && (
              <>
                <div className="filters">
                  <select
                    aria-label="Category filter"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="">All categories</option>
                    {data.categories
                      .filter((c) => c.isActive)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                  <div className="search-box">
                    <Search size={16} />
                    <input
                      aria-label="Search tasks"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search intentions…"
                    />
                  </div>
                  <select
                    aria-label="Status filter"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    {[
                      "OPEN",
                      "ALL",
                      "INBOX",
                      "PLANNED",
                      "IN_PROGRESS",
                      "COMPLETED",
                      "DEFERRED",
                      "CANCELLED",
                    ].map((s) => (
                      <option value={s} key={s}>
                        {human(s)}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Priority filter"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                  >
                    <option value="">All priorities</option>
                    {["HIGH", "MEDIUM", "LOW"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  <select
                    aria-label="Tag filter"
                    value={tag}
                    onChange={(e) => setTag(e.target.value)}
                  >
                    <option value="">All tags</option>
                    {data.tags.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Entity filter"
                    value={entity}
                    onChange={(e) => setEntity(e.target.value)}
                  >
                    <option value="">All entities</option>
                    {data.entities.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={archive}
                      onChange={(e) => setArchive(e.target.checked)}
                    />{" "}
                    Archived
                  </label>
                </div>
                <section className="panel">
                  <div className="section-heading">
                    <h2>
                      {category
                        ? data.categories.find((c) => c.id === category)?.name
                        : "Intentions"}{" "}
                      <span className="count">{filtered.length}</span>
                    </h2>
                    {category && (
                      <button
                        className="text-button"
                        onClick={() => setCategory("")}
                      >
                        Clear category
                      </button>
                    )}
                  </div>
                  {taskRows(
                    filtered.slice(0, visible),
                    "No matching intentions.",
                  )}
                  {filtered.length > visible && (
                    <button
                      className="panel-link"
                      onClick={() => setVisible(visible + 60)}
                    >
                      Load more
                    </button>
                  )}
                </section>
              </>
            )}
            {view === "week" && (
              <Planning data={data} save={save} openTask={openTask} />
            )}
            {view === "journal" && <JournalView data={data} save={save} />}
            {view === "timeline" && (
              <Timeline data={data} openTask={openTask} />
            )}
            {view === "insights" && <Insights data={data} />}
            {view === "library" && <Library data={data} save={save} />}

          </main>
        </div>
        {drawer && (
          <Drawer
            title={
              drawer === "new"
                ? "Add a task"
                : "Task details"
            }
            onClose={closeDrawer}
          >
            {drawer === "new" ? (
              <QuickTaskForm data={data} cell={{date:data.today,categoryId:"",mode:"plan"}} save={save} onDone={closeDrawer} />
            ) : selected ? (
              <TaskDetail
                key={selected.id + ":" + selected.version}
                task={selected}
                data={data}
                save={save}
                onClose={closeDrawer}
              />
            ) : (
              <Empty title="Task not found" />
            )}
          </Drawer>
        )}
        {notice && (
          <div
            role={notice.error ? "alert" : "status"}
            className={"toast " + (notice.error ? "error" : "")}
          >
            <span>{notice.text}</span>
            <button
              className="icon-button"
              aria-label="Dismiss message"
              onClick={() => setNotice(null)}
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>
    </NoticeContext.Provider>
  );
}
