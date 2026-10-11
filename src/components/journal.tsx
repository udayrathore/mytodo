"use client";
import { useState, type FormEvent } from "react";
import { Plus, Search, ArrowUpRight } from "lucide-react";
import type { Workspace, Journal } from "@/lib/workspace";
import type { Save } from "./task-form";
import {
  Drawer,
  Field,
  Chips,
  Empty,
  displayDate,
  localInput,
  inputToIso,
} from "./ui";
export function JournalView({ data, save }: { data: Workspace; save: Save }) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Journal | "new" | null>(null);
  const entries = data.journals.filter(
    (j) =>
      !j.archivedAt &&
      `${j.title} ${j.content}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="section-toolbar">
        <div className="search-box">
          <Search size={17} />
          <input
            aria-label="Search journal"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your observations…"
          />
        </div>
        <button className="button primary" onClick={() => setEditing("new")}>
          <Plus size={17} /> New observation
        </button>
      </div>
      <div className="journal-grid">
        {entries.map((j) => (
          <button
            className="journal-card"
            key={j.id}
            onClick={() => setEditing(j)}
          >
            <div className="card-overline">
              <span>{displayDate(j.occurredAt, data.user.timezone)}</span>
              <ArrowUpRight size={17} />
            </div>
            <h2>{j.title || "Untitled observation"}</h2>
            <p>{j.content}</p>
            <div className="chips">
              {j.categories.map((l) => (
                <span className="chip" key={l.categoryId}>
                  {data.categories.find((c) => c.id === l.categoryId)?.name}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>
      {!entries.length && (
        <Empty title="A place to notice things">
          Write an observation. It doesn’t have to become a task.
        </Empty>
      )}
      {editing && (
        <Drawer
          title={editing === "new" ? "New observation" : "Your observation"}
          onClose={() => setEditing(null)}
        >
          <JournalForm
            data={data}
            journal={editing === "new" ? undefined : editing}
            save={save}
            done={() => setEditing(null)}
          />
        </Drawer>
      )}
    </>
  );
}
function JournalForm({
  data,
  journal,
  save,
  done,
}: {
  data: Workspace;
  journal?: Journal;
  save: Save;
  done: () => void;
}) {
  const [cats, setCats] = useState(
    journal?.categories.map((c) => c.categoryId) || [],
  );
  const [entities, setEntities] = useState(
    journal?.entities.map((e) => e.entityId) || [],
  );
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    if (
      await save({
        type: "journal.save",
        id: journal?.id,
        title: f.get("title"),
        content: f.get("content"),
        occurredAt: inputToIso(String(f.get("occurredAt")), data.user.timezone),
        categoryIds: cats,
        entityIds: entities,
      })
    )
      done();
    setBusy(false);
  }
  return (
    <form className="form-stack" onSubmit={submit}>
      <Field label="Title · optional">
        <input
          autoFocus
          name="title"
          maxLength={240}
          defaultValue={journal?.title || ""}
          placeholder="Give this thought a name"
          className="title-input"
        />
      </Field>
      <Field label="What did you notice?">
        <textarea
          name="content"
          required
          rows={12}
          defaultValue={journal?.content || ""}
          placeholder="Something learned, a passing thought, a moment worth keeping…"
        />
      </Field>
      <Field label={`Occurred at · ${data.user.timezone}`}>
        <input
          type="datetime-local"
          name="occurredAt"
          required
          defaultValue={localInput(
            journal?.occurredAt || new Date().toISOString(),
            data.user.timezone,
          )}
        />
      </Field>
      <div className="field">
        <span>Categories</span>
        <Chips
          items={data.categories.filter((c) => c.isActive)}
          selected={cats}
          onChange={setCats}
        />
      </div>
      <div className="field">
        <span>Entities</span>
        <Chips
          items={data.entities}
          selected={entities}
          onChange={setEntities}
        />
      </div>
      <button disabled={busy} className="button primary">
        {busy ? "Saving…" : "Save observation"}
      </button>
      {journal && (
        <button
          type="button"
          className="text-button danger"
          onClick={async () => {
            if (await save({ type: "journal.archive", id: journal.id })) done();
          }}
        >
          Archive observation
        </button>
      )}
    </form>
  );
}
