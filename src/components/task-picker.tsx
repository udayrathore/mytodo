"use client";
import { useEffect, useState } from "react";
import type { Task } from "@/lib/workspace";
import { groupTasks } from "@/lib/task-groups";
import { human } from "./ui";
export function TaskPicker({
  tasks,
  name = "targetId",
  required = false,
  empty = "Choose a task",
  label = "Task",
  onChange,
  categoryId,
  excludeIds = [],
}: {
  tasks: Task[];
  categoryId?: string;
  excludeIds?: string[];
  name?: string;
  required?: boolean;
  empty?: string;
  label?: string;
  onChange?: (id: string) => void;
}) {
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [remote, setRemote] = useState<Task[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError("");
    setRemote([]);
    setCursor(null);
    setSelected("");
    const timer = setTimeout(() => {
      const q = new URLSearchParams({
        view: "picker",
        search,
        ...(categoryId ? { category: categoryId } : {}),
      });
      fetch(`/api/workspace?${q}`, { signal: controller.signal })
        .then(async (r) => {
          if (!r.ok) throw new Error("Could not load tasks.");
          return r.json();
        })
        .then((d) => {
          setRemote(d.tasks);
          setCursor(d.page?.nextCursor || null);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setBusy(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, categoryId]);
  const candidates = [
    ...new Map(
      [...(search ? [] : tasks), ...remote].map((t) => [t.id, t]),
    ).values(),
  ].filter(
    (t) =>
      !excludeIds.includes(t.id) &&
      (!categoryId || t.primaryCategoryId === categoryId),
  );
  const groups = groupTasks(candidates);
  async function more() {
    if (!cursor || busy) return;
    setBusy(true);
    try {
      const q = new URLSearchParams({
        view: "picker",
        search,
        cursor,
        ...(categoryId ? { category: categoryId } : {}),
      });
      const r = await fetch(`/api/workspace?${q}`);
      if (!r.ok) throw new Error("Could not load more tasks.");
      const d = await r.json();
      setRemote((old) => [...old, ...d.tasks]);
      setCursor(d.page?.nextCursor || null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const group = groups.find((g) => g.key === selected);
  const repeating = !!group?.occurrences[0].seriesId;
  return (
    <div className="form-stack">
      <label className="field">
        Search tasks
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            onChange?.("");
          }}
        />
      </label>
      {error && <p role="alert">{error}</p>}

      <label className="field">
        {label}
        <select
          required={required}
          value={group ? selected : ""}
          onChange={(e) => {
            setSelected(e.target.value);
            const next = groups.find((g) => g.key === e.target.value);
            onChange?.(
              next && !next.occurrences[0].seriesId
                ? next.occurrences[0].id
                : "",
            );
          }}
        >
          <option value="">{empty}</option>
          {groups.map((g) => (
            <option key={g.key} value={g.key}>
              {g.occurrences[0].title}
              {g.occurrences[0].seriesId ? " · Repeating" : ""}
            </option>
          ))}
        </select>
      </label>
      {cursor && (
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={more}
        >
          Load more choices
        </button>
      )}
      {!repeating && group && (
        <input type="hidden" name={name} value={group.occurrences[0].id} />
      )}
      {repeating && (
        <label className="field">
          Which date?
          <select
            key={selected}
            name={name}
            required
            defaultValue=""
            onChange={(e) => onChange?.(e.target.value)}
          >
            <option value="">Choose an occurrence</option>
            {group.occurrences.map((t) => (
              <option key={t.id} value={t.id}>
                {t.plannedDate?.slice(0, 10) || "Unscheduled"} ·{" "}
                {human(t.status)}
                {t.title !== group.occurrences[0].title ? ` · ${t.title}` : ""}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
