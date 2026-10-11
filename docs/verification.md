# Verification — 11 October 2026

## Executed successfully

| Check | Result |
| --- | --- |
| Prisma format, validation/generation | Passed with Prisma 7.10.0 |
| Both checked-in SQL migrations | Applied to local PostgreSQL WASM; independently executed in isolated constraint tests |
| Domain unit tests | 6 passed |
| Database / command integration tests | 8 passed |
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
