"use client";
import { useEffect, useRef, useState } from "react";
import { displayDate } from "./ui";
type Row = {
  id: string;
  at: string;
  day: string;
  dateOnly: boolean;
  kind: string;
  title: string;
  text: string;
  taskId: string | null;
};
export function RemoteHistory({
  timezone,
  taskId,
  openTask,
  revision,
}: {
  timezone: string;
  taskId?: string;
  openTask?: (task: { id: string }) => void;
  revision?: unknown;
}) {
  const [filter, setFilter] = useState("All"),
    [rows, setRows] = useState<Row[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const generation = useRef(0);
  useEffect(() => {
    const n = ++generation.current;
    const controller = new AbortController();
    setRows([]);
    setCursor(null);
    setBusy(true);
    setError("");
    const q = new URLSearchParams({
      filter,
      ...(taskId ? { task: taskId } : {}),
    });
    fetch(`/api/history?${q}`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error("Could not load history.");
        return r.json();
      })
      .then((d) => {
        if (n === generation.current) {
          setRows(d.items);
          setCursor(d.nextCursor);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (n === generation.current) setBusy(false);
      });
    return () => controller.abort();
  }, [filter, taskId, revision]);
  async function more() {
    if (busy || !cursor) return;
    const n = generation.current;
    setBusy(true);
    setError("");
    try {
      const q = new URLSearchParams({
        filter,
        cursor,
        ...(taskId ? { task: taskId } : {}),
      });
      const r = await fetch(`/api/history?${q}`);
      if (!r.ok) throw new Error("Could not load history.");
      const d = await r.json();
      if (n === generation.current) {
        setRows(
          (old) =>
            [
              ...new Map([...old, ...d.items].map((r) => [r.id, r])).values(),
            ] as Row[],
        );
        setCursor(d.nextCursor);
      }
    } catch (e) {
      if (n === generation.current) setError((e as Error).message);
    } finally {
      if (n === generation.current) setBusy(false);
    }
  }
  return (
    <>
      {!taskId && (
        <div className="tabs">
          {["All", "Task planning", "Action", "Observation"].map((f) => (
            <button
              key={f}
              className={filter === f ? "active" : ""}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="timeline">
        {rows.map((r, i) => (
          <div key={r.id}>
            {r.day !== rows[i - 1]?.day && (
              <h3 className="timeline-date">{displayDate(r.day, "UTC")}</h3>
            )}
            <article className="timeline-entry">
              <span className="history-dot" />
              <div>
                <div className="timeline-meta">
                  {r.kind} ·{" "}
                  {r.dateOnly
                    ? "Date recorded"
                    : new Date(r.at).toLocaleTimeString("en", {
                        hour: "numeric",
                        minute: "2-digit",
                        timeZone: timezone,
                      })}
                </div>
                {r.taskId && openTask ? (
                  <button
                    className="timeline-title"
                    onClick={() => openTask({ id: r.taskId! })}
                  >
                    {r.title}
                  </button>
                ) : (
                  <strong>{r.title}</strong>
                )}
                <p>{r.text}</p>
              </div>
            </article>
          </div>
        ))}
      </div>
      {busy && <p role="status">Loading history…</p>}
      {!busy && !rows.length && !error && <p>No history yet.</p>}
      {cursor && (
        <button className="button" disabled={busy} onClick={more}>
          Load earlier entries
        </button>
      )}
    </>
  );
}
