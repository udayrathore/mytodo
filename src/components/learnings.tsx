"use client";
import { useEffect, useState, useRef } from "react";
import dynamic from "next/dynamic";
import { Plus } from "lucide-react";
const LearningEditor = dynamic(() => import("./learning-editor"), {
  ssr: false,
  loading: () => <p>Opening learning…</p>,
});
export type Learning = {
  categoryId: string | null;
  id: string;
  title: string;
  content: string;
  document: Record<string, unknown>;
  coreFinding: string;
  version: number;
  archivedAt: string | null;
  updates: { id: string; kind: string; body: string; createdAt: string }[];
};
export async function learningRequest(
  path: string,
  body?: Record<string, unknown>,
) {
  const r = await fetch("/api/learnings" + path, {
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" }),
  });
  const d = await r.json();
  if (!r.ok) throw Error(d.error || "Could not save.");
  return d;
}
export function Learnings() {
  const [rows, setRows] = useState<
      {
        id: string;
        categoryId: string | null;
        title: string;
        coreFinding: string;
        updatedAt: string;
      }[]
    >([]),
    [search, setSearch] = useState(""),
    [archive, setArchive] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null),
    [loadingMore, setLoadingMore] = useState(false);
  const [categories, setCategories] = useState<
    { id: string; name: string; parentId: string | null }[]
  >([]);
  useEffect(() => {
    let live = true;
    learningRequest("?categories=1")
      .then((d) => {
        if (live) setCategories(d.categories);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [revision]);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(
      () =>
        learningRequest(
          `?archive=${archive}&search=${encodeURIComponent(search)}`,
        )
          .then((d) => {
            if (live) {
              setRows(d.learnings);
              setCursor(d.nextCursor);
              setError("");
            }
          })
          .catch((e) => {
            if (live) setError(e.message);
          }),
      200,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [search, archive, revision]);
  const scope = `${archive}:${search}:${revision}`;
  const latestScope = useRef(scope);
  latestScope.current = scope;
  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const d = await learningRequest(
        `?archive=${archive}&search=${encodeURIComponent(search)}&cursor=${cursor}`,
      );
      if (latestScope.current !== scope) return;
      setRows((old) => [
        ...new Map([...old, ...d.learnings].map((r) => [r.id, r])).values(),
      ]);
      setCursor(d.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load more.");
    } finally {
      setLoadingMore(false);
    }
  }
  if (selected)
    return (
      <LearningEditor
        key={selected}
        id={selected}
        onClose={() => {
          setSelected(null);
          setRevision((n) => n + 1);
        }}
      />
    );
  function categoryName(id: string | null) {
    const names: string[] = [],
      seen = new Set<string>();
    let c = categories.find((c) => c.id === id);
    while (c && !seen.has(c.id)) {
      seen.add(c.id);
      names.unshift(c.name);
      const parentId = c.parentId;
      c = categories.find((p) => p.id === parentId);
    }
    return names.join(" / ") || "Uncategorized";
  }
  const groups = [...new Set(rows.map((r) => r.categoryId))].sort((a, b) =>
    a === null
      ? 1
      : b === null
        ? -1
        : categoryName(a).localeCompare(categoryName(b)),
  );
  return (
    <section>
      <div className="section-toolbar">
        <h2>Learnings</h2>
        <input
          aria-label="Search learnings"
          placeholder="Search learnings…"
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
        <button className="button primary" onClick={() => setSelected("new")}>
          <Plus size={16} />
          New learning
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {groups.map((categoryId) => (
        <section className="subsection" key={categoryId || "uncategorized"}>
          <h3>{categoryName(categoryId)}</h3>
          <div className="document-list">
            {rows
              .filter((r) => r.categoryId === categoryId)
              .map((r) => (
                <button
                  className="document-list-row learning-title-row"
                  key={r.id}
                  onClick={() => setSelected(r.id)}
                >
                  <strong>{r.title}</strong>
                </button>
              ))}
          </div>
        </section>
      ))}
      {cursor && (
        <button
          className="button"
          disabled={loadingMore}
          onClick={() => void loadMore()}
        >
          {loadingMore ? "Loading…" : "Load more learnings"}
        </button>
      )}
    </section>
  );
}
