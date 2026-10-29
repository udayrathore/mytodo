import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calendarDays,
  calendarMonth,
  calendarShortcuts,
  parseCalendarDate,
  validCalendarDate,
} from "../src/lib/calendar";

test("calendar dates reject overflow, support leap days and keep month grids on Monday", () => {
  assert.equal(validCalendarDate("2026-02-29"), false);
  assert.equal(validCalendarDate("2028-02-29"), true);
  assert.equal(calendarMonth("2026-12-31", 1), "2027-01-01");
  const days = calendarDays("2026-10-01");
  assert.equal(days[0], "2026-09-28");
  assert.equal(days.length, 42);
  assert.ok(days.includes("2026-10-31"));
});

test("calendar shortcuts and typed dates use supplied workspace today rather than browser timezone", () => {
  assert.deepEqual(calendarShortcuts("2026-10-29"), {
    today: "2026-10-29",
    tomorrow: "2026-10-30",
    weekend: "2026-10-31",
    nextWeek: "2026-11-02",
  });
  assert.equal(calendarShortcuts("2026-11-02").nextWeek, "2026-11-09");
  for (const input of ["29 Oct", "Oct 29, 2026", "2026-10-29", "today"])
    assert.equal(parseCalendarDate(input, "2026-10-29"), "2026-10-29");
  assert.equal(parseCalendarDate("tomorrow", "2026-12-31"), "2027-01-01");
  assert.equal(parseCalendarDate("31 Feb 2026", "2026-10-29"), null);
  assert.equal(parseCalendarDate("12/03/2026", "2026-10-29"), null);
});
