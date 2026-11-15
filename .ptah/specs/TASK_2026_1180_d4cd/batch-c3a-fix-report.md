# Batch c3a fix report

All paths below are relative to the worktree root. No commit or push was made.

| Finding | Change and evidence |
| --- | --- |
| F1 | `libs/backend/auth-providers/src/lib/quota/plan-usage.service.ts:181-192`: retain the exact live `no-open-session` reading unless OAuth returns available windows. This preserves event windows, reason, cache, and stale behavior. |
| F2 | `libs/backend/auth-providers/src/lib/quota/plan-usage.service.ts:178`: inject the OAuth reader once through an optional constructor argument. Stubs in `libs/backend/auth-providers/src/lib/quota/plan-usage.service.spec.ts:139`, `libs/backend/auth-providers/src/lib/quota/plan-usage.accounts.spec.ts:54`, and `libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/plan-limit-owner-discovery.service.spec.ts:963` prevent real credential and network access. Service fallback order and failure are tested at `plan-usage.service.spec.ts:161`; named routes skip OAuth at `plan-usage.accounts.spec.ts:143`. The production DI factory is unchanged. |
| F3 | `libs/backend/auth-providers/src/lib/quota/readers/claude-oauth-plan-usage.reader.ts:112-131`: mark a partial window set unestablished when a present window or scoped limit is malformed. Assertion at `claude-oauth-plan-usage.reader.spec.ts:44`. |
| F4 | `libs/backend/auth-providers/src/lib/quota/readers/claude-oauth-plan-usage.reader.ts:26-31,116,126`: accept finite over-limit percentages and clamp them to 100; test at `claude-oauth-plan-usage.reader.spec.ts:93`. |
| F5 | `libs/backend/auth-providers/src/lib/quota/readers/claude-oauth-plan-usage.reader.ts:55-66`: injected home and environment functions select `CLAUDE_CONFIG_DIR` or the default home paths. Both cases are tested at `claude-oauth-plan-usage.reader.spec.ts:85`. The reader documents the credential-file limitation for Keychain-only logins. |
| F6 | `libs/backend/auth-providers/src/lib/quota/readers/claude-oauth-plan-usage.reader.spec.ts:41`: anonymized account fixture asserts that the metadata owner key equals the live resolver key. The equality check still fails closed; it does not cryptographically bind token to metadata. |
| F7 | `libs/backend/auth-providers/src/lib/quota/readers/claude-oauth-plan-usage.reader.ts:80-92`: missing or malformed account metadata returns `account-unverified`; an already-aborted signal prevents HTTP. Tests at `claude-oauth-plan-usage.reader.spec.ts:100`. |
| F8 | `libs/backend/auth-providers/src/lib/quota/readers/claude-oauth-plan-usage.reader.ts:103-106`: cancel non-2xx bodies. `claude-oauth-plan-usage.reader.spec.ts:93-124` covers seconds expiry, HTTP failures, invalid bodies, network rejection, route skips, and logger privacy. Existing `cli-*` status reasons are reused because the shared status type has no HTTP-specific equivalents. |

Checks:

- `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/auth-providers/src/lib/quota/plan-usage.service.spec.ts libs/backend/auth-providers/src/lib/quota/plan-usage.accounts.spec.ts libs/backend/auth-providers/src/lib/quota/readers/claude-oauth-plan-usage.reader.spec.ts libs/backend/auth-providers/src/lib/quota/readers/claude-plan-usage.reader.spec.ts`: PASS, 4 suites, 79 tests.
- `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.lib.json`: PASS.
- `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.spec.json`: PASS.
- `npx eslint` on the six changed TypeScript files: PASS, 0 errors, 3 existing warnings.
- `git diff --check`: PASS.

Skill discovery was available, but it found no local matching skill. The remote search results were not invocable, so repository guidance was applied directly.
