"use client";
import {
  useEffect,
  useRef,
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { X, Plus } from "lucide-react";
export const NoticeContext = createContext<{
  text: string;
  error: boolean;
} | null>(null);
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-mark">
        <Plus size={22} />
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}
export function Drawer({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const notice = useContext(NoticeContext);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      className="drawer"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="drawer-inner">
        <header className="drawer-head">
          <span className="eyebrow">{title}</span>
          <button
            className="icon-button"
            aria-label="Close panel"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        {notice && (
          <p
            className={notice.error ? "form-error" : "form-success"}
            role={notice.error ? "alert" : "status"}
          >
            {notice.text}
          </p>
        )}
        {children}
      </div>
    </dialog>
  );
}
export function Chips({
  items,
  selected,
  onChange,
}: {
  items: { id: string; name: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div className="chips">
      {items.map((i) => (
        <button
          key={i.id}
          type="button"
          className={"chip " + (selected.includes(i.id) ? "selected" : "")}
          aria-pressed={selected.includes(i.id)}
          onClick={() =>
            onChange(
              selected.includes(i.id)
                ? selected.filter((x) => x !== i.id)
                : [...selected, i.id],
            )
          }
        >
          {i.name}
        </button>
      ))}
      {!items.length && <small className="muted">Add these in Library.</small>}
    </div>
  );
}
export const human = (value: string) =>
  value === "PLANNED"
    ? "Upcoming"
    : value
        .toLowerCase()
        .replaceAll("_", " ")
        .replace(/^./, (s) => s.toUpperCase());
export const duration = (minutes: number) =>
  minutes >= 60
    ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`
    : `${minutes}m`;
export function displayDate(value: string, timezone?: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(new Date(value));
}
export function localInput(iso: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
  return parts.replace(" ", "T");
}
// Convert a wall-clock input in the workspace timezone, independent of the browser timezone.
export function inputToIso(value: string, timezone: string) {
  let date = new Date(value + "Z");
  for (let i = 0; i < 3; i++) {
    const projected = localInput(date.toISOString(), timezone);
    date = new Date(
      date.getTime() + Date.parse(value + "Z") - Date.parse(projected + "Z"),
    );
  }
  return date.toISOString();
}
