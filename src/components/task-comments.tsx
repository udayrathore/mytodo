"use client";
import { useEffect, useState } from "react";
import type { Save } from "./task-form";

type Comment = { id: string; body: string; createdAt: string };
export function TaskComments({ taskId, timezone, save, showEditor=true }: { showEditor?:boolean; taskId: string; timezone: string; save: Save }) {
  const [items, setItems] = useState<Comment[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [body, setBody] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(`/api/comments?task=${taskId}`, { signal: controller.signal, cache: "no-store" })
      .then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error); return data; })
      .then(data => { setItems(data.items); setCursor(data.nextCursor); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [taskId, revision]);
  async function loadMore() {
    setLoading(true); setError("");
    try {
      const r = await fetch(`/api/comments?task=${taskId}&cursor=${cursor}`, { cache: "no-store" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setItems(previous => [...previous, ...data.items]); setCursor(data.nextCursor);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load comments."); }
    finally { setLoading(false); }
  }
  if(!showEditor&&!items.length&&!error)return null;
  return <section className="subsection task-comments" aria-label="Task comments">
    <h3>Comments</h3>
    {showEditor&&<form className="form-stack" onSubmit={async e => {
      e.preventDefault(); if (busy || !body.trim()) return;
      setBusy(true);
      try {
        if (await save({ type: "task.comment", id: taskId, body: body.trim() })) {
          setBody(""); setRevision(r => r + 1);
        }
      } finally { setBusy(false); }
    }}>
      <label className="field"><span>Add a comment</span>
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={3} maxLength={5000} required disabled={busy} placeholder="Write a comment…" />
      </label>
      <button className="button primary" disabled={busy || loading || !body.trim()}>{busy ? "Adding…" : "Add comment"}</button>
    </form>}
    {error && <p role="alert">{error} <button className="text-button" onClick={() => setRevision(r => r + 1)}>Retry</button></p>}
    <div aria-live="polite">
      {!loading && !error && !items.length && <p className="muted">No comments yet.</p>}
      {items.map(comment => <article key={comment.id} className="task-comment">
        <time className="muted" dateTime={comment.createdAt}>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(comment.createdAt))}</time>
        <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{comment.body}</p>
      </article>)}
      {loading && <p className="muted">Loading comments…</p>}
    </div>
    {cursor && <button className="button" disabled={loading || busy} onClick={loadMore}>Older comments</button>}
  </section>;
}
