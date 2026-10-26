"use client";
import { useEffect, useState } from "react";
import { useRemote } from "./use-remote";
import { resolveWorkCategoryIds } from "@/lib/work-mode";
type Settings = {
  enabled: boolean;
  categoryIds: string[];
  categories: {
    id: string;
    name: string;
    parentId: string | null;
    isActive: boolean;
    archivedAt: string | null;
  }[];
};
export function WorkModeSettings({
  onSaved,
}: {
  onSaved: () => Promise<void>;
}) {
  const remote = useRemote<Settings>("/api/work-mode");
  const [selected, setSelected] = useState<string[]>([]),
    [saved, setSaved] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (remote.data) {
      setSelected(remote.data.categoryIds);
      setSaved(remote.data.categoryIds);
    }
  }, [remote.data]);
  if (!remote.data)
    return <p role="status">{remote.error || "Loading Work mode…"}</p>;
  const categories = remote.data.categories;
  const orderedCategories: typeof categories = [];
  const seenCategories = new Set<string>();
  const visitCategory = (category: (typeof categories)[number]) => {
    if (seenCategories.has(category.id)) return;
    seenCategories.add(category.id);
    orderedCategories.push(category);
    for (const child of categories)
      if (child.parentId === category.id) visitCategory(child);
  };
  for (const category of categories)
    if (
      !category.parentId ||
      !categories.some((parent) => parent.id === category.parentId)
    )
      visitCategory(category);
  for (const category of categories) visitCategory(category);
  const included = new Set(
    resolveWorkCategoryIds(
      { id: "", workModeEnabled: true, workCategoryIds: selected },
      categories,
    ) || [],
  );
  const dirty = JSON.stringify(selected) !== JSON.stringify(saved);
  function path(id: string) {
    const names: string[] = [],
      seen = new Set<string>();
    let category = categories.find((c) => c.id === id);
    while (category && !seen.has(category.id)) {
      seen.add(category.id);
      names.unshift(category.name);
      category = categories.find((c) => c.id === category?.parentId);
    }
    return names.join(" / ");
  }
  return (
    <section className="work-mode-settings">
      <h1>Work mode</h1>
      <p>
        Choose the categories to show while Work mode is on. Selecting a parent
        includes its subcategories.
      </p>
      <p className="muted">
        Use the briefcase icon at the top right to switch between personal and
        work views. New sign-ins start in Work mode from 10am until 7pm in your
        account timezone. You can switch modes anytime.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setMessage("");
          try {
            const response = await fetch("/api/work-mode", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "configure",
                categoryIds: selected,
              }),
            });
            const data = await response.json();
            if (!response.ok) throw Error(data.error || "Could not save.");
            setSaved(data.categoryIds);
            setSelected(data.categoryIds);
            setMessage("Work categories saved.");
            await onSaved();
          } catch (error) {
            setMessage(
              error instanceof Error ? error.message : "Could not save.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          <legend>Visible categories · {included.size}</legend>
          {orderedCategories
            .filter(
              (c) => (c.isActive && !c.archivedAt) || selected.includes(c.id),
            )
            .map((category) => {
              const explicit = selected.includes(category.id),
                inherited = !explicit && included.has(category.id);
              return (
                <label className="work-category-option" key={category.id}>
                  <input
                    type="checkbox"
                    checked={explicit || inherited}
                    disabled={
                      inherited ||
                      ((!category.isActive || !!category.archivedAt) &&
                        !explicit)
                    }
                    onChange={(event) =>
                      setSelected((previous) =>
                        event.target.checked
                          ? [...previous, category.id]
                          : previous.filter((id) => id !== category.id),
                      )
                    }
                  />
                  <span>
                    {path(category.id)}
                    {inherited && <small>Included through its parent</small>}
                    {(!category.isActive || category.archivedAt) && (
                      <small>No longer active</small>
                    )}
                  </span>
                </label>
              );
            })}
          {!categories.length && (
            <p>Create categories first in Menu → Categories.</p>
          )}
        </fieldset>
        <div className="section-toolbar">
          <button
            type="submit"
            className="button primary"
            disabled={busy || !dirty}
          >
            {busy ? "Saving…" : "Save work categories"}
          </button>
          <button
            type="button"
            className="text-button"
            disabled={busy || !selected.length}
            onClick={() => setSelected([])}
          >
            Clear selection
          </button>
          {dirty && <small>Unsaved changes</small>}
        </div>
        <p role="status">{message}</p>
      </form>
    </section>
  );
}
