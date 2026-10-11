"use client";
import { useState, type FormEvent } from "react";
import { Plus, ArrowRight, Check, Minus } from "lucide-react";
import type { Workspace, Task } from "@/lib/workspace";
import type { Save } from "./task-form";
import { Drawer, Field, displayDate, Empty, human } from "./ui";
import { weekOf, addDays } from "@/lib/domain";
export function Planning({
  data,
  save,
  openTask,
}: {
  data: Workspace;
  save: Save;
  openTask: (t: Task) => void;
}) {
  const [periodId, setPeriodId] = useState(
    data.periods.find(
      (p) =>
        p.startsOn.slice(0, 10) <= data.today &&
        p.endsOn.slice(0, 10) >= data.today,
    )?.id ||
      data.periods[0]?.id ||
      "",
  );
  const [create, setCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const p = data.periods.find((p) => p.id === periodId);
  const planned = data.tasks.filter((t) =>
    t.periods.some((l) => l.planningPeriodId === periodId && !l.removedAt),
  );
  const backlog = data.tasks.filter(
    (t) =>
      !t.archivedAt &&
      !["COMPLETED", "CANCELLED"].includes(t.status) &&
      !planned.some((p) => p.id === t.id),
  );
  const done = planned.filter((t) => t.status === "COMPLETED").length;
  const next = p
    ? data.periods
        .filter((n) => n.startsOn > p.endsOn && n.status === "OPEN")
        .sort((a, b) => a.startsOn.localeCompare(b.startsOn))[0]
    : null;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    if (
      await save({
        type: "period.create",
        title: f.get("title"),
        startsOn: f.get("startsOn"),
        endsOn: f.get("endsOn"),
      })
    )
      setCreate(false);
    setBusy(false);
  }
  return (
    <>
      <div className="section-toolbar">
        <select
          aria-label="Planning period"
          className="period-select"
          value={periodId}
          onChange={(e) => setPeriodId(e.target.value)}
        >
          <option value="" disabled>
            Choose a planning period
          </option>
          {data.periods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title} · {displayDate(p.startsOn, "UTC")} –{" "}
              {displayDate(p.endsOn, "UTC")}
            </option>
          ))}
        </select>
        <button className="button" onClick={() => setCreate(true)}>
          <Plus size={16} /> New week
        </button>
      </div>
      {p ? (
        <>
          <div className="plan-banner">
            <div>
              <span className="eyebrow">
                {p.status === "CLOSED"
                  ? "Closed plan"
                  : "An intention for the week"}
              </span>
              <h2>{p.title}</h2>
              <p>
                {planned.length} planned · {done} currently complete ·{" "}
                {
                  planned.filter(
                    (t) => t.periods.filter((l) => !l.removedAt).length > 1,
                  ).length
                }{" "}
                carried across plans
              </p>
            </div>
            <button
              className="button"
              onClick={() =>
                save({
                  type: "period.close",
                  id: p.id,
                  closed: p.status !== "CLOSED",
                })
              }
            >
              {p.status === "CLOSED" ? "Reopen plan" : "Close plan"}
            </button>
          </div>
          <div className="planning-columns">
            <section className="panel">
              <div className="section-heading">
                <h2>
                  In this plan <span className="count">{planned.length}</span>
                </h2>
              </div>
              {planned.map((t) => (
                <div className="planning-row" key={t.id}>
                  <button className="planning-task" onClick={() => openTask(t)}>
                    <span
                      className={
                        "task-indicator " +
                        (t.status === "COMPLETED" ? "done" : "")
                      }
                    >
                      {t.status === "COMPLETED" && <Check size={13} />}
                    </span>
                    <span>
                      {t.title}
                      <small>
                        {human(t.status)}
                        {t.archivedAt ? " · Archived" : ""}
                      </small>
                    </span>
                  </button>
                  <div className="row-actions">
                    {next && !["COMPLETED", "CANCELLED"].includes(t.status) && (
                      <button
                        className="icon-button"
                        title={`Carry to ${next.title}`}
                        aria-label={`Carry ${t.title} to ${next.title}`}
                        onClick={() =>
                          save({
                            type: "period.assign",
                            id: t.id,
                            periodId: next.id,
                          })
                        }
                      >
                        <ArrowRight size={16} />
                      </button>
                    )}
                    {p.status !== "CLOSED" && (
                      <button
                        className="icon-button"
                        title="Remove from plan"
                        aria-label={`Remove ${t.title} from plan`}
                        onClick={() =>
                          save({
                            type: "period.remove",
                            id: t.id,
                            periodId: p.id,
                          })
                        }
                      >
                        <Minus size={16} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {!planned.length && (
                <Empty title="A little space to plan">
                  Add something from your backlog.
                </Empty>
              )}
              <p className="panel-footnote">
                Carry-forward keeps the earlier assignment. Removing a task also
                preserves its planning history.
              </p>
            </section>
            <section className="panel">
              <div className="section-heading">
                <h2>
                  Available intentions{" "}
                  <span className="count">{backlog.length}</span>
                </h2>
              </div>
              {backlog.map((t) => (
                <div key={t.id} className="planning-row">
                  <button className="planning-task" onClick={() => openTask(t)}>
                    <span>
                      {t.title}
                      <small>{human(t.status)}</small>
                    </span>
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Add ${t.title} to plan`}
                    disabled={p.status === "CLOSED"}
                    onClick={() =>
                      save({ type: "period.assign", id: t.id, periodId: p.id })
                    }
                  >
                    <Plus size={17} />
                  </button>
                </div>
              ))}
              {!backlog.length && <Empty title="Everything has a place" />}
            </section>
          </div>
        </>
      ) : (
        <Empty title="Begin with a week">
          Create a planning period to collect your intentions.
        </Empty>
      )}
      {create && (
        <Drawer title="New planning period" onClose={() => setCreate(false)}>
          <form onSubmit={submit} className="form-stack">
            <Field label="Title">
              <input
                name="title"
                required
                autoFocus
                placeholder="A week with a little more space"
              />
            </Field>
            <Field label="Starts on">
              <input
                name="startsOn"
                type="date"
                defaultValue={addDays(weekOf(data.today).start, 7)}
                required
              />
            </Field>
            <Field label="Ends on">
              <input
                name="endsOn"
                type="date"
                defaultValue={addDays(weekOf(data.today).end, 7)}
                required
              />
            </Field>
            <button className="button primary" disabled={busy}>
              Create plan
            </button>
          </form>
        </Drawer>
      )}
    </>
  );
}
