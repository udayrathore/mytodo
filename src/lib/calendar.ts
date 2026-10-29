export function calendarDate(value: string): string {
  return value.slice(0, 10);
}

export function validCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function shiftCalendarDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function calendarMonth(value: string, offset = 0): string {
  const date = new Date(`${value.slice(0, 7)}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 10);
}

export function calendarDays(month: string): string[] {
  const first = calendarMonth(month);
  const weekday = new Date(`${first}T00:00:00Z`).getUTCDay();
  const start = shiftCalendarDate(first, -((weekday + 6) % 7));
  return Array.from({ length: 42 }, (_, i) => shiftCalendarDate(start, i));
}

export function calendarShortcuts(today: string) {
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  return {
    today,
    tomorrow: shiftCalendarDate(today, 1),
    weekend: shiftCalendarDate(today, (6 - weekday + 7) % 7),
    nextWeek: shiftCalendarDate(today, 8 - (weekday || 7)),
  };
}

const months = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

/** Accept explicit calendar dates and a small, predictable set of shortcuts. */
export function parseCalendarDate(input: string, today: string): string | null {
  const text = input
    .trim()
    .toLowerCase()
    .replaceAll(",", "")
    .replace(/\s+/g, " ");
  const shortcuts = calendarShortcuts(today);
  if (text === "today") return today;
  if (text === "tomorrow") return shortcuts.tomorrow;
  if (text === "next week") return shortcuts.nextWeek;
  if (text === "this weekend") return shortcuts.weekend;
  if (validCalendarDate(text)) return text;
  const dayFirst = /^(\d{1,2}) ([a-z]{3,9})(?: (\d{4}))?$/.exec(text);
  const monthFirst = /^([a-z]{3,9}) (\d{1,2})(?: (\d{4}))?$/.exec(text);
  if (!dayFirst && !monthFirst) return null;
  const month = months.indexOf((dayFirst?.[2] || monthFirst![1]).slice(0, 3));
  if (month < 0) return null;
  const day = dayFirst?.[1] || monthFirst![2];
  const year = dayFirst?.[3] || monthFirst?.[3] || today.slice(0, 4);
  const value = `${year}-${String(month + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
  return validCalendarDate(value) ? value : null;
}
