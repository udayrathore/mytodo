"use client";
import {
  useEffect,
  useState,
  useCallback,
  useRef,
  useId,
  type ReactNode,
} from "react";
import {
  Plus,
  AlignLeft,
  Target,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Drawer } from "./ui";
import { HierarchyCreateForm } from "./hierarchy-create-form";
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
    [editing, setEditing] = useState<"new" | null>(null),
    [parent, setParent] = useState<Goal | null>(null),
    [category, setCategory] = useState(""),
    [drag, setDrag] = useState<string | null>(null),
    [over, setOver] = useState<string | null>(null);

  const saving = useRef(false);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
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
    if (!detail?.nextCommentsCursor || busy || saving.current) return;
    saving.current = true;
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
      saving.current = false;
      setBusy(false);
    }
  }
  async function act(body: Record<string, unknown>) {
    if (saving.current || busy) return false;
    saving.current = true;
    setBusy(true);
    setError("");
    const selectedId = selectedRef.current;
    try {
      const committed = await write(body);
      const saved = committed.result as Partial<Detail> | undefined;
      if (selectedId && body.action !== "delete") {
        if (saved?.id === selectedId && typeof saved.version === "number")
          setDetail((old) =>
            old?.id === selectedId ? { ...old, ...saved } : old,
          );
        else if (
          body.id === selectedId &&
          ["archive", "restore"].includes(String(body.action))
        )
          setDetail((old) =>
            old?.id === selectedId
              ? {
                  ...old,
                  archivedAt:
                    body.action === "archive" ? new Date().toISOString() : null,
                  version: old.version + 1,
                }
              : old,
          );
      }
      try {
        await Promise.all([
          refresh(),
          selectedId && body.action !== "delete"
            ? read<{ goal: Detail }>(`/api/goals?id=${selectedId}`).then(
                (next) => {
                  if (selectedRef.current === selectedId)
                    setDetail((old) =>
                      !old || next.goal.version >= old.version
                        ? next.goal
                        : old,
                    );
                },
              )
            : Promise.resolve(),
        ]);
      } catch {
        setError(
          "Saved. Could not reload the view; your editing draft is kept here.",
        );
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
      return false;
    } finally {
      saving.current = false;
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
            disabled={busy}
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
          disabled={busy}
          onClick={() => {
            setError("");
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
                  disabled={busy}
                  onClick={() => {
                    setError("");
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
      {selected && (
        <Drawer
          popup
          title="Goal details"
          onClose={() => {
            if (!busy) {
              setSelected(null);
              setDetail(null);
            }
          }}
        >
          {detail ? (
            <GoalEditor
              key={detail.id}
              goal={detail}
              data={data}
              busy={busy}
              error={error}
              act={act}
              onOpenTask={onOpenTask}
              onOpenChild={(id) => {
                if (!busy) {
                  setError("");
                  setSelected(id);
                }
              }}
              onAddChild={() => {
                setError("");
                setParent(detail);
                setCategory(detail.categoryId);
                setEditing("new");
              }}
              onOlderComments={olderComments}
              onDeleted={() => {
                setSelected(null);
                setDetail(null);
              }}
            />
          ) : (
            <p role="status">{error || "Loading goal…"}</p>
          )}
        </Drawer>
      )}
      {editing && (
        <Drawer
          popup
          title={parent ? "New subgoal" : "New goal"}
          onClose={() => {
            if (!busy) {
              setEditing(null);
              setParent(null);
            }
          }}
        >
          <HierarchyCreateForm
            key={`new-${parent?.id || "root"}-${category}`}
            kind="goal"
            parent={parent}
            initialCategory={category}
            categories={data.categories}
            busy={busy}
            save={async (body) => {
              const ok = await act(body);
              if (ok) {
                setEditing(null);
                setParent(null);
              }
              return ok;
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
type GoalDraft = {
  title: string;
  reason: string;
  categoryId: string;
  parentId: string;
  status: string;
  progress: number;
  hours: string;
};
function goalDraft(goal: Goal): GoalDraft {
  return {
    title: goal.title,
    reason: goal.reason,
    categoryId: goal.categoryId,
    parentId: goal.parentId || "",
    status: goal.status,
    progress: goal.progress,
    hours: goal.estimatedMinutes ? String(goal.estimatedMinutes / 60) : "",
  };
}
function GoalSidebarSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <details className="task-edit-setting hierarchy-sidebar-details">
      <summary>
        {title}
        <span aria-hidden="true">+</span>
      </summary>
      <div className="task-edit-options">{children}</div>
    </details>
  );
}
function GoalEditor({
  goal,
  data,
  busy,
  error,
  act,
  onOpenTask,
  onOpenChild,
  onAddChild,
  onOlderComments,
  onDeleted,
}: {
  goal: Detail;
  data: GoalData;
  busy: boolean;
  error: string;
  act: (body: Record<string, unknown>) => Promise<boolean>;
  onOpenTask?: (id: string) => void;
  onOpenChild: (id: string) => void;
  onAddChild: () => void;
  onOlderComments: () => Promise<void>;
  onDeleted: () => void;
}) {
  const formId = useId();
  const [draft, setDraft] = useState(() => goalDraft(goal));
  const baseline = useRef(goalDraft(goal));
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [conflict, setConflict] = useState(false);
  const submitting = useRef(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const before = baseline.current;
    const next = goalDraft(goal);
    baseline.current = next;
    if (!submitting.current) {
      const previous = draftRef.current;
      const merged = { ...previous };
      let changedDraft = false;
      for (const key of Object.keys(next) as (keyof GoalDraft)[]) {
        if (previous[key] === before[key])
          (merged as Record<string, unknown>)[key] = next[key];
        else if (next[key] !== before[key] && next[key] !== previous[key])
          changedDraft = true;
      }
      if (changedDraft) setConflict(true);
      setDraft(merged);
    }
  }, [goal]);
  function patch(values: Partial<GoalDraft>) {
    setSaved(false);
    setDraft((old) => ({ ...old, ...values }));
  }
  const forbidden = new Set([goal.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const candidate of data.goals)
      if (
        candidate.parentId &&
        forbidden.has(candidate.parentId) &&
        !forbidden.has(candidate.id)
      ) {
        forbidden.add(candidate.id);
        changed = true;
      }
  }
  const children = data.goals.filter(
    (candidate) => candidate.parentId === goal.id,
  );
  const archived = !!goal.archivedAt;
  async function save() {
    if (busy || submitting.current || archived || conflict) return;
    submitting.current = true;
    setSaved(false);
    try {
      const ok = await act({
        action: "save",
        id: goal.id,
        version: goal.version,
        title: draft.title.trim(),
        reason: draft.reason.trim(),
        categoryId: draft.categoryId,
        parentId: draft.parentId || null,
        status: draft.status,
        progress: draft.progress,
        estimatedMinutes: draft.hours
          ? Math.round(Number(draft.hours) * 60)
          : null,
        subgoals: [],
      });
      if (ok) {
        const progress = draft.status === "COMPLETED" ? 100 : draft.progress;
        const normalized = {
          ...draft,
          title: draft.title.trim(),
          reason: draft.reason.trim(),
          progress,
          status:
            progress === 100
              ? "COMPLETED"
              : progress > 0
                ? "STARTED"
                : draft.status,
        };
        baseline.current = normalized;
        setDraft(normalized);
        setSaved(true);
      }
    } finally {
      submitting.current = false;
    }
  }
  return (
    <div className="task-detail-screen hierarchy-detail-screen">
      {(error || conflict) && (
        <p className="form-error task-edit-error" role="alert">
          {error ||
            "This goal changed while you were editing. Your draft is kept here; reopen the goal to load its latest version before saving."}
        </p>
      )}
      <div className="task-edit-layout">
        <form
          id={formId}
          aria-label="Edit goal"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        />
        <section
          className="task-edit-main hierarchy-edit-main"
          aria-label="Goal content"
        >
          <fieldset
            className="task-edit-content-fields"
            disabled={busy || archived}
          >
            <div className="task-edit-title-row">
              <Target
                className="hierarchy-title-icon"
                size={20}
                aria-hidden="true"
              />
              <input
                className="task-edit-title hierarchy-title"
                form={formId}
                name="title"
                aria-label="Goal name"
                value={draft.title}
                onChange={(event) => patch({ title: event.target.value })}
                required
                maxLength={240}
              />
            </div>
            <label className="task-edit-description-label">
              <AlignLeft size={16} aria-hidden="true" />
              <textarea
                className="task-edit-description hierarchy-reason"
                form={formId}
                name="reason"
                aria-label="Goal reason"
                placeholder="Why does this goal matter?"
                value={draft.reason}
                onChange={(event) => patch({ reason: event.target.value })}
                required
                maxLength={20000}
                rows={3}
              />
            </label>
          </fieldset>
          <section
            className="task-checklist hierarchy-children"
            aria-label="Subgoals"
          >
            {children.length > 0 && (
              <h3 className="task-checklist-heading">
                Subgoals{" "}
                <small>
                  {
                    children.filter((child) => child.status === "COMPLETED")
                      .length
                  }
                  /{children.length}
                </small>
              </h3>
            )}
            {children.map((child) => (
              <button
                key={child.id}
                type="button"
                className="goal-subgoal-link hierarchy-child-row"
                disabled={busy}
                onClick={() => onOpenChild(child.id)}
              >
                <span
                  className={child.status === "COMPLETED" ? "is-complete" : ""}
                >
                  {child.title}
                </span>
                <small>
                  {child.progress}%{child.archivedAt ? " · Archived" : ""}
                </small>
              </button>
            ))}
            {!archived && (
              <button
                type="button"
                className="task-checklist-add text-button"
                disabled={busy}
                onClick={onAddChild}
              >
                <Plus size={16} />
                Add subgoal
              </button>
            )}
          </section>
        </section>
        <aside
          className="task-edit-sidebar hierarchy-edit-sidebar"
          aria-label="Goal settings"
        >
          <fieldset
            className="task-edit-setting-fields"
            disabled={busy || archived}
          >
            <label className="field task-edit-setting">
              <span>Category</span>
              <select
                form={formId}
                name="categoryId"
                value={draft.categoryId}
                onChange={(event) => patch({ categoryId: event.target.value })}
                required
              >
                {data.categories
                  .filter(
                    (category) =>
                      (category.isActive && !category.archivedAt) ||
                      category.id === draft.categoryId,
                  )
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {data.categories.find(
                        (parent) => parent.id === category.parentId,
                      )?.name
                        ? data.categories.find(
                            (parent) => parent.id === category.parentId,
                          )?.name + " / "
                        : ""}
                      {category.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field task-edit-setting">
              <span>Parent goal</span>
              <select
                form={formId}
                name="parentId"
                value={draft.parentId}
                onChange={(event) => patch({ parentId: event.target.value })}
              >
                <option value="">None — top-level goal</option>
                {data.goals
                  .filter(
                    (candidate) =>
                      !candidate.archivedAt && !forbidden.has(candidate.id),
                  )
                  .map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.title}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field task-edit-setting">
              <span>Status</span>
              <select
                form={formId}
                name="status"
                value={draft.status}
                onChange={(event) => patch({ status: event.target.value })}
              >
                <option value="NOT_STARTED">Not started</option>
                <option value="STARTED">Started</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </label>
            <label className="field task-edit-setting">
              <span>Progress (%)</span>
              <input
                form={formId}
                name="progress"
                type="number"
                min={0}
                max={100}
                required
                value={draft.progress}
                onChange={(event) =>
                  patch({ progress: Number(event.target.value) })
                }
              />
              <progress
                className="goal-detail-progress"
                value={draft.progress}
                max={100}
                aria-label="Goal progress"
              />
            </label>
            <label className="field task-edit-setting">
              <span>Estimated hours</span>
              <input
                form={formId}
                name="hours"
                type="number"
                min={0.1}
                max={166666}
                step={0.1}
                value={draft.hours}
                onChange={(event) => patch({ hours: event.target.value })}
                placeholder="Optional"
              />
            </label>
            {!archived && (
              <button
                type="submit"
                form={formId}
                className="button primary task-edit-save"
                disabled={busy || conflict}
              >
                {busy ? "Saving…" : "Save changes"}
              </button>
            )}
          </fieldset>
          {saved && (
            <p role="status" className="muted small hierarchy-save-notice">
              Saved.
            </p>
          )}
          <fieldset className="task-edit-auxiliary" disabled={busy}>
            <GoalSidebarSection title="Related tasks">
              <GoalTasks
                detail={goal}
                busy={busy}
                act={act}
                onOpenTask={onOpenTask}
              />
            </GoalSidebarSection>
            <GoalSidebarSection title="Comments & check-ins">
              {!archived && (
                <form
                  className="form-stack"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (busy) return;
                    const form = event.currentTarget,
                      fields = new FormData(form);
                    if (
                      await act({
                        action: "comment",
                        id: goal.id,
                        version: goal.version,
                        body: fields.get("body"),
                        ...(fields.get("progress") !== ""
                          ? { progress: Number(fields.get("progress")) }
                          : {}),
                      })
                    )
                      form.reset();
                  }}
                >
                  <label className="field">
                    <span>Comment or check-in</span>
                    <textarea
                      name="body"
                      aria-label="Comment or check-in"
                      placeholder="Leave a comment or record a check-in…"
                      required
                      maxLength={20000}
                      rows={3}
                    />
                  </label>
                  <label className="field">
                    <span>Progress update (optional)</span>
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
              {goal.comments.map((comment) => (
                <article className="goal-comment" key={comment.id}>
                  <small>
                    {new Date(comment.createdAt).toLocaleString()}
                    {comment.progress !== null
                      ? ` · Check-in: ${comment.progress}%`
                      : ""}
                  </small>
                  <p>{comment.body}</p>
                </article>
              ))}
              {goal.nextCommentsCursor && (
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => void onOlderComments()}
                >
                  Older comments
                </button>
              )}
              {!goal.comments.length && (
                <p className="muted small">No check-ins yet.</p>
              )}
            </GoalSidebarSection>
            <div className="task-edit-setting hierarchy-record-actions">
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  if (
                    archived ||
                    window.confirm("Archive this goal and its subgoals?")
                  )
                    void act({
                      action: archived ? "restore" : "archive",
                      id: goal.id,
                      version: goal.version,
                    });
                }}
              >
                {archived ? "Restore from archive" : "Archive goal"}
              </button>
              <button
                className="text-button danger"
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
                        id: goal.id,
                        version: goal.version,
                      })
                    )
                      onDeleted();
                }}
              >
                Delete goal
              </button>
            </div>
          </fieldset>
        </aside>
      </div>
    </div>
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
