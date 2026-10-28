# Storage, security and synchronization

The production repository is `src/lib/repository.ts`, which calls same-origin authenticated APIs. `server/app.ts` exposes the API; `server/workspace.ts` reads and writes normalized Turso/libSQL tables. No production fallback to mock data or a browser-only journal exists.

## Authentication and ownership

Better Auth 1.7 uses its supported Drizzle SQLite adapter. Passwords use Better Auth's password hashing. Sessions live in Turso, with HttpOnly/SameSite=Lax cookies and Secure cookies in production, seven-day expiration and no client cookie-cache authentication shortcut. Login and other sensitive endpoints use database-backed rate limits. Password change, session revocation and password-confirmed account deletion use the library's supported endpoints.

Every state-changing request requires a trusted Origin and JSON content. Origins are explicit local or Vercel deployment origins, with optional owner-configured custom domains. API responses use `private, no-store`; no cross-origin credentialed access is enabled. A browser account header is checked against the session to prevent an old tab from writing into a different account after another tab signs in. It never grants ownership by itself.

All user-owned SQL queries bind the authenticated user ID. Composite keys and foreign keys pair related IDs with that owner. Photos are served only to their owning session. Error responses and logs omit passwords, tokens, SQL and raw driver errors. The runtime client bundle imports no server credential module. `.env.local` and CLI authentication files are excluded from source uploads and Git.

## Database shape

Migration `0001_initial.sql` creates prefixed tables for users, sessions, credentials, verifications, rate limits, workspaces/revisions, categories, templates, habits, logs, field definitions/values, workout templates/sessions/exercises/sets, preferences, photos, receipts and staged import parts.

Frequently queried attributes have explicit columns and indexes. Flexible metadata is JSON with validation. Habit schedules are stored in owned habit rows. Custom values use definition IDs and typed JSON values, so new fields require no schema migration. Workout exercises and sets are separate owned rows with ordered positions. Activity relationships are reciprocal and can span dates; deferred composite foreign keys permit atomic creation of an overnight pair.

The migration ledger stores source checksums. Migrations run transactionally and are repeatable. Files already recorded in the ledger cannot be edited silently. Unrecognized existing application tables cause a stop; no database is dropped or reset during setup. Foreign keys are enabled in the configured Turso database and integration tests.

## Writes and conflicts

The UI keeps its existing reusable callback-based edits. The repository compares the resulting draft with its base and creates record operations with SHA-256 canonical fingerprints and a stable mutation UUID. The server opens a write transaction, reads the owner's latest state, validates each fingerprint, applies only the requested records, validates the full reference graph, writes normalized rows, increments the revision and records a receipt.

A changed revision alone does not cause a conflict: edits to untouched records can merge. A changed record fingerprint produces HTTP 409 and keeps pending data for review. Duplicate event submissions are rejected unless explicitly marked as a separate event. A retried UUID with the same request returns the existing confirmed result; reuse for a different request is rejected. Concurrent writes serialize in the database. No force merge silently overwrites another device's edits.

Large changes are sent in bounded, checksummed parts scoped to the account and UUID. Commit reconstructs and validates the request, then applies it atomically. Parts are never treated as saved journal records; old abandoned parts are removed after 24 hours. Images are uploaded separately so normal activity updates and responses do not contain repeated large image payloads. Snapshots stream as JSON; photos have individually bounded authenticated responses.

## Local caches

IndexedDB `tend-cloud-cache` contains per-account confirmed/cached views, queued mutations, an unexpired last-authenticated session descriptor, and previously loaded photos. It contains no password, session cookie, database token or signing secret. The previous edition's `tend-personal-tracker` database is read only after explicit import and is not deleted.

When online, an API/database failure is an explicit error. When actually offline, loaded cached records may be viewed and activity-log changes queued. Other edits require reconnection. Pending operations are not labelled cloud-confirmed. Reconnection retries stable operation IDs. Conflict resolution downloads a recovery backup before discarding pending data in favor of the server version. Logout checks the queue and clears local cached session/account data after successful server sign-out.

An offline cached session cannot discover server-side revocation until reconnecting; it is bounded by its recorded expiration. Local caches inherit device/browser security. Clearing browser storage removes pending changes, while confirmed Turso records remain recoverable by signing in.

## History and calculations

The ten supplied historical events are inserted only when the signed-in owner explicitly chooses that history on account initialization. Existing journals cannot be reinitialized accidentally. Starter suggestions and workout templates create no completed activities or attendance. Two 26 October oil entries remain separate and flagged. Qualitative times do not become invented exact clock times.

Habit rates use eligible dates through today in the account timezone, excluding pre-start, post-end and paused dates. Numeric/duration goals sum completed daily values; rating goals use the highest rating. Target schedules count distinct days and assess misses only after a period ends. A partial current period does not earn a completed-period streak prematurely.

Backups contain all application records and photo bytes. Merge retains existing account versions of matching IDs; Replace is explicit and revision-aware through record conflicts. Account-journal erase uses an expected revision, affects only that owner and deletes server photos and customizations. Account deletion also removes that owner's credentials and sessions through foreign-key cascades.
