import { z } from "zod";
const addDays = (date: string, days: number) =>
  new Date(new Date(date + "T00:00:00Z").getTime() + days * 86400000)
    .toISOString()
    .slice(0, 10);
export const taskColors = [
  "sage",
  "blue",
  "purple",
  "rose",
  "amber",
  "slate",
] as const;
export const taskIcons = [
  "none",
  "check",
  "star",
  "heart",
  "home",
  "briefcase",
  "book",
  "fitness",
  "wallet",
  "coffee",
  "music",
  "leaf",
  "target",
] as const;
export const repeatRule = z.object({
  unit: z.enum(["DAY", "WEEK", "MONTH"]),
  interval: z.number().int().min(1).max(365),
  endsOn: z.iso.date().nullable().default(null),
});
export type RepeatRule = z.infer<typeof repeatRule>;
// Monthly occurrences always use the original day, clamped for short months.
export function occurrenceDates(
  start: string,
  rule: RepeatRule,
  from: string,
  through: string,
): string[] {
  const end = rule.endsOn && rule.endsOn < through ? rule.endsOn : through;
  if (end < start || end < from) return [];
  const anchor = new Date(start + "T00:00:00Z");
  const first = new Date(from + "T00:00:00Z");
  const step = rule.interval * (rule.unit === "WEEK" ? 7 : 1);
  let n = Math.max(
    0,
    rule.unit === "MONTH"
      ? Math.floor(
          ((first.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
            first.getUTCMonth() -
            anchor.getUTCMonth()) /
            step,
        ) - 1
      : Math.floor((first.getTime() - anchor.getTime()) / 86400000 / step),
  );
  const result: string[] = [];
  while (true) {
    let date: string;
    if (rule.unit === "MONTH") {
      const month = new Date(
        Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + n * step, 1),
      );
      const last = new Date(
        Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0),
      ).getUTCDate();
      month.setUTCDate(Math.min(anchor.getUTCDate(), last));
      date = month.toISOString().slice(0, 10);
    } else date = addDays(start, n * step);
    if (date > end) break;
    if (date >= from) result.push(date);
    n++;
  }
  return result;
}
