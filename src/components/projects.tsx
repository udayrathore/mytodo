"use client";
import { CollectionSettings } from "./collection-settings";
import { useEffect, useState, type FormEvent } from "react";
import type { Workspace, Task } from "@/lib/workspace";
import type { Save } from "./task-form";
import { Drawer, Field } from "./ui";
import { TaskPicker } from "./task-picker";
import { CategorySheet } from "./category-sheet";
export function Projects({
  data,
  save,
  openTask,
  onRange,
  setScope,
}: {
  setScope: (key: string, value: string) => void;
  data: Workspace;
  save: Save;
  openTask: (task: Task) => void;
  onRange: (through: string) => Promise<void>;
}) {
  const projects = data.entities.filter(
    (e) => e.type === "PROJECT",
  );
  const [selected, setSelected] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkedTask, setLinkedTask] = useState("");
  useEffect(() => {
    setScope("project", selected);
  }, [selected, setScope]);
  const project = projects.find((p) => p.id === selected);
  const edit = projects.find((p) => p.id === editing);
  const members = data.tasks.filter(
    (t) => !t.archivedAt && t.entities.some((e) => e.entityId === selected),
  );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    if (
      await save({
        type: "project.save",
        id: editing === "new" ? undefined : editing,
        name: f.get("name"),
        description: f.get("description"),
        categoryIds: f.getAll("categoryIds"),
      })
    )
      setEditing(null);
    setBusy(false);
  }
  return (
    <>
      <div className="section-toolbar">
        <label className="field">
          Project
          <select
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setLinkedTask("");
            }}
          >
            <option value="">Choose a project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button className="button primary" onClick={() => setEditing("new")}>
          New project
        </button>
        {project && (
          <button className="button" onClick={() => setEditing(project.id)}>
            Edit project & categories
          </button>
        )}
      </div>
      <div className="collection-list">
        {projects.map(item => <section className="collection-row" key={item.id}>
          <div className="section-toolbar"><button className="text-button" onClick={() => setSelected(item.id)}>{item.name}</button><button className="button" onClick={() => setEditing(item.id)}>Edit</button></div>
          <CollectionSettings item={item} kind="project" save={save} />
        </section>)}
      </div>
      {project ? (
        <>
          <p className="muted">
            Categories:{" "}
            {(project.metadata?.categoryIds || [])
              .map((id) => data.categories.find((c) => c.id === id)?.name)
              .filter(Boolean)
              .join(", ") ||
              "None linked yet — edit this project to choose categories."}
          </p>
          <CategorySheet
            key={project.id}
            data={data}
            projectId={project.id}
            save={save}
            openTask={openTask}
            onRange={onRange}
          />
          <details className="series-settings">
            <summary>Add or remove existing tasks</summary>
            <form
              className="form-stack"
              onSubmit={async (e) => {
                e.preventDefault();
                if (busy || !linkedTask) return;
                setBusy(true);
                if (
                  await save({
                    type: "project.linkTask",
                    id: project.id,
                    taskId: linkedTask,
                    linked: true,
                  })
                )
                  setLinkedTask("");
                setBusy(false);
              }}
            >
              <TaskPicker
                excludeIds={members.map((t) => t.id)}
                key={project.id + members.length}
                tasks={data.tasks.filter(
                  (t) => !t.archivedAt && !members.some((m) => m.id === t.id),
                )}
                required
                onChange={setLinkedTask}
              />
              <button className="button" disabled={busy || !linkedTask}>
                Add to project
              </button>
            </form>
            <div className="form-stack">
              {members.map((t) => (
                <div className="section-toolbar" key={t.id}>
                  <button className="text-button" onClick={() => openTask(t)}>
                    {t.title} · {t.plannedDate?.slice(0, 10) || "Unscheduled"}
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      await save({
                        type: "project.linkTask",
                        id: project.id,
                        taskId: t.id,
                        linked: false,
                      });
                      setBusy(false);
                    }}
                  >
                    Remove from project
                  </button>
                </div>
              ))}
            </div>
            <p className="muted small">
              Removing a task from a project keeps the task and its history.
              Linking a repeating task adds only the selected occurrence.
            </p>
          </details>
        </>
      ) : (
        <p className="empty">
          Choose or create a project to plan its tasks across categories.
        </p>
      )}
      {editing && (
        <Drawer
          title={edit ? "Edit project" : "New project"}
          onClose={() => setEditing(null)}
        >
          <form className="form-stack" onSubmit={submit}>
            <Field label="Name">
              <input
                required
                name="name"
                maxLength={240}
                defaultValue={edit?.name || ""}
              />
            </Field>
            <Field label="Purpose / outcome">
              <textarea
                name="description"
                rows={3}
                maxLength={20000}
                defaultValue={edit?.description || ""}
              />
            </Field>
            <fieldset>
              <legend>Linked categories · choose at least one</legend>
              {data.categories.map((c) => (
                <label className="checkbox-label" key={c.id}>
                  <input
                    type="checkbox"
                    name="categoryIds"
                    value={c.id}
                    defaultChecked={edit?.metadata?.categoryIds?.includes(c.id)}
                  />
                  {c.name}
                  {c.parentId
                    ? ` · ${data.categories.find((p) => p.id === c.parentId)?.name || "Child category"}`
                    : ""}
                </label>
              ))}
            </fieldset>
            <button className="button primary" disabled={busy}>
              {busy ? "Saving…" : "Save project"}
            </button>
          </form>
        </Drawer>
      )}
    </>
  );
}
