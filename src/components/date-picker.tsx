"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleSlash,
  Clock3,
  Repeat2,
  Sofa,
  Sun,
  X,
} from "lucide-react";
import {
  calendarDate,
  calendarDays,
  calendarMonth,
  calendarShortcuts,
  parseCalendarDate,
  shiftCalendarDate,
} from "@/lib/calendar";
import styles from "./date-picker.module.css";

export type DatePickerProps = {
  name?: string;
  form?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  label?: string;
  triggerText?: string;
  id?: string;
  required?: boolean;
  min?: string;
  max?: string;
  allowNoDate?: boolean;
  includeTime?: boolean;
  disabled?: boolean;
  today?: string;
  className?: string;
  children?: ReactNode;
};

const friendlyDate = (date: string, options?: Intl.DateTimeFormatOptions) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
    ...options,
  });

export function DatePicker({
  name,
  form,
  value,
  defaultValue = "",
  onChange,
  label = "Date",
  triggerText,
  id,
  required = false,
  min,
  max,
  allowNoDate = !required,
  includeTime = false,
  disabled = false,
  today: suppliedToday,
  className = "",
  children,
}: DatePickerProps) {
  const generatedId = useId();
  const fieldId = id || generatedId;
  const panelId = `${fieldId}-calendar`;
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const repeatMenu = useRef<HTMLDetailsElement>(null);
  const editor = useRef<HTMLInputElement>(null);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const selected = value === undefined ? internalValue : value;
  const selectedDate = calendarDate(selected);
  const today =
    suppliedToday ||
    new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [month, setMonth] = useState(() =>
    calendarMonth(selectedDate || today),
  );
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [time, setTime] = useState(selected.slice(11, 16) || "09:00");
  const [position, setPosition] = useState<CSSProperties>({});
  const dates = calendarDays(month);
  const shortcuts = calendarShortcuts(today);

  function close(returnFocus = false) {
    if (repeatMenu.current) repeatMenu.current.open = false;
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  }
  function show() {
    if (disabled) return;
    setDraft(selectedDate ? friendlyDate(selectedDate) : "");
    setMonth(calendarMonth(selectedDate || today));
    setTime(selected.slice(11, 16) || "09:00");
    setError("");
    setHasOpened(true);
    setOpen(true);
  }
  function candidate(date: string, nextTime = time) {
    return date && includeTime ? `${date}T${nextTime}` : date;
  }
  function permitted(date: string, nextTime = time) {
    const next = candidate(date, nextTime);
    if (!date) return !required && allowNoDate;
    // Date-only constraints apply to the whole calendar day, even on a timed field.
    return (
      (!min || (min.length === 10 ? date >= min : next >= min)) &&
      (!max || (max.length === 10 ? date <= max : next <= max))
    );
  }
  function commit(date: string, shouldClose = true, nextTime = time) {
    if (!permitted(date, nextTime)) {
      setError(
        !date
          ? "Choose a date for this field."
          : "Choose a date within the allowed range.",
      );
      return;
    }
    const next = candidate(date, nextTime);
    if (value === undefined) setInternalValue(next);
    onChange?.(next);
    setDraft(date ? friendlyDate(date) : "");
    setError("");
    if (shouldClose) close(true);
  }
  function applyDraft() {
    if (!draft.trim() || /^(no date|none)$/i.test(draft.trim())) {
      commit("");
      return;
    }
    const parsed = parseCalendarDate(draft, today);
    if (!parsed) {
      setError("Use a date such as 29 Oct 2026 or YYYY-MM-DD.");
      return;
    }
    commit(parsed);
  }

  useLayoutEffect(() => {
    if (!open) return;
    let frame = 0;
    let followupFrame = 0;
    const place = () => {
      const box = trigger.current?.getBoundingClientRect();
      if (!box) return;
      const margin = 12;
      const width = Math.min(340, window.innerWidth - margin * 2);
      // A short space above/below the chip must not squash the whole calendar.
      // When neither side fits, overlap the anchor and use the available viewport.
      const maxHeight = Math.max(
        100,
        Math.min(680, window.innerHeight - margin * 2),
      );
      const height = Math.min(panel.current?.scrollHeight || 600, maxHeight);
      const below = box.bottom + 8;
      const above = box.top - height - 8;
      const preferred =
        below + height <= window.innerHeight - margin
          ? below
          : above >= margin
            ? above
            : below;
      const next: CSSProperties = {
        position: "fixed",
        left: Math.max(
          margin,
          Math.min(box.left, window.innerWidth - width - margin),
        ),
        top: Math.max(
          margin,
          Math.min(preferred, window.innerHeight - height - margin),
        ),
        width,
        maxHeight,
      };
      setPosition((previous) =>
        previous.left === next.left &&
        previous.top === next.top &&
        previous.width === next.width &&
        previous.maxHeight === next.maxHeight
          ? previous
          : next,
      );
    };
    const schedulePlace = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    place();
    editor.current?.focus({ preventScroll: true });
    editor.current?.select();
    // Parent dialogs can be shown/centered after this child's layout effect.
    // Re-measure after that layout, and again if the dialog or repeat section grows.
    frame = requestAnimationFrame(() => {
      place();
      followupFrame = requestAnimationFrame(place);
    });
    const observer = new ResizeObserver(schedulePlace);
    if (trigger.current) observer.observe(trigger.current);
    if (panel.current) observer.observe(panel.current);
    const dialog = root.current?.closest("dialog");
    if (dialog) observer.observe(dialog);
    window.addEventListener("resize", schedulePlace);
    window.addEventListener("scroll", schedulePlace, true);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(followupFrame);
      observer.disconnect();
      window.removeEventListener("resize", schedulePlace);
      window.removeEventListener("scroll", schedulePlace, true);
    };
  }, [open]);

  useEffect(() => {
    if (value !== undefined) return;
    const form = root.current?.closest("form");
    if (!form) return;
    const reset = (event: Event) => {
      queueMicrotask(() => {
        if (event.defaultPrevented) return;
        setInternalValue(defaultValue);
        setTime(defaultValue.slice(11, 16) || "09:00");
        setError("");
        setOpen(false);
      });
    };
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [defaultValue, value]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (
        repeatMenu.current?.open &&
        !repeatMenu.current.contains(event.target as Node)
      )
        repeatMenu.current.open = false;
      if (!root.current?.contains(event.target as Node)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // A nested repeat-until calendar consumes Escape before its parent.
        const nearestOpenCalendar = (event.target as Element)?.closest?.(
          '[data-calendar-open="true"]',
        );
        if (nearestOpenCalendar && nearestOpenCalendar !== root.current) return;
        event.preventDefault();
        event.stopPropagation();
        if (repeatMenu.current?.open) {
          repeatMenu.current.open = false;
          repeatMenu.current.querySelector("summary")?.focus();
        } else close(true);
      }
    };
    document.addEventListener("pointerdown", outside);
    // A calendar inside a task dialog consumes Escape before that dialog closes.
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape, true);
    };
  }, [open]);

  const dateText = selectedDate
    ? selectedDate === today
      ? "Today"
      : selectedDate === shortcuts.tomorrow
        ? "Tomorrow"
        : friendlyDate(selectedDate, { year: undefined })
    : "No date";
  const buttonText =
    includeTime && selected
      ? `${dateText} · ${selected.slice(11, 16)}`
      : dateText;

  return (
    <div
      ref={root}
      data-calendar-open={open}
      className={`${styles.root} ${className}`}
      onBlurCapture={(event) => {
        if (
          open &&
          event.relatedTarget &&
          !root.current?.contains(event.relatedTarget as Node)
        )
          close();
      }}
    >
      <input
        id={fieldId}
        className={styles.validationInput}
        name={name}
        form={form}
        type={includeTime ? "datetime-local" : "date"}
        value={selected}
        min={min}
        max={max}
        required={required}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => commit(event.target.value, false)}
        onInvalid={(event) => {
          event.preventDefault();
          show();
          setError("Choose a valid date for this field.");
        }}
      />
      <button
        ref={trigger}
        type="button"
        disabled={disabled}
        className={`${styles.trigger} ${selectedDate === today ? styles.today : ""}`}
        aria-label={triggerText ? label : `${label}: ${buttonText}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => (open ? close() : show())}
      >
        <CalendarDays size={16} aria-hidden="true" />
        <span>{triggerText || buttonText}</span>
      </button>
      {(hasOpened || children) && (
        <div
          ref={panel}
          id={panelId}
          role="dialog"
          aria-label={`Choose ${label.toLowerCase()}`}
          className={styles.panel}
          style={position}
          hidden={!open}
        >
          <div className={styles.inputRow}>
            <input
              ref={editor}
              type="text"
              value={draft}
              aria-label={`Enter ${label.toLowerCase()}`}
              placeholder="Type a date…"
              aria-invalid={!!error}
              aria-describedby={error ? `${panelId}-error` : undefined}
              onChange={(event) => {
                setDraft(event.target.value);
                setError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.stopPropagation();
                  applyDraft();
                }
              }}
            />
            <button type="button" aria-label="Apply date" onClick={applyDraft}>
              <Check size={17} />
            </button>
            <button
              type="button"
              aria-label="Close calendar"
              onClick={() => close(true)}
            >
              <X size={17} />
            </button>
          </div>
          {error && (
            <p id={`${panelId}-error`} className={styles.error} role="alert">
              {error}
            </p>
          )}
          <div className={styles.shortcuts}>
            {[
              {
                label: "Today",
                date: shortcuts.today,
                icon: <CalendarDays size={18} />,
              },
              {
                label: "Tomorrow",
                date: shortcuts.tomorrow,
                icon: <Sun size={18} />,
              },
              {
                label: "This weekend",
                date: shortcuts.weekend,
                icon: <Sofa size={18} />,
              },
              {
                label: "Next week",
                date: shortcuts.nextWeek,
                icon: <ChevronRight size={18} />,
              },
            ].map((item) => (
              <button
                type="button"
                key={item.label}
                disabled={!permitted(item.date)}
                onClick={() => commit(item.date)}
              >
                <span className={styles.shortcutName}>
                  {item.icon}
                  {item.label}
                </span>
                <small>
                  {new Date(`${item.date}T00:00:00Z`).toLocaleDateString("en", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    timeZone: "UTC",
                  })}
                </small>
              </button>
            ))}
            {allowNoDate && !required && (
              <button type="button" onClick={() => commit("")}>
                <span className={styles.shortcutName}>
                  <CircleSlash size={18} />
                  No date
                </span>
              </button>
            )}
          </div>
          <div className={styles.calendar}>
            <div className={styles.monthHeading}>
              <strong>
                {new Date(`${month}T00:00:00Z`).toLocaleDateString("en", {
                  month: "long",
                  year: "numeric",
                  timeZone: "UTC",
                })}
              </strong>
              <div>
                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={() => setMonth(calendarMonth(month, -1))}
                >
                  <ChevronLeft size={17} />
                </button>
                <button
                  type="button"
                  aria-label="Show current month"
                  onClick={() => setMonth(calendarMonth(today))}
                >
                  <span aria-hidden="true">○</span>
                </button>
                <button
                  type="button"
                  aria-label="Next month"
                  onClick={() => setMonth(calendarMonth(month, 1))}
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>
            <div className={styles.weekdays} aria-hidden="true">
              {["M", "T", "W", "T", "F", "S", "S"].map((day, i) => (
                <span key={i}>{day}</span>
              ))}
            </div>
            <div
              className={styles.days}
              role="group"
              aria-label="Calendar dates"
              onKeyDown={(event) => {
                const current = (event.target as HTMLElement).dataset.date;
                if (!current) return;
                const offset = (
                  {
                    ArrowLeft: -1,
                    ArrowRight: 1,
                    ArrowUp: -7,
                    ArrowDown: 7,
                  } as Record<string, number>
                )[event.key];
                if (!offset) return;
                event.preventDefault();
                const next = shiftCalendarDate(current, offset);
                const target = root.current?.querySelector<HTMLButtonElement>(
                  `[data-date="${next}"]`,
                );
                if (target && !target.disabled) target.focus();
                else if (!target) {
                  setMonth(calendarMonth(next));
                  requestAnimationFrame(() =>
                    root.current
                      ?.querySelector<HTMLButtonElement>(
                        `[data-date="${next}"]`,
                      )
                      ?.focus(),
                  );
                }
              }}
            >
              {dates.map((date) => (
                <button
                  type="button"
                  key={date}
                  data-date={date}
                  disabled={!permitted(date)}
                  aria-label={friendlyDate(date, { weekday: "long" })}
                  aria-pressed={date === selectedDate}
                  aria-current={date === today ? "date" : undefined}
                  className={`${date.slice(0, 7) !== month.slice(0, 7) ? styles.otherMonth : ""} ${date === selectedDate ? styles.selected : ""} ${date === today ? styles.currentDay : ""}`}
                  onClick={() => commit(date)}
                >
                  {Number(date.slice(8, 10))}
                </button>
              ))}
            </div>
          </div>
          {includeTime && (
            <div className={styles.timeRow}>
              <label>
                <Clock3 size={17} aria-hidden="true" />
                Time
                <input
                  type="time"
                  aria-label={`${label} time`}
                  value={time}
                  onChange={(event) => {
                    const next = event.target.value;
                    setTime(next);
                    if (selectedDate && next) commit(selectedDate, false, next);
                  }}
                />
              </label>
            </div>
          )}
          {children && (
            <details ref={repeatMenu} className={styles.repeat}>
              <summary>
                <Repeat2 size={17} aria-hidden="true" />
                Repeat
              </summary>
              <div>{children}</div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
