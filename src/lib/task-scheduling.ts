import { addDays, dateKey } from "./domain";
// Shift a due timestamp by a calendar day, preserving its local wall-clock time.
export function nextDayDueDate(
  dueAt: Date | null,
  timezone: string,
): Date | null {
  if (!dueAt) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(dueAt);
  const part = (name: string) => parts.find((p) => p.type === name)!.value;
  const nextDate = addDays(
    `${part("year")}-${part("month")}-${part("day")}`,
    1,
  );
  const target = `${nextDate}T${part("hour")}:${part("minute")}:${part("second")}.${String(dueAt.getUTCMilliseconds()).padStart(3, "0")}Z`;
  let shifted = new Date(dueAt.getTime() + 86400000);
  for (let i = 0; i < 3; i++) {
    const local = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(shifted);
    const value = (name: string) => local.find((p) => p.type === name)!.value;
    const projected = Date.parse(
      `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}:${value("second")}.${String(shifted.getUTCMilliseconds()).padStart(3, "0")}Z`,
    );
    const correction = Date.parse(target) - projected;
    if (!correction) break;
    shifted = new Date(shifted.getTime() + correction);
  }
  return shifted;
}
export function tomorrowDate(timezone: string, now = new Date()) {
  return addDays(dateKey(now, timezone), 1);
}

/** Pending work is open, unarchived, and scheduled no later than today (or undated). */
export function isPendingTask(
  task: {
    status: string;
    archivedAt?: Date | string | null;
    plannedDate: Date | string | null;
  },
  today: string,
): boolean {
  const date =
    task.plannedDate instanceof Date
      ? task.plannedDate.toISOString().slice(0, 10)
      : task.plannedDate?.slice(0, 10);
  return (
    !task.archivedAt &&
    !["COMPLETED", "CANCELLED"].includes(task.status) &&
    (!date || date <= today)
  );
}
