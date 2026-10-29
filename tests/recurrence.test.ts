import { test } from "node:test";
import assert from "node:assert/strict";
import { occurrenceDates, repeatRule } from "../src/lib/recurrence";
test("monthly repeats keep the anchor day across short months and leap years", () => {
  assert.deepEqual(
    occurrenceDates(
      "2024-01-31",
      { unit: "MONTH", interval: 1, endsOn: null },
      "2024-01-01",
      "2024-04-30",
    ),
    ["2024-01-31", "2024-02-29", "2024-03-31", "2024-04-30"],
  );
  assert.deepEqual(
    occurrenceDates(
      "2025-01-31",
      { unit: "MONTH", interval: 1, endsOn: null },
      "2025-02-01",
      "2025-03-31",
    ),
    ["2025-02-28", "2025-03-31"],
  );
});
test("custom windows respect interval, inclusive end, and requested range", () => {
  assert.deepEqual(
    occurrenceDates(
      "2026-10-20",
      { unit: "DAY", interval: 3, endsOn: "2026-10-29" },
      "2026-10-23",
      "2027-01-01",
    ),
    ["2026-10-23", "2026-10-26", "2026-10-29"],
  );
  assert.deepEqual(
    occurrenceDates(
      "2026-10-20",
      { unit: "WEEK", interval: 2, endsOn: null },
      "2026-10-21",
      "2026-11-20",
    ),
    ["2026-11-03", "2026-11-17"],
  );
  assert.equal(
    repeatRule.safeParse({ unit: "DAY", interval: 0 }).success,
    false,
  );
});

test("weekday repeats skip weekends and yearly schedules preserve their calendar anchor", () => {
  assert.deepEqual(
    occurrenceDates(
      "2026-10-29",
      { unit: "WEEKDAY", interval: 1, endsOn: null },
      "2026-10-29",
      "2026-11-04",
    ),
    ["2026-10-29", "2026-10-30", "2026-11-02", "2026-11-03", "2026-11-04"],
  );
  assert.deepEqual(
    occurrenceDates(
      "2024-02-29",
      { unit: "MONTH", interval: 12, endsOn: null },
      "2024-02-29",
      "2028-03-01",
    ),
    ["2024-02-29", "2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"],
  );
});
