"use client";
import { useState } from "react";
import { Folder, Briefcase } from "lucide-react";
import type { Save } from "./task-form";
type Item = { id: string; name: string; isActive: boolean; archivedAt?: string | null; imageData?: string | null };
export function CollectionAvatar({ item, project = false }: { item: Pick<Item, "name" | "imageData">; project?: boolean }) {
  return <span className="collection-avatar">{item.imageData ? <img src={item.imageData} alt="" /> : project ? <Briefcase size={20} /> : <Folder size={20} />}</span>;
}
export function CollectionSettings({ item, kind, save, compact = false }: { item: Item; kind: "project" | "category"; save: Save; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function update(fields: Record<string, unknown>) {
    setBusy(true); setError("");
    try { await save({ type: "collection.settings", id: item.id, kind, ...fields }); }
    finally { setBusy(false); }
  }
  return <div className={"collection-settings" + (compact ? " compact" : "")}>
    {!compact && <CollectionAvatar item={item} project={kind === "project"} />}
    <label className="field">Status<select aria-label={`${item.name} status`} disabled={busy} value={item.archivedAt ? "ARCHIVED" : item.isActive ? "ACTIVE" : "CLOSED"} onChange={e => update({ status: e.target.value })}>
      <option value="ACTIVE">Active</option><option value="CLOSED">Closed</option><option value="ARCHIVED">Archived</option>
    </select></label>
    <label className="image-upload">Upload logo<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={async e => {
      const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
      setError(""); setBusy(true);
      let url = "";
      try {
        if (file.size > 10 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Choose a PNG, JPEG or WebP image under 10 MB.");
        url = URL.createObjectURL(file);
        const img = new Image(); img.src = url; await img.decode();
        const canvas = document.createElement("canvas"); canvas.width = 192; canvas.height = 192;
        const context = canvas.getContext("2d"); if (!context) throw new Error("Could not read image.");
        const scale = Math.min(192 / img.width, 192 / img.height);
        context.drawImage(img, (192 - img.width * scale) / 2, (192 - img.height * scale) / 2, img.width * scale, img.height * scale);
        const imageData = canvas.toDataURL("image/webp", .8);
        if (imageData.length > 65000) throw new Error("Choose a simpler image.");
        await update({ imageData });
      } catch (error) { setError(error instanceof Error ? error.message : "Could not upload image."); }
      finally { if (url) URL.revokeObjectURL(url); setBusy(false); }
    }} /></label>
    {item.imageData && <button className="text-button" disabled={busy} onClick={() => update({ imageData: null })}>Reset image</button>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
