# Review - batch c3a (Claude OAuth plan-usage source)

Reviewer: code-logic-reviewer (CLI lane, read-only)
Scope: uncommitted changes in worktree `lane-usage-claude-c3`

- `libs/backend/auth-providers/src/lib/quota/readers/claude-oauth-plan-usage.reader.ts` (new)
- `libs/backend/auth-providers/src/lib/quota/readers/claude-oauth-plan-usage.reader.spec.ts` (new)
- `libs/backend/auth-providers/src/lib/quota/plan-usage.service.ts` (diff at :179-184)

## Verdict

**CHANGES REQUIRED - score 5/10.**

The reader itself is careful. It never refreshes or writes credentials. It logs only error names.
The token goes only into the Authorization header. It uses `redirect: 'error'` and a 5 s timeout
with cleanup. The owner check fails closed.

The service integration has defects that block the batch:

- The fallback replaces the `no-open-session` reading with a different status in every case
  where the OAuth source does not succeed. This changes the cache and stale behavior and
  breaks two existing service tests.
- The OAuth reader has no injection point in `PlanUsageService`. Existing service specs now
  read the real `~/.claude/.credentials.json` and can call the real endpoint.

Evidence for the score: the security and privacy rules hold (above 4). The fallback regresses
existing behavior for every non-OAuth Claude owner with no open session (below 7).

## Checks run

- `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath .../claude-oauth-plan-usage.reader.spec.ts`: 6/6 passed.
- I did NOT run `plan-usage.service.spec.ts`. After this change, that spec reads real credential
  files from the home directory and can send an HTTP request to the real endpoint (see F2).
  The brief forbids both. The analysis of F1/F2 is from the source code.
- I did not run tsc or eslint again. The batch report gives passing results for both, and the
  types used (`no-oauth`, `account-unverified`, `usage-auth-rejected`) exist in
  `libs/shared/src/lib/types/plan-limit.types.ts:210-220`.

## Five logic questions

1. **What happens on failure?** Each failure in the reader returns a typed unavailable reading.
   But the service loses the `no-open-session` marker, so the failure semantics change (F1).
2. **What is the owner proof?** The reader builds the key with the same `claudeAccountOwnerKey`
   function as the live reader (email + `\0` + organization, both trimmed). The proof is
   metadata only, but it fails closed (F5, F6).
3. **Is any state stale or racy?** `no-usage-source` readings are now cached for 30 s, so a
   session that opens in that time is not read on a non-refresh call (F1).
4. **Are boundaries validated?** Yes, with Zod. The window schema is stricter than the live
   mapper (F4). A partly dropped set still has `windowSetEstablished: true` (F3).
5. **Is anything incomplete?** There is no service-level test of the fallback, and some failure
   paths have no test (F8).

## Findings

### F1 - HIGH - Fallback drops `no-open-session` and changes cache and stale behavior

`plan-usage.service.ts:179-184`, `claude-oauth-plan-usage.reader.ts:47-49`

When the live reader returns `no-open-session`, the service now always returns the OAuth
reading. None of the OAuth unavailable readings carry `unavailableReason: 'no-open-session'`.
Effects in `PlanUsageService.settle` (`plan-usage.service.ts:420-461`):

- `no-usage-source` readings (`no-oauth`, and `account-unverified` for non-account owners,
  reader :61, :67, :68, :80) are not transient. `settle` caches them (:452-454). For 30 s
  (`PLAN_USAGE_CACHE_TTL_MS`), a non-refresh read returns this cached reading and does not
  try the live session that opened in that time (:219-228). Before, `no-open-session` was never
  cached.
- `service-unavailable` readings without `unavailableReason` (`account-unverified`
  mismatch :77, `usage-auth-rejected`, `cli-unavailable`, `cli-timeout`, `cli-parse-failed`) are
  transient (`isTransientFailure`, :523-529). The service now re-serves the cached available
  reading as `stale`. The existing test "no open session never re-serves the cache as stale"
  (`plan-usage.service.spec.ts:1051-1061`) asserts the opposite.
- The UI reason changes from "no open session" to `no-oauth` / `account-unverified` for API-key,
  Bedrock and Vertex users, and for macOS users (credentials in the Keychain, no file). For an
  API-key owner, `account-unverified` is an incorrect reason.
- Test F27 (`plan-usage.service.spec.ts:213-232`) expects `status: 'service-unavailable'` and
  `unavailableReason: 'no-open-session'`. With `CLAUDE_A` (an account owner with email `a@x`),
  the OAuth reader now returns `no-oauth` (no file, `no-usage-source`) or `account-unverified`
  (file present, owner mismatch). Both cases fail the test. The batch did not run this spec.

**Fix:** Only replace the live reading when the OAuth reading is `available`. Otherwise return
the live reading and keep its `unavailableReason`. You can add the OAuth reason as extra
information:

```ts
const oauth = await oauthReader(request);
return oauth.status === 'available'
  ? oauth
  : { ...live, ...(oauth.statusReason && { statusReason: oauth.statusReason }) };
```

Also skip the OAuth call when `target.ownerRef.identityKind !== 'account'` (an early return in
the service), so API-key and unknown owners keep the exact old path. Then run
`plan-usage.service.spec.ts` and `plan-usage.accounts.spec.ts` after F2 is fixed.

### F2 - HIGH - OAuth reader is not injectable; service tests touch real credentials and network

`plan-usage.service.ts:183`

The service builds the reader with the default `fetch`, `readFile` and `homedir`. The
constructor has no parameter to replace it. Every existing spec that constructs
`PlanUsageService` with a null `readPlanUsage` (`plan-usage.service.spec.ts`,
`plan-usage.accounts.spec.ts`,
`libs/backend/cli-agent-runtime/.../plan-limit-owner-discovery.service.spec.ts`) now:

- reads the developer's real `~/.claude/.credentials.json` and `~/.claude.json`, and
- sends a GET with the real token to `api.anthropic.com` when the email and organization in
  the local file match the fixture owner. This is unlikely, but it is not prevented.

The result also depends on the machine (file present or absent), so the tests are not
deterministic. It also builds a new reader closure on each call.

**Fix:** Build the OAuth reader one time in the constructor, from an optional constructor
parameter (for example `claudeOauthReader: PlanUsageReader = createClaudeOauthPlanUsageReader(logger, now)`),
or from an injected `{ fetcher, read, home }` dependency. In the service specs, inject a
stub that returns `no-usage-source`. Add one service spec for the fallback order: live first,
OAuth only on `no-open-session` and a native route, and `readPlanUsage` called exactly once.

### F3 - MEDIUM - A dropped malformed window still gives `windowSetEstablished: true`

`claude-oauth-plan-usage.reader.ts:99-103, 113-115`

A present but malformed window (for example `five_hour: { utilization: 'bad' }`) is dropped
silently. The reader then passes the rest to `mapClaudePlanUsage`, which sets
`windowSetEstablished: true` (`claude-plan-usage.reader.ts:261`). Consumers read this flag as
"this is the full window set" (`plan-limit.types.ts:251`, `lane-state.ts:271`). The UI thus
treats the dropped window as absent, not as unknown. The batch goal is "unknown with a reason".

**Fix:** Count fields that are present and not null but fail `Window` / `Limit`. When the
count is above zero, return the reading with `windowSetEstablished: false` (keep the valid
windows). Add a spec assertion for the flag in the "drops malformed windows" test.

### F4 - MEDIUM - `utilization` / `percent` above 100 drops the window

`claude-oauth-plan-usage.reader.ts:26, 31`

`Window` and `Limit` use `.max(100)`. The live mapper accepts any number
(`claude-plan-usage.reader.ts:55, 71`). If the API reports a value above 100 (over the limit,
or rounding), the OAuth source drops exactly the window that is most important, and with F3
the set still shows as complete. The same account then shows different windows from the
live source and the OAuth source. A value of 100 maps to `used.percent: 100` only. No
exhaustion flag is made, which is correct.

**Fix:** Remove `.max(100)` (keep `.min(0)` and `.finite()`), or clamp to 100 after the parse.
Add a fixture with `utilization: 104`.

### F5 - MEDIUM - `CLAUDE_CONFIG_DIR` is ignored; the home directory does not use the existing abstraction

`claude-oauth-plan-usage.reader.ts:57, 64, 72`

The reader always reads `<homedir>/.claude/.credentials.json` and `<homedir>/.claude.json`.
Claude Code uses `$CLAUDE_CONFIG_DIR/.credentials.json` and `$CLAUDE_CONFIG_DIR/.claude.json`
when the variable is set. The repository already handles this variable
(`accounts/claude-ambient-login-status.ts:14`, `accounts/claude-route-certifier.ts:341`).
The native route can therefore read a different login directory than the one the native
session uses. Both files come from the same directory and the owner key check runs before
HTTP. Thus the result is a false `account-unverified` or `no-oauth`, not windows for a wrong
owner. A wrong-owner attach would need `.credentials.json` and `.claude.json` in the same
directory to hold different accounts. That is possible only if one file is stale.

**Fix:** Resolve the Claude config directory with the same rule as the ambient login code
(`CLAUDE_CONFIG_DIR`, then `homedir()/.claude`). Note that `.claude.json` sits inside
`CLAUDE_CONFIG_DIR` when the variable is set, and in the home directory when it is not. Add
one spec for each case. Record the macOS Keychain case (no file, `no-oauth`) as a known
limitation in the reader's doc comment.

### F6 - LOW - Owner proof is metadata only; organization field equality is not proven

`claude-oauth-plan-usage.reader.ts:72-77`

The key matches the live-reader key only if `accountInfo().organization` from the SDK equals
`oauthAccount.organizationName` in `.claude.json`. The batch report states this, but no test
or code reference proves it. If the two values are different (for example, the SDK gives no
organization for a personal account), every OAuth read fails closed with
`account-unverified`. This is safe, but the feature then does nothing. The token is also not
bound to the metadata (the report states this).

**Fix:** Add a reference to the SDK source of `accountInfo().organization`, or a test with a
real-shaped (anonymized) fixture that proves both keys are equal. Keep the fail-closed check.

### F7 - LOW - Wrong reason when `.claude.json` fails; already-aborted signal is not honored

`claude-oauth-plan-usage.reader.ts:72, 78-80, 84`

- A missing or invalid `.claude.json` (after a valid token) goes to the catch block and
  returns `no-oauth`. The correct reason is `account-unverified`.
- If `signal` is already aborted, `addEventListener('abort')` never fires. The request then
  runs until the 5 s timer. Check `signal?.aborted` before the fetch, or use
  `AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)])`.
- A caller abort is reported as `cli-timeout`. The service throws an abort error in that case
  (`plan-usage.service.ts:395, 399`), so this has no user effect.

**Fix:** Wrap the `.claude.json` read in its own try block that returns `account-unverified`.
Check `signal?.aborted` before the request.

### F8 - LOW - Missing failure-path tests and minor HTTP handling

`claude-oauth-plan-usage.reader.spec.ts`, `claude-oauth-plan-usage.reader.ts:92-93`

Paths with no test:

- 403, 429, 500 (all non-2xx except 401).
- Fetch rejection that is not an abort (network error, rejected redirect) gives `cli-unavailable`.
- Empty body `{}`, `null` body, and an array body give `cli-parse-failed`.
- `expiresAt` in seconds (for example `1.7e9`). The current code treats it as expired, which
  fails closed. Add a test so this is a stated decision.
- Named route and non-account owner give `no-usage-source` with no file read.
- No test asserts that the logger never gets the token, email or organization. Add a check
  that no logger call argument contains `fixture-token`, `person@example.test` or `Example`.
- The 401 test uses `ok: false` objects, but the success path uses a real `Response`. This is
  acceptable.

HTTP handling:

- A non-2xx response body is not consumed or cancelled. Call `response.body?.cancel()` before
  the return so the undici connection is released.
- 429 maps to `cli-unavailable` and the service then serves stale data. That is acceptable,
  but a `Retry-After` value is ignored. The reasons named `cli-*` are wrong for an HTTP
  source. If a provider-API reason exists in `PlanLimitStatusReason`, use it. If not, record
  the reuse as a decision.

## Items confirmed correct

- No refresh or write of credentials. Only `readFile` is used, and `refreshToken` is never read
  (`Credentials` schema :13-18).
- The token appears only in the `Authorization` header (:89). Log calls pass only
  `error.name` (:79, :121). The response body, email and organization are never logged.
- `redirect: 'error'` (:90). The timeout is bounded at 5 s and covers the body read (`json()` runs
  inside the timed try block). The timer and listener are removed in `finally` (:123-126).
- `expiresAt <= now()` check in ms (:68). Seconds-based values fail closed.
- The owner key comes from the same `claudeAccountOwnerKey` as the live reader
  (`claude-plan-usage.reader.ts:189`, `provider-owner.resolver.ts:127-137`). The comparison
  runs before HTTP. Named routes and non-account owners are refused before any file read (:60).
- Each malformed window is dropped by itself. An empty or invalid payload returns
  `cli-parse-failed`. A `PlanUsageParseError` from the mapper is caught (:117). The resets map to
  `resetSource: 'provider-api'`, and `source: 'provider-api'` is set.
- `readPlanUsage` is called exactly once per service read. Named routes never reach OAuth.
  Other providers are not changed. With an open session, `unsupported-auth` from the live reader
  is returned unchanged.

## Decisions

- I did not run `plan-usage.service.spec.ts`. Options: run it (it can read real credentials
  and call the endpoint) or analyze the code. Evidence: the brief forbids real credential reads
  and endpoint calls. Reversible: yes. Run the spec after F2 is fixed.
