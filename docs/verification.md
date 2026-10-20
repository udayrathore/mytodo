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
