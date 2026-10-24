"use client";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useState, useRef, useEffect } from "react";
import { ArrowLeft, Bold, Italic, Underline, Strikethrough, List, ListOrdered, Quote, Undo2, Redo2 } from "lucide-react";
import type { Workspace, Journal } from "@/lib/workspace";
import { Chips, localInput, inputToIso } from "./ui";
type Draft = { title: string; content: string; document: Record<string, unknown>; occurredAt: string; categoryIds: string[]; entityIds: string[] };
export default function JournalDocument({ journal, data, onSaved, onClose, onArchive }: { journal: Journal; data: Workspace; onSaved: (j: Journal) => void; onClose: () => void; onArchive: (j: Journal) => Promise<boolean> }) {
  const initial: Draft = { title: journal.title || "", content: journal.content, document: journal.document || { type: "doc", content: journal.content.split("\n").map(line => ({ type: "paragraph", ...(line ? {content: [{ type: "text", text: line }]} : {}) })) }, occurredAt: journal.occurredAt, categoryIds: journal.categories.map(c => c.categoryId), entityIds: journal.entities.map(e => e.entityId) };
  const [draft, setDraft] = useState(initial);
  const latest = useRef(initial);
  const version = useRef(journal.version ?? 0);
  const revision = useRef(0), saved = useRef(0);
  const pending = useRef<Promise<boolean> | null>(null);
  const [tick, setTick] = useState(0);
  const [status, setStatus] = useState("Saved");
  const [error, setError] = useState("");
  const [details, setDetails] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [recovery, setRecovery] = useState<{ draft: Draft; version: number } | null>(null);
  const blocked = useRef(false);
  const key = `journal-draft:${journal.id}`;
  function change(patch: Partial<Draft>) {
    const next = { ...latest.current, ...patch }; latest.current = next; setDraft(next); revision.current++; setTick(n => n+1); setStatus("Unsaved changes");
    try { sessionStorage.setItem(key, JSON.stringify({ draft: next, version: version.current })); } catch { /* server save remains available */ }
  }
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: false, heading: { levels: [1,2,3] } })],
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    content: initial.document,
    editorProps: { attributes: { class: "journal-prose", role: "textbox", "aria-label": "Document body", "aria-multiline": "true" } },
    onUpdate: ({ editor }) => change({ content: editor.getText(), document: editor.getJSON() }),
  });
  useEffect(() => {
    try { const raw = sessionStorage.getItem(key); if (raw) { const cached = JSON.parse(raw); if (cached.draft?.document && typeof cached.draft.title === "string") setRecovery(cached); } } catch { /* ignore invalid draft */ }
    const warn = (e: BeforeUnloadEvent) => { if (revision.current !== saved.current) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [key]);
  async function flush(): Promise<boolean> {
    if (pending.current) return pending.current;
    if (blocked.current) return false;
    const work = async () => {
      while (saved.current < revision.current) {
        const snapshot = latest.current, target = revision.current;
        setStatus("Saving…"); setError("");
        try {
          const r = await fetch("/api/commands", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "journal.save", id: journal.id, version: version.current, ...snapshot }) });
          const result = await r.json();
          if (!r.ok) { if (r.status === 409) blocked.current = true; throw new Error(r.status === 409 ? "This document changed in another tab. Your draft is retained in this tab. Copy your text before reopening the latest version." : result.error || "Could not save. Your draft is retained in this tab."); }
          version.current = result.version; saved.current = target;
          onSaved({ ...journal, ...snapshot, version: result.version, categories: snapshot.categoryIds.map(categoryId => ({ categoryId })), entities: snapshot.entityIds.map(entityId => ({ entityId })) });
          if (revision.current === target) { try { sessionStorage.removeItem(key); } catch {} }
          else { try { sessionStorage.setItem(key, JSON.stringify({ draft: latest.current, version: version.current })); } catch {} }
        } catch(e) { setStatus("Not saved"); setError(e instanceof Error ? e.message : "Could not save."); return false; }
      }
      setStatus("Saved"); return true;
    };
    pending.current = work();
    try { return await pending.current; } finally { pending.current = null; }
  }
  useEffect(() => {
    if (!tick || recovery) return;
    const timer = setTimeout(() => { void flush(); }, 1200);
    return () => clearTimeout(timer);
  }, [tick, recovery]);
  useEffect(() => {
    const shortcut = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void flush(); } };
    window.addEventListener("keydown", shortcut); return () => window.removeEventListener("keydown", shortcut);
  });
  const tools = editor ? [
    { name: "Undo", Icon: Undo2, action: () => editor.chain().focus().undo().run(), disabled: !editor.can().undo() },
    { name: "Redo", Icon: Redo2, action: () => editor.chain().focus().redo().run(), disabled: !editor.can().redo() },
    { name: "Bold", Icon: Bold, action: () => editor.chain().focus().toggleBold().run(), active: editor.isActive("bold") },
    { name: "Italic", Icon: Italic, action: () => editor.chain().focus().toggleItalic().run(), active: editor.isActive("italic") },
    { name: "Underline", Icon: Underline, action: () => editor.chain().focus().toggleUnderline().run(), active: editor.isActive("underline") },
    { name: "Strikethrough", Icon: Strikethrough, action: () => editor.chain().focus().toggleStrike().run(), active: editor.isActive("strike") },
    { name: "Bulleted list", Icon: List, action: () => editor.chain().focus().toggleBulletList().run(), active: editor.isActive("bulletList") },
    { name: "Numbered list", Icon: ListOrdered, action: () => editor.chain().focus().toggleOrderedList().run(), active: editor.isActive("orderedList") },
    { name: "Quote", Icon: Quote, action: () => editor.chain().focus().toggleBlockquote().run(), active: editor.isActive("blockquote") },
  ] : [];
  return <section className="journal-document">
    <header className="document-header"><button className="icon-button" aria-label="Back to documents" disabled={leaving} onClick={async () => { setLeaving(true); if (await flush()) onClose(); else setLeaving(false); }}><ArrowLeft size={20} /></button>
      <input aria-label="Document title" value={draft.title} maxLength={240} placeholder="Untitled document" onChange={e => change({title: e.target.value})} />
      <span role="status" className="document-save-status">{status}</span><button className="button" onClick={() => void flush()}>Save</button><button className="button" aria-expanded={details} onClick={() => setDetails(!details)}>Details</button>
    </header>
    {error && <p className="document-error" role="alert">{error} {!blocked.current && <button className="text-button" onClick={() => void flush()}>Retry</button>}</p>}
    {recovery && <div className="document-error">An unsaved draft is available in this tab. <button className="button" onClick={() => { const old = recovery; setRecovery(null); if (old.version !== version.current) { blocked.current = true; setError("The server version has changed. Recovered text is available to copy; automatic saving is paused."); } editor?.commands.setContent(old.draft.document, {emitUpdate: false}); change(old.draft); }}>Recover draft</button><button className="text-button" onClick={() => { sessionStorage.removeItem(key); setRecovery(null); }}>Discard draft</button></div>}
    <div className="document-toolbar" role="toolbar" aria-label="Document formatting">
      <select aria-label="Paragraph style" value={editor?.isActive("heading", {level:1}) ? "1" : editor?.isActive("heading", {level:2}) ? "2" : editor?.isActive("heading", {level:3}) ? "3" : "0"} onChange={e => { const level = Number(e.target.value); if (level) editor?.chain().focus().setHeading({level: level as 1|2|3}).run(); else editor?.chain().focus().setParagraph().run(); }}><option value="0">Normal text</option><option value="1">Heading 1</option><option value="2">Heading 2</option><option value="3">Heading 3</option></select>
      {tools.map(t => <button key={t.name} className="icon-button" aria-label={t.name} data-tooltip={t.name} aria-pressed={t.active} disabled={t.disabled} onMouseDown={e => e.preventDefault()} onClick={t.action}><t.Icon size={17} /></button>)}
    </div>
    {details && <div className="document-details form-stack"><label className="field">Entry date<input type="datetime-local" value={localInput(draft.occurredAt, data.user.timezone)} onChange={e => { if (e.target.value) change({occurredAt: inputToIso(e.target.value, data.user.timezone)}); }} /></label><div className="field"><span>Categories</span><Chips items={data.categories.filter(c => c.isActive || draft.categoryIds.includes(c.id))} selected={draft.categoryIds} onChange={categoryIds => change({categoryIds})} /></div><div className="field"><span>Entities</span><Chips items={data.entities} selected={draft.entityIds} onChange={entityIds => change({entityIds})} /></div><button className="text-button danger" disabled={leaving} onClick={async () => { setLeaving(true); if (await flush()) await onArchive(journal); setLeaving(false); }}>Archive document</button></div>}
    <div className="document-desk"><div className="document-paper"><EditorContent editor={editor} /></div></div>
    <footer className="document-footer">{draft.content.trim() ? draft.content.trim().split(/\s+/).length : 0} words</footer>
  </section>;
}
