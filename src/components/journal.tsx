"use client";
import { useEffect, useState } from "react";
import { Plus, FileText, Search } from "lucide-react";
import type { Workspace, Journal } from "@/lib/workspace";
import type { Save } from "./task-form";
import { displayDate } from "./ui";
import dynamic from "next/dynamic";
const JournalDocument = dynamic(() => import("./journal-document"), {
  ssr: false,
  loading: () => <p>Opening document…</p>,
});
export function JournalView({
  data,
  save,
  setScope,
}: {
  data: Workspace;
  save: Save;
  setScope: (key: string, value: string) => void;
}) {
  const [query, setQuery] = useState(data.page?.scope?.search || "");
  const [editing, setEditing] = useState<Journal | null>(null);
  const [local, setLocal] = useState<Record<string, Journal>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setScope("journalSearch", query), 200);
    return () => clearTimeout(timer);
  }, [query, setScope]);
  const entries = [
    ...new Map(
      [...data.journals, ...Object.values(local)].map((j) => [j.id, j]),
    ).values(),
  ]
    .filter(
      (j) =>
        !j.archivedAt &&
        `${j.title} ${j.content}`.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  if (editing)
    return (
      <JournalDocument
        key={editing.id}
        journal={editing}
        data={data}
        onSaved={(journal) =>
          setLocal((old) => ({ ...old, [journal.id]: journal }))
        }
        onClose={() => setEditing(null)}
        onArchive={async (journal) => {
          if (await save({ type: "journal.archive", id: journal.id })) {
            setLocal((old) => ({
              ...old,
              [journal.id]: {
                ...journal,
                archivedAt: new Date().toISOString(),
              },
            }));
            setEditing(null);
            return true;
          }
          return false;
        }}
      />
    );
  return (
    <section className="journal-documents" aria-label="Journal documents">
      <div className="section-toolbar">
        <div className="search-box">
          <Search size={17} />
          <input
            aria-label="Search documents"
            placeholder="Search documents…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button
          className="button primary"
          disabled={busy}
          onClick={async () => {
            if (busy) return;
            setBusy(true);
            setError("");
            const occurredAt = new Date().toISOString();
            try {
              const r = await fetch("/api/commands", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  type: "journal.save",
                  title: "Untitled document",
                  content: "",
                  occurredAt,
                  categoryIds: [],
                  entityIds: [],
                }),
              });
              const result = await r.json();
              if (!r.ok)
                throw new Error(result.error || "Could not create document.");
              const journal: Journal = {
                id: result.id,
                title: "Untitled document",
                content: "",
                occurredAt,
                categories: [],
                entities: [],
                archivedAt: null,
                version: result.version,
              };
              setLocal((old) => ({ ...old, [journal.id]: journal }));
              setEditing(journal);
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Could not create document.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <Plus size={17} />
          {busy ? "Creating…" : "New document"}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="document-list">
        <div className="document-list-header">
          <span>Document</span>
          <span>Entry date</span>
        </div>
        {entries.map((j) => (
          <button
            key={j.id}
            className="document-list-row"
            onClick={() => setEditing(j)}
          >
            <FileText size={24} />
            <span>
              <strong>{j.title || "Untitled document"}</strong>
              <small>{j.content.slice(0, 160) || "Blank document"}</small>
            </span>
            <time>{displayDate(j.occurredAt, data.user.timezone)}</time>
          </button>
        ))}
      </div>
      {!entries.length && <p className="empty">No documents.</p>}
    </section>
  );
}
