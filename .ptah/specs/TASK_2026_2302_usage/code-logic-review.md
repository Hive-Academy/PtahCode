# Code Logic Review — `TASK_2026_2302_usage`

Scope: uncommitted worktree changes (ledger workspace key + migration S0009, agy `/usage` CLI source, Codex owner-key unification). Read-only review; no tests run.

## Summary

| Metric              | Value          |
| ------------------- | -------------- |
| Overall score       | 6/10           |
| Assessment          | NEEDS_REVISION |
| Blocking issues     | 0              |
| Serious issues      | 4              |
| Moderate issues     | 8              |
| Failure modes found | 12             |

## Five logic questions

### 1. How does this fail silently?

- agy exits non-zero after a model turn: the runner rejects with only `stderr` and discards stdout (`fallback-usage.runner.ts` `createNodeFallbackExecutor` close handler), so `num_turns > 0` is never inspected, no breaker trips, and the 5-minute short backoff just re-arms the same call (`antigravity-cli-usage.source.ts:241-257`).
- A `signed-out` keyring answer short-circuits before any spawn (`antigravity-cli-usage.source.ts:218`), with no backoff and no second opinion from agy. A mis-parsed cmdkey output therefore hides a working agy permanently.
- Codex `account/read` failure is swallowed (`codex-account-usage-client.ts` `accountEmail`) and leaves the owner unresolved while the quota result is still cached.

### 2. What user action produces unexpected behaviour?

- Linux user with `/home/u/Proj` and `/home/u/proj` (distinct folders): S0009 and `ledgerWorkspaceKey` merge their sessions, usage, stats and coverage; the session list for one folder now returns the other's sessions.
- Windows user in a non-English locale who is signed in to agy: tile says "Sign in to the Antigravity CLI" (see S3).
- User switches ChatGPT personal -> team account under the same email: see Codex finding.

### 3. What input data produces a wrong answer?

- Same-email, different `accountId` Codex accounts (see Codex-2).
- Paths with `..`, `.` or a relative form: the session list used to `path.resolve` (platform-core `normalizeWorkspaceRoot`) before matching; `ledgerWorkspaceKey` does not (`sqlite-session-record-repository.ts:105-110`).
- agy stdout with a banner line (update notice, warning) before the JSON: `JSON.parse` fails, `not-json`, breaker trips for the whole process.

### 4. What happens when a dependency fails?

- agy slow (> about 7 s: AV scan, cold start): killed, and when the stage had the full window the breaker trips `killed` for the process lifetime although nothing proves a model turn ran (`antigravity-cli-usage.source.ts:222-226`).
- keyring query throws or times out: treated as `unknown`, agy runs. Reasonable.
- Codex `account/read` hangs: delays publishing an already-fetched quota until the process request timeout; the child is closed only after it (`codex-account-usage-client.ts` performRead).

### 5. What is missing that the requirements never mentioned?

- No cross-OS fixture for S0009 with a pre-existing collision of two real workspaces; no record of the original (unfolded) key.
- No cache/backoff for `cli-not-found` (spawn of `agy` on every chain read, `fallback-usage.runner.ts` until=0 path).
- No account verification for `cli-store`/`unknown` owners: agy answers for its keyring account, the cache is keyed by the owner key with fingerprint `'active'`.

## Failure modes

### FM1 Billing breaker does not cover non-zero exit or reduced-budget kills

- Trigger: a future agy routes `/usage` to a model and (a) exits non-zero, or (b) is killed while `budgetMs < 8000`.
- Symptom: a billed turn every 5 minutes (`FALLBACK_SHORT_BACKOFF_MS`), never "at most one per run".
- Evidence: `antigravity-cli-usage.source.ts:222-226` (`fullWindow` gate), `:241-257`; runner close handler rejects with stderr only. On Windows the stage typically gets under 8 s because `powershell.exe` discovery in the local stage can take up to 3 s (`antigravity-plan-usage.reader.ts` ANTIGRAVITY_USAGE_TIMEOUT_MS), so `fullWindow` is often false.
- Current handling: trips only on parsed `num_turns>0`, non-zero counters, non-JSON, or kill inside a full window.
- Recommendation: trip on any non-zero exit, any kill (regardless of window), and any spawn that produced stdout we could not prove; or keep the 5 min backoff but also count total model-capable attempts per process (max 1 unproven attempt).

### FM2 Breaker is too sensitive in the other direction

- Trigger: banner text on stdout, or a kill of a slow but legitimate run inside the full window (the effective timeout is `deadline - now()` after up to 1 s of sign-in wait, about 7 s, not 8 s).
- Symptom: Antigravity plan usage permanently "unavailable" until app restart, with only a warn log; the UI shows `cli-unavailable` (cause `cli-guard-rejected`).
- Evidence: `antigravity-usage.parser`/`parseAgyUsageOutput` `not-json` branch; `trip('killed')`.
- Recommendation: extract the JSON object from stdout (first `{` .. last `}`), and make `not-json` with exit 0 a plain parse failure (backoff), not a breaker trip, unless stdout is non-empty and mentions a turn.

### FM3 False "not signed in" on localized Windows

- Trigger: `cmdkey /list:gemini:antigravity` output whose credential line does not match the ASCII-colon regex (full-width colon, localized label with colon variants, extra tokens after target).
- Symptom: `parseCmdkeyList` returns `signed-out` because the heading contains the target; the source returns `cli-not-signed-in` without running agy (`antigravity-sign-in.ts` parseCmdkeyList; `antigravity-cli-usage.source.ts:218`). Violates "a signed-in user is never told not signed in".
- Recommendation: report `signed-out` only on a positive "no credentials" signal (exit code 1 / known `NONE`), otherwise `unknown`; and treat `signed-out` as advisory (still allow one guarded run) or at least do not hard-stop.

### FM4 Runner regex mislabels exit errors as not-signed-in

- Trigger: agy exits non-zero with stderr mentioning "login", "sign in", "not authenticated" for any reason (network, token refresh).
- Symptom: `cli-not-signed-in` for a signed-in user. Evidence: `fallback-usage.runner.ts` catch block regex.
- Recommendation: for Antigravity, map non-zero exit to `cli-exit-error` and let only the keyring check say "not signed in".

### FM5 Linux case-fold merge of distinct workspaces (irreversible)

- Trigger: case-sensitive FS with two folders differing only by case; any workspace where fold loses information.
- Symptom: usage, session list and coverage of two workspaces collapse; S0009 rewrites originals so it cannot be undone.
- Evidence: `ledger-workspace-key.ts:19-22`, `session-store-migrations.ts` `canonicalizeLedgerWorkspaceKeys` UPDATEs; `sqlite-session-record-repository.ts:105-110` list now matches by fold.
- Current handling: none; this matches the shared Analytics fold, so Analytics already treats them as one.
- Recommendation: accept and document, or preserve `workspace_path` filter in `listForWorkspace` (add `AND workspace_path = ?` is not enough on Windows; compare folded path of `workspace_path`) so the session list stays exact while ledger aggregates use the fold.

### FM6 Session list no longer resolves the path

- Trigger: caller passes a relative or dotted path, `~`-expanded or short-name form.
- Symptom: empty list where `path.resolve` previously matched. Evidence: `sqlite-session-record-repository.ts:105-110`, `ledger-workspace-key.ts` doc ("does not resolve"). Low likelihood (callers pass absolute roots), flagged because behaviour changed silently.

### FM7 Codex owner key flips between accountId and email material

- Trigger: server reports `accountId` on one read and `null` on another (the protocol makes it optional), or legacy vs core path see different data.
- Symptom: digest material `account-id\0..` vs `email\0..` yields two owner keys for one account; windows/ledger history split. All persisted owner keys derived by the old code (`home\0email` legacy, `#account:<sha(home\0accountId)>` core) are orphaned once.
- Evidence: `codex-account-identity.ts:25-36`, `codex-account-usage.service.ts:555-575`, `codex-account-usage-client.ts` performRead.
- Recommendation: prefer one material consistently (email when known, accountId only as extra), or persist the first-seen choice per home; note the one-time key migration in the task.

### FM8 Same-email account switch is not detected before the quota read

- Trigger: legacy path; personal -> team account with one email (different `accountId`), quota read then fails.
- Symptom: `signedInKey` (email only) is unchanged, so A's cache and `ownerKey` stay; the failed read serves A's data stale as B. Evidence: `codex-account-usage.service.ts:555-563` vs `:570-575` (the accountId check only runs after a successful quota read). The auth-file watcher mitigates the common case (`clearCache` nulls both).
- Recommendation: acceptable if the auth file always changes on switch; otherwise compare `account/read` `planType`/`type` too.

### FM9 account/read can delay the quota publish

- Trigger: `accountId` null and `account/read` slow/hung. Quota is already fetched but `child.close()` and the cache write wait for the request timeout. Evidence: `codex-account-usage-client.ts` performRead (`accountEmail` before `child.close()`). Also the result schema requires `requiresOpenaiAuth: boolean` (`codex-protocol-methods.ts` account/read); an older server omitting it fails validation and silently yields no owner.

### FM10 Agy env allowlist passes the host's API keys

- `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_CLOUD_PROJECT` are forwarded (`antigravity-cli-usage.source.ts` AGY_ENV_ALLOW). If Ptah or the user's shell exports these for another purpose, agy authenticates as that key (different quota than the subscription shown) and the sign-in check reports `signed-in` from them. Not a Ptah-secret leak per se, but the shown plan windows may belong to a different credential. Recommendation: document, or only forward when the sign-in check found no keyring entry.

### FM11 Owner-kind gaps for the CLI stage

- `account` owner whose key differs from `currentAntigravityStoreOwner()` returns `account-mismatch` and never runs the CLI (`antigravity-plan-usage.reader.ts` cli stage); `cli-store`/`unknown` owners run with no account verification, and the 2-minute runner cache (`ANTIGRAVITY_CLI_CACHE_MS`, key fingerprint `'active'`) can show account A's windows for up to 2 minutes after switching agy accounts.

### FM12 Empty available Codex read reported as `cli-parse-failed`

- `codex-plan-usage.reader.ts` `emptyReading`: a free/new account with legitimately no windows reads as "Provider usage output not recognized". Label is honest enough but names a parse failure for a valid answer. Also runs `emptyReading` after the rollout source fails, preserving account/activity; behaviour verified by reading, not tests.

## Blocking issues

None.

## Serious issues

### S1 Billing breaker holes (FM1)

- File: `libs/backend/auth-providers/src/lib/quota/readers/antigravity-cli-usage.source.ts:222-257`, `fallback-usage.runner.ts` executor close handler.
- Scenario: agy build that sends `/usage` to the model exits non-zero or is killed under a reduced budget.
- Impact: violates the hard requirement (at most one billed turn per app run); repeats every 5 minutes (and the stage runs on every chain read, not only `allowCliFallback`).
- Fix: trip on every kill and every non-zero exit; keep stdout on rejection and inspect it; cap unproven attempts per process at 1.

### S2 Irreversible fold + session list cross-contamination on Linux (FM5)

- File: `session-store-migrations.ts` S0009, `sqlite-session-record-repository.ts:105-110`.
- Scenario/Impact/Fix: see FM5. The session list is a user-visible behaviour change for a use case that did not need folding.

### S3 False "not signed in" (FM3, FM4)

- File: `antigravity-sign-in.ts` `parseCmdkeyList`, `fallback-usage.runner.ts` catch regex, `antigravity-cli-usage.source.ts:218`.
- Impact: violates the explicit requirement; hard-stops the only source for plain `agy acp` users.
- Fix: as FM3/FM4.

### S4 Codex owner key instability (FM7, FM8)

- File: `codex-account-identity.ts:25-36`, `codex-account-usage.service.ts:555-575`.
- Impact: split history, orphaned persisted owners, and a same-email switch window.
- Fix: as FM7/FM8.

## Moderate and minor issues

- `antigravity-cli-usage.source.ts:222-226`/FM2: breaker trips on a slow, legitimate run; `not-json` trips on a banner.
- FM9 account/read delay and strict `requiresOpenaiAuth` requirement (`codex-protocol-methods.ts` account/read).
- FM10 env allowlist forwards API-key variables.
- FM11 account/cli-store owner handling and 2 min cross-account cache.
- `fallback-usage.runner.ts`: `cli-not-found` gets no backoff (spawns `agy` on each 30 s chain read); `agy.cmd` shims on Windows would fail with `EINVAL` under `shell:false` and be reported as an exit error.
- `antigravity-cli-usage.source.ts:231`: production code branches on `JEST_WORKER_ID`; a test-only guard in the shipped path (acceptable, but an injected-seam default would be cleaner).
- Migration cost (`canonicalizeLedgerWorkspaceKeys`): one UPDATE per distinct key through `idx_session_usage_workspace_time`/`idx_sessions_workspace_key`/`idx_session_stats_workspace_time` (fine), but all in one `BEGIN IMMEDIATE` transaction run synchronously on the opening connection; a multi-million-row ledger blocks startup and grows the WAL. Idempotent and crash-safe (the runner records the version after `run`; a re-run is a no-op). No finding on correctness.
- Parser (`antigravity-usage.parser.ts`): `remaining_fraction` 0 -> 100 %, otherwise capped at 99.9 %, 1970 reset dropped; a stale reset older than 24 h is dropped but its percent is still shown (`knownReset`). OK; the TSV fallback fails closed.
- Minor: keyed duplicate buckets are silently skipped (`keys.has`).

## Data flow

1. Producer (`recordUsage`, replay cursor) -> `SessionStatsRepository.writeEventInTransaction` folds `workspaceKey` (`session-stats-repository.ts:391`): OK. Replay rows reach it through `usage-cursor-repository.ts:144`: OK.
2. Session record upsert folds `workspace_key` (`sqlite-session-record-repository.ts:74-77`): OK.
3. `session_stats` and coverage take the key from `sessions`/turn rows (`session-stats-repository.ts:502,548-557`): OK, already folded.
4. Readers (workspace usage, top sessions, counts, coverage, codex run lookup, session stats/model/event count): all wrapped by `workspaceKeyInput`: OK. No other raw `FROM sessions`/`session_usage_*` SQL outside the store (grep).
5. Migration rewrites sessions/turns/stats keys and merges coverage: OK (see cost note).
6. agy chain: OAuth -> local LS -> CLI stage -> `readUsageSourceChain` -> `primaryFailure` for reason: OK except S1-S3.
7. Codex: client digest and service owner key both `accountOwnerKey('openai-codex', digest)` over normalized home: consistent; see S4.

## Requirements fulfilment

| Requirement                                      | Status   | Gap                                                      |
| ------------------------------------------------ | -------- | -------------------------------------------------------- |
| One canonical ledger key on all reads/writes     | COMPLETE | none found                                               |
| Migration merges coverage, idempotent, in a tx   | COMPLETE | no collision-of-real-workspaces handling (FM5)           |
| agy: never more than one billed turn per run     | PARTIAL  | S1                                                       |
| agy: never per chat turn / no shell / env scrub  | PARTIAL  | per 30 s chain read with 2 min cache; env passes API keys |
| agy: reject num_turns>0 / non-zero counters      | COMPLETE | parse side verified; exit/kill paths not covered (S1)    |
| Signed-in user never told "not signed in"        | PARTIAL  | S3                                                       |
| Reason labels in shared, tiles show reason       | COMPLETE | none found                                               |
| Codex stable shared owner key                    | PARTIAL  | S4                                                       |
| Codex account/read fallback, typed empty reason  | PARTIAL  | FM9, FM12                                                |

Implicit requirements not addressed: record of pre-fold keys; backoff for missing binary; Windows `.cmd` shim.

## Edge cases

| Case                                   | Handled | How                              | Concern                         |
| -------------------------------------- | ------- | -------------------------------- | ------------------------------- |
| POSIX root `/`, drive root, UNC        | YES     | fold + `'/'` fallback            | `\\` alone maps to `/`          |
| Re-running S0009                       | YES     | fold idempotent                  | none                            |
| Crash between run() and bookkeeping    | YES     | re-run is a no-op                | none                            |
| Two coverage rows collapse             | YES     | MIN/MAX upsert                   | none                            |
| Two real folders differing by case     | NO      | merged                           | FM5                             |
| agy 1970 reset, fraction 0 / 1         | YES     | no reset / 100 % / 0 %           | none                            |
| agy output with banner                 | NO      | trips breaker                    | FM2                             |
| agy non-zero exit with a model turn    | NO      | exit error only                  | FM1                             |
| Concurrent chain reads                 | YES     | shared flight, `cli-busy` otherwise | different owner keys get `cli-busy` |
| Temp dir cleanup                       | YES     | removed after close, late create handled | none                    |
| Codex accountId null                   | PARTIAL | account/read email               | FM7, FM9                        |
| Codex account switch                   | PARTIAL | watcher + signedInKey            | FM8                             |

## Verdict

- Recommendation: REVISE
- Confidence: MEDIUM (static review; no runtime or test execution)
- Top risk: the agy billing breaker only covers a parsed, exit-0, full-window run, so a model-routing agy that exits non-zero or is killed under a reduced budget can bill every 5 minutes.
- What a robust implementation would add: trip on kill and non-zero exit and inspect stdout on failure; JSON extraction tolerant of banners; sign-out only on a positive signal; a single consistent Codex identity material with a documented one-time owner-key change; exact-path session listing; a backoff for a missing `agy`; and specs for exit-nonzero, banner and localized cmdkey outputs.
