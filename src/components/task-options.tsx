"use client";
import { useState, type FormEvent } from "react";
import {
  Check,
  Star,
  Heart,
  House,
  Briefcase,
  BookOpen,
  Dumbbell,
  Wallet,
  Coffee,
  Music,
  Leaf,
  Target,
  Repeat2,
  Ban,
} from "lucide-react";
import { taskColors, taskIcons, type RepeatRule } from "@/lib/recurrence";
import type { Task } from "@/lib/workspace";
import type { Save } from "./task-form";
const icons = {
  check: Check,
  star: Star,
  heart: Heart,
  home: House,
  briefcase: Briefcase,
  book: BookOpen,
  fitness: Dumbbell,
  wallet: Wallet,
  coffee: Coffee,
  music: Music,
  leaf: Leaf,
  target: Target,
};
export function TaskIcon({
  name,
  size = 14,
}: {
  name?: string;
  size?: number;
}) {
  const Icon = icons[name as keyof typeof icons];
  return Icon ? (
    <Icon
      size={size}
      aria-hidden="true"
      data-tooltip={
        name ? name.charAt(0).toUpperCase() + name.slice(1) : undefined
      }
    />
  ) : null;
}
export function AppearanceFields({
  isMicro = false,
  color = "sage",
  icon = "none",
}: {
  isMicro?: boolean;
  color?: string;
  icon?: string;
}) {
  const [selectedColor, setColor] = useState(color);
  const [selectedIcon, setIcon] = useState(icon);
  return (
    <div className="appearance-fields">
      <label className="checkbox-label">
        <input name="isMicro" type="checkbox" defaultChecked={isMicro} /> Micro
        task · icon only
      </label>
      <fieldset>
        <legend>Color</legend>
        <div className="color-options">
          {taskColors.map((c) => (
            <label key={c} className={"color-choice color-" + c} title={c}>
              <input
                type="radio"
                name="color"
                value={c}
                checked={selectedColor === c}
                onChange={() => setColor(c)}
              />
              <span>{c}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="task-icon-picker">
        <legend>Icon</legend>
        <div className="task-icon-grid">
          {taskIcons.map((value) => {
            const label =
              value === "none"
                ? "No icon"
                : value.charAt(0).toUpperCase() + value.slice(1);
            return (
              <label
                key={value}
                className="task-icon-choice"
                data-tooltip={label}
              >
                <input
                  type="radio"
                  name="icon"
                  value={value}
                  checked={selectedIcon === value}
                  onChange={() => setIcon(value)}
                  aria-label={label}
                />
                <span className="task-icon-tile" aria-hidden="true">
                  {value === "none" ? (
                    <Ban size={20} />
                  ) : (
                    <TaskIcon name={value} size={20} />
                  )}
                  {selectedIcon === value && (
                    <Check className="task-icon-selected" size={10} />
                  )}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
export function RepeatFields({
  rule,
  allowNone = true,
}: {
  rule?: RepeatRule | null;
  allowNone?: boolean;
}) {
  const initial = rule ? (rule.interval === 1 ? rule.unit : "CUSTOM") : "NONE";
  const [preset, setPreset] = useState(initial);
  const [unit, setUnit] = useState(rule?.unit || "DAY");
  return (
    <div className="repeat-fields form-stack">
      <label className="field">
        Repeat
        <select
          name="repeatPreset"
          value={preset}
          onChange={(e) => setPreset(e.target.value)}
        >
          {allowNone && <option value="NONE">Does not repeat</option>}
          <option value="DAY">Daily</option>
          <option value="WEEK">Weekly</option>
          <option value="MONTH">Monthly</option>
          <option value="CUSTOM">Custom interval</option>
        </select>
      </label>
      {preset !== "NONE" && (
        <>
          {preset === "CUSTOM" && (
            <div className="form-grid">
              <label className="field">
                Every
                <input
                  name="repeatInterval"
                  type="number"
                  min={1}
                  max={365}
                  required
                  defaultValue={rule?.interval || 1}
                />
              </label>
              <label className="field">
                Unit
                <select
                  name="repeatUnit"
                  value={unit}
                  onChange={(e) =>
                    setUnit(e.target.value as RepeatRule["unit"])
                  }
                >
                  <option value="DAY">Days</option>
                  <option value="WEEK">Weeks</option>
                  <option value="MONTH">Months</option>
                </select>
              </label>
            </div>
          )}
          <label className="field">
            Repeat until <span className="muted">(optional)</span>
            <input
              name="repeatEnd"
              type="date"
              defaultValue={rule?.endsOn?.slice(0, 10) || ""}
            />
          </label>
          <p className="muted small">
            Each date gets its own task. Monthly repeats use the last day when a
            month is shorter.
          </p>
        </>
      )}
    </div>
  );
}
export function readRepeat(f: FormData): RepeatRule | null {
  const preset = String(f.get("repeatPreset") || "NONE");
  return preset === "NONE"
    ? null
    : {
        unit: (preset === "CUSTOM"
          ? f.get("repeatUnit")
          : preset) as RepeatRule["unit"],
        interval: preset === "CUSTOM" ? Number(f.get("repeatInterval")) : 1,
        endsOn: String(f.get("repeatEnd") || "") || null,
      };
}
export function SeriesSettings({ task, save }: { task: Task; save: Save }) {
  const [busy, setBusy] = useState(false);
  const series = task.series;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    const repeat = readRepeat(f);
    if (!repeat) return;
    setBusy(true);
    await save(
      series
        ? {
            type: "series.schedule",
            id: series.id,
            version: series.version,
            repeat,
            active: f.get("repeatActive") === "on",
          }
        : { type: "series.create", id: task.id, version: task.version, repeat },
    );
    setBusy(false);
  }
  return (
    <details className="series-settings">
      <summary>
        <Repeat2 size={15} />{" "}
        {series
          ? `Repeats every ${series.interval} ${series.unit.toLowerCase()}${series.interval === 1 ? "" : "s"}${series.active ? "" : " · paused"}`
          : "Make this task repeat"}
      </summary>
      <form className="form-stack" onSubmit={submit}>
        {!task.plannedDate && !series ? (
          <p>Set a planned date and save the task first.</p>
        ) : (
          <>
            <RepeatFields
              key={series?.version || 0}
              rule={
                series
                  ? {
                      unit: series.unit,
                      interval: series.interval,
                      endsOn: series.endsOn?.slice(0, 10) || null,
                    }
                  : { unit: "DAY", interval: 1, endsOn: null }
              }
              allowNone={false}
            />
            {series && (
              <>
                <label className="checkbox-label">
                  <input
                    name="repeatActive"
                    type="checkbox"
                    defaultChecked={series.active}
                  />{" "}
                  Repeating enabled
                </label>
                <p className="muted small">
                  Schedule changes apply to unstarted future occurrences.
                  Completed, ongoing, past, and individually edited tasks stay
                  intact. Pausing hides unstarted future occurrences; resuming
                  restores those still on the schedule.
                </p>
              </>
            )}
            <button className="button" disabled={busy}>
              {busy
                ? "Saving…"
                : series
                  ? "Update repeat schedule"
                  : "Start repeating"}
            </button>
          </>
        )}
      </form>
    </details>
  );
}
