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
  ArrowUpRight,
  Check,
  LogOut,
  Menu,
  X,
  RefreshCw,
  ArrowRight,
  Clock3,
  Leaf,
  Bell,
} from "lucide-react";
import type { Workspace as Data, Task } from "@/lib/workspace";
import { activeStatuses, descendants, dateKey } from "@/lib/domain";
import { effortTotal } from "@/lib/analytics";
import {
  NoticeContext,
  Drawer,
  Empty,
  human,
  duration,
  displayDate,
} from "./ui";
import { TaskForm } from "./task-form";
import { TaskDetail } from "./task-detail";
import { JournalView } from "./journal";
import { Library } from "./library";
import { Planning } from "./planning";
import { Insights, Timeline } from "./insights";
const nav = [
  { id: "today", name: "Today", icon: Sun },
  { id: "week", name: "Weekly plan", icon: CalendarDays },
  { id: "tasks", name: "All intentions", icon: Inbox },
  { id: "journal", name: "Journal", icon: BookOpen },
  { id: "timeline", name: "Timeline", icon: History },
  { id: "insights", name: "Insights", icon: ChartNoAxesCombined },
];
const headings: Record<
  string,
  { title: string; subtitle: string; eyebrow: string }
> = {
  today: {
    title: "Make room for what matters.",
    subtitle: "A little intention. A little action. Space to notice.",
    eyebrow: "Your daily workspace",
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
  const [mobile, setMobile] = useState(false);
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
    setMobile(false);
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
  const open = data.tasks.filter(
    (t) => !t.archivedAt && activeStatuses.has(t.status),
  );
  const daily = data.tasks
    .filter(
      (t) =>
        !t.archivedAt &&
        t.plannedDate?.slice(0, 10) === data.today &&
        t.status !== "CANCELLED",
    )
    .sort(
      (a, b) =>
        (a.status === "COMPLETED" ? 1 : 0) - (b.status === "COMPLETED" ? 1 : 0),
    );
  const dailyDone = daily.filter((t) => t.status === "COMPLETED");
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
  function categoryTree(
    parentId: string | null = null,
    depth = 0,
  ): React.ReactNode {
    return data.categories
      .filter((c) => c.parentId === parentId && c.isActive)
      .map((c) => (
        <div key={c.id}>
          <button
            className={"category-nav " + (category === c.id ? "active" : "")}
            style={{ paddingLeft: 18 + depth * 14 }}
            onClick={() => navigate("tasks", c.id)}
          >
            <span className={"category-dot color-" + (depth % 3)} />
            <span>{c.name}</span>
            <small>
              {
                open.filter(
                  (t) =>
                    t.primaryCategoryId &&
                    descendants(data.categories, c.id).has(t.primaryCategoryId),
                ).length
              }
            </small>
          </button>
          {categoryTree(c.id, depth + 1)}
        </div>
      ));
  }
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
  const inbox = open.filter((t) => t.status === "INBOX");
  const todayMinutes = data.tasks
    .flatMap((t) => t.effort)
    .filter((e) => e.occurredOn.slice(0, 10) === data.today)
    .reduce((n, e) => n + e.minutes, 0);
  return (
    <NoticeContext.Provider value={notice}>
      <div className="app-shell">
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {mobile && (
          <button
            className="mobile-scrim"
            aria-label="Close navigation"
            onClick={() => setMobile(false)}
          />
        )}
        <aside className={"sidebar " + (mobile ? "mobile-open" : "")}>
          <a className="brand" href="/">
            <span className="brand-mark">
              <Aperture size={24} strokeWidth={1.6} />
            </span>
            <div>
              Still<span>PERSONAL INTELLIGENCE</span>
            </div>
          </a>
          <button
            className="capture-button"
            onClick={() => {
              setDrawer("new");
              setMobile(false);
            }}
          >
            <Plus size={18} /> Capture an intention <kbd>N</kbd>
          </button>
          <span className="nav-label">WORKSPACE</span>
          <nav aria-label="Main navigation">
            {nav.map((n) => (
              <button
                className={
                  "nav-item " + (view === n.id && !category ? "active" : "")
                }
                key={n.id}
                onClick={() => navigate(n.id)}
              >
                <n.icon size={18} strokeWidth={1.7} />
                <span>{n.name}</span>
                {n.id === "tasks" && <small>{open.length}</small>}
                {n.id === "today" && <span className="nav-today-dot" />}
              </button>
            ))}
          </nav>
          <div className="nav-label label-row">
            <span>AREAS OF LIFE</span>
            <button
              className="icon-button"
              aria-label="Manage categories"
              onClick={() => navigate("library")}
            >
              <Plus size={14} />
            </button>
          </div>
          <div className="category-tree">
            {categoryTree()}
            {!data.categories.length && (
              <button
                className="category-nav"
                onClick={() => navigate("library")}
              >
                Add an area of life
              </button>
            )}
          </div>
          <div className="sidebar-bottom">
            <button
              className={"nav-item " + (view === "library" ? "active" : "")}
              onClick={() => navigate("library")}
            >
              <LibraryBig size={18} />
              <span>Library & templates</span>
            </button>
            <div className="profile">
              <span className="avatar">{data.user.name.slice(0, 1)}</span>
              <div>
                <strong>{data.user.name}</strong>
                <small>Personal workspace</small>
              </div>
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
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="breadcrumb">
              <button
                className="icon-button mobile-menu"
                aria-label="Open navigation"
                onClick={() => setMobile(true)}
              >
                <Menu size={20} />
              </button>
              <span>My workspace</span>
              <ChevronRight size={13} />
              <strong>
                {category
                  ? data.categories.find((c) => c.id === category)?.name
                  : nav.find((n) => n.id === view)?.name || "Library"}
              </strong>
            </div>
            <div className="topbar-right">
              <span className="private-label">
                <span /> Private, by design
              </span>
              <button
                className="icon-button"
                aria-label="Refresh workspace"
                onClick={() =>
                  refresh().catch(() =>
                    setNotice({ text: "Could not refresh.", error: true }),
                  )
                }
              >
                <RefreshCw size={15} className={saving ? "spin" : ""} />
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
            {["today", "tasks"].includes(view) && (
              <form className="quick-capture" onSubmit={quickCapture}>
                <Plus size={21} />
                <input
                  aria-label="Quick capture"
                  maxLength={240}
                  value={capture}
                  onChange={(e) => setCapture(e.target.value)}
                  placeholder={
                    view === "today"
                      ? "What would you like to make room for today?"
                      : "Capture an intention…"
                  }
                  required
                />
                <button disabled={saving} type="submit">
                  Capture <span>↵</span>
                </button>
              </form>
            )}
            {view === "today" && (
              <div className="daily-grid">
                <div>
                  <section className="panel today-panel">
                    <div className="section-heading">
                      <h2>
                        Today’s intentions{" "}
                        <span className="count">{daily.length}</span>
                      </h2>
                      <span className="muted small">
                        {dailyDone.length} complete
                      </span>
                    </div>
                    {taskRows(daily, "Your day has room.")}
                    <button
                      className="panel-link"
                      onClick={() => setDrawer("new")}
                    >
                      <Plus size={16} /> Add an intention
                    </button>
                  </section>
                  <section className="panel inbox-panel">
                    <div className="section-heading">
                      <div>
                        <h2>
                          A thought for later{" "}
                          <span className="count">{inbox.length}</span>
                        </h2>
                        <p className="muted small">
                          Safely captured. No date needed.
                        </p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => {
                          navigate("tasks");
                          setStatus("INBOX");
                        }}
                      >
                        View inbox <ArrowUpRight size={14} />
                      </button>
                    </div>
                    {taskRows(
                      inbox.slice(0, 3),
                      "Nothing waiting in your inbox.",
                    )}
                  </section>
                  <div className="philosophy">
                    <Leaf size={18} />
                    <span>
                      Not everything needs to be finished today. It just needs a
                      place.
                    </span>
                  </div>
                </div>
                <aside className="daily-aside">
                  <section className="attention-card">
                    <div className="card-overline">
                      <span>A LITTLE PERSPECTIVE</span>
                      <Aperture size={18} />
                    </div>
                    <h2>
                      Attention, gently
                      <br />
                      accounted for.
                    </h2>
                    <div className="attention-stats">
                      <div>
                        <strong>{duration(todayMinutes)}</strong>
                        <span>effort recorded</span>
                      </div>
                      <div>
                        <strong>
                          {dailyDone.length}
                          <small> / {daily.length}</small>
                        </strong>
                        <span>intentions complete</span>
                      </div>
                    </div>
                    <div className="progress-track">
                      <span
                        style={{
                          width: `${daily.length ? (dailyDone.length / daily.length) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <p>A record of the day. Never a score.</p>
                    <button onClick={() => navigate("insights")}>
                      Explore your patterns <ArrowUpRight size={16} />
                    </button>
                  </section>
                  <section className="reflection-card">
                    <div className="card-overline">
                      <span>PAUSE & NOTICE</span>
                      <BookOpen size={18} />
                    </div>
                    <h2>
                      What’s becoming
                      <br />a little clearer?
                    </h2>
                    <p>
                      An observation doesn’t need an outcome. Just a few words
                      to come back to.
                    </p>
                    <button
                      className="button"
                      onClick={() => navigate("journal")}
                    >
                      Open your journal <ArrowRight size={16} />
                    </button>
                  </section>
                  {data.journals.find((j) => !j.archivedAt) && (
                    <section className="recent-note">
                      <span className="eyebrow">A recent observation</span>
                      <h3>{data.journals.find((j) => !j.archivedAt)?.title}</h3>
                      <p>
                        {data.journals
                          .find((j) => !j.archivedAt)
                          ?.content.slice(0, 165)}
                        …
                      </p>
                      <button
                        className="text-button"
                        onClick={() => navigate("journal")}
                      >
                        Keep reading <ArrowUpRight size={14} />
                      </button>
                    </section>
                  )}
                </aside>
              </div>
            )}
            {view === "tasks" && (
              <>
                <div className="filters">
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
            <footer className="workspace-footer">
              <span>
                Intention <i /> Action <i /> Observation
              </span>
              <span>One personal record. Room to grow.</span>
            </footer>
          </main>
        </div>
        {drawer && (
          <Drawer
            title={
              drawer === "new"
                ? "Capture an intention"
                : "An intention, in detail"
            }
            onClose={closeDrawer}
          >
            {drawer === "new" ? (
              <TaskForm data={data} save={save} onDone={closeDrawer} />
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
