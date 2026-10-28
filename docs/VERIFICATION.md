# Verification — 28 October 2026

- Strict frontend/server TypeScript checks and a production Vite/PWA build succeed.
- 29 client/business tests and 9 server integration tests pass (38 total).
- The supplied Turso database was reachable and empty before migration.
- Migration `0001_initial.sql` was applied successfully; foreign keys are enabled.
- The real API handlers passed an actual-Turso smoke test: health, anonymous rejection, sign-up, login/logout, session invalidation, historical activity creation/edit/deletion, typed custom fields and workout/set persistence.
- The isolated verification account was deleted after the smoke test.
- The same end-to-end API check passed through the local Vite server at `http://localhost:5173`, including login after logout. Temporary accounts left by an earlier verifier failure were removed.
- Runtime dependencies have zero reported npm audit advisories at verification time.
- Production is live at [habit-tracker-498cdf89.vercel.app](https://habit-tracker-498cdf89.vercel.app). The full API smoke test passed over HTTPS against Turso, including signup, login/logout, activity/custom-field/workout persistence, edits, deletion and temporary-account cleanup.
- Hosted frontend assets, calendar/settings refresh routes, PWA files, security headers, private API rejection and API `no-store` headers passed HTTP checks.
- [GitHub Actions](https://github.com/Mhxd-Rafii/tend/actions/runs/40671831158) passed all tests, the production build, artifact validation and secret checks on Linux for release commit `4d0ab59`.

Server integration tests use an isolated in-memory libSQL database. They cover migration idempotence, hashed passwords, cookie attributes, unauthorized requests, stale and cross-account changes, same-record conflicts, independent-record merging, idempotent retry, normalized habit/field/workout rows, login rate limiting, photo isolation, account-header mismatches, owner-only journal reset, account deletion and redacted database errors. Client tests cover the preserved forms, calculations, overnight links, filters, CSV, caches, pending queues, interrupted responses and conflict preservation.

Browser visual checks, mobile-device installation, actual notifications and print layout have not been verified. Earlier browser automation could not confidently identify the Chrome URL and stopped. Generated shell/route/icon/cache configuration is checked by `npm run verify:build`; that does not replace a real device test.

The complete source is pushed to [Mhxd-Rafii/tend](https://github.com/Mhxd-Rafii/tend). The repository's original README commit was merged without rewriting its history. Both GitHub and Vercel are authenticated, server credentials are configured, and Vercel confirmed the GitHub repository connection. Production deployment `dpl_CMwD6AhpG1LeLmdjc8Snvfs1tjZv` reached `READY` and passed the live API checks. Preview also reached `READY`; its Vercel sign-in protection is preserved, so anonymous API verification is blocked there. `.deployment-state.json` records the actual deployment identities locally.

The first hosted function failed because Node ESM could not resolve extensionless imports. Runtime imports now use explicit `.js` specifiers and the server uses TypeScript's `NodeNext` resolution. The emitted Node API loaded successfully locally, and the corrected hosted function passed the production smoke test.

The complete development-tool audit reports 38 entries (4 low, 7 moderate, 26 high, 1 critical), predominantly in current Vercel CLI/build tooling and Workbox's build chain. Available automatic fixes propose incompatible major downgrades, so those were not forced. They are not production application runtime dependencies. Recheck tooling advisories when upgrading; a clean runtime audit is not a claim that the full development dependency audit is clean.
