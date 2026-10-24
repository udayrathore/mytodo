"use client";
import { useState} from "react";
import type { Workspace} from "@/lib/workspace";
import { addDays,  descendants, weekOf} from "@/lib/domain";
import { useRemote} from "./use-remote";
import { CategoryRadar} from "./category-radar";
import { Field} from "./ui";

export function CategoryDistribution({ data }: { data: Workspace }) {
  const [preset, setPreset] = useState("7d");
  const [customFrom, setCustomFrom] = useState(addDays(data.today, -6));
  const [customTo, setCustomTo] = useState(data.today);
  const monthsAgo = (months: number) => {
    const date = new Date(data.today + "T00:00:00Z");
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() - months);
    const last = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    ).getUTCDate();
    date.setUTCDate(Math.min(day, last));
    return addDays(date.toISOString().slice(0, 10), 1);
  };
  const starts: Record<string, string> = {
    today: data.today,
    yesterday: addDays(data.today, -1),
    week: weekOf(data.today).start,
    "7d": addDays(data.today, -6),
    month: data.today.slice(0, 7) + "-01",
    "30d": addDays(data.today, -29),
    "90d": addDays(data.today, -89),
    year: data.today.slice(0, 4) + "-01-01",
    "6m": monthsAgo(6),
    "12m": monthsAgo(12),
    all: "0001-01-01",
  };
  const from = preset === "custom" ? customFrom : starts[preset];
  const to =
    preset === "custom"
      ? customTo
      : preset === "yesterday"
        ? addDays(data.today, -1)
        : data.today;
  const [parentId, setParentId] = useState("");
  const [metric, setMetric] = useState("activity");
  const valid = !!from && !!to && from <= to && to <= data.today;
  const report = useRemote<{
    rows: { categoryId: string | null; count: number }[];
  }>(
    valid
      ? `/api/reports?${new URLSearchParams({ from, to, metric, kind: "balance" })}`
      : null,
    data,
  );
  const counts = report.data?.rows || [];
  const categories = data.categories.filter(
    (c) => c.parentId === (parentId || null),
  );
  const rows = categories.map((category) => {
    const ids = descendants(data.categories, category.id);
    return {
      ...category,
      count: counts
        .filter((r) => r.categoryId && ids.has(r.categoryId))
        .reduce((n, r) => n + r.count, 0),
    };
  });
  const directCount =
    counts.find((r) => r.categoryId === (parentId || null))?.count || 0;
  const shown = rows
    .filter((r) => r.isActive || r.count > 0)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const total = shown.reduce((sum, r) => sum + r.count, directCount);
  const parent = data.categories.find((c) => c.id === parentId);
  const chart = [
    ...shown,
    {
      id: "direct",
      name: parent ? `Directly in ${parent.name}` : "Uncategorized",
      description: null,
      count: directCount,
    },
  ];
  return (
    <>
      <div className="section-toolbar insight-filter">
        <div className="date-range">
          <Field label="Date range">
            <select
              value={preset}
              onChange={(e) => {
                if (e.target.value === "custom") {
                  setCustomFrom(
                    preset === "all" ? addDays(data.today, -6) : from,
                  );
                  setCustomTo(to);
                }
                setPreset(e.target.value);
              }}
            >
              <optgroup label="Days">
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
              </optgroup>
              <optgroup label="Weeks">
                <option value="week">This week</option>
                <option value="7d">Last 7 days</option>
              </optgroup>
              <optgroup label="Months">
                <option value="month">This month</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
              </optgroup>
              <optgroup label="Year">
                <option value="year">This year</option>
                <option value="6m">Last 6 months</option>
                <option value="12m">Last 12 months</option>
              </optgroup>
              <option value="all">All time</option>
              <option value="custom">Custom range</option>
            </select>
          </Field>
          {preset === "custom" && (
            <>
              <Field label="From">
                <input
                  type="date"
                  value={customFrom}
                  max={customTo || data.today}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
              </Field>
              <Field label="To">
                <input
                  type="date"
                  value={customTo}
                  min={customFrom}
                  max={data.today}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </Field>
            </>
          )}
          <Field label="Measure">
            <select value={metric} onChange={(e) => setMetric(e.target.value)}>
              <option value="activity">Tasks worked on</option>
              <option value="completed">Tasks completed</option>
            </select>
          </Field>
          <Field label="Categories">
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
            >
              <option value="">Primary categories</option>
              {data.categories.map((c) => (
                <option value={c.id} key={c.id}>
                  Inside {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>
      {!valid ? (
        <p role="alert">Choose a date range ending today or earlier.</p>
      ) : report.error ? (
        <p role="alert">{report.error}</p>
      ) : !report.data ? (
        <p role="status">Loading category balance…</p>
      ) : (
        <>
          <section className="panel">
            <div className="section-heading">
              <h2>Category balance</h2>
              <span>{total} tasks</span>
            </div>
            <p className="muted">
              {metric === "activity"
                ? "Tasks with a completion or recorded activity"
                : "Tasks with a completion"}{" "}
              in this period. Each task counts once; each repeat date is a
              separate task. Future plans don’t count.
            </p>
            <CategoryRadar
              rows={chart.filter((row) => row.id !== "direct" || row.count > 0)}
              total={total}
            />
            <p className="panel-footnote">
              Parent totals include their children. Choose “Inside” a category
              to see its children without counting them twice. Archived task
              history is included.
            </p>
          </section>
          <section className="panel">
            <h2>Least active categories</h2>

            {[...shown]
              .sort((a, b) => a.count - b.count || a.sortOrder - b.sortOrder)
              .map((row) => (
                <div className="distribution-row" key={row.id}>
                  <div>
                    <span>{row.name}</span>
                    <strong>
                      {row.count === 0
                        ? "No tasks recorded"
                        : `${row.count} tasks`}
                    </strong>
                  </div>
                  <p className="muted small">
                    {row.description ||
                      "Add a goal in Categories to remember why this area matters."}
                  </p>
                </div>
              ))}
            {!shown.length && (
              <p className="muted">No child categories here yet.</p>
            )}
          </section>
        </>
      )}
    </>
  );
}
