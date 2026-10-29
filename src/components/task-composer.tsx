"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Plus,
  AlignLeft,
  Folder,
  CalendarDays,
  Gauge,
  CircleArrowUp,
  X,
  ArrowUp,
  BriefcaseBusiness,
} from "lucide-react";
import type { Workspace } from "@/lib/workspace";
import type { Save } from "./task-form";
import { PopoverMenu } from "./popover-menu";
import { DatePicker } from "./date-picker";
import { RepeatFields, readRepeat } from "./task-options";
import { TaskPriorityDials } from "./task-priority-dials";
import styles from "./task-composer.module.css";
type Field =
  "description" | "category" | "date" | "importance" | "urgency" | "projects";
const options = [
  { key: "description", label: "Description", icon: AlignLeft },
  { key: "category", label: "Category", icon: Folder },
  { key: "date", label: "Date", icon: CalendarDays },
  { key: "importance", label: "Importance", icon: Gauge },
  { key: "urgency", label: "Urgency", icon: CircleArrowUp },
  { key: "projects", label: "Projects", icon: BriefcaseBusiness },
] as const;
export function TaskComposer({
  data,
  save,
  onDone,
  defaultDate,
  defaultCategoryId = "",
}: {
  data: Workspace;
  save: Save;
  onDone: () => void;
  defaultDate?: string | null;
  defaultCategoryId?: string;
}) {
  const titleInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => titleInput.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);
  const initialDate =
    defaultDate === undefined ? data.today : defaultDate || "";
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(initialDate);
  const [category, setCategory] = useState(defaultCategoryId);
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState<Field[]>(() => [
    ...(defaultCategoryId ? ["category" as const] : []),
    ...(initialDate !== data.today ? ["date" as const] : []),
  ]);
  const [busy, setBusy] = useState(false);
  const [repeatKey, setRepeatKey] = useState(0);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const dials = (["importance", "urgency"] as const).filter((key) =>
    fields.includes(key),
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !title.trim()) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const ok = await save({
        type: "task.create",
        title: title.trim(),
        description,
        primaryCategoryId: category || null,
        plannedDate: date || null,
        importance: Number(form.get("importance") || 5),
        urgency: Number(form.get("urgency") || 5),
        entityIds: projectIds,
        repeat: date ? readRepeat(form) : null,
      });
      if (ok) {
        setTitle("");
        setDescription("");
        setDate(initialDate);
        setCategory(defaultCategoryId);
        setProjectIds([]);
        setRepeatKey((n) => n + 1);
        onDone();
      }
    } finally {
      setBusy(false);
    }
  }
  const addMenu = (
    <PopoverMenu
      label="Add task field"
      icon={<Plus size={22} />}
      className={styles.addMenu}
    >
      {options.map(({ key, label, icon: Icon }) => (
        <button
          type="button"
          key={key}
          aria-label={label}
          data-close-menu
          disabled={busy}
          aria-pressed={fields.includes(key)}
          onClick={() =>
            setFields((old) => (old.includes(key) ? old : [...old, key]))
          }
        >
          <Icon size={18} />
          {label}
          {fields.includes(key) && <span aria-label="Added">✓</span>}
        </button>
      ))}
    </PopoverMenu>
  );
  return (
    <form
      className={styles.composer}
      onSubmit={submit}
      aria-label="Create task"
    >
      <div className={styles.mainRow}>
        {!fields.length && addMenu}
        <input
          ref={titleInput}
          className={styles.title}
          autoFocus
          aria-label="Task name"
          placeholder="Task name"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={240}
          disabled={busy}
        />
        <button
          type="submit"
          className={styles.submit}
          aria-label="Add task"
          title="Add task · Enter"
          disabled={busy || !title.trim()}
          style={{ visibility: title.trim() ? "visible" : "hidden" }}
        >
          <ArrowUp size={20} />
        </button>
      </div>
      {fields.includes("description") && (
        <div className={styles.description}>
          <textarea
            name="description"
            aria-label="Description"
            placeholder="Description"
            autoFocus
            rows={3}
            maxLength={20000}
            value={description}
            disabled={busy}
            onChange={(e) => setDescription(e.target.value)}
          />
          <button
            type="button"
            aria-label="Remove description field"
            disabled={busy}
            onClick={() => {
              setDescription("");
              setFields((old) => old.filter((f) => f !== "description"));
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <div
        className={styles.fields}
        style={fields.length ? undefined : { display: "none" }}
      >
        {!!fields.length && addMenu}
        {fields.includes("category") && (
          <label className={styles.selectChip}>
            <Folder size={16} />
            <span className="sr-only">Category</span>
            <select
              aria-label="Category"
              value={category}
              disabled={busy}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Uncategorized</option>
              {data.categories
                .filter((c) => c.isActive && !c.archivedAt)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {data.categories.some((p) => p.id === c.parentId)
                      ? `${data.categories.find((p) => p.id === c.parentId)!.name} / `
                      : ""}
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        {fields.includes("date") ? (
          <DatePicker
            label="Task date"
            today={data.today}
            name="plannedDate"
            value={date}
            disabled={busy}
            onChange={(value) => {
              setDate(value);
              if (!value) setRepeatKey((n) => n + 1);
            }}
          >
            <fieldset disabled={!date || busy} className={styles.repeat}>
              <RepeatFields
                key={repeatKey}
                startDate={date || data.today}
                today={data.today}
              />
            </fieldset>
            {!date && <p>Choose a date to repeat this task.</p>}
          </DatePicker>
        ) : (
          <input type="hidden" name="plannedDate" value={date} />
        )}
        {!!dials.length && <TaskPriorityDials fields={dials} minValue={1} />}
        {fields.includes("projects") && (
          <PopoverMenu
            label="Link projects"
            text={
              projectIds.length ? `${projectIds.length} projects` : "Projects"
            }
            icon={<BriefcaseBusiness size={16} />}
            className={styles.projectMenu}
          >
            {data.entities
              .filter(
                (e) => e.type === "PROJECT" && e.isActive && !e.archivedAt,
              )
              .map((project) => (
                <label className={styles.projectOption} key={project.id}>
                  <input
                    type="checkbox"
                    checked={projectIds.includes(project.id)}
                    onChange={(e) =>
                      setProjectIds((old) =>
                        e.target.checked
                          ? [...old, project.id]
                          : old.filter((id) => id !== project.id),
                      )
                    }
                  />
                  {project.name}
                </label>
              ))}
            {!data.entities.some(
              (e) => e.type === "PROJECT" && e.isActive && !e.archivedAt,
            ) && <p>No projects yet.</p>}
          </PopoverMenu>
        )}
      </div>
      {busy && (
        <span role="status" className={styles.hint}>
          Saving…
        </span>
      )}
    </form>
  );
}
