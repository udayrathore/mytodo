"use client";
import { Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Category = {
  id: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
  archivedAt: string | null;
};
type Parent = {
  id: string;
  title: string;
  categoryId: string;
  reason: string;
  goalId?: string | null;
};
export function HierarchyCreateForm({
  kind,
  parent,
  initialCategory,
  categories,
  busy,
  save,
}: {
  kind: "goal" | "challenge";
  parent?: Parent | null;
  initialCategory: string;
  categories: Category[];
  busy: boolean;
  save: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const name = kind === "goal" ? "Goal" : "Challenge";
  const childName = kind === "goal" ? "sub-goal" : "sub-challenge";
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState(parent?.reason || "");
  const [category, setCategory] = useState(
    parent?.categoryId || initialCategory,
  );
  const [children, setChildren] = useState<{ key: string; title: string }[]>(
    [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const locked = busy || saving;
  const pending = useRef(false);
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      nameInput.current?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(frame);
  }, []);
  const options = categories.filter(
    (item) => item.isActive && !item.archivedAt,
  );
  return (
    <form
      className="hierarchy-create-form"
      aria-label={`Create ${kind}`}
      onSubmit={async (event) => {
        event.preventDefault();
        if (pending.current || locked) return;
        if (!title.trim() || !reason.trim()) {
          setError("Enter a name and reason.");
          return;
        }
        if (!category) {
          setError("Choose a category for this " + kind + ".");
          return;
        }
        pending.current = true;
        setSaving(true);
        setError("");
        const childRows = children
          .filter((child) => child.title.trim())
          .map((child) => ({
            title: child.title.trim(),
            ...(kind === "goal" ? { estimatedMinutes: null, progress: 0 } : {}),
          }));
        try {
          const ok = await save({
            action: "save",
            title: title.trim(),
            reason: reason.trim(),
            categoryId: category,
            parentId: parent?.id || null,
            ...(kind === "goal"
              ? {
                  status: "NOT_STARTED",
                  progress: 0,
                  estimatedMinutes: null,
                  subgoals: childRows,
                }
              : {
                  coreLearning: "",
                  goalId: parent?.goalId || null,
                  subchallenges: childRows,
                }),
          });
          if (!ok)
            setError(
              "Could not save this " +
                kind +
                ". Your draft is kept; try again.",
            );
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not save. Your draft is kept.",
          );
        } finally {
          pending.current = false;
          setSaving(false);
        }
      }}
    >
      {parent && (
        <p className="hierarchy-create-context">Under {parent.title}</p>
      )}
      <label className="hierarchy-create-name">
        <span className="sr-only">{name} name</span>
        <input
          ref={nameInput}
          aria-label={`${name} name`}
          name="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={`${name} name`}
          required
          maxLength={240}
          autoFocus
          disabled={locked}
        />
      </label>
      <label className="hierarchy-create-reason">
        <span>Reason</span>
        <textarea
          aria-label="Reason"
          name="reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={`Why does this ${kind} matter?`}
          required
          maxLength={20000}
          rows={2}
          disabled={locked}
        />
      </label>
      <section
        className="hierarchy-create-children"
        aria-label={kind === "goal" ? "Sub-goals" : "Sub-challenges"}
      >
        {children.map((child, index) => (
          <div className="hierarchy-create-child" key={child.key}>
            <span className="hierarchy-child-circle" aria-hidden="true" />
            <input
              aria-label={`${kind === "goal" ? "Sub-goal" : "Sub-challenge"} ${index + 1} name`}
              placeholder={`${kind === "goal" ? "Sub-goal" : "Sub-challenge"} name`}
              value={child.title}
              onChange={(event) =>
                setChildren((rows) =>
                  rows.map((row) =>
                    row.key === child.key
                      ? { ...row, title: event.target.value }
                      : row,
                  ),
                )
              }
              maxLength={240}
              required
              autoFocus
              disabled={locked}
            />
            <button
              type="button"
              className="icon-button"
              aria-label={`Remove ${childName} ${index + 1}`}
              onClick={() =>
                setChildren((rows) =>
                  rows.filter((row) => row.key !== child.key),
                )
              }
              disabled={locked}
            >
              <X size={16} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="text-button hierarchy-add-child"
          disabled={locked || children.length >= 50}
          onClick={() =>
            setChildren((rows) => [
              ...rows,
              { key: crypto.randomUUID(), title: "" },
            ])
          }
        >
          <Plus size={16} />
          Add {childName}
        </button>
      </section>
      <footer className="hierarchy-create-footer">
        <label
          className="hierarchy-create-category"
          hidden={options.some(
            (item) => item.id === (parent?.categoryId || initialCategory),
          )}
        >
          <span>Category</span>
          <select
            aria-label="Category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            disabled={locked}
            required
          >
            <option value="">Choose category</option>
            {options.map((item) => (
              <option key={item.id} value={item.id}>
                {categories.find((candidate) => candidate.id === item.parentId)
                  ?.name
                  ? categories.find(
                      (candidate) => candidate.id === item.parentId,
                    )!.name + " / "
                  : ""}
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <button className="button primary" disabled={locked || !options.length}>
          {saving ? "Saving…" : `Create ${kind}`}
        </button>
      </footer>
      {!options.length && (
        <p className="muted small">
          Add an active category in Menu → Master first.
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
