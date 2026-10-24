"use client";
import { useState, useEffect, useRef } from "react";
import { Folder, Briefcase } from "lucide-react";
import type { Save } from "./task-form";
type Item = { id: string; name: string; isActive: boolean; archivedAt?: string | null; imageData?: string | null };
export function CollectionAvatar({ item, project = false }: { item: Pick<Item, "name" | "imageData">; project?: boolean }) {
  return <span className="collection-avatar">{item.imageData ? <img src={item.imageData} alt="" /> : project ? <Briefcase size={20} /> : <Folder size={20} />}</span>;
}
export function CollectionSettings({ item, kind, save }: { item: Item; kind: "project" | "category"; save: Save }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(item.archivedAt ? "ARCHIVED" : item.isActive ? "ACTIVE" : "CLOSED");
  const [source, setSource] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [x, setX] = useState(50);
  const [y, setY] = useState(50);
  const [size, setSize] = useState(256);
  const [fit, setFit] = useState(false);
  const [remove, setRemove] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  function draw(canvas: HTMLCanvasElement, dimension: number) {
    if (!source) return;
    canvas.width = dimension; canvas.height = dimension;
    const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Image editor unavailable.");
    const scale = (fit ? Math.min(dimension / source.width, dimension / source.height) : Math.max(dimension / source.width, dimension / source.height)) * zoom;
    const width = source.width * scale, height = source.height * scale;
    ctx.drawImage(source, (dimension - width) * x / 100, (dimension - height) * y / 100, width, height);
  }
  useEffect(() => { if (source && canvasRef.current) draw(canvasRef.current, size); }, [source, zoom, x, y, size, fit]);
  return <section className="image-editor form-stack" aria-label="Status and display image">
    <label className="field">Status<select disabled={busy} value={status} onChange={e => setStatus(e.target.value)}>
      <option value="ACTIVE">Active</option><option value="CLOSED">Closed</option><option value="ARCHIVED">Archived</option>
    </select></label>
    {!source && !remove && <CollectionAvatar item={item} project={kind === "project"} />}
    <label className="field">Display image · up to 2 MB<input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/bmp,image/x-icon,image/vnd.microsoft.icon" disabled={busy} onChange={async e => {
      const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
      setError(""); setBusy(true);
      let url = "";
      try {
        if (file.size > 2 * 1024 * 1024) throw new Error("Choose an image of 2 MB or less.");
        if (!/\.(jpe?g|png|webp|gif|avif|bmp|ico)$/i.test(file.name)) throw new Error("Choose JPG, PNG, WebP, GIF, AVIF, BMP or ICO.");
        url = URL.createObjectURL(file);
        const img = new Image(); img.src = url; await img.decode();
        if (!img.width || !img.height) throw new Error("Could not read this image.");
        // Keep a decoded still frame so animated inputs have a stable crop.
        const still = document.createElement("canvas");
        const ratio = Math.min(1, 2048 / Math.max(img.width, img.height));
        still.width = Math.max(1, Math.round(img.width * ratio)); still.height = Math.max(1, Math.round(img.height * ratio));
        still.getContext("2d")!.drawImage(img, 0, 0, still.width, still.height);
        const decoded = new Image(); decoded.src = still.toDataURL("image/png"); await decoded.decode();
        setSource(decoded); setZoom(1); setX(50); setY(50); setFit(false); setRemove(false);
      } catch (e) { setError(e instanceof DOMException && e.name === "EncodingError" ? "This image could not be opened. Try exporting it as JPG or PNG, then upload it again." : e instanceof Error ? e.message : "Could not read image."); }
      finally { if (url) URL.revokeObjectURL(url); setBusy(false); }
    }} /></label>
    {source && <div className="form-stack">
      <canvas ref={canvasRef} className="crop-preview" aria-label="Cropped image preview" />
      <label className="checkbox-label"><input type="checkbox" checked={fit} onChange={e => { setFit(e.target.checked); setZoom(1); }} />Fit entire image</label>
      <label className="field">Zoom<input type="range" min="1" max="4" step="0.05" value={zoom} onChange={e => setZoom(Number(e.target.value))} /></label>
      <label className="field">Horizontal position<input type="range" min="0" max="100" value={x} onChange={e => setX(Number(e.target.value))} /></label>
      <label className="field">Vertical position<input type="range" min="0" max="100" value={y} onChange={e => setY(Number(e.target.value))} /></label>
      <label className="field">Image size<select value={size} onChange={e => setSize(Number(e.target.value))}>{[128,256,512].map(n => <option key={n} value={n}>{n} × {n} px</option>)}</select></label>
      <p className="muted small">Saved as a compressed still image.</p>
      <button type="button" className="text-button" disabled={busy} onClick={() => setSource(null)}>Cancel image change</button>
    </div>}
    {(item.imageData || source) && <button type="button" className="text-button" disabled={busy} onClick={() => { setRemove(true); setSource(null); }}>Use default image</button>}
    {remove && <p className="muted">Default image selected.</p>}
    <button type="button" className="button" disabled={busy} onClick={async () => {
      setBusy(true); setError("");
      try {
        let imageData: string | null | undefined = remove ? null : undefined;
        if (source) {
          const canvas = document.createElement("canvas"); draw(canvas, size);
          imageData = canvas.toDataURL("image/webp", .85);
          for (const quality of [.7, .55, .4, .25]) {
            if (imageData.length <= 65000) break;
            imageData = canvas.toDataURL("image/webp", quality);
          }
          if (imageData.length > 65000) { draw(canvas, 128); imageData = canvas.toDataURL("image/webp", .7); }
          if (imageData.length > 65000) throw new Error("Image could not be compressed. Choose a smaller size.");
        }
        if (await save({ type: "collection.settings", id: item.id, kind, status, ...(imageData !== undefined ? { imageData } : {}) })) { setSource(null); setRemove(false); }
      } catch (e) { setError(e instanceof Error ? e.message : "Could not save image."); }
      finally { setBusy(false); }
    }}>{busy ? "Saving…" : "Save status & image"}</button>
    {error && <p role="alert">{error}</p>}
  </section>;
}
