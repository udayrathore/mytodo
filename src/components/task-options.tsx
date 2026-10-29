"use client";
import { DatePicker } from "./date-picker";
import { useState, type FormEvent } from "react";
import { Repeat2 } from "lucide-react";
import type { RepeatRule } from "@/lib/recurrence";
import type { Task } from "@/lib/workspace";
import type { Save } from "./task-form";
export function RepeatFields({
  rule,
  allowNone = true,
  startDate,
  today,
}: {
  rule?: RepeatRule | null;
  allowNone?: boolean;
  startDate?: string;
  today?: string;
}) {
  const initial = rule
    ? rule.unit === "MONTH" && rule.interval === 12
      ? "YEAR"
      : rule.interval === 1
        ? rule.unit
        : "CUSTOM"
    : allowNone
      ? "NONE"
      : "DAY";
  const [preset, setPreset] = useState(initial);
  const [unit, setUnit] = useState(
    rule?.unit === "WEEKDAY" ? "DAY" : rule?.unit || "DAY",
  );
  const anchor =
    startDate || new Intl.DateTimeFormat("en-CA").format(new Date());
  const date = new Date(anchor + "T00:00:00Z");
  const weekday = date.toLocaleDateString("en", {
    weekday: "long",
    timeZone: "UTC",
  });
  const yearly = date.toLocaleDateString("en", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  const presets = [
    ...(allowNone ? [{ value: "NONE", label: "Does not repeat" }] : []),
    { value: "DAY", label: "Every day" },
    { value: "WEEK", label: `Every week on ${weekday}` },
    { value: "WEEKDAY", label: "Every weekday (Mon–Fri)" },
    { value: "MONTH", label: `Every month on day ${date.getUTCDate()}` },
    { value: "YEAR", label: `Every year on ${yearly}` },
    { value: "CUSTOM", label: "Custom…" },
  ];
  return (
    <div className="repeat-fields form-stack">
      <input type="hidden" name="repeatPreset" value={preset} />
      <div className="repeat-presets" role="group" aria-label="Repeat options">
        {presets.map((option) => (
          <button
            type="button"
            key={option.value}
            aria-label={option.label}
            aria-pressed={preset === option.value}
            onClick={() => setPreset(option.value)}
          >
            {option.label}
            {preset === option.value && <span aria-hidden="true"> ✓</span>}
          </button>
        ))}
      </div>
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
                  onChange={(event) =>
                    setUnit(event.target.value as typeof unit)
                  }
                >
                  <option value="DAY">Days</option>
                  <option value="WEEK">Weeks</option>
                  <option value="MONTH">Months</option>
                </select>
              </label>
            </div>
          )}
          <div className="field">
            <span>Repeat until (optional)</span>
            <DatePicker
              name="repeatEnd"
              label="Repeat until"
              today={today}
              min={anchor}
              defaultValue={rule?.endsOn?.slice(0, 10) || ""}
            />
          </div>
        </>
      )}
    </div>
  );
}
export function readRepeat(form: FormData): RepeatRule | null {
  const preset = String(form.get("repeatPreset") || "NONE");
  if (preset === "NONE") return null;
  return {
    unit: (preset === "YEAR"
      ? "MONTH"
      : preset === "CUSTOM"
        ? form.get("repeatUnit")
        : preset) as RepeatRule["unit"],
    interval:
      preset === "YEAR"
        ? 12
        : preset === "CUSTOM"
          ? Number(form.get("repeatInterval"))
          : 1,
    endsOn: String(form.get("repeatEnd") || "") || null,
  };
}
export function SeriesSettings({
  task,
  save,
  today,
}: {
  task: Task;
  save: Save;
  today?: string;
}) {
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
              today={today}
              startDate={task.plannedDate?.slice(0, 10)}
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
