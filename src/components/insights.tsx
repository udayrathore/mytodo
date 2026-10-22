"use client";
import { RemoteHistory } from "./remote-history";
import { useState } from "react";
import { useRemote } from "./use-remote";
import { analytics } from "@/lib/analytics";
import { weekOf, addDays, dateKey } from "@/lib/domain";
import type { Workspace, Task } from "@/lib/workspace";
import { duration, displayDate, human, Empty, Field } from "./ui";
export function Insights({ data }: { data: Workspace }) {
  const [from, setFrom] = useState(addDays(weekOf(data.today).start, -21));
  const [to, setTo] = useState(data.today);
  const valid =
    !!from &&
    !!to &&
    from <= to &&
    Date.parse(to) - Date.parse(from) <= 365 * 86400000;
  const report = useRemote<ReturnType<typeof analytics>>(
    valid
      ? `/api/reports?${new URLSearchParams({ from, to, kind: "insights" })}`
      : null,
    data,
  );
  const a = report.data || {
    total: 0,
    uncategorized: 0,
    created: 0,
    completed: 0,
    deferred: 0,
    overdue: 0,
    days: [],
    category: [],
    entity: [],
    tags: [],
  };
  const max = Math.max(...a.days.map((d) => d.minutes), 1);
  const bars = (rows: { name: string; minutes: number; id: string }[]) =>
    rows.some((r) => r.minutes) ? (
      rows
        .filter((r) => r.minutes)
        .map((r) => (
          <div className="distribution-row" key={r.id}>
            <div>
              <span>{r.name}</span>
              <strong>{duration(r.minutes)}</strong>
            </div>
            <div className="bar-track">
              <span
                style={{
                  width: `${(r.minutes / Math.max(a.total, 1)) * 100}%`,
                }}
              />
            </div>
          </div>
        ))
    ) : (
      <p className="muted">Record some effort to see this distribution.</p>
    );
  return (
    <>
      <div className="section-toolbar insight-filter">
        <div className="date-range">
          <Field label="From">
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
        </div>
      </div>
      {!valid && <p role="alert">Choose a valid range of up to one year.</p>}
      {report.error && <p role="alert">{report.error}</p>}
      {valid && !report.data && !report.error && (
        <p role="status">Loading insights…</p>
      )}
      {valid && report.data && (
        <>
          <div className="metric-grid">
            {[
              {
                label: "Recorded effort",
                value: duration(a.total),
                note: "From dated effort entries",
              },
              {
                label: "Tasks created",
                value: a.created,
                note: "Within this date range",
              },
              {
                label: "Completion events",
                value: a.completed,
                note: `${a.deferred} deferral events`,
              },
              {
                label: "Overdue now",
                value: a.overdue,
                note: "Open tasks past their due date",
              },
            ].map((m) => (
              <div className="metric-card" key={m.label}>
                <span>{m.label}</span>
                <strong>{m.value}</strong>
                <small>{m.note}</small>
              </div>
            ))}
          </div>
          <section className="panel effort-chart">
            <div className="section-heading">
              <div>
                <h2>Daily effort</h2>
              </div>
              <span className="muted">Minutes per day</span>
            </div>
            <div
              className="daily-bars"
              role="img"
              aria-label={`Daily recorded effort from ${from} to ${to}, total ${a.total} minutes`}
            >
              {a.days.map((d) => (
                <div
                  className="day-bar"
                  key={d.date}
                  title={`${d.date}: ${d.minutes} minutes`}
                >
                  <div
                    style={{
                      height: `${Math.max(d.minutes ? 3 : 0, (d.minutes / max) * 100)}%`,
                    }}
                  />
                  <span>
                    {a.days.length <= 31 ? new Date(d.date).getUTCDate() : ""}
                  </span>
                </div>
              ))}
            </div>
            <div className="chart-labels">
              <span>{displayDate(from || data.today, "UTC")}</span>
              <span>{displayDate(to || data.today, "UTC")}</span>
            </div>
          </section>
          <div className="insight-grid">
            <section className="panel">
              <h2>By area of life</h2>
              {bars([
                ...a.category.filter((c) => !c.parentId),
                {
                  id: "uncategorized",
                  name: "Uncategorized",
                  minutes: a.uncategorized,
                },
              ])}
              <p className="panel-footnote">
                Root categories include every descendant. Each effort entry is
                counted once; uncategorized work is separate.
              </p>
              {a.category
                .filter((c) => c.parentId && c.minutes > 0)
                .map((c) => (
                  <p className="meta-line" key={c.id}>
                    {c.name}
                    <strong>{duration(c.minutes)}</strong>
                  </p>
                ))}
            </section>
            <section className="panel">
              <h2>Connected to your work</h2>
              {bars(a.entity)}
              <p className="panel-footnote">
                Entities include their descendants and count a task’s effort
                once. Rows overlap and must not be added together.
              </p>
            </section>
            <section className="panel">
              <h2>Through a different lens</h2>
              {bars(a.tags)}
              <p className="panel-footnote">
                Tags overlap. The overall total always comes directly from
                effort entries.
              </p>
            </section>
          </div>
        </>
      )}
    </>
  );
}
export function Timeline({
  data,
  openTask,
}: {
  data: Workspace;
  openTask: (t: Pick<Task, "id">) => void;
}) {
  return (
    <RemoteHistory
      timezone={data.user.timezone}
      openTask={openTask}
      revision={data}
    />
  );
}
