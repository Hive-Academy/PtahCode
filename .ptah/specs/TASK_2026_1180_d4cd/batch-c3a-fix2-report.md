# Batch c3a round 2 fix report

## Findings

- N1 MEDIUM: `libs/backend/auth-providers/src/lib/quota/plan-usage.service.ts:162-173,198-212` now keeps a bounded, per-owner OAuth failure cooldown using the injected clock. A normal failure waits 60 seconds; refresh may bypass it. A 429 cooldown also applies to refresh. The live no-open-session reading is returned on every call and is never added to the service cache. `libs/backend/auth-providers/src/lib/quota/readers/claude-oauth-plan-usage.reader.ts:14-20,115-120` parses Retry-After seconds or HTTP dates and bounds the delay to 1 second through 5 minutes. The private hint is typed at `libs/backend/auth-providers/src/lib/quota/readers/plan-usage-reader.types.ts:91`. Tests: `libs/backend/auth-providers/src/lib/quota/plan-usage.service.spec.ts:169,187` and `libs/backend/auth-providers/src/lib/quota/readers/claude-oauth-plan-usage.reader.spec.ts:129`.
- N2 LOW: Owner isolation in the cooldown is tested at `libs/backend/auth-providers/src/lib/quota/plan-usage.service.spec.ts:169`. The existing reader still requires the local account key to match the live owner key. Actual SDK and credential-file organization field equality remains unverified because that requires live private account data; no such data was read or recorded.
- N3 LOW: A rejected response-body cancellation no longer replaces the 401/403 auth reason at `libs/backend/auth-providers/src/lib/quota/readers/claude-oauth-plan-usage.reader.ts:116`. Test: `libs/backend/auth-providers/src/lib/quota/readers/claude-oauth-plan-usage.reader.spec.ts:124`.
- N4 LOW: Missing credentials (`ENOENT`) now log at debug level at `libs/backend/auth-providers/src/lib/quota/readers/claude-oauth-plan-usage.reader.ts:86-89`. Test: `libs/backend/auth-providers/src/lib/quota/readers/claude-oauth-plan-usage.reader.spec.ts:64`.
- N5 INFO: Every reader test now checks warn, debug and error logger calls for fixture secrets and identity values at `libs/backend/auth-providers/src/lib/quota/readers/claude-oauth-plan-usage.reader.spec.ts:36-41`.

## Checks

- `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/auth-providers/src/lib/quota/plan-usage.service.spec.ts libs/backend/auth-providers/src/lib/quota/plan-usage.accounts.spec.ts libs/backend/auth-providers/src/lib/quota/readers/claude-oauth-plan-usage.reader.spec.ts libs/backend/auth-providers/src/lib/quota/readers/claude-plan-usage.reader.spec.ts`: PASS, 4 suites, 86 tests. An intermediate run had one timeout in an existing stale-cache test under a slow runner; the final rerun passed.
- `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.lib.json`: PASS.
- `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.spec.json`: PASS.
- `npx eslint libs/backend/auth-providers/src/lib/quota/plan-usage.service.ts libs/backend/auth-providers/src/lib/quota/plan-usage.service.spec.ts libs/backend/auth-providers/src/lib/quota/readers/claude-oauth-plan-usage.reader.ts libs/backend/auth-providers/src/lib/quota/readers/claude-oauth-plan-usage.reader.spec.ts libs/backend/auth-providers/src/lib/quota/readers/plan-usage-reader.types.ts`: PASS, 0 errors, 1 pre-existing unused-variable warning in plan-usage.service.ts.

Skill discovery was available but found no matching backend TypeScript skill. No real endpoint or credential file was accessed. No commit, push or PR was made.
