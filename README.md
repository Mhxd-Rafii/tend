# Tend — Turso + Vercel habit tracker

React + Vite + TypeScript, Tailwind, Radix/shadcn-style source components, React Hook Form + Zod, TanStack Query/Table, Recharts, date-fns, Better Auth, and Turso/libSQL. The existing activity journal, suggestions, habits, calendar, gym, reports, themes, custom fields, and PWA are preserved.

**Version 2 uses authenticated server APIs and Turso as the primary database.** IndexedDB is a per-account offline cache and pending-operation queue. Database failures never silently switch to a local-only production journal. Supabase and Netlify are not used.

## Run locally

Use Node 22.12+ within the Node 22 line, with npm and Git. Open PowerShell in the project:

```powershell
cd 'D:\Dynamic habit'
npm ci
npm run setup
npm run db:migrate
npm run dev
```

`npm run setup` privately prompts for a Turso token if one is missing and generates a strong session secret. It writes only ignored `.env.local`, without printing credentials. The supplied database URL is already the setup default. If this workspace has already been configured, rerunning setup retains its configuration. Use `npm run setup -- --rotate-token` to replace the token privately.

Open **http://localhost:5173**. The command runs the Vite UI and API server together. The API listens on loopback port 3001; Vite proxies `/api` to it. Keep the terminal open. Press Ctrl+C to stop both processes. Both configured ports must be free.

Create your own account, then choose how to initialize its journal:

- **Use my October history:** the exact ten supplied records, preserving unspecified clock times, reciprocal overnight links, and both 26 October duplicate-review flags.
- **Start fresh:** all 43 suggestions, six categories and eight workout templates, with no invented completions, habits or attendance.
- **Import this device’s journal / JSON backup:** migrate the previous browser-storage edition explicitly. Its original IndexedDB store is not deleted.

Use the same account on mobile and desktop at the deployed HTTPS URL to access the same records. A public production deployment is not required for local testing. Local development directly uses the configured Turso database, so account changes persist there.

To test production assets locally:

```powershell
npm run build
npm run preview
```

Open **http://localhost:4173**. This starts the API and Vite production preview together. Installation/offline caching should be tested in this preview or the HTTPS deployment, after an initial online load.

## Push to your personal GitHub and deploy

This workspace is linked to the supplied repository, **[Mhxd-Rafii/tend](https://github.com/Mhxd-Rafii/tend)**. The launch helper reuses that recorded repository. It creates a new private repository only when no repository has been recorded in the local deployment state.

One-time sign-ins:

```powershell
npm run github:login
npm run vercel:login
```

Complete the official device sign-ins yourself using your personal accounts. The GitHub helper downloads a checksum-verified official CLI into ignored `.tools/` if needed. No passwords or access tokens belong in source files or chat.

Then:

```powershell
npm run launch
```

Launch runs migrations, strict TypeScript checks, client/server tests, a production build, artifact and secret checks, and a real API persistence smoke test. It then commits and pushes the source to the recorded repository (or creates a new private repository when none is recorded), creates a uniquely named Vercel project, configures server variables through stdin, deploys a preview and production, and checks their returned URLs.

The helper will not replace an unrelated repository or existing Vercel project. Local `.deployment-state.json` records repository/project/deployment identities for resuming. GitHub credentials are supplied to Git only for the push command; existing global Git credential settings are preserved. No force push is used.

Individual commands are also available:

```powershell
npm run github:status
npm run github:push
npm run deploy
```

`github:push` pushes the recorded repository, creating a new private repository only if none is recorded. `deploy` resumes the configured Vercel project/deployment. Run `launch` for the complete verification sequence first.

Vercel configuration is in `vercel.json`: Vite build, `dist` frontend output, Node 22 server function in `api/index.ts`, Mumbai region, `/api/*` routing and SPA refresh rewrites. The **whole source project** must be deployed; uploading `dist` alone does not provide the API. Vercel's generated deployment and production alias URLs are used; no hostname is assumed available.

When the GitHub repository is available, the deployment helper attempts to connect it to Vercel for future automatic deployments. Vercel may require enabling repository access in its GitHub integration. A successful direct CLI deployment remains usable if automatic Git deployment access is not yet granted.

Preview Deployment Protection is preserved. The helper does not create bypass credentials or weaken protection to run checks. A protected deployment is reported as such; production verification uses the production alias returned by Vercel when available.

## Server configuration

| Variable | Purpose |
| --- | --- |
| `TURSO_DATABASE_URL` | libSQL URL of the Turso database |
| `TURSO_AUTH_TOKEN` | Database access token; server only |
| `SESSION_SECRET` | Random session signing/encryption secret of at least 32 characters |
| `APP_URL` | Local app origin; on Vercel the deployment's system URLs supply the default |
| `APP_TRUSTED_ORIGINS` | Optional comma-separated, explicit additional origins |
| `RESEND_API_KEY`, `EMAIL_FROM` | Optional password-reset email delivery; verified sender needed |

The deployment helper puts database/session variables into Development, Preview and Production as Vercel secrets. Local `APP_URL` is applied only to Development. It derives Preview and Production origins from Vercel's returned environment information. For a custom production domain, set `APP_URL` to that HTTPS origin and redeploy.

Never prefix server credentials with `VITE_`. `.env*`, `.vercel`, `.tools`, local database files, deployment state, archives, and dependencies are excluded from Git and/or deployment uploads. `.env.example` contains placeholders only. The migration and connection tools redact driver errors and never print credentials. Rotate a database token that has been shared in chat.

## Features

- Searchable Quick Add with favorites, recent/frequent suggestions, Enter-to-log, optional detail forms and Undo.
- Date/time/qualitative-time logging, notes, quantity, units, durations, ratings, related events and optional photos.
- Sorted, filtered and paginated journal; saved column visibility/order/widths; typed metadata fields; mobile cards and sorting; CSV matching the selected filters.
- Daily, weekly and monthly calendars with category indicators, backdated edits, plans and scheduled habits.
- Daily/weekday/weekly-target/monthly-target/custom-date habits, goals, pause/archive history, eligible completion and streaks.
- Workout templates, exercises, sets, reps, weight, cardio duration, body weight, rest days, history, records, comparisons and charts.
- Dashboard widget settings, reports and print styles, light/dark/system theme, timezone/date preferences.
- Sign-up/login/logout, password change, active-session revocation and password-confirmed account deletion. Password reset is enabled only when a mail provider is configured.
- Full backup import/export including photos; import merges retain account versions of matching IDs, while Replace restores the backup explicitly after downloading a recovery copy.
- Foreground reminders and installable/offline application shell. Closed-app push scheduling is not configured.

Keyboard shortcuts: Ctrl/Cmd K for journal search, N for Quick Add outside forms, and Enter in suggestion search for the first matching result.

## Synchronization and offline behavior

Server updates apply record-level optimistic fingerprints inside a Turso write transaction. Concurrent changes to different records can merge; stale edits to the same record are rejected. Stable mutation UUIDs and receipts prevent duplicate writes when a response is lost and retried. Server responses, not local cache writes, determine confirmed cloud state.

Offline viewing requires a previously authenticated, unexpired cached session and loaded journal. Activity-log creation, editing and deletion can be queued offline. Habit/template/field/workout/settings changes require connectivity. Pending counts remain visible until server confirmation. Synchronization resumes when connectivity returns.

A conflict preserves pending changes and offers retry or **Back up & use server copy**. The latter downloads the pending journal before explicitly discarding its queue. Signing out is disabled while changes remain pending. Session revocation is enforced on the next server request; an offline device can still view previously cached data until its cached session expires or it reconnects.

Photos are stored in owned Turso rows and served by authenticated endpoints. Offline preview uses photos previously cached on that device. Full JSON export embeds their bytes for portable restoration. Photos are limited to 2 MB; backup imports to 50 MB. Large changes upload in bounded parts before an atomic commit. Abandoned upload parts expire after 24 hours.

## Database and migrations

```powershell
npm run db:check
npm run db:migrate
```

`db:check` reports connection and foreign-key status without secrets. The migration runner uses checksums and a `tend_schema_migrations` ledger. Applied SQL files are immutable; add a new numbered SQL file for future changes. Existing unrecognized `tend_` tables without a ledger cause a safe stop rather than replacement. Migrations do not erase unrelated database tables or existing user data.

Owned tables cover users, sessions, credentials, categories, activity templates, habits, logs, custom definitions/values, workout templates/sessions/exercises/sets, photos, preferences, mutation receipts and bounded import parts. SQL uses parameterized values and composite user-owned foreign keys. Account IDs come from verified server sessions; a browser-supplied ID never grants access.

See [storage and security design](docs/STORAGE.md) and [verification status](docs/VERIFICATION.md).

## Verification commands

```powershell
npm test
npm run typecheck
npm run build
npm run verify:build
npm run check:secrets
npm run verify:api -- --direct
```

The API smoke test uses the actual configured Turso database through the real handlers. It creates an isolated temporary QA account, checks authentication, historical activity CRUD, custom fields and workout persistence, then removes that account. It does not modify another account’s records. To run it against a reachable deployment:

```powershell
npm run verify:api -- https://ACTUAL-RETURNED-URL.vercel.app
```

GitHub Actions run tests and builds using an isolated local libSQL test database; production credentials are not needed in CI. Production dependencies currently have no npm audit advisories; development-tool advisories are documented separately.

## Troubleshooting

| Problem | Action |
| --- | --- |
| API says server not configured | Run setup; check the server-only variables on Vercel, then redeploy. |
| Existing device data appears absent | Sign in, then explicitly import the prior device journal or its JSON backup. |
| Port 5173/3001/4173 is already used | Stop the other process or previous tracker terminal before starting. |
| Local API works but UI requests fail | Use the Vite URL, keep both processes running, and use an allowed app origin. |
| Database token denied | Rotate it in Turso; run setup with `--rotate-token`, update the Vercel secret and redeploy. |
| Same record changed on two devices | Retry if appropriate, or export pending changes and choose the server copy for review. |
| A save failed | It is not reported as cloud-confirmed. Check the synchronization banner and retry. |
| Sign-up/login returns 429 | Wait for the indicated rate-limit window. Counters are stored in the database. |
| No password-reset email option | Configure a verified Resend sender and server variables; password changes while signed in remain available. |
| Protected preview prevents checks | Sign in to view it. The helper preserves deployment protection and reports blocked anonymous verification. |
| Repo exists / project link is unfamiliar | Helpers stop instead of overwriting. Review the recorded identity and existing remote. |
| Git integration cannot connect | Enable the private repository in Vercel's GitHub integration; direct CLI deployment still works. |

Do not use the previous Netlify ZIP for this version. It is an obsolete artifact of the local-only edition.
