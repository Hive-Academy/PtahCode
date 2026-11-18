# Code logic review: Antigravity quota readers

Scope: `libs/backend/auth-providers/src/lib/quota/readers/` (`antigravity-plan-usage.reader.ts`, `antigravity-oauth-plan-usage.reader.ts`, `antigravity-cli-usage.adapter.ts` and their specs). Read-only review; nothing was run.

## Verdict
**REVISE, 6/10.**
The core intent is met. No path spawns `agy`, no failure-cache entry is written, and the chain is bounded to 11 s with linked aborts. Two production behaviour changes need a decision, and the specs dropped coverage of local-RPC and OAuth code that still ships.

## Defects

1. **Serious** — `antigravity-plan-usage.reader.ts:142` (also `:94`, `:120`). An OAuth `invalid_grant` now ends the chain with `status: 'unsupported-auth'`.
   - HEAD returned `service-unavailable` here. Its adapter flattened every OAuth failure to `sourceFailure('provider-api','no-oauth')`, so HEAD never surfaced `unsupported-auth` from this reader.
   - The new status changes lane classification. `plan-snapshot-windows.ts:24` and `:33` (`NO_PLAN_STATUSES`) return `[]` for it, so ledger windows are dropped, including exhaustion evidence of an "at limit" lane. `plan-usage.service.ts:113` and `:585` also mark it ineligible. A stale ACP token can therefore turn "at limit" or "room" into "no plan / unknown".
   - `:120` makes the local-rpc stage return `source-not-applicable` once `unsupportedAuth` is set. HEAD still tried the language server after any OAuth failure, and that source can succeed while the token file is stale. This is a regression in availability.
   - **Fix:** keep `status: 'service-unavailable'` with `statusReason: 'usage-auth-rejected'`. Drop `unsupportedAuth` (`:91`, `:94`, `:120`, `:126`), or at least keep local-rpc running. If `unsupported-auth` is intended, confirm that clearing the ledger windows is acceptable and update the ledger and classifier tests.
   - Lines 72 and 142 of the OAuth reader and the chain reader encode this status twice (`antigravity-oauth-plan-usage.reader.ts:72`, `antigravity-plan-usage.reader.ts:142`).
   - The spec at `antigravity-plan-usage.reader.spec.ts:60-68` locks in the new behaviour.

2. **Moderate** — `antigravity-plan-usage.reader.ts:227-235` (`catch` inside the candidate loop, then `return lastFailure`). HEAD called `observeAccount(null)` after the candidate loop when nothing answered. That call is now gone, along with the early `return lastFailure` at `:232`. It remains only for "no server" (`:165`) and the outer catch (`:237`). When a server is found but every candidate fails, a stale `observedAntigravityAccount` stays set (`provider-owner.resolver.ts:273-283`). It can then feed a wrong account into owner resolution until it expires.
   - **Fix:** call `observeAccount(null)` before `return lastFailure` at `:235` and `:232`. A simpler option is a `let answered = false` flag, with the clear done in the `finally` when nothing was observed.

3. **Moderate (cleanup, blocks nothing)** — the CLI adapter is dead code.
   - **Whole file `antigravity-cli-usage.adapter.ts` can be deleted.** Its only importer is `antigravity-plan-usage.reader.ts:40-42`, which uses `readAntigravityCliUsage` only as `typeof` for the unused `_readCli` parameter (`:84`). The adapter's own spec and `antigravity-plan-usage.reader.spec.ts:6,19-21` are the only other users (searched the repository with `git grep`).
   - Delete from the reader: the import at `:40-42` and the `_readCli` slot at `:84`. Update the spec: `setup()` passes `cli` at index 7, and the `cli` mocks at `:19`, `:36`, `:67`, and `:26-38` need removing. `plan-usage.service.ts:238` passes only `(logger, now)`, so production callers are unaffected.
   - Once the adapter goes, these also have no production use: `parseAntigravityUsageJson` (`antigravity-usage-json.parser.ts:39`, plus its spec), `antigravity-usage-window.ts` (`antigravityGroupSlug`, `antigravityWindowIdentity`; only the adapter and the parser use them), and the `FALLBACK_MAX_OUTPUT_BYTES` import. `fallback-usage.runner.ts` and `fallback-usage.constants.ts` stay because the runner still defines `FallbackExecutor` and `nodeFallbackExecutor` for others. Check `fallback-usage.runner.ts:171-268` before touching them.
   - If the file is kept as a seam for later, it still carries these unused items (`antigravity-cli-usage.adapter.ts`): `AntigravityCliOptions` (`:67-78`, all fields), `AntigravityCliExec` (`:61`), `AntigravityCliFailureReason` and `AntigravityCliResult` (`:37-58`), `_signal` (`:81`), `parseAntigravityCliUsage` (`:91`), `parseLine` (`:125`), `USAGE_ROW_SCHEMA`, `MAX_LINES`, `MAX_FIELD_LENGTH`, `ANTIGRAVITY_CLI_MAX_OUTPUT_BYTES` (`:13`), and the `FallbackExecutor` import (`:2`, used only in the options type). Its three removed timeout and back-off constants have no remaining importers.

4. **Minor** — `antigravity-plan-usage.reader.ts:142-143`. The `statusReason: primary.reason === 'source-not-applicable' ? undefined : primary.reason` branch is unreachable. `antigravityFailure` never emits `source-not-applicable`, and the early `sourceFailure(..., 'source-not-applicable')` returns never enter `failures` (`record` is not called). So the `undefined` assignment cannot clear a reason the base reading carried today. It is still a trap: `{ statusReason: undefined }` overwrites `reading.statusReason` (from `...reading`).
   - **Fix:** `...(primary && primary.reason !== 'source-not-applicable' && { statusReason: primary.reason })`. Also delete the blank line at `:144`.

5. **Minor** — redundant ternaries `error instanceof Error ? 'request-failed' : 'request-failed'` at `antigravity-plan-usage.reader.ts:116`, `:239` and `antigravity-oauth-plan-usage.reader.ts:138`, `:196`. Both branches are identical; reduce them to a plain `'request-failed'`.

6. **Minor** — `antigravity-oauth-plan-usage.reader.ts:121` uses a hard-coded `10_000` timeout. The chain stage cuts it at 3 s (`antigravity-plan-usage.reader.ts:49`). It does not violate the 11 s budget when reached through the chain, but a direct caller can use up to 10 s of an outer 12 s deadline. Name it as a constant, for example `ANTIGRAVITY_OAUTH_TIMEOUT_MS`.

7. **Minor** — `antigravity-plan-usage.reader.ts:155` returns `budgetUnavailable()`, a reading without `sourceFailures`. When the local stage is entered with less than 1 s left, `record` pushes no failure detail, unlike every other failure. Use `antigravityFailure('local-rpc','timeout')`.

## Notes confirmed or rejected
- **Note 1**: confirmed, see defect 3.
- **Note 2**: partly confirmed.
  - OAuth path: `antigravity-plan-usage.reader.ts:104-105` gates on `identityKind` only. The token file carries no email, so there was never an account check. HEAD had none either, so nothing was lost.
  - Local path: `observeAccount(...)` against `ownerRef.key` is intact (`:185-194`). It returns `'account-changed'`, mapped to `account-mismatch` / `account-unverified` (`:122-123`), and the chain stops on it (`usage-source-chain.ts:71`, `:75`).
  - The CLI-stage pre-check for `identityKind === 'account'` survives at `:131-133` but is now moot. The post-read check disappeared together with the CLI run.
  - The one real loss is defect 2.
- **Note 3**: the `undefined` spread is not reachable (defect 4). `invalid-grant` → `unsupported-auth` is not what HEAD returned from the chain (defect 1). HEAD's OAuth reader did return `unsupported-auth` internally at HEAD `:143`, but the HEAD adapter discarded it.

## Check A: production
- **Process spawn:** the only remaining spawns are `defaultRun` (`ps`, `powershell`, `lsof`) in `antigravity-plan-usage.reader.ts:446-454`, for local server discovery. The CLI stage (`:125-135`) spawns nothing and records no cache, and the adapter stub is not called at all.
- **Abort and timers, OAuth stage (`:103-118`):** the listener is removed, `clearTimeout` runs and `controller.abort()` runs in `finally` on success, failure and abort. An already-aborted signal is handled at `:109`.
- **Abort and timers, local stage (`:156-244`):** same. `clearTimeout`, `removeEventListener` and `controller.abort()` run in `finally`. A pre-aborted signal returns before any listener is added (`:151`).
- **OAuth reader (`:117-201`):** same discipline, with `finally` at `:197-201`. `abortable` removes its listener in `.finally`.
- **Budget:** the chain deadline is `Math.max(0, chainDeadline - now())` (`:137`). OAuth is capped at 3 s and local at `min(3 s, time left)`, so the sequential worst case is about 6 s. `readUsageSourceChain` races each stage against its own abort, so no stage can outlive 11 s. `usage-source-chain.ts:10` still defaults to 20 s but is overridden.
- **Failure shown as room:** not possible. Only an `available` reading with windows carries windows, and every failure builds `windows: []`.
- **Status changes vs HEAD:** `unsupported-auth` (defect 1) is the only status that changes how a lane is classified. All other failures stay `service-unavailable`, with a more specific `statusReason`.
  - `usage-auth-rejected` for a 403: HEAD's OAuth reader said `no-usage-source`, but the chain still reported `service-unavailable`.
  - `no-local-server`, `cli-parse-failed`, `usage-budget-exhausted`.

## Check C: rules in changed lines
- No `any`, no `as unknown as`, no non-null `!`, no `console.*`, no `@ts-ignore`.
- All `catch` use `error: unknown`, except the pre-existing commented swallow in `discoverServer` (`:280`, has a `degradation-audit` comment).
- External payloads are parsed with Zod: `TokenSchema`, `RefreshSchema`, `QuotaSchema`, `AntigravityStatusSchema`.
- Logging: `logger.debug` at `:98` spreads `detail`, which contains only `source`, `reason`, `cause` and `httpStatus`. No token, email, CSRF value or refresh token reaches a log.
- The `(target as { ownerRef?: QuotaOwnerRef })` cast at `:187` is pre-existing; `target` already has `ownerRef`, so the cast can be dropped.
- File size: `antigravity-plan-usage.reader.ts` is 529 lines and the OAuth reader is 284. Both are under the 700-line limit.

## Lost test coverage
Tests of the removed print probe are acceptable losses (a): HEAD reader spec `:83-97`, `:106-270`, `:581-end`, and the HEAD CLI adapter spec `:127-503` and the `antigravityCliCandidates` test (`:504`).

Behaviour that STILL EXISTS but lost coverage (b):

| # | HEAD spec lines | Production code it covered |
|---|---|---|
| 1 | reader spec `:294-313` HTTPS then HTTP order, mapping, email not exposed | `antigravity-plan-usage.reader.ts:168-226`, `:327-346` (`candidates`) |
| 2 | reader spec `:314-334` extension port fallback when no listener | `:338-344` |
| 3 | reader spec `:335-376` padded POSIX pids, ambiguous servers, no ports | `:286-325` (`parseServers`), `:263` (`servers.length !== 1`), `:383-388` |
| 4 | reader spec `:377-412` model name cap, reset parsing, logger privacy | `:389-418` (`toWindow`) |
| 5 | reader spec `:413-445` real loopback request: headers and body | `:455-482` (`defaultRequest`) |
| 6 | reader spec `:446-455` removes caller abort listener | `:158`, `:242` (local); the new spec only checks timer count, not listeners |
| 7 | reader spec `:456-506` quoted arguments, abort discovery, closed port | `:347-362`, `:370-375`, `:483-528` |
| 8 | reader spec `:530-544` clears stale observation when server disappears | `:164-166` (and the missing clear in defect 2) |
| 9 | reader spec `:545-558` omits model with no remaining fraction, unavailable if none | `:197-226` |
| 10 | reader spec `:559-569` transport constants exact | `antigravity-ls.provisional` constants used at `:455-481` |
| 11 | reader spec `:570-580` settles once on a request error | `:483-528` (`readJsonResponse`) |
| 12 | OAuth spec `:77-93` returns before reading an already aborted request | `antigravity-oauth-plan-usage.reader.ts:120-124` |
| 13 | OAuth spec `:94-124` caps JSON bodies (oversized token and quota responses) | `:100-105` (`boundedJson`, `MAX_BODY_BYTES`) |
| 14 | OAuth spec `:125-159` (the `fetchAvailableModels` path and `groups` summary form) | `:167-189`, `:228-284` (`summaryWindows`, `modelWindows`) |
| 15 | OAuth spec `:176-206` second endpoint after a quota 403 without refreshing the token | `:167-180` |

Partly retained:
- HEAD reader spec `:271-293` (local probe when OAuth is unavailable) is now covered by 'accepts verified local windows' (`antigravity-plan-usage.reader.spec.ts:82-86`).
- HEAD `:507-522` (one deadline for unsettled discovery) is covered by the new spec at `:93-110`.
- HEAD `:523-529` (parsed account belongs to another owner) is covered by `:49-59` (`account-mismatch`).
- OAuth: token reuse, 401 refresh, invalid grant, 403, malformed token and hang are covered by the new OAuth spec.

Retained tests of dead code: `antigravity-cli-usage.adapter.spec.ts:17-120` tests `parseAntigravityCliUsage`, which is unused. Delete with the adapter (defect 3).

Related spec gaps in the new code:
- No test that an `invalid_grant` followed by a working local server still reads (defect 1).
- No test covers the sequential budget `min(3 s, time left)` when OAuth consumes its full 3 s.

## Checked and clean
- No process is started for the CLI stage.
- The failure cache is not touched, because the CLI stage only returns a `source-unavailable` failure.
- Abort listener removal, `clearTimeout` and `controller.abort()` in `finally` on every exit for the OAuth, local-rpc and chain code.
- `statusReason` precedence at `:139-141` (`account-unverified` first, then a non-CLI cause that is not `missing-token-file` or `missing-local-server`) is sound.
- `usage-source-chain.ts` and `plan-usage-reader.types.ts` are unchanged.
- `plan-usage.service.ts:238` passes only `(logger, now)`, so the factory's parameter changes break no production caller.
