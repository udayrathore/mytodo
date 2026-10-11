"use client";
import { useState } from "react";
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
  const a = analytics(data, valid ? from : data.today, valid ? to : data.today);
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
        <p className="muted">
          Patterns to reflect on, without a productivity score.
        </p>
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
      <div className="metric-grid">
        {[
          {
            label: "Recorded effort",
            value: duration(a.total),
            note: "From dated effort entries",
          },
          {
            label: "Intentions created",
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
            <span className="eyebrow">Action over time</span>
            <h2>A record of your attention</h2>
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
            Entities include their descendants and count a task’s effort once.
            Rows overlap and must not be added together.
          </p>
        </section>
        <section className="panel">
          <h2>Through a different lens</h2>
          {bars(a.tags)}
          <p className="panel-footnote">
            Tags overlap. The overall total always comes directly from effort
            entries.
          </p>
        </section>
      </div>
    </>
  );
}
export function Timeline({
  data,
  openTask,
}: {
  data: Workspace;
  openTask: (t: Task) => void;
}) {
  const [filter, setFilter] = useState("All");
  const [limit, setLimit] = useState(60);
  const rows = [
    ...data.events
      .filter(
        (e) => !(e.eventType === "EFFORT_RECORDED" && e.toValue?.effortEntryId),
      )
      .map((e) => ({
        id: e.id,
        at:
          typeof e.toValue?.occurredOn === "string"
            ? e.toValue.occurredOn
            : e.occurredAt,
        kind: ["CREATED", "PLANNED", "RESCHEDULED"].includes(e.eventType)
          ? "Intention"
          : "Action",
        dateOnly: typeof e.toValue?.occurredOn === "string",
        title:
          e.eventType === "EFFORT_RECORDED"
            ? "Activity logged"
            : human(e.eventType),
        text: [
          data.tasks.find((t) => t.id === e.taskId)?.title || "Task",
          typeof e.toValue?.note === "string" ? e.toValue.note : "",
        ]
          .filter(Boolean)
          .join(" · "),
        taskId: e.taskId,
      })),
    ...data.tasks.flatMap((t) =>
      t.effort.map((e) => ({
        id: e.id,
        at: e.occurredOn,
        kind: "Action",
        dateOnly: true,
        title: `${duration(e.minutes)} · ${t.title}`,
        text: e.note || "Manual effort recorded",
        taskId: t.id,
      })),
    ),
    ...data.journals.map((j) => ({
      id: j.id,
      at: j.occurredAt,
      kind: "Observation",
      dateOnly: false,
      title: j.title || "An observation",
      text: j.content,
      taskId: null,
    })),
  ]
    .filter((r) => filter === "All" || r.kind === filter)
    .map((r) => ({
      ...r,
      day: r.dateOnly
        ? r.at.slice(0, 10)
        : dateKey(new Date(r.at), data.user.timezone),
    }))
    .sort((a, b) => b.day.localeCompare(a.day) || b.at.localeCompare(a.at));
  let previous = "";
  return (
    <>
      <div className="tabs timeline-tabs">
        {["All", "Intention", "Action", "Observation"].map((t) => (
          <button
            className={filter === t ? "active" : ""}
            key={t}
            onClick={() => {
              setFilter(t);
              setLimit(60);
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="timeline">
        {rows.slice(0, limit).map((r) => {
          const day = r.day;
          const header = day !== previous;
          previous = day;
          return (
            <div key={r.id}>
              {header && (
                <h3 className="timeline-date">
                  {displayDate(day, "UTC")}{" "}
                  {day === data.today && <span>Today</span>}
                </h3>
              )}
              <article className="timeline-entry">
                <span className={"history-dot " + r.kind.toLowerCase()} />
                <div>
                  <div className="timeline-meta">
                    <span>{r.kind}</span>
                    <time>
                      {r.dateOnly
                        ? "Date recorded"
                        : new Date(r.at).toLocaleTimeString("en", {
                            hour: "numeric",
                            minute: "2-digit",
                            timeZone: data.user.timezone,
                          })}
                    </time>
                  </div>
                  {r.taskId ? (
                    <button
                      className="timeline-title"
                      onClick={() => {
                        const t = data.tasks.find((t) => t.id === r.taskId);
                        if (t) openTask(t);
                      }}
                    >
                      {r.title}
                    </button>
                  ) : (
                    <h2>{r.title}</h2>
                  )}
                  <p>{r.text}</p>
                </div>
              </article>
            </div>
          );
        })}
      </div>
      {!rows.length && <Empty title="Your story starts here" />}
      {rows.length > limit && (
        <button className="button" onClick={() => setLimit(limit + 60)}>
          Load earlier entries
        </button>
      )}
    </>
  );
}
