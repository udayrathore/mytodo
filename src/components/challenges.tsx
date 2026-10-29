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
  ChevronLeft,
  ChevronRight,
  AlignLeft,
  Archive,
  Trash2,
  Target,
} from "lucide-react";
import { Drawer } from "./ui";
import { HierarchyCreateForm } from "./hierarchy-create-form";
type Challenge = {
  coreLearning: string;
  id: string;
  title: string;
  reason: string;
  categoryId: string;
  parentId: string | null;
  goalId: string | null;
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
type ChallengeData = {
  challenges: Challenge[];
  categories: Category[];
  goals: { id: string; title: string; archivedAt: string | null }[];
  links: { challengeId: string }[];
};
type ChallengeTask = {
  id: string;
  title: string;
  status: string;
  plannedDate: string | null;
  dueAt: string | null;
  completedAt: string | null;
  archivedAt: string | null;
};
type Detail = Challenge & {
  nextCommentsCursor: string | null;
  comments: {
    id: string;
    body: string;
    createdAt: string;
    kind: string;
    journal: { id: string; title: string | null; content: string } | null;
  }[];
  tasks: { task: ChallengeTask }[];
};
async function read<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  const d = await r.json();
  if (!r.ok) throw Error(d.error || "Could not load.");
  return d;
}
async function write(body: Record<string, unknown>) {
  const r = await fetch("/api/challenges", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw Error(d.error || "Could not save.");
  return d;
}
export function Challenges({
  onOpenTask,
}: {
  onOpenTask?: (id: string) => void;
}) {
  const [data, setData] = useState<ChallengeData | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [archive, setArchive] = useState(false),
    [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null),
    [detail, setDetail] = useState<Detail | null>(null),
    [creating, setCreating] = useState(false),
    [parent, setParent] = useState<Challenge | null>(null),
    [category, setCategory] = useState(""),
    [drag, setDrag] = useState<string | null>(null),
    [over, setOver] = useState<string | null>(null);
  const mutationBusy = useRef(false);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const boardRef = useRef<HTMLDivElement>(null);
  const refresh = useCallback(async () => {
    setData(await read<ChallengeData>("/api/challenges"));
  }, []);
  useEffect(() => {
    let live = true;
    read<ChallengeData>("/api/challenges")
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
      read<{ challenge: Detail }>(`/api/challenges?id=${selected}`)
        .then((d) => {
          if (live) setDetail(d.challenge);
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    return () => {
      live = false;
    };
  }, [selected]);
  async function olderComments() {
    if (!detail?.nextCommentsCursor || mutationBusy.current) return;
    mutationBusy.current = true;
    setBusy(true);
    const id = detail.id;
    try {
      const next = await read<{ challenge: Detail }>(
        `/api/challenges?id=${id}&commentsCursor=${detail.nextCommentsCursor}`,
      );
      setDetail((old) =>
        old?.id === id
          ? {
              ...old,
              comments: [...old.comments, ...next.challenge.comments],
              nextCommentsCursor: next.challenge.nextCommentsCursor,
            }
          : old,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load comments.");
    } finally {
      mutationBusy.current = false;
      setBusy(false);
    }
  }
  async function act(body: Record<string, unknown>) {
    if (mutationBusy.current) return false;
    mutationBusy.current = true;
    setBusy(true);
    setError("");
    try {
      const acknowledgement = await write(body);
      let expectedVersion =
        detail?.id === selected ? detail.version : undefined;
      if (
        selected &&
        selectedRef.current === selected &&
        acknowledgement.result?.id === selected &&
        acknowledgement.result?.title
      ) {
        expectedVersion = acknowledgement.result.version;
        setDetail((previous) =>
          previous?.id === selected
            ? { ...previous, ...acknowledgement.result }
            : previous,
        );
      } else if (
        selected &&
        selectedRef.current === selected &&
        body.id === selected &&
        (body.action === "archive" || body.action === "restore")
      ) {
        expectedVersion = detail ? detail.version + 1 : undefined;
        setDetail((previous) =>
          previous?.id === selected
            ? {
                ...previous,
                version: previous.version + 1,
                archivedAt:
                  body.action === "archive" ? new Date().toISOString() : null,
              }
            : previous,
        );
      }
      try {
        await Promise.all([
          refresh(),
          selected && body.action !== "delete"
            ? read<{ challenge: Detail }>(
                `/api/challenges?id=${selected}`,
              ).then((next) => {
                if (selectedRef.current !== selected) return;
                if (
                  expectedVersion !== undefined &&
                  next.challenge.version > expectedVersion
                ) {
                  setError(
                    "Saved. This challenge changed elsewhere; reopen it before editing again. Your draft is kept here.",
                  );
                  return;
                }
                setDetail((previous) =>
                  previous?.id === selected ? next.challenge : previous,
                );
              })
            : Promise.resolve(),
        ]);
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
      mutationBusy.current = false;
      setBusy(false);
    }
  }
  if (!data) return <p role="status">{error || "Loading challenges…"}</p>;
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
  const visible = data.challenges.filter(
    (g) => Boolean(g.archivedAt) === archive,
  );
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
      p = data.challenges.find((x) => x.id === p)?.parentId ?? null;
    }
  }
  function challengeCard(g: Challenge): React.ReactNode {
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
            const from = data!.challenges.find((x) => x.id === drag);
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
          </button>
        </article>
      </div>
    );
  }
  return (
    <section className="goals-module">
      <div className="section-toolbar">
        <h2>Challenges</h2>
        <input
          aria-label="Search challenges"
          placeholder="Search challenges…"
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
            setCreating(true);
          }}
        >
          <Plus size={16} />
          New challenge
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
        aria-label="Challenge category lanes"
        tabIndex={0}
      >
        {data.categories
          .filter((c) =>
            visible.some(
              (g) =>
                (!g.parentId ||
                  !data.challenges.some(
                    (parent) => parent.id === g.parentId,
                  )) &&
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
                          !data.challenges.some(
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
                      !data.challenges.some(
                        (parent) => parent.id === g.parentId,
                      )) &&
                    matches.has(g.id),
                )
                .map((g) => challengeCard(g))}
              {!archive && c.isActive && !c.archivedAt && (
                <button
                  className="inline-add-task"
                  onClick={() => {
                    setParent(null);
                    setCategory(c.id);
                    setCreating(true);
                  }}
                >
                  <Plus size={16} />
                  Add challenge
                </button>
              )}
            </section>
          ))}
      </div>
      {selected && (
        <Drawer
          popup
          title="Challenge details"
          onClose={() => {
            if (!mutationBusy.current) {
              setSelected(null);
              setDetail(null);
            }
          }}
        >
          {detail ? (
            <ChallengeEditor
              key={detail.id}
              detail={detail}
              data={data}
              busy={busy}
              error={error}
              act={act}
              olderComments={olderComments}
              onOpenTask={onOpenTask}
              onOpenChild={(id) => {
                setError("");
                setSelected(id);
              }}
              onAddChild={() => {
                setError("");
                setParent(detail);
                setCategory(detail.categoryId);
                setCreating(true);
              }}
              onDeleted={() => {
                setSelected(null);
                setDetail(null);
              }}
            />
          ) : (
            <p>{error || "Loading challenge…"}</p>
          )}
        </Drawer>
      )}
      {creating && (
        <Drawer
          popup
          title={parent ? "New sub-challenge" : "New challenge"}
          onClose={() => {
            if (!mutationBusy.current) {
              setCreating(false);
              setParent(null);
            }
          }}
        >
          <HierarchyCreateForm
            key={`new-${parent?.id || "root"}-${category}`}
            kind="challenge"
            parent={parent}
            initialCategory={category}
            categories={data.categories}
            busy={busy}
            save={async (body) => {
              const saved = await act(body);
              if (saved) {
                setCreating(false);
                setParent(null);
              }
              return saved;
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

function ChallengeSetting({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <details className="task-edit-setting hierarchy-extra">
      <summary>
        {title}
        <span aria-hidden="true">+</span>
      </summary>
      <div className="task-edit-options">{children}</div>
    </details>
  );
}

function ChallengeEditor({
  detail,
  data,
  busy,
  error,
  act,
  olderComments,
  onOpenTask,
  onOpenChild,
  onAddChild,
  onDeleted,
}: {
  detail: Detail;
  data: ChallengeData;
  busy: boolean;
  error: string;
  act: (body: Record<string, unknown>) => Promise<boolean>;
  olderComments: () => Promise<void>;
  onOpenTask?: (id: string) => void;
  onOpenChild: (id: string) => void;
  onAddChild: () => void;
  onDeleted: () => void;
}) {
  const formId = useId();
  const [title, setTitle] = useState(detail.title);
  const [reason, setReason] = useState(detail.reason);
  const [categoryId, setCategoryId] = useState(detail.categoryId);
  const [parentId, setParentId] = useState(detail.parentId || "");
  const [goalId, setGoalId] = useState(detail.goalId || "");
  const [coreLearning, setCoreLearning] = useState(detail.coreLearning || "");
  const [adding, setAdding] = useState<"task" | "log" | "journal" | null>(null);
  const forbidden = new Set([detail.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of data.challenges)
      if (
        item.parentId &&
        forbidden.has(item.parentId) &&
        !forbidden.has(item.id)
      ) {
        forbidden.add(item.id);
        changed = true;
      }
  }
  const locked = busy || !!detail.archivedAt;
  const children = data.challenges.filter(
    (item) => item.parentId === detail.id,
  );
  return (
    <div
      className="hierarchy-detail-screen task-detail-screen"
      aria-busy={busy}
    >
      {error && (
        <p className="form-error task-edit-error" role="alert">
          {error}
        </p>
      )}
      <div className="task-edit-layout">
        <form
          id={formId}
          aria-label="Edit challenge"
          onSubmit={(event) => {
            event.preventDefault();
            if (!locked)
              void act({
                action: "save",
                id: detail.id,
                version: detail.version,
                title,
                reason,
                coreLearning,
                categoryId,
                parentId: parentId || null,
                goalId: goalId || null,
                subchallenges: [],
              });
          }}
        />
        <section className="task-edit-main" aria-label="Challenge content">
          <fieldset className="task-edit-content-fields" disabled={locked}>
            <div className="task-edit-title-row hierarchy-title-row">
              <Target
                className="hierarchy-title-icon"
                size={20}
                aria-hidden="true"
              />
              <input
                form={formId}
                className="task-edit-title"
                aria-label="Challenge name"
                name="title"
                required
                maxLength={240}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <label className="task-edit-description-label hierarchy-reason">
              <AlignLeft size={16} aria-hidden="true" />
              <textarea
                form={formId}
                className="task-edit-description"
                aria-label="Reason"
                name="reason"
                placeholder="Why does this challenge matter?"
                required
                maxLength={20000}
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
          </fieldset>
          <section className="hierarchy-children" aria-label="Sub-challenges">
            {children.length > 0 && (
              <h3>
                Sub-challenges <small>{children.length}</small>
              </h3>
            )}
            {children.map((child) => (
              <button
                className="goal-subgoal-link hierarchy-child-link"
                key={child.id}
                type="button"
                disabled={busy}
                onClick={() => onOpenChild(child.id)}
              >
                <span>{child.title}</span>
                <small>{child.archivedAt ? "Archived" : ""}</small>
              </button>
            ))}
            {!detail.archivedAt && (
              <button
                type="button"
                className="inline-add-task"
                disabled={busy}
                onClick={onAddChild}
              >
                <Plus size={16} />
                Add sub-challenge
              </button>
            )}
          </section>
        </section>
        <aside className="task-edit-sidebar" aria-label="Challenge settings">
          <fieldset className="task-edit-setting-fields" disabled={locked}>
            <label className="field task-edit-setting">
              <span>Category</span>
              <select
                form={formId}
                aria-label="Category"
                required
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
              >
                {data.categories
                  .filter(
                    (item) =>
                      (item.isActive && !item.archivedAt) ||
                      item.id === categoryId,
                  )
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.parentId &&
                      data.categories.find(
                        (parent) => parent.id === item.parentId,
                      )?.name
                        ? data.categories.find(
                            (parent) => parent.id === item.parentId,
                          )!.name + " / "
                        : ""}
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field task-edit-setting">
              <span>Parent challenge</span>
              <select
                form={formId}
                aria-label="Parent challenge"
                value={parentId}
                onChange={(event) => setParentId(event.target.value)}
              >
                <option value="">None — top-level challenge</option>
                {data.challenges
                  .filter((item) => !item.archivedAt && !forbidden.has(item.id))
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field task-edit-setting">
              <span>Related goal</span>
              <select
                form={formId}
                aria-label="Related goal"
                value={goalId}
                onChange={(event) => setGoalId(event.target.value)}
              >
                <option value="">None</option>
                {data.goals
                  .filter((item) => !item.archivedAt || item.id === goalId)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                      {item.archivedAt ? " (Archived)" : ""}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field task-edit-setting">
              <span>Core learning</span>
              <textarea
                form={formId}
                aria-label="Core learning"
                name="coreLearning"
                rows={4}
                maxLength={20000}
                value={coreLearning}
                onChange={(event) => setCoreLearning(event.target.value)}
                placeholder="What have you learned?"
              />
            </label>
            <button
              className="button primary task-edit-save"
              type="submit"
              form={formId}
              disabled={locked}
            >
              {busy ? "Saving…" : "Save changes"}
            </button>
          </fieldset>
          <fieldset className="task-edit-auxiliary" disabled={busy}>
            <ChallengeSetting
              title={`Related tasks${detail.tasks.length ? ` · ${detail.tasks.length}` : ""}`}
            >
              {!detail.archivedAt && adding !== "task" && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setAdding("task")}
                >
                  Link a task
                </button>
              )}
              <ChallengeTasks
                detail={detail}
                busy={busy}
                act={act}
                onOpenTask={onOpenTask}
                linking={adding === "task"}
                onDone={() => setAdding(null)}
              />
            </ChallengeSetting>
            <ChallengeSetting
              title={`Logs & learning${detail.comments.length ? ` · ${detail.comments.length}` : ""}`}
            >
              {!detail.archivedAt &&
                !["log", "journal"].includes(adding || "") && (
                  <div className="goal-actions">
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setAdding("log")}
                    >
                      Add a log
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setAdding("journal")}
                    >
                      Link a journal
                    </button>
                  </div>
                )}
              <ChallengeLogs
                key={`${detail.id}-${adding}`}
                detail={detail}
                busy={busy}
                act={act}
                olderComments={olderComments}
                mode={adding === "log" || adding === "journal" ? adding : null}
                onDone={() => setAdding(null)}
              />
            </ChallengeSetting>
            <div className="hierarchy-record-actions">
              <button
                type="button"
                className="text-button task-edit-archive"
                disabled={busy}
                onClick={() => {
                  if (
                    detail.archivedAt ||
                    window.confirm(
                      "Archive this challenge and its subchallenges?",
                    )
                  )
                    void act({
                      action: detail.archivedAt ? "restore" : "archive",
                      id: detail.id,
                      version: detail.version,
                    });
                }}
              >
                <Archive size={15} />
                {detail.archivedAt ? "Restore" : "Archive"}
              </button>
              <button
                type="button"
                className="text-button danger hierarchy-delete"
                disabled={busy}
                onClick={async () => {
                  if (
                    window.confirm(
                      "Permanently delete this challenge, its subchallenges and comments? Linked tasks will be kept.",
                    )
                  ) {
                    if (
                      await act({
                        action: "delete",
                        id: detail.id,
                        version: detail.version,
                      })
                    )
                      onDeleted();
                  }
                }}
              >
                <Trash2 size={15} />
                Delete
              </button>
            </div>
          </fieldset>
        </aside>
      </div>
    </div>
  );
}

function ChallengeTasks({
  detail,
  busy,
  act,
  onOpenTask,
  linking,
  onDone,
}: {
  linking: boolean;
  onDone: () => void;
  detail: Detail;
  busy: boolean;
  act: (body: Record<string, unknown>) => Promise<boolean>;
  onOpenTask?: (id: string) => void;
}) {
  const [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [results, setResults] = useState<ChallengeTask[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setResults([]);
    if (query.trim()) {
      const timer = setTimeout(
        () =>
          read<{ tasks: ChallengeTask[] }>(
            `/api/challenges?search=${encodeURIComponent(query)}`,
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
  function group(t: ChallengeTask) {
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
  if (!detail.tasks.length && !linking) return null;
  return (
    <section className="subsection">
      {detail.tasks.length > 0 && (
        <div className="section-toolbar">
          <h3>Related tasks</h3>
          <select
            aria-label="Filter related tasks"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            {["all", "pending", "overdue", "completed", "cancelled"].map(
              (f) => (
                <option key={f} value={f}>
                  {f[0].toUpperCase() + f.slice(1)} (
                  {
                    detail.tasks.filter(
                      ({ task }) => f === "all" || group(task) === f,
                    ).length
                  }
                  )
                </option>
              ),
            )}
          </select>
        </div>
      )}
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
      {!detail.archivedAt && linking && (
        <div className="form-stack">
          <div className="section-toolbar">
            <h3>Link a task</h3>
            <button className="text-button" onClick={onDone}>
              Cancel
            </button>
          </div>
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
                  ) {
                    setQuery("");
                    onDone();
                  }
                }}
              >
                {t.title}
                <small>{t.plannedDate?.slice(0, 10) || "Unscheduled"}</small>
              </button>
            ))}
          {error && <p role="alert">{error}</p>}
        </div>
      )}
    </section>
  );
}
export function TaskChallenges({
  taskId,
  showEditor = true,
}: {
  taskId: string;
  showEditor?: boolean;
}) {
  const [data, setData] = useState<ChallengeData | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = useCallback(
    async () =>
      setData(await read<ChallengeData>(`/api/challenges?taskId=${taskId}`)),
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
      setError(e instanceof Error ? e.message : "Could not link challenge.");
    } finally {
      setBusy(false);
    }
  }
  if (!showEditor && !data?.links.length && !error) return null;
  return (
    <section className="subsection">
      <h3>Challenges</h3>
      {data?.links.map((l) => {
        const g = data.challenges.find((g) => g.id === l.challengeId);
        return (
          <div className="goal-task-row" key={l.challengeId}>
            <span>
              {g?.title}
              {g?.archivedAt ? " · Archived" : ""}
            </span>
            {!g?.archivedAt && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() => void link(l.challengeId, true)}
              >
                Unlink
              </button>
            )}
          </div>
        );
      })}
      {showEditor && (
        <select
          aria-label="Link to challenge"
          value=""
          disabled={busy || !data}
          onChange={(e) => {
            if (e.target.value) void link(e.target.value);
          }}
        >
          <option value="">Link a challenge…</option>
          {data?.challenges
            .filter(
              (g) =>
                !g.archivedAt &&
                !data.links.some((l) => l.challengeId === g.id),
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

function ChallengeLogs({
  detail,
  busy,
  act,
  mode,
  onDone,
  olderComments,
}: {
  olderComments: () => Promise<void>;
  mode: "log" | "journal" | null;
  onDone: () => void;
  detail: Detail;
  busy: boolean;
  act: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [query, setQuery] = useState(""),
    [journals, setJournals] = useState<{ id: string; title: string | null }[]>(
      [],
    ),
    [journal, setJournal] = useState<{
      id: string;
      title: string | null;
    } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (!mode) return;
    let live = true;
    const timer = setTimeout(
      () =>
        read<{ journals: { id: string; title: string | null }[] }>(
          `/api/challenges?journalSearch=${encodeURIComponent(query)}`,
        )
          .then((d) => {
            if (live) setJournals(d.journals);
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
  }, [query, mode]);
  if (!mode && !detail.comments.length) return null;
  return (
    <section className="subsection">
      <h3>{mode === "journal" ? "Link a journal" : "Logs"}</h3>
      {!detail.archivedAt && mode && (
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
                body:
                  f.get("body") ||
                  (journal
                    ? `Linked journal: ${journal.title || "Untitled"}`
                    : ""),
                kind: f.get("kind"),
                journalId: journal?.id || null,
              })
            ) {
              form.reset();
              setJournal(null);
              setQuery("");
              onDone();
            }
          }}
        >
          <label className="field">
            Type
            <select name="kind">
              <option value="CHECK_IN">Check-in</option>
              <option value="COMMENT">Comment</option>
              <option value="UPDATE">Update</option>
              <option value="LEARNING">Core learning</option>
            </select>
          </label>
          <textarea
            name="body"
            aria-label="Log entry"
            placeholder={
              mode === "journal"
                ? "Note (optional)…"
                : "Record a check-in, update or learning…"
            }
            required={mode !== "journal"}
            maxLength={20000}
            rows={3}
          />
          <details open={mode === "journal" ? true : undefined}>
            <summary>
              {journal
                ? `Journal: ${journal.title || "Untitled"}`
                : "Link a journal (optional)"}
            </summary>
            <input
              aria-label="Search journals"
              placeholder="Search journals…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {journal && (
              <button
                type="button"
                className="text-button"
                onClick={() => setJournal(null)}
              >
                Remove link
              </button>
            )}
            {journals.map((j) => (
              <button
                type="button"
                className="goal-subgoal-link"
                key={j.id}
                onClick={() => setJournal(j)}
              >
                {j.title || "Untitled"}
                {journal?.id === j.id ? " ✓" : ""}
              </button>
            ))}
          </details>
          <div className="goal-actions">
            <button
              className="button"
              disabled={busy || (mode === "journal" && !journal)}
            >
              {mode === "journal" ? "Link journal" : "Post log"}
            </button>
            <button className="text-button" type="button" onClick={onDone}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
      {detail.comments.map((c) => (
        <article className="goal-comment" key={c.id}>
          <small>
            {c.kind.replaceAll("_", " ").toLowerCase()} ·{" "}
            {new Date(c.createdAt).toLocaleString()}
          </small>
          <p>{c.body}</p>
          {c.journal && (
            <details>
              <summary>Journal · {c.journal.title || "Untitled"}</summary>
              <p style={{ whiteSpace: "pre-wrap" }}>{c.journal.content}</p>
            </details>
          )}
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
    </section>
  );
}
