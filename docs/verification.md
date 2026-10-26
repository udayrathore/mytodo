# Verification — 11 October 2026

## Executed successfully

| Check | Result |
| --- | --- |
| Prisma format, validation/generation | Passed with Prisma 7.10.0 |
| All three checked-in SQL migrations | Applied to local PostgreSQL WASM; independently executed in isolated constraint tests |
| Domain, tracker and recurrence unit tests | 11 passed |
| Database / command integration tests | 13 passed |
| Authenticated HTTP security/workflow test | 1 passed |
| TypeScript `tsc --noEmit` | Passed |
| Optimized Next.js production build | Passed; all private pages and APIs are dynamic |
| `npm audit` | 0 reported vulnerabilities at verification time |
| Git exclusion checks | Environment files, local credentials/data, dependencies and generated client excluded |

The database tests cover category cycles, cross-owner references, invalid effort, self-relations, invalid status timestamps, ambiguous reminder subjects, append-only events, typed-field membership/storage, immutable template history, capture/completion/reopening, stale writes, carry-forward, historical removal, transactional required fields and independent journals.

The HTTP test exercises unauthenticated rejection, incorrect-password rejection, exact-origin checks, validation failures, owner sign-in, cookie flags, private caching, exactly one reminder delivery across refreshes, sign-out revocation, replay rejection and database-backed rate limits.

## Interactive browser verification

Verified the **production build** through Codex’s in-app browser:

- Protected landing redirects to sign-in; owner credentials open the workspace.
- Fast task capture persists and appears in the daily list.
- Task details open; a dated effort note updates the detail and aggregate totals.
- Completion changes the checkbox state and appends history.
- Carry-forward keeps the old weekly assignment.
- An independent journal observation saves and appears in the unified timeline.
- Typed guitar-template text, number and multi-select values save and survive reopening.
- New tags appear in the Library.
- Task text search filters results on mobile.
- Insights show dated effort, category/descendant rollups, entity overlap labels, tag distributions and uncategorized work.
- Desktop viewport checked at 1440 CSS pixels; mobile at 390 CSS pixels. Document width matched viewport width, with no horizontal overflow in the checked views.
- Browser console contained no JavaScript errors during the final checked session.

Screenshots: [desktop](workspace-preview.jpg), [mobile](mobile-preview.jpg).

## Verification limits

- **No Neon or Vercel credentials were supplied.** Cloud migration deployment, native PostgreSQL concurrency, live TLS cookies and Vercel deployment remain unverified. They are documented, not claimed complete.
- Native PostgreSQL startup was denied by the local runtime’s shared-memory restriction. Tests used PostgreSQL WASM and the exact SQL migrations; this is not a concurrency substitute for Neon.
- The standalone Playwright browser launch was blocked by the local process sandbox. The reusable browser regression test is included, but the automated browser suite is not reported as passed. The interactive browser flows above were performed and visibly verified instead.
- PGlite’s socket transport handles SQL error recovery differently from native PostgreSQL. Deliberate SQL-rejection tests use its direct engine API, while ordinary domain command tests use the same Prisma adapter as the application.
- Local socket connections and application connections explicitly use UTC so timestamp values remain correct; calendar dates and display still use the owner’s IANA timezone.

## Re-run

With the development database and app running:

```sh
npm test
npm run test:integration
npm run test:http
npm run typecheck
npm run build
npm audit
```

On a machine that permits headless Chromium, also run the browser suite as described in the README. Before first real use, run migrations and the same security/workflow checks against a disposable Neon branch, then deploy production with a unique password.

## Category-grid update

The production preview was checked with seven parent columns, dates on the left, sticky column/date headings and top navigation. Browser checks saved an untimed activity with notes, opened its history, and saved a future plan in Movement that appeared under Health. Temporary browser-check tasks were archived afterward. A 390px mobile viewport kept document width at 390px while the sheet scrolled independently.

New automated checks cover plans versus activity dates, timed-log deduplication, arbitrary-depth category rollup, repeated logs, optional minutes, owner boundaries and rejecting future activity atomically. No Prisma schema or migrations changed.

## Recurrence update — 20 October 2026

25 automated checks passed: 11 unit tests, 13 migration/command integration tests and one HTTP security test. New cases cover month-end/leap-year anchors, interval windows, repeat deduplication under concurrent refreshes, owner constraints, one-occurrence versus series edits, preserved completion, future inheritance, pausing/resuming, stale updates, manual-archive protection, typed-field/link cloning, per-occurrence custom-value isolation and appearance validation.

The production browser check created a three-day daily series with a blue fitness icon, changed all three to a new title with purple/star styling, completed only the first, and paused the remaining two. Temporary verification tasks were archived afterward. The preview screenshot contains that temporary demonstration series. The production build passed using webpack (the local Turbopack process was restricted from opening its worker port).

## Grouped recurrence and delayed tooltips — 20 October 2026

Task selectors now list each series once and require an explicit dated occurrence before linking. The Tasks view collapses matching occurrences into expandable groups; filters run before grouping, and completion still targets one occurrence. Equal titles from unrelated series/tasks remain separate. No data migration or user task edits were needed.

26 automated checks passed, including the grouping identity/order regression, plus the production webpack build. A separate browser tab verified the single series option, dated occurrence selector, grouped list, delayed keyboard-focus tooltip and Escape dismissal. Pointer hover uses the same 3,000ms timer; moving away, scrolling, resizing or clicking cancels it. Preview: `grouped-tasks-tooltips.jpg`.


## Reliability verification — 25 October 2026

This section supersedes the older test inventory for the reliability changes.

- Node 24.22.1 production build and TypeScript checks passed.
- 21 unit/isolated SQL constraint tests passed.
- Six existing Prisma workflow integration tests passed on a disposable PGlite socket database.
- API regression suite passed: authenticated category creation; five concurrent requests
  using one retry key create exactly one row; origin rejection; timed and untimed history;
  reminder claim/delivery; repeated goal/challenge reordering; comment and learning pagination.
- Local concurrency observation: five duplicate category requests completed in 28–29 ms.
  This is a local functional check, not a Vercel or Neon benchmark.
- In-app browser: created a category, saw the success message and row, and verified the row
  after reloading. Tested the original draft-navigation guard; full automated browser suite
  could not launch Chrome (environment returned SIGABRT/EPERM). A browser dialog subsequently
  stalled in-app automation; final draft restoration remains covered by code review and the
  checked-in browser regression, not claimed as an executed browser pass.
- Production logs were read without changing production data. Available recent logs showed
  connection SSL-mode warnings, not a confirmed cause of the slow saves.
- No production migration or deployment was performed during these checks.

Run `npm run build`, then `npm run test:isolated` on a machine with a working Playwright
browser. `node scripts/test-isolated.mjs --api-only` runs the isolated database/API portion.


## Task feedback release — 26 October 2026

- Node 24 production build and type checking passed.
- 23 unit/SQL constraint tests, nine database workflow tests, and the HTTP regression suite passed.
- Project links were checked through creation, task editing, unlinking/relinking, and owner isolation.
- Execute paging was checked with 105 open tasks plus a completed task, keeping completed records after open tasks and priority ordering across the cursor boundary.
- Tomorrow scheduling checks cover undated work, stale writes, shifted due dates, daylight-saving changes, and preservation of other repeat occurrences.
- In-app browser: linked Product launch in a task popup, saved, closed/reopened, and verified that the checkbox remained selected. The urgency heading toggled to highest first. Completed work appeared below open work with strike-through and read-only priority dials. The bottom-right Move to tomorrow action closed the popup and moved the task into upcoming work.
- Browser verification used a separate disposable database; no cloud application records were created for testing.

## Local Work mode changes — 26 October 2026

- Work mode configuration and blue theme remain local; nothing from this change was pushed or deployed.
- Production build and TypeScript checks passed using `npm run build -- --webpack`. The default Turbopack build could not bind an internal worker port in this execution environment.
- 20 unit tests, nine isolated database workflow tests, and two HTTP regression tests passed. Work mode coverage includes persisted category configuration, descendants, foreign-category rejection, empty selection, server pagination, linked content, history and reports.
- Login-hour boundaries are tested at 09:59:59, 10:00:00, 18:59:59 and 19:00:00 in Asia/Kolkata, plus New York winter and summer timezone behavior. The HTTP test checks the successful login's stored mode against the account timezone before manually disabling it for fixture setup.
- In-app browser verified the unified Execute / Manage / Plan, funnel and briefcase toolbar; manual switching; scoped work tasks; category filter expansion and close control; and Manage view. Configuration persistence and inherited child selection were also checked in the disposable local browser workspace.
- The additive Work mode migration was applied to the local preview database only. Cloud deployment and migration are intentionally pending.

## Production release preparation — 26 October 2026

- Fixed the desktop sidebar inheriting the legacy header's `flex-wrap`, navigation ordering, and `flex-basis: 100%` rules at widths below 1200px. Desktop navigation now uses its own column layout; page content can shrink within its container.
- Cloud and local desktop checks both reported 16px root/body fonts, 260px sidebars, visual viewport scale 1, and no horizontal overflow at the inspected widths. The exact user-reported scale change was not reproduced at those widths.
- Webpack production build/type checks and all 31 unit/database/HTTP tests passed after the responsive fix.
- Vercel releases now run the existing safe migration runner before building, keeping production credentials on Vercel. The historical clean-start reset is marked applied rather than executed. No production secrets were downloaded locally.
