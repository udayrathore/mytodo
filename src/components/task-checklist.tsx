"use client";

import { useId, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Trash2 } from "lucide-react";
import type { Task, TaskChecklistItem } from "@/lib/workspace";
import type { Save } from "./task-form";

export function TaskChecklist({
  task,
  save,
  disabled = false,
}: {
  task: Task;
  save: Save;
  disabled?: boolean;
}) {
  const panelId = useId();
  const [expanded, setExpanded] = useState(true);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const addInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const items = task.checklistItems || [];
  const completed = items.filter((item) => item.isCompleted).length;
  const blocked = disabled || busy || !!task.archivedAt;

  async function change(
    command: Record<string, unknown>,
    onSaved?: () => void,
  ) {
    if (saving.current || disabled || task.archivedAt) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const ok = await save({ id: task.id, version: task.version, ...command });
      if (ok) onSaved?.();
      else
        setError(
          "Could not save this sub-task. Your changes are kept; try again.",
        );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save this sub-task. Try again.",
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  function edit(item: TaskChecklistItem) {
    setEditing(item.id);
    setEditTitle(item.title);
    setError("");
  }

  return (
    <section className="task-checklist" aria-label="Sub-tasks" aria-busy={busy}>
      {items.length > 0 && (
        <h3 className="task-checklist-heading">
          <button
            type="button"
            className="task-checklist-toggle"
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={() => setExpanded((value) => !value)}
          >
            <ChevronDown size={16} aria-hidden="true" />
            <span>Sub-tasks</span>
            <small aria-live="polite">
              {completed}/{items.length}
            </small>
          </button>
        </h3>
      )}
      <div id={panelId} hidden={items.length > 0 && !expanded}>
        <ul className="task-checklist-items">
          {items.map((item) => (
            <li
              key={item.id}
              className={`subtask-row${item.isCompleted ? " is-complete" : ""}`}
            >
              <button
                type="button"
                className="todo-check subtask-check"
                role="checkbox"
                aria-checked={item.isCompleted}
                aria-label={`${item.isCompleted ? "Reopen" : "Complete"} sub-task ${item.title}`}
                disabled={blocked}
                onClick={() =>
                  void change({
                    type: "task.checklist.update",
                    itemId: item.id,
                    isCompleted: !item.isCompleted,
                  })
                }
              >
                {item.isCompleted && <Check size={13} aria-hidden="true" />}
              </button>
              {editing === item.id ? (
                <form
                  className="subtask-edit-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!editTitle.trim()) return;
                    void change(
                      {
                        type: "task.checklist.update",
                        itemId: item.id,
                        title: editTitle.trim(),
                      },
                      () => setEditing(null),
                    );
                  }}
                >
                  <input
                    aria-label="Sub-task name"
                    value={editTitle}
                    onChange={(event) => setEditTitle(event.target.value)}
                    maxLength={240}
                    required
                    autoFocus
                    disabled={blocked}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        event.stopPropagation();
                        if (!blocked) setEditing(null);
                      }
                    }}
                  />
                  <div className="subtask-form-actions">
                    <button
                      type="submit"
                      className="button primary"
                      disabled={blocked || !editTitle.trim()}
                    >
                      {busy ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      disabled={blocked}
                      onClick={() => setEditing(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  className="subtask-title"
                  disabled={blocked}
                  onClick={() => edit(item)}
                  aria-label={`Edit sub-task ${item.title}`}
                >
                  {item.title}
                </button>
              )}
              <button
                type="button"
                className="icon-button subtask-remove"
                aria-label={`Remove sub-task ${item.title}`}
                disabled={blocked}
                onClick={() =>
                  void change(
                    { type: "task.checklist.remove", itemId: item.id },
                    () => {
                      if (editing === item.id) setEditing(null);
                    },
                  )
                }
              >
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        {adding ? (
          <form
            className="subtask-add-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!title.trim()) return;
              void change(
                { type: "task.checklist.add", title: title.trim() },
                () => {
                  setTitle("");
                  requestAnimationFrame(() => addInput.current?.focus());
                },
              );
            }}
          >
            <input
              ref={addInput}
              aria-label="New sub-task name"
              placeholder="Task name"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={240}
              required
              autoFocus
              disabled={blocked}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  if (!blocked) setAdding(false);
                }
              }}
            />
            <div className="subtask-form-actions">
              <button
                type="submit"
                className="button primary"
                disabled={blocked || !title.trim()}
              >
                {busy ? "Adding…" : "Add sub-task"}
              </button>
              <button
                type="button"
                className="text-button"
                disabled={blocked}
                onClick={() => setAdding(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            className="task-checklist-add text-button"
            disabled={blocked || items.length >= 200}
            onClick={() => {
              setAdding(true);
              setError("");
            }}
          >
            <Plus size={16} aria-hidden="true" />
            Add sub-task
          </button>
        )}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
