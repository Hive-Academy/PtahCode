# Antigravity review fixes

Applied all seven defects and restored all 15 coverage rows. Existing task changes were preserved. Only the six authorized reader files and this report were written.

## Defects

| # | Status | Evidence | Change |
|---|---|---|---|
| 1 | done | `libs/backend/auth-providers/src/lib/quota/readers/antigravity-oauth-plan-usage.reader.ts:72` | Invalid grant stays service-unavailable / usage-auth-rejected. Removed unsupportedAuth and kept local discovery after every OAuth failure; regression verifies working local windows. |
| 2 | done | `libs/backend/auth-providers/src/lib/quota/readers/antigravity-plan-usage.reader.ts:221` | Clears observations after all candidates fail, including timeout early return. Transport, schema and timeout regressions pass. |
| 3 | done | `libs/backend/auth-providers/src/lib/quota/readers/antigravity-plan-usage.reader.ts:117` | Deleted antigravity-cli-usage.adapter.ts and its spec using native file deletion. Removed import, unused factory parameter and CLI mocks; adjusted setup argument positions. CLI stage explicitly records source-unavailable without invoking a process. |
| 4 | done | `libs/backend/auth-providers/src/lib/quota/readers/antigravity-plan-usage.reader.ts:133` | Uses conditional statusReason spread; removed blank line. |
| 5 | done | `libs/backend/auth-providers/src/lib/quota/readers/antigravity-plan-usage.reader.ts:109` | Removed identical request-failed ternary branches in both readers. |
| 6 | done | `libs/backend/auth-providers/src/lib/quota/readers/antigravity-oauth-plan-usage.reader.ts:90` | Named the existing 10-second standalone OAuth timeout; chain cap remains 3 seconds. |
| 7 | done | `libs/backend/auth-providers/src/lib/quota/readers/antigravity-plan-usage.reader.ts:144` | Insufficient local budget returns structured local-rpc timeout failure. Regression verifies the skipped stage records its detail. |

Before deletion, Ptah reverse dependencies returned only the three permitted importers, but marked its graph incomplete. A native repository-wide `rg --hidden` search of the adapter module and every export confirmed no source importer outside the write set, including barrels/index.ts, apps/ptah-electron and libs/backend/cli-engine. Parser/window helpers and fallback runner/constants were left untouched.

## Restored coverage

Tests were restored from `git show HEAD:<spec path>` and adapted to the current factory signature, explicit owner targets and source failure details.

| Review row | Status | Evidence | Restored assertions |
|---|---|---|---|
| 1 | done | `libs/backend/auth-providers/src/lib/quota/readers/antigravity-plan-usage.reader.spec.ts:164` | HTTPS then HTTP order, usage mapping, observed email, email absent from result. |
| 2 | done | `libs/backend/auth-providers/src/lib/quota/readers/antigravity-plan-usage.reader.spec.ts:184` | Extension port, protocol, CSRF token and abort signal when no listener exists. |
| 3 | done | `libs/backend/auth-providers/src/lib/quota/readers/antigravity-plan-usage.reader.spec.ts:205` | Padded pids succeed; ambiguous servers and absent ports return unavailable. |
| 4 | done | `libs/backend/auth-providers/src/lib/quota/readers/antigravity-plan-usage.reader.spec.ts:247` | 64-character cap, reset time parsing and logger privacy. |
| 5 | done | `libs/backend/auth-providers/src/lib/quota/readers/antigravity-plan-usage.reader.spec.ts:283` | Real loopback request headers and exact JSON body. |
| 6 | done | `libs/backend/auth-providers/src/lib/quota/readers/antigravity-plan-usage.reader.spec.ts:316` | Caller listener removed after settling. |
| 7 | done | `libs/backend/auth-providers/src/lib/quota/readers/antigravity-plan-usage.reader.spec.ts:326` | Quoted process arguments, cancellation during discovery and real closed port rejection. |
| 8 | done | `libs/backend/auth-providers/src/lib/quota/readers/antigravity-plan-usage.reader.spec.ts:377` | Clears stale account when no local server exists. |
| 9 | done | `libs/backend/auth-providers/src/lib/quota/readers/antigravity-plan-usage.reader.spec.ts:392` | Unknown fraction omitted; no remaining windows means unavailable. |
| 10 | done | `libs/backend/auth-providers/src/lib/quota/readers/antigravity-plan-usage.reader.spec.ts:406` | Exact CSRF header and metadata request body. |
| 11 | done | `libs/backend/auth-providers/src/lib/quota/readers/antigravity-plan-usage.reader.spec.ts:417` | Request error settles with ECONNREFUSED. |
| 12 | done | `libs/backend/auth-providers/src/lib/quota/readers/antigravity-oauth-plan-usage.reader.spec.ts:71` | Already aborted request does not read auth. |
| 13 | done | `libs/backend/auth-providers/src/lib/quota/readers/antigravity-oauth-plan-usage.reader.spec.ts:88` | Oversized token JSON rejected; added separate oversized quota response regression. |
| 14 | done | `libs/backend/auth-providers/src/lib/quota/readers/antigravity-oauth-plan-usage.reader.spec.ts:119` | HEAD summary mapping, reset and privacy assertions restored. Added grouped summary and fetchAvailableModels family mapping tests, as requested by the review table. |
| 15 | done | `libs/backend/auth-providers/src/lib/quota/readers/antigravity-oauth-plan-usage.reader.spec.ts:154` | 403 falls through to second quota endpoint with only one token refresh. |

Related gaps: `libs/backend/auth-providers/src/lib/quota/readers/antigravity-plan-usage.reader.spec.ts:431` verifies fallback after rejected OAuth. `libs/backend/auth-providers/src/lib/quota/readers/antigravity-plan-usage.reader.spec.ts:453` verifies full 3-second OAuth consumption followed by local min(3 seconds, time remaining), including 1.5-second local budget and skipping a 0.5-second remainder.

Restoration decisions: kept HEAD?s no-usage-source assertion for cancellation before any applicable source ran. The first adaptation incorrectly changed that assertion; corrected the test without changing production behavior. Updated the invalid-grant HEAD expectation to the explicitly requested service-unavailable policy. No restored assertion was weakened to accommodate a production regression.

## Checks

| Command | Result |
|---|---|
| `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/auth-providers/src/lib/quota/readers/antigravity-plan-usage.reader.spec.ts libs/backend/auth-providers/src/lib/quota/readers/antigravity-oauth-plan-usage.reader.spec.ts` | PASS: 2 suites passed, 0 failed; 52 tests passed, 0 failed; exit 0. |
| `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.lib.json` | PASS: exit 0, 0 diagnostics. |
| `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.spec.json` | PASS: exit 0, 0 diagnostics. |
| `npx eslint libs/backend/auth-providers/src/lib/quota/readers/antigravity-plan-usage.reader.ts libs/backend/auth-providers/src/lib/quota/readers/antigravity-plan-usage.reader.spec.ts libs/backend/auth-providers/src/lib/quota/readers/antigravity-oauth-plan-usage.reader.ts libs/backend/auth-providers/src/lib/quota/readers/antigravity-oauth-plan-usage.reader.spec.ts` | PASS: exit 0, 0 errors, 2 warnings (unused typed catch bindings in reader). |

All command output was tailed. No nx, verify, build, serve, e2e or other check commands ran. Typechecks reported no errors outside the write set.

Earlier Jest iterations: initially 2 failed suites (reader lacked reflect-metadata), 19 passed / 1 failed executed tests (new nested matcher); then 1 passed / 1 failed suite, 51 passed / 1 failed test (abort assertion adaptation). Added the test reflect polyfill, corrected the new matcher and restored the exact HEAD abort expectation; final run passes. Initial ESLint had 0 errors / 3 warnings; removing the unused helper reduced warnings to 2. Node printed a Jest configuration ES-module warning; tests completed successfully.


## Open points

- No outstanding production fixes or omitted coverage rows. ESLint retains two unused catch-binding warnings where errors deliberately map to the same request-failed category; catch parameters remain typed unknown as requested.
- CLI skill discovery/loading is unavailable in this session; no required skills were specified. Ptah dependency lookup was available but incomplete, so native rg supplied the repository-wide importer check.
- antigravity-plan-usage.reader.spec.ts: 482 lines (under 700); no extra spec file added.
- antigravity-oauth-plan-usage.reader.spec.ts: 222 lines (under 700); no extra spec file added.
