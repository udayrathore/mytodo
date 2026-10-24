"use client";
import { useState } from "react";
import type { Workspace } from "@/lib/workspace";
import { Field, inputToIso, human } from "./ui";
import { TaskPicker } from "./task-picker";

type LinkOption = { id: string; title: string; archivedAt?: string | null };
function GoalLinks({ kind }: { kind: "goals" | "challenges" }) {
  const [items, setItems] = useState<LinkOption[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  async function load() {
    try {
      setError("");
      const response = await fetch(`/api/${kind}`);
      if (!response.ok) throw Error("Could not load options. Please retry.");
      const data = await response.json();
      setItems(data[kind].filter((item: LinkOption) => !item.archivedAt));
      setLoaded(true);
    } catch { setError("Could not load options. Please retry."); }
  }
  return <details onToggle={event => { if (event.currentTarget.open && !loaded) void load(); }}>
    <summary>Link {kind}</summary>
    {error && <p role="alert">{error} <button type="button" onClick={load}>Retry</button></p>}
    {loaded && !items.length && <p className="muted">No active {kind} yet.</p>}
    {items.map(item => <label className="checkbox-label" key={item.id}><input type="checkbox" name={kind === "goals" ? "goalIds" : "challengeIds"} value={item.id} />{item.title}</label>)}
  </details>;
}
export function TaskCreateExtras({ data, includeFields = true }: { data: Workspace; includeFields?: boolean }) {
  return <div className="form-stack">
    {includeFields && <>
      <details><summary>Due date & time estimate</summary><div className="form-stack">
        <Field label={`Due · ${data.user.timezone}`}><input type="datetime-local" name="dueAt" /></Field>
        <Field label="Estimated minutes"><input type="number" name="estimatedMinutes" min={0} max={100000} /></Field>
      </div></details>
      <details><summary>Add tags</summary>{data.tags.map(tag => <label className="checkbox-label" key={tag.id}><input type="checkbox" name="tagIds" value={tag.id} />{tag.name}</label>)}</details>
      <details><summary>Link entities</summary>{data.entities.filter(entity => entity.isActive).map(entity => <label className="checkbox-label" key={entity.id}><input type="checkbox" name="entityIds" value={entity.id} />{entity.name}</label>)}<Field label="Entity relationship"><input name="relationshipType" defaultValue="CONTRIBUTES_TO" maxLength={80} /></Field></details>
    </>}
    <GoalLinks kind="goals" /><GoalLinks kind="challenges" />
    <details><summary>Link another task</summary><div className="form-stack"><TaskPicker tasks={data.tasks.filter(task => !task.archivedAt)} empty="No linked task" /><Field label="Relationship"><select name="relationType">{["RELATED_TO", "SUBTASK_OF", "DEPENDS_ON", "BLOCKS", "FOLLOW_UP_TO"].map(value => <option key={value} value={value}>{human(value)}</option>)}</select></Field></div></details>
    <details><summary>Add a comment</summary><Field label="Comment"><textarea name="initialComment" maxLength={5000} rows={3} /></Field></details>
    <details><summary>Add a reminder</summary><Field label={`Remind me · ${data.user.timezone}`}><input name="reminderAt" type="datetime-local" /></Field><p className="muted">Appears when you open or refresh the app after this time.</p></details>
  </div>;
}
export function readTaskCreateExtras(form: FormData, timezone: string) {
  return {
    goalIds: form.getAll("goalIds"), challengeIds: form.getAll("challengeIds"),
    relatedTaskId: form.get("targetId") || null, relationType: form.get("relationType") || "RELATED_TO",
    initialComment: form.get("initialComment") || "",
    reminderAt: form.get("reminderAt") ? inputToIso(String(form.get("reminderAt")), timezone) : null,
  };
}
