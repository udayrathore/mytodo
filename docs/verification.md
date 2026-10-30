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

- After clarification that the desktop UI felt too large, compact desktop density was added: 14px navigation/task text, a 224px sidebar, tighter task rows and toolbar spacing, and narrower goal lanes. The local browser confirmed a 14px workspace, 224px sidebar and no page-width overflow. Mobile sizing and browser zoom remain unchanged.

## Local pending-task views — 29 October 2026

- Execute loads overdue, today and undated open work across pagination, while future scheduled work remains outside the default view. Collection filters retain their existing all-date browsing behavior. Completed-today tasks remain below open work, including overdue/undated tasks checked off today in the account timezone.
- Move to today uses the existing version-checked schedule command. It appears only for pending tasks not already scheduled today; completed, cancelled and archived tasks cannot be moved. Other repeat occurrences and due dates are preserved.
- Plan keeps explicit scheduled dates and all materialized repeat occurrences. Pending cards are brighter and labelled Pending; older dated tasks no longer duplicate in the unplaced list. Undated work stays unplaced, and a Work mode child category can serve as a visible column when its parent is outside the scope.
- Browser verified actual local overdue tasks on their original October 26/27 Plan cells. In the disposable test workspace, Move to today saved and survived reload, with the action gone once the task was in today's group.
- Verification uses Node 24, a Webpack production build/type check, unit checks and isolated database/HTTP regressions. The disposable PGlite harness explicitly sets UTC to match the configured production adapter; this preserves exact timestamp round trips at account-day boundaries.
- No commit, push, production migration or deployment was performed for this change. Local app runs on port 3000; the separate disposable verification app uses port 3107.
- Final result: production build/type checks, 22 unit tests, 11 database workflow tests and two HTTP suites passed (35 total). Browser confirmed checking off an overdue test task keeps it in Completed after reload and removes its reschedule action. The narrow viewport check reported document width equal to viewport width after the navigation fix; temporary viewport overrides were reset.

## Local minimal task creation and shared calendars — 29 October 2026

- New task creation starts with a plus menu and task-name input. Enter or the submit arrow saves; today is the default. Category/description/date/Importance/Urgency/projects appear only when requested; explicit Plan cell context is retained. Description uses the existing stored field.
- Confirmed preferences: simple checklist children with no own dates/categories, manual parent completion, 1–10 Importance and Urgency, no task scheduling time, all repeat presets. Checklist storage/owner/version-checked commands are ready; checklist UI and comprehensive edit design are intentionally deferred.
- Undated tasks remain saved with their descriptions and can be retrieved by direct detail/pickers, but are hidden from task lists and collection counts for now.
- Shared DatePicker replaces applicable date controls in task forms, activity/reminders, journal metadata, reports, planning periods, timeline capture and repeat end dates. Existing time-based fields retain their timezone conversions. Repeat supports daily, weekly, weekdays, monthly, yearly (12 months), and custom intervals. Calendar and repeat menus preserve form fields when closed, respect date bounds, support keyboard dismissal and position within the viewport.
- Applied additive checklist and repeat-unit migrations only to the local preview. No commit, push, production migration or deployment was performed.
- Node 24 Webpack production build and typecheck passed. 26 unit tests, 14 isolated database workflows and two HTTP suites passed (42 total).
- Browser verified minimal default state and focus, Enter saving a task dated today, optional description/category/dials persisting (Importance7/Urgency8), preserving Importance when Urgency is added, weekday-repeat materialization without weekend dates, and saving a hidden undated task with its description. Database checks used only a disposable test workspace.

### Grouped overdue tasks and bulk rescheduling — 29 October 2026

- Execute now groups all past-date open tasks in one collapsible Overdue section, including when sorting by Urgency or Importance. Today stays below it. Individual Move to today buttons and delay text were removed; dates use compact red calendar labels matching the reference.
- The Reschedule action uses the shared date picker and applies one atomic command across all matching pages, respecting the fetched category/entity/project/tag/search/status scope and the account's Work mode. A server count includes unloaded tasks; the UI waits for the refreshed view after saving.
- Completed, cancelled, archived, undated, today and future tasks are excluded. Recurring occurrences keep their original recurrence identity and future schedule; due timestamps are preserved.
- Validation: production webpack build passed after removing stale generated `.next/dev` cache; 26 unit tests, 16 disposable database workflows and 2 HTTP workflows passed (44 total). The new database coverage checks 105 matching tasks across pages, scope snapshots/counts, exclusions, ownership, idempotent retries and recurrence preservation.
- Browser: disposable category with two overdue tasks and one task for today; selecting Today in the bulk calendar moved both overdue tasks into Today and removed the Overdue section. Verified priority sorting keeps the Overdue group. Final local preview has no browser console errors.
- Changes remain local; no commit, push, deployment or production data mutation. Preview: `outputs/overdue-grouped-local.png` in the current chat workspace.

### Two-column task editor and nested checklist — 29 October 2026

- The task popup uses a wide split layout: task name/manual completion, description and nested sub-tasks in the left pane; category, projects, dates, urgency/importance, status, tags, entities, estimates, repeat settings, comments, related goals/challenges, reminders, effort/history, archive and tomorrow action in the right pane. Narrow screens stack the two panes.
- Checklist UI supports add, inline rename, completion/reopening and removal. It never creates standalone task rows or automatically completes the parent. Date editing uses the shared picker; planned dates remain date-only and optional.
- Task acknowledgements return versions immediately. Scalar and checklist commands share a serialized version, so rapid sequential edits remain valid. Existing drafts survive checklist saves and same-task background refreshes, including refresh errors; unexpected newer versions block overwriting another tab's edits.
- Validation: production webpack build passed; 28 unit tests, 16 isolated database workflows and 2 HTTP workflows passed (46 total). Two new acknowledgement tests protect manual completion, checklist content and shared-series date/status preservation.
- Browser verification used disposable data: add/rename/check/remove sub-tasks while preserving an unsaved description; edit urgency and save task fields; manually complete the parent, remove a sub-task and save again without reopening it accidentally; retain project/tag links; clear and restore the planned date; reopen and verify saved values. Database checks confirmed the content, links and nine successive acknowledged versions. No browser console errors in the isolated editor.
- Screenshot: task-edit-two-column.png in the current chat's outputs directory. Local app remains running; no commit, push, deployment or production data mutation.

### Minimal goal/challenge creation and detailed editors — 29–30 October 2026

- Goals and challenges share a compact create form with name, reason and inline sub-goal/sub-challenge names. As confirmed by the user, top-level creation keeps a small category picker; creation inside a parent or category column inherits that category.
- Clicking either record opens a task-style two-column editor. Name, reason and child hierarchy stay left; categories, parent links, goal progress/status/estimates or challenge goal association/core learning, linked tasks, comments/check-ins/logs/journals and archive/delete stay right. Existing board ordering and category scoping are preserved.
- Adding a child opens a second create popup while keeping the parent editor and its unsaved drafts mounted. Acknowledged versions update before parallel list/detail refreshes; failed refreshes retain drafts. Native Escape uses the same close guard as the close button.
- Verification: production webpack build passed; 28 unit tests, 16 isolated database workflows and 3 HTTP workflows passed (47 total). New HTTP coverage checks atomic parent-plus-children saves, inherited defaults, detailed edits retaining children, stale writes and rollback for invalid child ownership/category.
- Browser checks created both parents with two children, added a third through the editor while retaining unsaved parent drafts, saved detailed settings, posted a goal progress check-in and challenge learning log without losing reason text, then reopened both records. Database assertions confirmed both parents, six children, category/reason inheritance, goal progress and hours, challenge goal association/core learning and comment/log history. No browser console errors in the test workspace.
- Previews saved in the current chat outputs: goal-create-minimal.png, goal-edit-two-column.png, challenge-create-minimal.png and challenge-edit-two-column.png. Changes are local only; no commit, push, deployment, schema migration or production data mutation.

## PWA, push summaries and load performance — 30 October 2026

- Production build and TypeScript/no-unused checks pass. Unit tests: 43/43;
  disposable database workflows: 19/19; HTTP workflows: 4/4. Dependency audit
  reports zero known vulnerabilities in both the full and production trees.
- Browser checked minimal task creation, direct Goals navigation, task details,
  adding a nested checklist item while preserving the parent title draft, and
  saving the parent afterward. App/notification controls render the confirmed
  account timezone and completed-today/all-pending count definitions. Browser
  verification used an isolated temporary database, never production records.
- PWA tests cover the actual Next 16 Turbopack asset filenames, immutable-only
  public asset caching, private HTML/API/mutation exclusions, generic offline
  fallback, explicit update acceptance and editor-safe notification clicks.
  Development unregisters only this app's worker and clears its public caches.
- HTTP checks confirm private APIs stay no-store; content-hashed JavaScript is
  immutable; manifest and service worker revalidate; worker scope is root.
- Workspace-specific initial entry JavaScript decreased from 308,988 to 185,208
  raw bytes (about 40%) before the final small cleanup. Heavy views are loaded
  when opened. SSR honors the bookmarked view and skips the redundant first
  workspace read. Independent database reads run concurrently. New Server-Timing
  values separate authentication and workspace costs. These are code/bundle
  results, not a claim of measured production p95; current Vercel observability
  aggregate access requires a paid plan.
- Verified unused legacy task-form implementation and unreachable activity-form
  creation branches were removed; historical database columns/tables remain.
- New task-checklist and Web Push migrations are additive; weekday recurrence
  only expands a check constraint. Release preflight blocks destructive pending
  SQL for populated databases, never executes the retired reset, and compares
  business-table row counts before and after migrations. No seed/reset runs.
- Native daily cron targets 09:00/20:00 Asia/Kolkata. Hobby scheduling can be up
  to 59 minutes late and has no automatic retry; exact timing/reliable later
  retry needs the documented external scheduler or suitable Vercel plan.
  Production push delivery must not be called active until secret installation,
  device opt-in, a test push and a scheduled invocation have been verified.

### Notifications deferred — 30 October 2026

At the user's request, notifications are disabled by default and in production.
Notification controls and effects do not mount; PWA installation stays available.
Subscription and dispatch routes return 404 while paused, and `vercel.json` has no
scheduled jobs. No external scheduler was connected. Existing data and the retained
implementation remain available for a later, explicitly enabled release.

Validation: 44 unit tests, 19 isolated database workflows and 4 HTTP workflows pass;
TypeScript/no-unused checks pass. The local production build passes with Webpack
(the local Turbopack process hit a socket permission restriction). Vercel continues
to use its normal production compiler.
