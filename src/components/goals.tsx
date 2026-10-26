"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { Plus, MessageSquare, ChevronLeft, ChevronRight } from "lucide-react";
import { Drawer } from "./ui";
type Goal = {
  id: string;
  title: string;
  reason: string;
  categoryId: string;
  parentId: string | null;
  status: string;
  progress: number;
  estimatedMinutes: number | null;
  sortOrder: number;
  version: number;
  archivedAt: string | null;
};
type Category = {
  id: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
  archivedAt: string | null;
};
type GoalData = {
  goals: Goal[];
  categories: Category[];
  links: { goalId: string }[];
};
type GoalTask = {
  id: string;
  title: string;
  status: string;
  plannedDate: string | null;
  dueAt: string | null;
  completedAt: string | null;
  archivedAt: string | null;
};
type Detail = Goal & {
  nextCommentsCursor: string | null;
  comments: {
    id: string;
    body: string;
    progress: number | null;
    createdAt: string;
  }[];
  tasks: { task: GoalTask }[];
};
async function read<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  const d = await r.json();
  if (!r.ok) throw Error(d.error || "Could not load.");
  return d;
}
async function write(body: Record<string, unknown>) {
  const r = await fetch("/api/goals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw Error(d.error || "Could not save.");
  return d;
}
const statusName = (s: string) =>
  s === "NOT_STARTED"
    ? "Not started"
    : s === "COMPLETED"
      ? "Completed"
      : "Started";
export function Goals({ onOpenTask }: { onOpenTask?: (id: string) => void }) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<GoalData | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [archive, setArchive] = useState(false),
    [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null),
    [detail, setDetail] = useState<Detail | null>(null),
    [editing, setEditing] = useState<Goal | "new" | null>(null),
    [parent, setParent] = useState<Goal | null>(null),
    [category, setCategory] = useState(""),
    [drag, setDrag] = useState<string | null>(null),
    [over, setOver] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setData(await read<GoalData>("/api/goals"));
  }, []);
  useEffect(() => {
    let live = true;
    read<GoalData>("/api/goals")
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    let live = true;
    setDetail(null);
    if (selected)
      read<{ goal: Detail }>(`/api/goals?id=${selected}`)
        .then((d) => {
          if (live) setDetail(d.goal);
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    return () => {
      live = false;
    };
  }, [selected]);
  async function olderComments() {
    if (!detail?.nextCommentsCursor || busy) return;
    setBusy(true);
    const id = detail.id;
    try {
      const next = await read<{ goal: Detail }>(
        `/api/goals?id=${id}&commentsCursor=${detail.nextCommentsCursor}`,
      );
      setDetail((old) =>
        old?.id === id
          ? {
              ...old,
              comments: [...old.comments, ...next.goal.comments],
              nextCommentsCursor: next.goal.nextCommentsCursor,
            }
          : old,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load comments.");
    } finally {
      setBusy(false);
    }
  }
  async function act(body: Record<string, unknown>) {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      await write(body);
      try {
        await refresh();
        if (selected && body.action !== "delete")
          setDetail(
            (await read<{ goal: Detail }>(`/api/goals?id=${selected}`)).goal,
          );
      } catch {
        setError(
          "Saved. Could not reload the view; refresh to see the latest records.",
        );
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (!data) return <p role="status">{error || "Loading goals…"}</p>;
  function categoryPath(c: Category) {
    const names = [c.name];
    const seen = new Set([c.id]);
    let p = c.parentId;
    while (p && !seen.has(p)) {
      seen.add(p);
      const found = data!.categories.find((x) => x.id === p);
      if (!found) break;
      names.unshift(found.name);
      p = found.parentId;
    }
    return names.join(" / ");
  }
  const visible = data.goals.filter((g) => Boolean(g.archivedAt) === archive);
  const matches = new Set(
    visible
      .filter((g) =>
        `${g.title} ${g.reason}`.toLowerCase().includes(search.toLowerCase()),
      )
      .map((g) => g.id),
  );
  for (const g of visible.filter((g) => matches.has(g.id))) {
    let p = g.parentId;
    const seen = new Set<string>();
    while (p && !seen.has(p)) {
      seen.add(p);
      matches.add(p);
      p = data.goals.find((x) => x.id === p)?.parentId ?? null;
    }
  }
  function goalCard(g: Goal): React.ReactNode {
    return (
      <div key={g.id} className="goal-branch">
        <article
          className={`goal-card ${over === g.id ? "goal-drop-target" : ""}`}
          draggable={!archive && !busy && !search}
          onDragStart={(e) => {
            e.stopPropagation();
            setDrag(g.id);
            e.dataTransfer.setData("text/plain", g.id);
          }}
          onDragEnd={() => {
            setDrag(null);
            setOver(null);
          }}
          onDragOver={(e) => {
            const from = data!.goals.find((x) => x.id === drag);
            if (
              from &&
              from.id !== g.id &&
              from.parentId === g.parentId &&
              from.categoryId === g.categoryId
            ) {
              e.preventDefault();
              e.stopPropagation();
              setOver(g.id);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (drag && over === g.id)
              void act({
                action: "reorder",
                id: drag,
                beforeId: g.id,
                placement:
                  e.clientY >
                  e.currentTarget.getBoundingClientRect().top +
                    e.currentTarget.getBoundingClientRect().height / 2
                    ? "after"
                    : "before",
              });
            setDrag(null);
            setOver(null);
          }}
        >
          <button
            className="goal-card-open"
            onClick={() => {
              setError("");
              setSelected(g.id);
            }}
          >
            <span className="goal-card-title">{g.title}</span>
            <span className="goal-card-meta">
              {statusName(g.status)} · {g.progress}%
            </span>
          </button>
        </article>
      </div>
    );
  }
  return (
    <section className="goals-module">
      <div className="section-toolbar">
        <h2>Goals</h2>
        <input
          aria-label="Search goals"
          placeholder="Search goals…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={archive}
            onChange={(e) => setArchive(e.target.checked)}
          />
          Archived
        </label>
        <button
          className="button primary"
          onClick={() => {
            setParent(null);
            setCategory("");
            setEditing("new");
          }}
        >
          <Plus size={16} />
          New goal
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="goal-scroll-controls">
        <button
          type="button"
          className="icon-button"
          aria-label="Scroll categories left"
          title="Previous categories"
          onClick={() =>
            boardRef.current?.scrollBy({ left: -334, behavior: "smooth" })
          }
        >
          <ChevronLeft size={20} />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Scroll categories right"
          title="Next categories"
          onClick={() =>
            boardRef.current?.scrollBy({ left: 334, behavior: "smooth" })
          }
        >
          <ChevronRight size={20} />
        </button>
      </div>
      <div
        ref={boardRef}
        className="goals-board"
        role="region"
        aria-label="Goal category lanes"
        tabIndex={0}
      >
        {data.categories
          .filter((c) =>
            visible.some(
              (g) =>
                (!g.parentId ||
                  !data.goals.some((parent) => parent.id === g.parentId)) &&
                g.categoryId === c.id &&
                matches.has(g.id),
            ),
          )
          .map((c) => (
            <section className="goal-lane" key={c.id}>
              <h3>
                {categoryPath(c)}{" "}
                <span>
                  {
                    visible.filter(
                      (g) =>
                        (!g.parentId ||
                          !data.goals.some(
                            (parent) => parent.id === g.parentId,
                          )) &&
                        g.categoryId === c.id,
                    ).length
                  }
                </span>
              </h3>
              {visible
                .filter(
                  (g) =>
                    g.categoryId === c.id &&
                    (!g.parentId ||
                      !data.goals.some((parent) => parent.id === g.parentId)) &&
                    matches.has(g.id),
                )
                .map((g) => goalCard(g))}
              {!archive && c.isActive && !c.archivedAt && (
                <button
                  className="inline-add-task"
                  onClick={() => {
                    setParent(null);
                    setCategory(c.id);
                    setEditing("new");
                  }}
                >
                  <Plus size={16} />
                  Add goal
                </button>
              )}
            </section>
          ))}
      </div>
      {selected && !editing && (
        <Drawer
          popup
          title="Goal"
          onClose={() => {
            setSelected(null);
            setDetail(null);
          }}
        >
          {detail ? (
            <>
              <h2>{detail.title}</h2>
              <p className="goal-detail-reason">{detail.reason}</p>
              <div className="goal-card-meta">
                {statusName(detail.status)} · {detail.progress}%
                {detail.estimatedMinutes
                  ? ` · ${detail.estimatedMinutes / 60}h estimated`
                  : ""}
              </div>
              <progress
                className="goal-detail-progress"
                value={detail.progress}
                max={100}
                aria-label="Goal progress"
              />
              <div className="goal-actions">
                {!detail.archivedAt && (
                  <>
                    <button
                      className="button"
                      onClick={() => setEditing(detail)}
                    >
                      Edit
                    </button>
                    <button
                      className="button"
                      onClick={() => {
                        setParent(detail);
                        setCategory(detail.categoryId);
                        setEditing("new");
                      }}
                    >
                      Add subgoal
                    </button>
                  </>
                )}
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => {
                    if (
                      detail.archivedAt ||
                      window.confirm("Archive this goal and its subgoals?")
                    )
                      void act({
                        action: detail.archivedAt ? "restore" : "archive",
                        id: detail.id,
                        version: detail.version,
                      });
                  }}
                >
                  {detail.archivedAt ? "Restore" : "Archive"}
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      window.confirm(
                        "Permanently delete this goal, its subgoals and comments? Linked tasks will be kept.",
                      )
                    )
                      if (
                        await act({
                          action: "delete",
                          id: detail.id,
                          version: detail.version,
                        })
                      ) {
                        setSelected(null);
                        setDetail(null);
                      }
                  }}
                >
                  Delete
                </button>
              </div>
              {data.goals.some((g) => g.parentId === detail.id) && (
                <section className="subsection">
                  <h3>Subgoals</h3>
                  {data.goals
                    .filter((g) => g.parentId === detail.id)
                    .map((g) => (
                      <button
                        className="goal-subgoal-link"
                        key={g.id}
                        onClick={() => setSelected(g.id)}
                      >
                        {g.title}
                        <span>
                          {g.progress}%{g.archivedAt ? " · Archived" : ""}
                        </span>
                      </button>
                    ))}
                </section>
              )}
              <GoalTasks
                detail={detail}
                busy={busy}
                act={act}
                onOpenTask={onOpenTask}
              />
              <section className="subsection">
                <h3>
                  <MessageSquare size={15} /> Comments & check-ins
                </h3>
                {!detail.archivedAt && (
                  <form
                    className="form-stack"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const form = e.currentTarget,
                        f = new FormData(form);
                      if (
                        await act({
                          action: "comment",
                          id: detail.id,
                          version: detail.version,
                          body: f.get("body"),
                          ...(f.get("progress") !== ""
                            ? { progress: Number(f.get("progress")) }
                            : {}),
                        })
                      )
                        form.reset();
                    }}
                  >
                    <textarea
                      name="body"
                      aria-label="Comment or check-in"
                      placeholder="Leave a comment or record a check-in…"
                      required
                      maxLength={20000}
                      rows={3}
                    />
                    <label className="field">
                      Progress update (optional)
                      <input
                        name="progress"
                        type="number"
                        min={0}
                        max={100}
                        placeholder="0–100%"
                      />
                    </label>
                    <button className="button" disabled={busy}>
                      Post
                    </button>
                  </form>
                )}
                {detail.comments.map((c) => (
                  <article className="goal-comment" key={c.id}>
                    <small>
                      {new Date(c.createdAt).toLocaleString()}
                      {c.progress !== null ? ` · Check-in: ${c.progress}%` : ""}
                    </small>
                    <p>{c.body}</p>
                  </article>
                ))}
                {detail.nextCommentsCursor && (
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => void olderComments()}
                  >
                    Older comments
                  </button>
                )}
                {!detail.comments.length && (
                  <p className="muted">No check-ins yet.</p>
                )}
              </section>
              {error && (
                <p role="alert" className="form-error">
                  {error}
                </p>
              )}
            </>
          ) : (
            <p>{error || "Loading goal…"}</p>
          )}
        </Drawer>
      )}
      {editing && (
        <Drawer
          popup
          title={editing === "new" ? "New goal" : "Edit goal"}
          onClose={() => setEditing(null)}
        >
          <GoalForm
            key={
              editing === "new" ? `new-${parent?.id}-${category}` : editing.id
            }
            goal={editing === "new" ? null : editing}
            parent={parent}
            initialCategory={category}
            data={data}
            busy={busy}
            save={async (body) => {
              if (await act(body)) {
                setEditing(null);
                setParent(null);
              }
            }}
          />
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
        </Drawer>
      )}
    </section>
  );
}
function GoalForm({
  goal,
  parent,
  initialCategory,
  data,
  busy,
  save,
}: {
  goal: Goal | null;
  parent: Goal | null;
  initialCategory: string;
  data: GoalData;
  busy: boolean;
  save: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [category, setCategory] = useState(
      goal?.categoryId || parent?.categoryId || initialCategory,
    ),
    [parentId, setParentId] = useState(goal?.parentId || parent?.id || "");
  const [hours, setHours] = useState(
    goal?.estimatedMinutes
      ? String(goal.estimatedMinutes / 60)
      : parent?.estimatedMinutes
        ? String(parent.estimatedMinutes / 60)
        : "",
  );
  const [children, setChildren] = useState<
    {
      key: number;
      title: string;
      hours: string | null;
      reason: string;
      categoryId: string;
      progress: number;
    }[]
  >([]);
  function patchChild(key: number, patch: Partial<(typeof children)[number]>) {
    setChildren((rows) =>
      rows.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  }
  const forbidden = new Set(goal ? [goal.id] : []);
  let changed = true;
  while (changed) {
    changed = false;
    for (const g of data.goals)
      if (g.parentId && forbidden.has(g.parentId) && !forbidden.has(g.id)) {
        forbidden.add(g.id);
        changed = true;
      }
  }
  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void save({
          action: "save",
          ...(goal ? { id: goal.id, version: goal.version } : {}),
          title: f.get("title"),
          reason: f.get("reason"),
          categoryId: category,
          parentId: parentId || null,
          status: f.get("status"),
          progress: Number(f.get("progress")),
          estimatedMinutes: hours ? Math.round(Number(hours) * 60) : null,
          subgoals: children
            .filter((c) => c.title.trim())
            .map((c) => ({
              title: c.title,
              ...(c.reason.trim() ? { reason: c.reason } : {}),
              ...(c.categoryId ? { categoryId: c.categoryId } : {}),
              progress: c.progress,
              estimatedMinutes:
                (c.hours ?? hours)
                  ? Math.round(Number(c.hours ?? hours) * 60)
                  : null,
            })),
        });
      }}
    >
      <label className="field">
        Goal
        <input
          name="title"
          defaultValue={goal?.title}
          required
          maxLength={240}
          autoFocus
        />
      </label>
      <label className="field">
        Why does this goal matter?
        <textarea
          name="reason"
          defaultValue={goal?.reason || parent?.reason}
          required
          maxLength={20000}
          rows={3}
        />
      </label>
      <label className="field">
        Category / subcategory
        <select
          required
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
          }}
        >
          <option value="">Choose category</option>
          {data.categories
            .filter((c) => c.isActive && !c.archivedAt)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.parentId
                  ? `${data.categories.find((p) => p.id === c.parentId)?.name} / `
                  : ""}
                {c.name}
              </option>
            ))}
        </select>
      </label>
      <label className="field">
        Parent goal
        <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">None — top-level goal</option>
          {data.goals
            .filter((g) => !g.archivedAt && !forbidden.has(g.id))
            .map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
        </select>
      </label>
      <div className="goal-form-row">
        <label className="field">
          Status
          <select name="status" defaultValue={goal?.status || "NOT_STARTED"}>
            <option value="NOT_STARTED">Not started</option>
            <option value="STARTED">Started</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </label>
        <label className="field">
          Progress (%)
          <input
            name="progress"
            type="number"
            min={0}
            max={100}
            defaultValue={goal?.progress || 0}
            required
          />
        </label>
        <label className="field">
          Estimated hours
          <input
            name="hours"
            type="number"
            min={0.1}
            max={166666}
            step={0.1}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
        </label>
      </div>
      <section className="inline-subgoals">
        <h3>Subgoals</h3>
        {goal &&
          data.goals
            .filter((g) => g.parentId === goal.id && !g.archivedAt)
            .map((g) => (
              <div className="subgoal-existing" key={g.id}>
                <span
                  aria-label={g.progress === 100 ? "Completed" : "Incomplete"}
                >
                  {g.progress === 100 ? "✓" : "○"}
                </span>
                <span>{g.title}</span>
                <small>
                  {g.progress}% ·{" "}
                  {g.estimatedMinutes
                    ? `${g.estimatedMinutes / 60}h`
                    : "No estimate"}
                </small>
              </div>
            ))}
        {children.map((c, i) => (
          <div className="subgoal-draft" key={c.key}>
            <div className="subgoal-draft-row">
              <span aria-hidden="true">○</span>
              <input
                aria-label={`Subgoal ${i + 1} name`}
                placeholder="Subgoal name"
                value={c.title}
                maxLength={240}
                required
                onChange={(e) => patchChild(c.key, { title: e.target.value })}
              />
              <label className="subgoal-hours">
                <input
                  aria-label={`Subgoal ${i + 1} estimated hours`}
                  type="number"
                  min={0.1}
                  max={166666}
                  step={0.1}
                  value={c.hours ?? hours}
                  onChange={(e) => patchChild(c.key, { hours: e.target.value })}
                />
                h
              </label>
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove subgoal ${i + 1}`}
                onClick={() =>
                  setChildren((rows) => rows.filter((r) => r.key !== c.key))
                }
              >
                ×
              </button>
            </div>
            <details>
              <summary>Customize · {c.progress}%</summary>
              <label className="field">
                Reason (inherits parent when empty)
                <textarea
                  value={c.reason}
                  maxLength={20000}
                  onChange={(e) =>
                    patchChild(c.key, { reason: e.target.value })
                  }
                />
              </label>
              <label className="field">
                Category
                <select
                  value={c.categoryId}
                  onChange={(e) =>
                    patchChild(c.key, { categoryId: e.target.value })
                  }
                >
                  <option value="">Same as parent</option>
                  {data.categories
                    .filter((c) => c.isActive && !c.archivedAt)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="field">
                Progress (%)
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={c.progress}
                  onChange={(e) =>
                    patchChild(c.key, { progress: Number(e.target.value) })
                  }
                />
              </label>
            </details>
          </div>
        ))}
        <button
          className="inline-add-task"
          type="button"
          disabled={busy || children.length >= 50}
          onClick={() =>
            setChildren((rows) => [
              ...rows,
              {
                key: Math.max(0, ...rows.map((r) => r.key)) + 1,
                title: "",
                hours: null,
                reason: "",
                categoryId: "",
                progress: 0,
              },
            ])
          }
        >
          <Plus size={16} />
          Add subgoal
        </button>
      </section>
      <button className="button primary" disabled={busy}>
        {busy ? "Saving…" : "Save goal"}
      </button>
    </form>
  );
}
function GoalTasks({
  detail,
  busy,
  act,
  onOpenTask,
}: {
  detail: Detail;
  busy: boolean;
  act: (body: Record<string, unknown>) => Promise<boolean>;
  onOpenTask?: (id: string) => void;
}) {
  const [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [results, setResults] = useState<GoalTask[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setResults([]);
    if (query.trim()) {
      const timer = setTimeout(
        () =>
          read<{ tasks: GoalTask[] }>(
            `/api/goals?search=${encodeURIComponent(query)}`,
          )
            .then((d) => {
              if (live) setResults(d.tasks);
            })
            .catch((e) => {
              if (live) setError(e.message);
            }),
        250,
      );
      return () => {
        live = false;
        clearTimeout(timer);
      };
    }
    return () => {
      live = false;
    };
  }, [query]);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  function group(t: GoalTask) {
    return t.status === "COMPLETED"
      ? "completed"
      : t.status === "CANCELLED"
        ? "cancelled"
        : (
              t.dueAt
                ? new Date(t.dueAt) < new Date()
                : t.plannedDate && t.plannedDate.slice(0, 10) < today
            )
          ? "overdue"
          : "pending";
  }
  return (
    <section className="subsection">
      <h3>Related tasks</h3>
      <div className="tabs">
        {["all", "pending", "overdue", "completed", "cancelled"].map((f) => (
          <button
            key={f}
            className={filter === f ? "active" : ""}
            onClick={() => setFilter(f)}
          >
            {f[0].toUpperCase() + f.slice(1)} (
            {
              detail.tasks.filter(
                ({ task }) => f === "all" || group(task) === f,
              ).length
            }
            )
          </button>
        ))}
      </div>
      {detail.tasks
        .filter(({ task }) => filter === "all" || group(task) === filter)
        .sort((a, b) =>
          (a.task.plannedDate || "9999").localeCompare(
            b.task.plannedDate || "9999",
          ),
        )
        .map(({ task }) => (
          <div className="goal-task-row" key={task.id}>
            <button
              className="text-button"
              onClick={() =>
                onOpenTask
                  ? onOpenTask(task.id)
                  : window.location.assign(`/?view=tasks&task=${task.id}`)
              }
            >
              {task.title}
            </button>
            <small>
              {group(task)}
              {task.archivedAt ? " · Archived" : ""}
            </small>
            {!detail.archivedAt && (
              <button
                disabled={busy}
                className="text-button"
                onClick={() =>
                  void act({ action: "unlink", id: detail.id, taskId: task.id })
                }
              >
                Unlink
              </button>
            )}
          </div>
        ))}
      {!detail.archivedAt && (
        <details>
          <summary>Link a task</summary>
          <input
            aria-label="Find task to link"
            placeholder="Search task names…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setError("");
            }}
          />
          {results
            .filter((t) => !detail.tasks.some((l) => l.task.id === t.id))
            .map((t) => (
              <button
                className="goal-subgoal-link"
                key={t.id}
                disabled={busy}
                onClick={async () => {
                  if (
                    await act({ action: "link", id: detail.id, taskId: t.id })
                  )
                    setQuery("");
                }}
              >
                {t.title}
                <small>{t.plannedDate?.slice(0, 10) || "Unscheduled"}</small>
              </button>
            ))}
          {error && <p role="alert">{error}</p>}
        </details>
      )}
    </section>
  );
}
export function TaskGoals({
  taskId,
  showEditor = true,
}: {
  taskId: string;
  showEditor?: boolean;
}) {
  const [data, setData] = useState<GoalData | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);

  const refresh = useCallback(
    async () => setData(await read<GoalData>(`/api/goals?taskId=${taskId}`)),
    [taskId],
  );
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, [refresh]);
  async function link(id: string, remove = false) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await write({ action: remove ? "unlink" : "link", id, taskId });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not link goal.");
    } finally {
      setBusy(false);
    }
  }
  if (!showEditor && !data?.links.length && !error) return null;
  return (
    <section className="subsection">
      <h3>Goals</h3>
      {data?.links.map((l) => {
        const g = data.goals.find((g) => g.id === l.goalId);
        return (
          <div className="goal-task-row" key={l.goalId}>
            <span>
              {g?.title}
              {g?.archivedAt ? " · Archived" : ""}
            </span>
            {!g?.archivedAt && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() => void link(l.goalId, true)}
              >
                Unlink
              </button>
            )}
          </div>
        );
      })}
      {showEditor && (
        <select
          aria-label="Link to goal"
          value=""
          disabled={busy || !data}
          onChange={(e) => {
            if (e.target.value) void link(e.target.value);
          }}
        >
          <option value="">Link a goal…</option>
          {data?.goals
            .filter(
              (g) =>
                !g.archivedAt && !data.links.some((l) => l.goalId === g.id),
            )
            .map((g) => (
              <option value={g.id} key={g.id}>
                {g.title}
              </option>
            ))}
        </select>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
