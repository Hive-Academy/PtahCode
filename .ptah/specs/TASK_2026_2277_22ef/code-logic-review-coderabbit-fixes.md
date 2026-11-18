# Code-logic review: CodeRabbit fixes (PR #1425, uncommitted diff)

Scope: `libs/backend/auth-providers/src/lib/quota/` (service, three readers, their specs, new `plan-usage.rejection.spec.ts`). Source was read directly. The triage report was treated as a claim.

Checks I ran: the five-suite targeted Jest command gave **PASS, 5 suites, 163 tests**. `tsc --noEmit` and the changed-file `eslint` run were started; their results are in "Check results" below. No `nx`, `verify`, build or serve command was run. No source file was edited.

Paths: `Q` = `libs/backend/auth-providers/src/lib/quota`, `OAuth` = `Q/readers/antigravity-oauth-plan-usage.reader.ts`, `AGY` = `Q/readers/antigravity-plan-usage.reader.ts`, `GROK` = `Q/readers/grok-account-plan-usage.reader.ts`, `SVC` = `Q/plan-usage.service.ts`.

## 1. Findings table

| # | Comment id | Finding | Verdict | Evidence | Proving test |
|---|---|---|---|---|---|
| 1 | 4615951658 | Auth rejection only for 401/403 or invalid_grant | FIXED | `OAuth:67-72`. `usage-auth-rejected` only for `invalid-grant` or `http-rejection` with 401/403. Other statuses map to `balance-unavailable`. | `preserves refresh failure %s %s`, `preserves quota HTTP status %i` (oauth spec) |
| 2 | 4615951677 | Schema failure gets a neutral reason | FIXED | `OAuth:69` (`schema-mismatch` -> `balance-unavailable`). | `uses a neutral reason for malformed OAuth credentials` |
| 3 | 4615951693 | Forward abort signal and encoding to token read | FIXED | `OAuth:113` types `readAuth` with `{encoding, signal}`. `OAuth:134` passes `controller.signal`. | `passes cancellation to the token file read` |
| 4 | 4615951715 | Refresh error body decoded best effort (400 / timeout kept) | FIXED | `OAuth:153-166`. Body failure is logged and falls through to `http-rejection` 400. Abort returns `timeout`. | `keeps HTTP 400 when the refresh error body is %s`, `keeps timeout when cancellation interrupts a refresh error body` |
| 5 | 4615951727 | Per-endpoint catch restored | FIXED | `OAuth:177-203`. Details in 2a. | `tries the next endpoint after a %s failure` (network/json/http), `ends the quota stage on %s without trying another endpoint` (abort/timeout) |
| 6 | 4615951747 | Token file re-read and validated before the 401 retry | FIXED | The read and `TokenSchema.parse` sit inside the `attempt` loop (`OAuth:131-144`). | `reloads replacement credentials before the single 401 retry` |
| 7 | 4615951770 | Evidence timestamp before dispatch, `fetchedAt` = completion | FIXED | `OAuth:179` takes `observedAt` before `fetcher`. `OAuth:194` sets `fetchedAt: now()` after decode. | `timestamps evidence before dispatch while retaining completion time` |
| 8 | 4615951790 | Disabled CLI must not consult the account store | FIXED | `AGY:116-120` no longer reads the store or calls `matchesAntigravityStoreAccount`. It returns `source-unavailable`. `_readStoreOwner` stays as an unused parameter (see minor items). | `does not consult the account store for the disabled CLI` |
| 9 | 4615951813 | Timeout vs missing server after discovery | FIXED | `AGY:148-151` checks `controller.signal.aborted` right after `discoverServer`. | `reports timeout when lsof exhausts discovery with no extension port` |
| 10 | 4615951830 | Body transport/timeout failures reach the request classifier | FIXED | `GROK:181-184` rethrows anything that is not a SyntaxError, or any error once aborted. It recognises SyntaxErrors across realms with `types.isNativeError`. | `classifies body read failure %s as %s` |
| 11 | 4615951851 | Provider-neutral reason for billing JSON/schema failure | FIXED | `GROK:183,186` use `balance-unavailable`. | `rejects billing schema %s` |
| 12 | review 5959042995 | Stale snapshot carries the current rejection reason | FIXED | `SVC:520`: `...(reading.statusReason && { statusReason })` inside a fresh object literal. | `preserves the current Grok rejection reason on stale measurements without caching it` (`plan-usage.rejection.spec.ts`) |

I did not do a revert-and-rerun mutation check. The triage report claims 20 failures against the old production files; I did not repeat it.

## 2. Specific checks

### (a) Per-endpoint catch in the OAuth reader: OK
- After a non-abort failure, the catch at `OAuth:197-202` sets `lastFailure`, logs a safe cause and does not return. The loop moves to the next endpoint. HTTP non-OK other than 401 hits `continue` (`:189`). Malformed JSON and `ZodError` land in the catch.
- Abort or timeout: `controller.signal.aborted`, or an error named `AbortError` or `TimeoutError`, returns `failure('timeout')` at `:198`, which ends the stage. `abortable` throws only once the controller has aborted, so it is covered.
- The 401 retry stays single. `attempt` runs at most 2 times (`:131`) and drops to 1 when `retryUnauthorized` is false. A 401 clears `cachedAccess` and breaks both loops. Only attempt 2 can refresh again. A second 401 ends the loop with the `http-rejection` 401 failure. There is no unbounded loop and at most one extra refresh.
- Each attempt re-reads the token file and runs `TokenSchema.parse` (`:134-144`). `cachedAccess` is keyed by `refresh_token` and `fetcher`, so a replaced credential is not served from the cache.

### (b) Auth rejection mapping: mostly OK, one gap
- The mapping at `OAuth:67-72` is correct. 503, 400 (non-`invalid_grant`) and schema failures get `balance-unavailable`. Grok and AGY stages keep their existing labels.
- Gap: `lastFailure` is overwritten by every later endpoint failure (`:187`, `:196`, `:199`). A real 401/403 on endpoint A followed by 503 or a schema mismatch on endpoint B, or on the `fetchAvailableModels` operation, ends as the neutral reason. An expired login can therefore be reported as "limits unavailable". A 401 ends the stage immediately, so that case is safe. Only a 403 (which uses `continue`) can be hidden. HEAD had the same overwrite, but then every status mapped to `usage-auth-rejected`, so the neutral mapping is what makes it visible. No test covers it. Non-blocking, see minor item M1.

### (c) Stale overlay: OK
`SVC:516-523` builds a new object with `{...staleFrom, status: 'stale', ...}`. `staleFrom` is the cached reading or the incoming stale reading, and neither is modified. The cache write is on the non-transient path only, so the rejection reason is never cached. The rejection spec covers that.

### (d) Timestamps: OK
`observedAt` is taken before dispatch and goes into the windows' `observedAt` and `usedObservedAt`. `fetchedAt` is the completion time. Consumers of `fetchedAt`:
- `AGY:86` uses it as `readAt` (completion semantics, correct).
- `SVC:485` uses it as `readAt`.
- `SVC:538` and `SVC:548` use it as the clear-evidence cut-off for provider-api readings. Window evidence is older than or equal to `fetchedAt`, so clearing evidence at or before `fetchedAt` never removes data newer than the read.
- No consumer compares `observedAt` against `fetchedAt` in a way the earlier `observedAt` breaks.

### (e) Sensitive data in logs and errors: OK
New log lines:
- `OAuth:160` logs `{cause, httpStatus: 400}`.
- `OAuth:201` logs `{cause}`.
- `AGY:90` spreads `{source, reason, cause, httpStatus}` (the `AntigravitySourceFailure` shape).
- `GROK:79` logs `{status, reason}`.

None logs a token, key, email, account id, response body or raw error message. `Error('aborted')` and `Error('response too large')` carry no data. Error objects are not logged.

### (f) New defects and hygiene
- No `any`, `as any`, `as unknown as`, non-null `!` or empty catch in the added lines (regex scan of the diff and a read of the OAuth reader). Every catch is `unknown` and either returns, rethrows or logs. The `as const` and `as { ownerRef?: ... }` casts are older code.
- File lengths: oauth reader 300, agy reader 511, grok reader 278, service 671, oauth spec 302, agy spec 507, grok spec 512, rejection spec 29. All are under 700, but `plan-usage.service.ts` has only 29 lines of headroom.
- The service already existed near the limit; this diff adds 1 line.
- Defects found are listed under minor items below.

## 3. Verdict: **APPROVED**

**Blocking items: none.** All 12 findings are fixed in code with a test that names them. The behaviours asked about in (a), (c), (d) and (e) hold.

**Minor items (not blocking):**
- M1. `OAuth:187,196,199`: a later neutral failure overwrites an earlier 401/403 `lastFailure`. This can hide a genuine expired login on the 403-then-503 path. Suggest keeping a rejection if one was seen, and adding a test.
- M2. `OAuth:143`: `error instanceof Error ? 'schema-mismatch' : 'request-failed'`. `JSON.parse` and `ZodError` are always `Error`, so `request-failed` is unreachable. It is harmless.
- M3. `AGY:78`: `_readStoreOwner` is an unused parameter kept for caller compatibility. Check whether any caller still passes it, then drop it. `AGY:106,228` already have unused-variable lint warnings (reported as existing at HEAD).
- M4. `SVC:315` has an existing unused-variable warning.
- M5. `plan-usage.service.ts` is 671 lines, near the 700 cap. The next change there must split it.
- M6. The working files use CRLF and git warns about it on touch. Normalise line endings at commit if the repo expects LF.

## Check results
- Jest (the 5 specs): PASS, 163 tests.
- `tsc --noEmit --project libs/backend/auth-providers/tsconfig.lib.json`: exit 0, no diagnostics.
- `eslint` on the four production files: exit 0, 0 errors, 3 warnings, all unused catch variables (`plan-usage.service.ts:315`, `antigravity-plan-usage.reader.ts:106,228`). This matches the triage claim.
