export type SummarySlot = "morning" | "evening";
export type SummaryCounts = { completed: number; pending: number };
export function localSummaryClock(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (name: string) => parts.find((part) => part.type === name)!.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
  };
}
/** New summaries normally start in the first 15 minutes; queued failures retry for an hour after enqueue. */
export function dueSummarySlot(
  timezone: string,
  now = new Date(),
  windowMinutes = 15,
) {
  const clock = localSummaryClock(timezone, now);
  if (
    clock.minute >= Math.max(1, Math.min(60, windowMinutes)) ||
    ![9, 20].includes(clock.hour)
  )
    return null;
  return {
    date: clock.date,
    slot: (clock.hour === 9 ? "morning" : "evening") as SummarySlot,
    expiresAt: new Date(now.getTime() + 60 * 60_000),
  };
}
export function summaryPayload(
  counts: SummaryCounts,
  date: string,
  slot: SummarySlot | "test",
) {
  return {
    title:
      slot === "test"
        ? "Task summary test"
        : slot === "morning"
          ? "Your 9am task summary"
          : "Your 8pm task summary",
    body: `${counts.completed} completed today · ${counts.pending} pending`,
    tag: `task-summary-${date}-${slot}`,
    url: "/?view=today",
  };
}
export function pushRetryDelay(attempts: number) {
  return Math.min(15 * 60_000, 30_000 * 2 ** Math.max(0, attempts - 1));
}
