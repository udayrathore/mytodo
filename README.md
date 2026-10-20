# Still — Personal Intelligence

A private workspace for **intention → action → observation**, built from the uploaded specification and the approved “Show Schema” conversation. Actual application data lives in PostgreSQL; there is no browser-storage demo or public bypass.

## What works

- Fast capture with `N` shortcut; daily intentions and a separate undated inbox.
- Task editing, completion/reopening, deferral, cancellation, archival/restoration, search, priority/status/category/tag/entity filters.
- Hierarchical categories with cycle protection, ordering, deactivation, and descendant aggregation.
- Weekly plans, closed reviews, carry-forward without losing previous assignments, and historical removal.
- Tags, typed entities and parent entities, editable relationships, and task dependencies/related work.
- Revisioned templates; typed custom fields (text, long text, number, boolean, date, datetime, select, multi-select).
- Optional manual effort entries, independent journal entries with category/entity links, and a unified timeline.
- Dated effort analytics, completion/deferral event counts, overdue intentions, and category/entity/tag distributions without double-counting each individual row.
- In-app reminders with atomic delivery records; they become visible when you open or refresh the workspace after their scheduled time.
- Owner-only sign-in with a salted password hash, revocable database sessions, persistent login throttling, protected reads/writes, and origin checks.

## Stack and compatibility

Checked on 11 October 2026 against official documentation and the package registry. Versions are pinned in `package-lock.json`.

| Component    | Version / choice                                                                      |
| ------------ | ------------------------------------------------------------------------------------- |
| Node.js      | 24 LTS (`.nvmrc`, Vercel runtime via `engines`)                                       |
| Next.js      | 16.4.0, TypeScript, App Router, Node.js runtime                                       |
| React        | 19.3.0                                                                                |
| Tailwind CSS | 4.3.3                                                                                 |
| Prisma       | 7.10.0 stable (the registry’s default tag was a release candidate for 8)              |
| PostgreSQL   | Neon, pooled runtime URL; direct migration URL                                        |
| Driver       | Prisma’s official `@prisma/adapter-pg`, max three connections per serverless instance |
| Validation   | Zod 4.6.5                                                                             |
| Icons        | Lucide; otherwise native accessible HTML controls                                     |

Official references: [Next.js requirements](https://nextjs.org/docs/app/getting-started/installation), [Prisma requirements](https://www.prisma.io/docs/orm/v7/reference/system-requirements), [Prisma PostgreSQL driver adapters](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/database-drivers), [Neon + Prisma](https://neon.com/docs/guides/prisma).

`deepmerge-ts` and `mysql2`, transitive Prisma tooling dependencies, are overridden to patched releases (8.0.2 / 3.24.5). Prisma generation and the production build have been verified with these overrides. Do not remove the overrides without checking the dependency audit.

## Local setup with Neon (recommended)

1. Install Node.js 24, then run `npm ci` in this folder.
2. Create a Neon project and a **development branch**, using Neon’s free plan where available. Create a PostgreSQL database. Do not share production data with development.
3. Copy `.env.example` to `.env`. Fill in:
   - `DATABASE_URL`: Neon’s **pooled** connection string (hostname contains `-pooler`), including `sslmode=require`.
   - `DIRECT_URL`: direct connection to the **same database/branch**, without `-pooler`, for migrations and backups.
   - `APP_URL`: exact origin you open in the browser, e.g. `http://localhost:3000`. Origin checks intentionally reject other hosts.
   - `OWNER_EMAIL`: your email, lowercase. There is no public registration.
   - `OWNER_NAME`, `APP_TIMEZONE`: display name and IANA timezone (default `Asia/Kolkata`).
   - `OWNER_PASSWORD_HASH`: generated below; never store a plaintext production password in an environment file.
4. Generate a hash with `npm run auth:password`. The helper reads stdin. For hidden terminal input on macOS/Linux:

   ```sh
   read -s 'pis_password?Choose a password (14+ characters): '
   printf '%s' "$pis_password" | npm run auth:password
   unset pis_password
   ```

   Copy only the resulting `scrypt:...` value into `OWNER_PASSWORD_HASH`. For shells that do not support the shown `read` syntax, use the helper interactively in a private terminal. No password is passed as a command argument.

5. Run `npm run db:migrate` to apply all versioned migrations.
6. Optionally run `npm run db:seed` on the development branch. It adds sample work for the owner, and skips if the owner already has tasks. It never overwrites existing tasks.
7. Run `npm run dev` and visit **http://localhost:3000**. Sign in using the configured owner email and the password you hashed. A new owner row is provisioned after successful sign-in if the seed was not run.

The supplied `.env.example` contains placeholders only. `.env`, local credentials, database data, and generated code are excluded from Git.

## No Neon credentials yet: isolated local preview

This repository includes a development-only [PGlite](https://pglite.dev/docs/pglite-socket) helper so you can explore and test without a cloud account. It uses the PostgreSQL WASM engine and a loopback socket; it is **not production storage** and does not model PostgreSQL concurrency or authentication exactly.

```sh
npm ci
npm run db:local           # terminal 1: keep running
npm run db:local:migrate   # terminal 2: applies the exact checked-in SQL
npm run db:seed
npm run dev
```

If `.env` does not exist, the helper creates a local-only configuration and a random sign-in password in `.local/login.txt`. Read that file to sign in. Existing `.env` files are never overwritten: use a fresh clone or deliberately move your existing environment file aside before choosing this mode. Keep the helper bound to `127.0.0.1`; it has no production authentication or TLS. Do not put real personal data in this preview database.

The local migration helper keeps a checksum ledger in `local_migrations`; it refuses edited, previously applied migrations. Neon uses Prisma’s `_prisma_migrations` ledger instead. Never copy the local database into production. Start Neon from the versioned migrations.

Native PostgreSQL startup was restricted in the build environment. Prisma’s schema engine could not deploy through the local socket server, so the exact migration SQL was applied using the local runner and tested directly in isolated PostgreSQL WASM as well. **Neon migrations and live Vercel deployment still need verification with your actual accounts.**

## Tests and checks

```sh
npm test                 # dates, validation, passwords, deduplicated analytics
npm run test:integration # isolated SQL constraints + Prisma command workflows
npm run test:http        # with the local app running: auth, CSRF, reminders, revocation
npm run typecheck
npm run build
npm audit
```

Integration tests require the local preview DB, or a **disposable** PostgreSQL branch with `ALLOW_INTEGRATION_TEST_DATABASE=1`. They create test owners and preserve their history; never run them against your production branch. SQL constraint tests use a separate in-memory PostgreSQL WASM instance and execute every checked-in migration.

A browser regression test is included:

```sh
npx playwright install chromium
npm run build
npm run start
npm run test:browser
```

It uses `.local/login.txt`, so it is for the isolated local setup. Set `PLAYWRIGHT_CHROME_PATH` to a locally installed Chrome binary if desired. This environment blocked a standalone headless Chrome launch, so the interactive in-app browser was used to verify the main workflows instead. See [verification notes](docs/verification.md) for the actual checks and limits.

## Deploy to Vercel

No deployment or paid service is required to run locally. For production:

1. Push this Git repository to your Git provider and import it into Vercel. Choose **Next.js**, Node **24.x**, install `npm ci`, build `npm run build`. No custom output directory is needed.
2. Set production environment variables from `.env.example` in Vercel’s project settings. Use a **production Neon branch**. Do not set `LOCAL_PGLITE` or copy local test credentials.
3. Set `APP_URL` to your final **HTTPS** production origin, without an extra path. Preview deployments need their own exact origin and separate development database, or leave previews unconfigured. Protected login remains unavailable without valid setup.
4. Apply `npm run db:migrate` from a trusted terminal/CI environment with the production `DIRECT_URL` **before** serving the new code. Migration is deliberately not part of the Next.js build: preview builds must not mutate production.
5. Deploy, sign in, capture a test task, reopen it, record effort, and verify persistence after a reload. Create a journal entry and sign out. Check that `/api/workspace` then returns 401.
6. Do not seed production unless you intentionally want the example records.

The architecture uses no local filesystem at runtime, no always-on workers, no mandatory paid APIs, and no external message delivery. In-app reminders are access-driven, so they do not require cron. Free-tier limits and Vercel Hobby usage eligibility remain subject to the providers’ current terms; the app itself has no paid dependency.

## Security and account operations

- Single owner allowlist is `OWNER_EMAIL`; credentials are checked on the server. Passwords use random salts and Node’s scrypt; only the hash is configured.
- Session cookies are HttpOnly, SameSite=Lax, seven-day expiry, and Secure on HTTPS. Only SHA-256 hashes of random 256-bit tokens are stored. Sign-out deletes the server session.
- Every data page and API independently requires a valid session. Mutations require an exact configured origin. Client-supplied owner IDs are never accepted.
- Login throttling is atomic and database-backed: ten attempts per fixed 15-minute owner window, shared across instances. A targeted attacker can temporarily lock out the owner; this is the deliberate simple tradeoff for an owner-only MVP. Add a provider-level rate limiter before widening access.
- All joins enforce matching owner IDs using additional composite SQL foreign keys. No destructive user-data deletion endpoint exists. Task events are append-only.
- To rotate credentials, update the hash in Vercel and invalidate sessions with `DELETE FROM sessions;` in your private database console. This revokes all active sign-ins. Keep the new password in your password manager.
- Environment setup errors do not enable a demo bypass. Do not expose the local preview database.

## Backup and restore

Use Neon’s available restore/branch features, checking the retention provided by your plan. Keep independent encrypted backups:

```sh
# Supply the direct URL securely via PG* environment variables or a private .pgpass.
pg_dump --format=custom --file=personal-intelligence.dump
# Restore only to a new, empty database; verify it before changing the app connection.
pg_restore --no-owner --no-acl --dbname=NEW_DATABASE personal-intelligence.dump
```

Do not commit dumps. Encrypt them at rest, restrict file permissions, and test restores. A backup must include every schema table and Prisma’s migration ledger; keeping only current task rows loses the history this system is built to preserve.

## Project map

- `prisma/schema.prisma`: typed relational model.
- `prisma/migrations`: versioned SQL, including checks and integrity triggers.
- `prisma/seed.ts`: realistic owner-scoped seed.
- `src/lib/commands.ts`: transactional domain operations.
- `src/lib/auth.ts`: owner/session verification and login throttling.
- `src/lib/workspace.ts`: owner-scoped read model; access-driven reminder delivery.
- `src/lib/domain.ts`, `analytics.ts`: validation, dates, aggregation.
- `src/app/api`: protected request boundaries; App Router pages.
- `src/components`: workspace, task detail, planning, journal, library, insights.
- `docs`: schema dictionary, ER diagram, architecture, verification.

See [architecture and MVP boundaries](docs/architecture.md) and the [full schema dictionary](docs/schema.md).

## Category tracker

The home screen is a seven-day sheet: dates on the left, active parent categories across the top. Each column includes all its descendants. Use Previous/Next week or Jump to date for past logs and future plans. The top navigation keeps the other tools accessible.

- **Plan** saves an intention on a date.
- **Log** records an activity for today or an earlier date, optionally linked to an existing task and optionally timed. Repeated logs remain separate; recording work does not require completing the task.
- **Journal** remains independent observation.

Timed logs use existing effort entries; untimed logs use existing task events. No schema migration was needed. Actual activity dates are kept separate from the time the record was created. Entries without a date or category remain accessible below the sheet and in Tasks.

The seed uses Environment Control, Health, Relationship, Sales & Marketing, Creativity, Operations, and Finances. For a workspace using the original sample categories, run `npm run db:categories` once. It creates/reuses these roots and nests the original sample categories while preserving tasks and history. Do not rerun it after intentionally reorganizing those sample categories.

## Task-first daily workflow

My day opens on today. Click a cell, enter a title and add the task; its date and category are already filled in. Change Upcoming / Ongoing / Completed directly on the card, or use the checkbox to complete/reopen it. Each task appears once in the default view, even if it has several activity entries. Notes and other creation fields are under Add details. Historical activity is opt-in; supporting tools are under More. Past cells still record activity, while today and future cells create to-dos. Status events and analytics continue to use the existing data model.
