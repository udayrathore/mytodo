"use client";
import { WorkModeSettings } from "./work-mode-settings";
import { PopoverMenu } from "./popover-menu";
import { mayLeaveEditor } from "./navigation-guard";
import { postCommand, applyCommandPatch } from "@/lib/command-client";
import { Learnings } from "./learnings";
import { Challenges } from "./challenges";
import { Goals } from "./goals";
import { AccountSettings } from "./account-settings";
import { Master } from "./master";
import { TaskCollectionFilters } from "./task-collection-filters";
import { DashboardTasks } from "./dashboard-tasks";
import {
  useEffect,
  useState,
  useCallback,
  useRef,
  type FormEvent,
} from "react";
import {
  BriefcaseBusiness,
  Menu as MenuIcon,
  Settings,
  Target,
  Sun,
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
import { groupTasks } from "@/lib/task-groups";
import { TaskDetail } from "./task-detail";
import { JournalView } from "./journal";
import { Library } from "./library";
import { Planning } from "./planning";
import { useRemote } from "./use-remote";
import { CategorySheet } from "./category-sheet";
import { Projects } from "./projects";
import { CategoryDistribution } from "./category-distribution";
import { Insights, Timeline } from "./insights";
const nav = [
  { id: "today", name: "My day", icon: Sun },

  { id: "goals", name: "Goals", icon: Target },
  { id: "challenges", name: "Challenges", icon: Target },
  { id: "learnings", name: "Learnings", icon: BookOpen },
  { id: "journal", name: "Journal", icon: BookOpen },
  { id: "timeline", name: "Timeline", icon: History },
  { id: "projects", name: "Projects", icon: LibraryBig },
  { id: "categories", name: "Categories", icon: LibraryBig },
  { id: "distribution", name: "Category balance", icon: ChartNoAxesCombined },
  { id: "master", name: "Master", icon: LibraryBig },
  { id: "account", name: "Account settings", icon: Settings },
  { id: "work-mode", name: "Configure Work mode", icon: BriefcaseBusiness },
];
const headings: Record<string, string> = {
  today: "My day",
  tasks: "Tasks",
  week: "Weekly plan",
  journal: "Journal",
  timeline: "Timeline",
  insights: "Insights",
  category: "Category workspace",
  projects: "Projects",
  categories: "Categories",
  distribution: "Category balance",
  library: "Library",
  master: "Master",
  goals: "Goals",
  challenges: "Challenges",
  learnings: "Learnings",
  account: "Login & recovery",
  "work-mode": "Work mode",
};
export function Workspace({ initial }: { initial: Data }) {
  const [data, setData] = useState(initial);
  const [view, setView] = useState("today");
  const [dashboard, setDashboard] = useState<"execute" | "manage" | "plan">(
    "execute",
  );
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("OPEN");
  const [tag, setTag] = useState("");
  const [entity, setEntity] = useState("");
  const [archive, setArchive] = useState(false);
  const [drawer, setDrawer] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [modeChanging, setModeChanging] = useState(false);
  const [newTaskDate, setNewTaskDate] = useState<string | null>(null);
  const [capture, setCapture] = useState("");
  const [expandedSeries, setExpandedSeries] = useState<string[]>([]);
  const [visible, setVisible] = useState(60);
  const query = useRef<Record<string, string>>({});
  const requestNumber = useRef(0);
  const [loading, setLoading] = useState(false);
  query.current = {
    ...query.current,
    view: [
      "master",
      "account",
      "work-mode",
      "goals",
      "challenges",
      "learnings",
    ].includes(view)
      ? "library"
      : view,
    dashboard,
    ...(category ? { category } : { category: "" }),
    search:
      view === "tasks" || view === "today"
        ? search
        : view === "journal"
          ? query.current.journalSearch || ""
          : "",
    status: view === "tasks" ? status : "ALL",
    archive: String(view === "tasks" && archive),
    tag: view === "tasks" || view === "today" ? tag : "",
    entity: view === "tasks" || view === "today" ? entity : "",
  };
  const refresh = useCallback(async (through?: string, append = false) => {
    if (through) query.current.through = through;
    const number = ++requestNumber.current;
    const params = new URLSearchParams(
      Object.entries(query.current).filter(
        ([k, v]) => v && k !== "journalSearch",
      ),
    );
    if (!append) params.delete("cursor");
    setLoading(true);
    try {
      const response = await fetch(`/api/workspace?${params}`, {
        cache: "no-store",
      });
      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!response.ok) throw new Error("Could not load the workspace.");
      const incoming: Data = await response.json();
      if (number !== requestNumber.current) return;
      setData((old) =>
        append
          ? {
              ...incoming,
              tasks: [
                ...new Map(
                  [...old.tasks, ...incoming.tasks].map((t) => [t.id, t]),
                ).values(),
              ],
              events: [
                ...new Map(
                  [...old.events, ...incoming.events].map((e) => [e.id, e]),
                ).values(),
              ],
              journals: [
                ...new Map(
                  [...old.journals, ...incoming.journals].map((j) => [j.id, j]),
                ).values(),
              ],
            }
          : incoming,
      );
      if (append) setVisible((v) => v + 100);
    } finally {
      if (number === requestNumber.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    delete query.current.cursor;
    const timer = setTimeout(() => {
      void refresh().catch((e) => setNotice({ text: e.message, error: true }));
    }, 150);
    return () => clearTimeout(timer);
  }, [
    view,
    dashboard,
    category,
    search,
    status,
    archive,
    tag,
    entity,
    refresh,
  ]);
  const setManageRange = useCallback(
    (from: string, through: string) => {
      query.current.from = from;
      query.current.through = through;
      delete query.current.cursor;
      void refresh().catch((e) => setNotice({ text: e.message, error: true }));
    },
    [refresh],
  );
  const setScope = useCallback(
    (key: string, value: string) => {
      query.current[key] = value;
      if (key === "journalSearch") query.current.search = value;
      delete query.current.cursor;
      void refresh().catch((e) => setNotice({ text: e.message, error: true }));
    },
    [refresh],
  );
  const detail = useRemote<Data>(
    drawer && drawer !== "new"
      ? `/api/workspace?view=task&task=${drawer}`
      : null,
    data,
  );
  const loadRange = useCallback(
    async (through: string) => {
      try {
        await refresh(through);
      } catch {
        setNotice({
          text: "Could not load repeating tasks for those dates.",
          error: true,
        });
      }
    },
    [refresh],
  );
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get("view");
    if (v && headings[v]) setView(v);
    const cat = params.get("category");
    if (cat) setCategory(cat);
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
      const result = await postCommand(command);
      if (
        result.patch &&
        !(data.workMode?.enabled && result.patch.collection === "categories")
      ) {
        requestNumber.current++; // Ignore reads started before this committed write.
        setLoading(false);
        setData((old) => applyCommandPatch(old, result));
      } else if (command.type !== "task.comment") {
        void refresh().catch(() =>
          setNotice({
            text: "Saved. Could not refresh the view; use Refresh to reload it.",
            error: true,
          }),
        );
      }
      setNotice({ text: "Saved.", error: false });
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
  async function toggleWorkMode() {
    if (modeChanging || !mayLeaveEditor()) return;
    setModeChanging(true);
    try {
      const response = await fetch("/api/work-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle",
          enabled: !data.workMode?.enabled,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "Could not switch mode.");
      delete query.current.category;
      delete query.current.entity;
      delete query.current.tag;
      delete query.current.project;
      delete query.current.cursor;
      setCategory("");
      setEntity("");
      setTag("");
      setDrawer(null);
      await refresh();
    } catch (error) {
      setNotice({
        text: error instanceof Error ? error.message : "Could not switch mode.",
        error: true,
      });
    } finally {
      setModeChanging(false);
    }
  }
  function navigate(next: string, cat = "") {
    if (!mayLeaveEditor()) return;
    delete query.current.project;
    delete query.current.period;
    delete query.current.cursor;
    delete query.current.through;
    delete query.current.from;
    setView(next);
    setCategory(cat);
    setEntity("");
    setTag("");
    setSearch("");
    setVisible(60);
    window.history.replaceState(
      {},
      "",
      `/?view=${next}${cat ? `&category=${encodeURIComponent(cat)}` : ""}`,
    );
  }
  function openTask(t: Pick<Task, "id">) {
    setDrawer(t.id);
    window.history.replaceState(
      {},
      "",
      `/?view=${view}${category ? `&category=${encodeURIComponent(category)}` : ""}&task=${t.id}`,
    );
  }
  function closeDrawer() {
    setDrawer(null);
    setNewTaskDate(null);
    window.history.replaceState(
      {},
      "",
      `/?view=${view}${category ? `&category=${encodeURIComponent(category)}` : ""}`,
    );
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
      (!entity || t.entities.some((l) => l.entityId === entity)),
  );
  const groupedTasks = groupTasks(filtered);
  const selected = detail.data?.tasks.find((t) => t.id === drawer);
  const heading = headings[view];
  const taskRows = (tasks: Task[], empty = "No tasks.") => (
    <div className="task-list">
      {tasks.map((t) => (
        <div
          className={
            "task-row " +
            "" +
            " " +
            (t.status === "COMPLETED" ? "completed" : "")
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
              {t.seriesId && (
                <>Repeating · {displayDate(t.plannedDate!, "UTC")} · </>
              )}
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
      {!tasks.length && <Empty title={empty} />}
    </div>
  );
  const due = data.reminders.filter((r) => r.status === "DELIVERED");
  return (
    <NoticeContext.Provider value={notice}>
      <div
        className="app-shell tracker-shell"
        data-mode={data.workMode?.enabled ? "work" : "personal"}
      >
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <div className="main-shell">
          <header className="tracker-topbar">
            <div className="sidebar-profile">
              <span className="profile-avatar">
                {data.user.name.slice(0, 1).toUpperCase()}
              </span>
              <strong>{data.user.name}</strong>
            </div>
            <button className="sidebar-add" onClick={() => setDrawer("new")}>
              <Plus size={20} />
              Add task
            </button>
            <nav aria-label="Main navigation" className="top-navigation">
              {nav
                .filter((n) =>
                  [
                    "today",
                    "tasks",
                    "goals",
                    "challenges",
                    "learnings",
                  ].includes(n.id),
                )
                .map((n) => (
                  <button
                    key={n.id}
                    className={view === n.id ? "active" : ""}
                    onClick={() => navigate(n.id)}
                  >
                    <n.icon size={16} />
                    <span>{n.name}</span>
                  </button>
                ))}
            </nav>
            <nav className="sidebar-settings" aria-label="Account and tools">
              <PopoverMenu
                label="Menu"
                text="Menu"
                icon={<MenuIcon size={18} />}
                className="bottom-menu"
              >
                {nav
                  .filter(
                    (n) =>
                      ![
                        "today",
                        "tasks",
                        "goals",
                        "challenges",
                        "learnings",
                      ].includes(n.id),
                  )
                  .map((n) => (
                    <button
                      data-close-menu
                      key={n.id}
                      className={view === n.id ? "active" : ""}
                      onClick={() => navigate(n.id)}
                    >
                      <n.icon size={16} />
                      {n.name}
                    </button>
                  ))}
                <button
                  data-close-menu
                  onClick={() =>
                    void refresh().catch(() =>
                      setNotice({ text: "Could not refresh.", error: true }),
                    )
                  }
                >
                  <RefreshCw size={16} />
                  Refresh workspace
                </button>
                <button
                  data-close-menu
                  onClick={async () => {
                    await fetch("/api/logout", { method: "POST" });
                    window.location.href = "/login";
                  }}
                >
                  <LogOut size={16} />
                  Sign out
                </button>
              </PopoverMenu>
            </nav>
            <button
              className="floating-add"
              aria-label="Add task"
              data-tooltip="Add task"
              onClick={() => setDrawer("new")}
            >
              <Plus size={26} />
            </button>
          </header>
          <main id="main" aria-busy={modeChanging}>
            <div className="workspace-toolbar">
              {view === "today" && (
                <>
                  <div
                    className="view-toggle"
                    role="group"
                    aria-label="Dashboard view"
                  >
                    {(["execute", "manage", "plan"] as const).map((mode) => (
                      <button
                        key={mode}
                        aria-pressed={dashboard === mode}
                        onClick={() => {
                          delete query.current.through;
                          delete query.current.from;
                          delete query.current.cursor;
                          setDashboard(mode);
                        }}
                      >
                        {mode[0].toUpperCase() + mode.slice(1)}
                      </button>
                    ))}
                  </div>
                  <TaskCollectionFilters
                    data={data}
                    scope={{ category, entity, tag }}
                    onScope={(kind, id) => {
                      setCategory(kind === "category" ? id : "");
                      setEntity(kind === "entity" ? id : "");
                      setTag(kind === "tag" ? id : "");
                      setSearch("");
                    }}
                  />
                </>
              )}
              <button
                type="button"
                className="work-mode-toggle icon-button"
                aria-label={
                  data.workMode?.enabled
                    ? "Turn off Work mode"
                    : "Turn on Work mode"
                }
                aria-pressed={!!data.workMode?.enabled}
                title={
                  data.workMode?.enabled
                    ? "Work mode is on"
                    : "Switch to Work mode"
                }
                disabled={modeChanging}
                onClick={() => void toggleWorkMode()}
              >
                <BriefcaseBusiness size={21} />
              </button>
            </div>

            {modeChanging && <p role="status">Switching mode…</p>}
            <div
              hidden={modeChanging}
              key={`${!!data.workMode?.enabled}:${data.workMode?.categoryIds.join(",") || ""}`}
            >
              {data.workMode?.enabled && (
                <div className="work-mode-status">
                  <BriefcaseBusiness size={14} />
                  <span>Work mode</span>
                  <button
                    className="text-button"
                    onClick={() => navigate("work-mode")}
                  >
                    Configure
                  </button>
                </div>
              )}
              <h1 className="sr-only">{heading}</h1>
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
                    placeholder="Add an upcoming task…"
                    required
                  />
                  <button disabled={saving} type="submit">
                    Capture <span>↵</span>
                  </button>
                </form>
              )}
              {view === "work-mode" && (
                <WorkModeSettings
                  onSaved={async () => {
                    delete query.current.cursor;
                    await refresh();
                    setNotice({ text: "Work categories saved.", error: false });
                  }}
                />
              )}
              {view === "master" && <Master />}
              {view === "account" && <AccountSettings />}
              {view === "learnings" && <Learnings />}
              {view === "challenges" && (
                <Challenges onOpenTask={(id) => setDrawer(id)} />
              )}
              {view === "goals" && <Goals onOpenTask={(id) => setDrawer(id)} />}
              {view === "today" && (
                <>
                  {dashboard !== "plan" && (
                    <DashboardTasks
                      onAdd={(date) => {
                        setNewTaskDate(date || null);
                        setDrawer("new");
                      }}
                      onManageRange={setManageRange}
                      onSort={(sort, direction) => {
                        query.current.sort = sort;
                        query.current.direction = direction;
                        delete query.current.cursor;
                        void refresh().catch((error) =>
                          setNotice({ text: error.message, error: true }),
                        );
                      }}
                      mode={dashboard}
                      data={data}
                      save={save}
                      openTask={openTask}
                      scope={{ category, entity, tag }}
                    />
                  )}
                </>
              )}
              {view === "today" && dashboard === "plan" && (
                <CategoryGrid
                  onRange={loadRange}
                  data={data}
                  save={save}
                  openTask={openTask}
                  openCategory={(id) => navigate("category", id)}
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
                        placeholder="Search tasks…"
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
                          : status === "PLANNED"
                            ? "Upcoming tasks"
                            : status === "OPEN"
                              ? "Open tasks"
                              : "Tasks"}{" "}
                        <span className="count">{groupedTasks.length}</span>
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
                    {groupedTasks.slice(0, visible).map((group) =>
                      group.occurrences[0].seriesId ? (
                        <section className="repeat-group" key={group.key}>
                          <button
                            className="panel-link"
                            aria-expanded={expandedSeries.includes(group.key)}
                            onClick={() =>
                              setExpandedSeries((current) =>
                                current.includes(group.key)
                                  ? current.filter((key) => key !== group.key)
                                  : [...current, group.key],
                              )
                            }
                          >
                            <span>
                              {group.occurrences[0].title} · Repeating
                            </span>
                            <span>
                              {group.occurrences.length} loaded dates ·{" "}
                              {expandedSeries.includes(group.key)
                                ? "Hide"
                                : "Show dates"}
                            </span>
                          </button>
                          {expandedSeries.includes(group.key) &&
                            taskRows(group.occurrences)}
                        </section>
                      ) : (
                        <div key={group.key}>{taskRows(group.occurrences)}</div>
                      ),
                    )}
                    {!groupedTasks.length && taskRows([], "No matching tasks.")}
                    {groupedTasks.length > visible && (
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
              {view === "category" && (
                <>
                  <div className="section-toolbar">
                    <button
                      className="text-button"
                      onClick={() => navigate("today")}
                    >
                      ← All categories
                    </button>
                    <label className="field">
                      Category
                      <select
                        value={category}
                        onChange={(e) => navigate("category", e.target.value)}
                      >
                        <option value="">Choose a category</option>
                        {data.categories
                          .filter((c) => c.isActive)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>
                  {category ? (
                    <CategorySheet
                      key={category}
                      data={data}
                      categoryId={category}
                      save={save}
                      openTask={openTask}
                      onRange={loadRange}
                    />
                  ) : (
                    <p>Choose a category to open its spreadsheet.</p>
                  )}
                </>
              )}
              {view === "projects" && (
                <Projects
                  setScope={setScope}
                  data={data}
                  save={save}
                  openTask={openTask}
                  onRange={loadRange}
                />
              )}
              {view === "categories" && (
                <Library
                  key="categories"
                  data={data}
                  save={save}
                  categoriesOnly
                />
              )}
              {view === "distribution" && <CategoryDistribution data={data} />}
              {view === "week" && (
                <Planning
                  data={data}
                  save={save}
                  openTask={openTask}
                  setScope={setScope}
                />
              )}
              {view === "journal" && (
                <JournalView data={data} save={save} setScope={setScope} />
              )}
              {view === "timeline" && (
                <Timeline data={data} openTask={openTask} />
              )}
              {view === "insights" && <Insights data={data} />}
              {view === "library" && <Library data={data} save={save} />}
              {loading && <p role="status">Loading…</p>}
              {data.page?.view === view && data.page.nextCursor && (
                <button
                  className="button"
                  disabled={loading}
                  onClick={() => {
                    query.current.cursor = data.page!.nextCursor!;
                    void refresh(undefined, true).catch((e) =>
                      setNotice({ text: e.message, error: true }),
                    );
                  }}
                >
                  Load more {view === "journal" ? "entries" : "tasks"}
                </button>
              )}
            </div>
          </main>
        </div>
        {drawer && (
          <Drawer
            popup
            hideTitle={drawer !== "new"}
            title={drawer === "new" ? "Add a task" : "Task details"}
            onClose={closeDrawer}
          >
            {drawer === "new" ? (
              <QuickTaskForm
                data={data}
                cell={{
                  date: newTaskDate || data.today,
                  categoryId: "",
                  mode: "plan",
                }}
                save={save}
                onDone={closeDrawer}
              />
            ) : selected ? (
              <TaskDetail
                key={selected.id + ":" + selected.version}
                task={selected}
                data={detail.data || data}
                save={save}
                onClose={closeDrawer}
              />
            ) : (
              <Empty
                title={
                  detail.error ||
                  (detail.loading ? "Loading task…" : "Task not found")
                }
              />
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
