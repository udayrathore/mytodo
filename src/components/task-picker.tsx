"use client";
import { useState } from "react";
import type { Task } from "@/lib/workspace";
import { groupTasks } from "@/lib/task-groups";
import { human } from "./ui";
export function TaskPicker({
  tasks,
  name = "targetId",
  required = false,
  empty = "Choose a task",
  label = "Task",
  onChange,
}: {
  tasks: Task[];
  name?: string;
  required?: boolean;
  empty?: string;
  label?: string;
  onChange?: (id: string) => void;
}) {
  const [selected, setSelected] = useState("");
  const groups = groupTasks(tasks);
  const group = groups.find((g) => g.key === selected);
  const repeating = !!group?.occurrences[0].seriesId;
  return (
    <div className="form-stack">
      <label className="field">
        {label}
        <select
          required={required}
          value={group ? selected : ""}
          onChange={(e) => {
            setSelected(e.target.value);
            const next = groups.find((g) => g.key === e.target.value);
            onChange?.(
              next && !next.occurrences[0].seriesId
                ? next.occurrences[0].id
                : "",
            );
          }}
        >
          <option value="">{empty}</option>
          {groups.map((g) => (
            <option key={g.key} value={g.key}>
              {g.occurrences[0].title}
              {g.occurrences[0].seriesId ? " · Repeating" : ""}
            </option>
          ))}
        </select>
      </label>
      {!repeating && group && (
        <input type="hidden" name={name} value={group.occurrences[0].id} />
      )}
      {repeating && (
        <label className="field">
          Which date?
          <select
            key={selected}
            name={name}
            required
            defaultValue=""
            onChange={(e) => onChange?.(e.target.value)}
          >
            <option value="">Choose an occurrence</option>
            {group.occurrences.map((t) => (
              <option key={t.id} value={t.id}>
                {t.plannedDate?.slice(0, 10) || "Unscheduled"} ·{" "}
                {human(t.status)}
                {t.title !== group.occurrences[0].title ? ` · ${t.title}` : ""}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
