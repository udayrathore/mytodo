import { test } from "node:test";
import assert from "node:assert/strict";
import { isWorkLoginTime, resolveWorkCategoryIds } from "../src/lib/work-mode";
const categories = [
  { id: "work", parentId: null, isActive: true },
  { id: "child", parentId: "work", isActive: true },
  { id: "personal", parentId: null, isActive: true },
  { id: "closed", parentId: "work", isActive: false },
  {
    id: "archived",
    parentId: "work",
    isActive: true,
    archivedAt: "2026-10-26",
  },
];
test("Work mode includes selected descendants, excludes inactive categories, and ignores foreign IDs", () => {
  assert.deepEqual(
    resolveWorkCategoryIds(
      {
        id: "owner",
        workModeEnabled: true,
        workCategoryIds: ["work", "foreign"],
      },
      categories,
    ),
    ["work", "child"],
  );
  assert.deepEqual(
    resolveWorkCategoryIds(
      { id: "owner", workModeEnabled: true, workCategoryIds: ["child"] },
      categories,
    ),
    ["child"],
  );
  assert.deepEqual(
    resolveWorkCategoryIds(
      { id: "owner", workModeEnabled: true, workCategoryIds: [] },
      categories,
    ),
    [],
  );
  assert.equal(
    resolveWorkCategoryIds(
      { id: "owner", workModeEnabled: false, workCategoryIds: ["work"] },
      categories,
    ),
    null,
  );
});

test("sign-in defaults to Work mode from 10:00 inclusive to 19:00 exclusive in the workspace timezone", () => {
  for (const [instant, expected] of [
    ["2026-10-26T04:29:59Z", false],
    ["2026-10-26T04:30:00Z", true],
    ["2026-10-26T13:29:59Z", true],
    ["2026-10-26T13:30:00Z", false],
    ["2026-10-26T18:30:00Z", false],
  ] as const)
    assert.equal(
      isWorkLoginTime(new Date(instant), "Asia/Kolkata"),
      expected,
      instant,
    );
  assert.equal(
    isWorkLoginTime(new Date("2026-10-26T14:00:00Z"), "America/New_York"),
    true,
  );
  assert.equal(
    isWorkLoginTime(new Date("2026-07-26T13:59:59Z"), "America/New_York"),
    false,
  );
  assert.equal(
    isWorkLoginTime(new Date("2026-07-26T14:00:00Z"), "America/New_York"),
    true,
  );
});
