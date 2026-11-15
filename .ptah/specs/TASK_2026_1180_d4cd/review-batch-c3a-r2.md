# Review round 2 - batch c3a (Claude OAuth plan-usage source)

Reviewer: code-logic-reviewer (CLI lane, read-only)
Scope: commit 088c9e756 and the merge commit 621c344e0 (HEAD) on `fix/lane-usage-claude-c3`.

- `libs/backend/auth-providers/src/lib/quota/readers/claude-oauth-plan-usage.reader.ts`
- `libs/backend/auth-providers/src/lib/quota/readers/claude-oauth-plan-usage.reader.spec.ts`
- `libs/backend/auth-providers/src/lib/quota/plan-usage.service.ts` (constructor :176-193, settle :428-477)
- `libs/backend/auth-providers/src/lib/quota/plan-usage.service.spec.ts`, `plan-usage.accounts.spec.ts`
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/plan-limit-owner-discovery.service.spec.ts`
- `libs/backend/auth-providers/src/lib/di/register.ts:336-349` (production factory, unchanged)

## Verdict

**APPROVED WITH ONE RECOMMENDED CHANGE - score 7/10.**

All eight round-1 findings are fixed in code. F6 is fixed only partly (the new test proves the
key formula, not the SDK field equality), but the check still fails closed. The merge did not
break the fallback. I found no token or personal data in logs, no credential write or refresh,
no wrong-owner attach path, no false AT LIMIT and no double live read.

One new MEDIUM item remains (N1): a failed OAuth read is never cached and has no backoff. Each
snapshot call with no open session repeats the file reads and, for a matched owner, the HTTP
request. A 429 answer is not respected.

Evidence for the score: the security, owner and cache rules hold, and all tests pass (above 6).
N1 adds unbounded network traffic to an endpoint that rate-limits, and F6 has no real proof
(below 9).

## Checks run

- `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath plan-usage.service.spec.ts plan-usage.accounts.spec.ts readers/claude-oauth-plan-usage.reader.spec.ts readers/claude-plan-usage.reader.spec.ts`:
  PASS, 4 suites, 82 tests (on HEAD, after the merge).
- `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.lib.json` and `tsconfig.spec.json`: PASS.
- `npx eslint` on the five changed auth-providers files: 0 errors, 3 warnings that existed before.
- Not run: `plan-limit-owner-discovery.service.spec.ts`. It is in `cli-agent-runtime`, and the
  brief allows only the auth-providers Jest config. I examined its stub by source (:968).
- I did not call the real endpoint and did not read real credential files.

## Round-1 findings - status

| ID | Status | Evidence |
| --- | --- | --- |
| F1 HIGH | Fixed | `plan-usage.service.ts:182-192`. The live reading is returned unless OAuth is `available` with windows. The `no-open-session` reason, the no-cache rule (:461) and the no-stale rule (:538-543) are kept. A throw from OAuth also returns the live reading. Existing F27 and "no open session never re-serves the cache as stale" tests pass. Named routes and non-account owners return the live reading before OAuth (:184). |
| F2 HIGH | Fixed | Optional constructor parameter `claudeOauthReader` (:178), built one time. The production factory passes 7 arguments (`register.ts:339-347`), so the default reader is used in production. All three specs that construct the service inject a stub (`plan-usage.service.spec.ts:139,151`, `plan-usage.accounts.spec.ts:54,65`, `plan-limit-owner-discovery.service.spec.ts:968`). `register.spec.ts`, `shutdown.spec.ts` and `container.smoke.spec.ts` only resolve the service. The default reader closure does no I/O until a call, so these specs touch no file or network. The reader spec injects `fetcher`, `read`, `home` and `env` (`reader.spec.ts:25-31`). A service test proves the order: live once, then OAuth (`plan-usage.service.spec.ts:169-184`). |
| F3 MEDIUM | Fixed | `reader.ts:112-122,131`. A present malformed window or limit entry sets `windowSetEstablished: false`. Test at `reader.spec.ts:45-50`. |
| F4 MEDIUM | Fixed | `.max(100)` removed (`reader.ts:26,31`), value clamped with `Math.min(100, ...)` (:116,126). Test at `reader.spec.ts:94-96`. An over-limit value maps to 100, which is a true limit, not a false AT LIMIT. |
| F5 MEDIUM | Fixed | `reader.ts:64-66`. `CLAUDE_CONFIG_DIR` selects both files. Otherwise `~/.claude/.credentials.json` and `~/.claude.json`. Both cases tested (`reader.spec.ts:86-93`). Keychain limitation documented (:1). `CLAUDE_SECURESTORAGE_CONFIG_DIR` is not read, but the repository sets it only for named profiles (`claude-login-console.ts:122,148`), and named routes skip OAuth. |
| F6 LOW | Partly fixed | `reader.spec.ts:42-44` asserts that `claudeAccountOwnerKey({ email, organization })` equals the fixture key. Both sides use the same formula, so the test does not prove that the SDK `accountInfo().organization` equals `oauthAccount.organizationName`. The SDK type (`agentSdkTypes.d.ts:23-33`) gives `organization?: string` with no source. The check still fails closed. See N2. |
| F7 LOW | Fixed | Account metadata has its own try block and returns `account-unverified` (`reader.ts:80-91`). An already-aborted signal returns before HTTP (:92). Tests at `reader.spec.ts:101-108`. |
| F8 LOW | Fixed | Non-2xx body cancelled (:104). Tests for 403/429/500, `{}`/`null`/`[]`, network rejection, seconds expiry, named and non-account skip, and a logger privacy check (`reader.spec.ts:94-130`). Reuse of `cli-*` reasons is recorded in the fix report. |

## Merge check (origin/main into the branch)

The main side added `providerOwnerClear` / `providerOwnerEvidence` handling in `settle`
(`plan-usage.service.ts:465-471`). The fallback wrapper (:180-193) is intact after the merge.
The OAuth reading sets neither field, so `settle` records only window evidence for it and clears
no owner evidence. The `no-open-session` no-cache rule (:461) and `isTransientFailure` (:538) are
unchanged. The service spec passes on HEAD.

## Decision: should the OAuth reading set `providerOwnerClear`?

**Decision: no. Do not set it now.**

- Options: (a) set `providerOwnerClear: true` on an available OAuth reading, like the codex
  reader (`codex-plan-usage.reader.ts:167`); (b) leave it unset.
- Evidence: `providerOwnerClear` makes `settle` call `ledger.clearProviderOwnerEvidence`
  (:466-468). That removes owner gate evidence, for example a recorded rate-limit gate that
  can show AT LIMIT. The codex reader sets it only when its owner gate did not deny, and its
  source is the codex account API for the same login. The Claude OAuth owner proof is
  metadata only: the email and organization in `.claude.json` against the owner key. The token
  is not bound to that metadata (`reader.ts:74-75,81`), and F6 shows the organization equality
  is not proven. If the proof is wrong, (a) would clear a real gate for the wrong owner and
  hide a true AT LIMIT. With (b), a wrong match can only add window evidence, and the existing
  gate stays until its own expiry. The live SDK reader does not set the field either, so (b)
  keeps parity with the live Claude source.
- Revisit when the token can be bound to the account (for example an endpoint that returns
  the account identity in the usage answer).
- Reversible: yes.

## New findings

### N1 - MEDIUM - Failed OAuth reads have no cache or backoff; each snapshot repeats HTTP

`plan-usage.service.ts:182-192`, `plan-usage.service.ts:461`, `claude-oauth-plan-usage.reader.ts:103-105`

When OAuth fails, the wrapper returns the live `no-open-session` reading. `settle` never caches
that reading (:461), by design. Thus every non-refresh snapshot call for a Claude account owner
with no open session runs the OAuth reader again: two file reads and, when the owner matches,
one HTTP request. Callers are on demand (`lane-limit-lookup.service.ts:239`,
`plan-limits-snapshot.service.ts:231`), so the rate follows the UI and lane lookups, not a
fixed timer. The flight map dedupes only concurrent calls.

Effects:

- A 429 answer gives `cli-unavailable`, and the next call sends the request again at once.
  `Retry-After` is ignored. This can keep the account rate-limited on this endpoint.
- A 401/403 (expired or revoked token that the file still shows as valid) repeats on each call
  until the CLI refreshes the file.
- Before this batch, this path had no network traffic.

A successful read is cached for 30 s, so the success path is bounded. Only the failure path is
not.

**Fix:** Keep a small per-owner failure state in the wrapper (or in the reader closure). After a
non-available OAuth result that reached HTTP, skip OAuth for that owner for a cooldown (for
example 60 s, or `Retry-After` for 429, with a cap). Keep the 401/403 skip until the credential
file's `mtime` or `expiresAt` changes. A `refresh: true` call can bypass the cooldown except for
429. Add one service test: two non-refresh reads after a failed OAuth read call the OAuth reader
one time.

### N2 - LOW - F6 test is self-referential; field equality is still unproven

`claude-oauth-plan-usage.reader.spec.ts:42-44`, `claude-oauth-plan-usage.reader.ts:84-87`

The test compares the formula with itself. If the SDK gives no organization (or a different
string) for a personal account while `.claude.json` has `organizationName`, every OAuth read
returns `account-unverified`, and the feature does nothing for those users. This is safe.

**Fix:** Record the observed shapes (anonymized) of `accountInfo()` and `oauthAccount` for one
personal and one team login in the task folder, or add a debug log of a boolean "owner key
matched" result with no values. Keep the fail-closed check.

### N3 - LOW - A rejected body cancel changes the 401/403 reason

`claude-oauth-plan-usage.reader.ts:103-105`

`await response.body?.cancel()` can reject for an errored stream. The outer catch then returns
`cli-unavailable` (or `cli-timeout`), not `usage-auth-rejected`. The service returns the live
reading in both cases, so the user effect is small.

**Fix:** `await response.body?.cancel().catch(() => undefined);`

### N4 - LOW - Warn log on each read in the normal "no file" case

`claude-oauth-plan-usage.reader.ts:76-78`

A Claude account owner with a Keychain-only login (macOS) has no credential file. Each
snapshot call with no open session logs a `warn` with reason `Error`. The log holds no secret or
path, but it is repeated noise. With N1 not fixed, the rate equals the snapshot rate.

**Fix:** Log `debug` for `ENOENT` and keep `warn` for other errors.

### N5 - INFO - Logger privacy test covers only one path

`claude-oauth-plan-usage.reader.spec.ts:129`

The assertion checks only `warn` calls after a network failure in one harness. It does not
check `debug` calls (for example `parseFailure` in the shared mapper) or the account-metadata
path. Source review shows that all reader log calls pass only `error.name`
(`reader.ts:77,89,137`), and the token is used only in the `Authorization` header (:100). No
change is required. A wider assertion across all tests (an `afterEach` on all logger methods)
would keep this true.

## Items confirmed correct

- No credential write or refresh: only `read` is used, and `refreshToken` is not parsed
  (`reader.ts:13-18`).
- Owner check before HTTP, fail closed on a mismatch, missing metadata or invalid JSON
  (`reader.ts:80-91`). Named routes and non-account owners (API key, Bedrock, Vertex, unknown)
  are skipped before any file read, in both the reader (:61) and the service (:184). API-key,
  Bedrock and Vertex users keep the exact old `no-open-session` result.
- `readPlanUsage` (the live probe) is called exactly one time per read
  (`plan-usage.service.spec.ts:172,180`). The OAuth reader runs only after a live
  `no-open-session` result.
- With an open session, the live reading (including `unsupported-auth`) is returned unchanged.
- An available OAuth reading is cached for the owner key, like a live reading. A later
  transient failure can re-serve it as stale for the same owner. That is the existing rule.
- Timeout of 5 s covers the body read. The timer and listener are removed in `finally`
  (`reader.ts:139-142`). `redirect: 'error'` is set (:101).
- No false AT LIMIT: values above 100 clamp to 100. Malformed windows are dropped and mark the
  set unestablished. `extra_usage` is not mapped. The OAuth reading sets no owner evidence.
- The spec fixtures use only placeholder data (`person@example.test`, `fixture-token`).

## Decisions

- `providerOwnerClear`: not required (see the decision section). Reversible.
- Did not run the `cli-agent-runtime` spec: the brief limits Jest to the auth-providers config.
  Its stub was checked by source. Reversible: the coordinator can run it in the gate.
- N1 is MEDIUM, not HIGH: it causes no wrong data and no security issue, and the success path is
  cached. It can cause rate limiting of the usage endpoint and avoidable traffic.
