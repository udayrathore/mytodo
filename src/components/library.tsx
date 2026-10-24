"use client";
import { CollectionSettings, CollectionAvatar} from "./collection-settings";
import { useState, type FormEvent} from "react";
import {
  Plus,
  Folder,
  Hash,
  Users,
  LayoutTemplate,
  ArrowUpRight} from "lucide-react";
import type { Workspace} from "@/lib/workspace";

import type { Save} from "./task-form";
import { Drawer, Field, human, Empty} from "./ui";
export function Library({
  data,
  save,
  categoriesOnly = false,
  initialTab = "Categories",
  singleTab = false,
}: {
  data: Workspace;
  save: Save;
  categoriesOnly?: boolean;
  initialTab?: string;
  singleTab?: boolean;
}) {
  const [tab, setTab] = useState(initialTab);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const category = data.categories.find((c) => c.id === editing),
    tag = data.tags.find((c) => c.id === editing),
    entity = data.entities.find((c) => c.id === editing);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const base = {
      id: editing === "new" ? undefined : editing,
      name: f.get("name"),
    };
    let c: Record<string, unknown>;
    if (tab === "Categories")
      c = {
        type: "category.save",
        ...base,
        parentId: f.get("parentId") || null,
        sortOrder: Number(f.get("sortOrder")),
        description: f.get("description"),
        isActive: category ? category.isActive : f.get("isActive") === "on",
      };
    else if (tab === "Tags")
      c = { type: "tag.save", ...base, description: f.get("description") };
    else if (tab === "Entities")
      c = {
        type: "entity.save",
        ...base,
        description: f.get("description"),
        entityType: f.get("entityType"),
        parentEntityId: f.get("parentEntityId") || null,
        isActive: f.get("isActive") === "on",
      };
    else return;
    if (await save(c)) setEditing(null);
    setBusy(false);
  }
  const items =
    tab === "Categories"
      ? [...data.categories].sort(
          (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
        )
      : tab === "Tags"
        ? data.tags
        : tab === "Entities"
          ? data.entities
          : [];
  return (
    <>
      <div className="section-toolbar">
        <div className="tabs compact">
          {(singleTab ? [initialTab] : categoriesOnly
            ? ["Categories"]
            : ["Categories", "Tags", "Entities"]
          ).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={tab === t ? "active" : ""}
            >
              {t}
            </button>
          ))}
        </div>
        <button
          className="button primary"
          onClick={() => {
            setEditing("new");

          }}
        >
          <Plus size={16} /> New{" "}
          {tab === "Categories" ? "category" : tab.slice(0, -1).toLowerCase()}
        </button>
      </div>
      {tab !== "Categories" && <p className="muted library-intro">
        {tab === "Categories"
          ? "Give each category a purpose and a priority rank. Lower ranks appear first on your home screen; tied ranks sort by name. Child categories belong inside their parent."
          : tab === "Tags"
            ? "Cross-cutting labels, independent of where a task belongs."
            : tab === "Entities"
              ? "People, projects, clients, and organizations connected to your work."
              : "Reusable fields for recurring kinds of tasks. New revisions preserve the past."}
      </p>}
      {tab === "Categories" ? <div className="category-list" role="list" aria-label="Categories">
        {[...data.categories].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)).map(item => (
          <div className="category-list-row" key={item.id} role="listitem">
            <button className="category-list-name" onClick={() => setEditing(item.id)} aria-label={`Edit ${item.name}`}>
              <CollectionAvatar item={item} />
              <span><strong>{item.name}</strong><small>{item.parentId ? data.categories.find(c => c.id === item.parentId)?.name : "Primary category"}{" · Priority "}{item.sortOrder}</small>{item.description && <span className="category-list-goal">{item.description}</span>}</span>
            </button>
            <span className="muted">{item.archivedAt ? "Archived" : item.isActive ? "Active" : "Closed"}</span>
            <button className="text-button" onClick={() => setEditing(item.id)}>Edit</button>
          </div>
        ))}
      </div> : <div className="library-grid">
        {items.map((item) => (
          <div key={item.id}>
          <button
            className="library-card"
            key={item.id}
            onClick={() => {
              setEditing(item.id);
            }}
          >
            <span className="library-icon">
              {tab === "Categories" ? (
                <Folder />
              ) : tab === "Tags" ? (
                <Hash />
              ) : tab === "Entities" ? (
                <Users />
              ) : (
                <LayoutTemplate />
              )}
            </span>
            <div>
              <h3>{item.name}</h3>
              <p>
                {"parentId" in item
                  ? data.categories.find((c) => c.id === item.parentId)?.name ||
                    "Primary category"
                  : "type" in item
                    ? human(String(item.type))
                      : item.description || "Tag"}
              </p>
              {"parentId" in item && (
                <>
                  <small>Priority rank {item.sortOrder}</small>
                  <p>{item.description || "No goal set yet"}</p>
                </>
              )}
              {"isActive" in item && !item.isActive && <small>{"archivedAt" in item && item.archivedAt ? "Archived" : "Closed"}</small>}
            </div>
            <ArrowUpRight size={16} />
          </button>

          </div>
        ))}
      </div>}
      {!items.length && <Empty title={`Add your first ${tab.toLowerCase()}`} />}
      {editing && (
        <Drawer
          title={`${editing === "new" ? "New" : "Edit"} ${tab.toLowerCase()}`}
          onClose={() => setEditing(null)}
        >
          {tab === "Categories" && category && <CollectionSettings key={category.id} item={category} kind="category" save={save} />}
          {singleTab && editing !== "new" && ["Tags"].includes(tab) && <button className="text-button danger" disabled={busy} onClick={async () => {
            if (tab === "Tags" && !window.confirm("Delete this tag?")) return;
            setBusy(true);
            try { if (await save({ type: "master.remove", kind: "tag", id: editing })) setEditing(null); }
            finally { setBusy(false); }
          }}>{"Delete tag"}</button>}
          <form className="form-stack" onSubmit={submit}>
            <Field label="Name">
              <input
                autoFocus
                name="name"
                required
                maxLength={240}
                defaultValue={
                  category?.name ||
                  tag?.name ||
                  entity?.name ||
                  ""
                }
              />
            </Field>
            {tab === "Categories" ? (
              <>
                <Field label="Parent">
                  <select
                    name="parentId"
                    defaultValue={category?.parentId || ""}
                  >
                    <option value="">Root category</option>
                    {data.categories
                      .filter((c) => c.id !== editing)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field
                  label="Goal / why this category matters"
                  hint="What do you want this area of your life to help you achieve?"
                >
                  <textarea
                    name="description"
                    rows={4}
                    maxLength={20000}
                    defaultValue={category?.description || ""}
                    placeholder="For example: build the energy and strength to be present for my family."
                  />
                </Field>
                <Field
                  label="Priority rank"
                  hint="Lower numbers come first. Use the same rank for equal priorities."
                >
                  <input
                    type="number"
                    min={0}
                    max={10000}
                    name="sortOrder"
                    defaultValue={category?.sortOrder || 0}
                  />
                </Field>
              </>
            ) : (
              <Field label="Description">
                <textarea
                  rows={3}
                  name="description"
                  defaultValue={
                    tag?.description ||
                    entity?.description ||
                    ""
                  }
                />
              </Field>
            )}
            {tab === "Entities" && (
              <>
                <Field label="Kind">
                  <select
                    name="entityType"
                    defaultValue={entity?.type || "PROJECT"}
                  >
                    {[
                      "PERSON",
                      "ORGANIZATION",
                      "CLIENT",
                      "PROJECT",
                      "OTHER",
                    ].map((t) => (
                      <option key={t} value={t}>
                        {human(t)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Parent entity">
                  <select
                    name="parentEntityId"
                    defaultValue={entity?.parentEntityId || ""}
                  >
                    <option value="">None</option>
                    {data.entities
                      .filter((e) => e.id !== editing)
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                  </select>
                </Field>
              </>
            )}
            {(tab === "Entities" || (tab === "Categories" && !category)) && (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="isActive"
                  defaultChecked={
                    category?.isActive ?? entity?.isActive ?? true
                  }
                />{" "}
                Active
              </label>
            )}
            <button disabled={busy} className="button primary">
              {busy
                ? "Saving…"
                : "Save changes"}
            </button>
          </form>
        </Drawer>
      )}
    </>
  );
}
