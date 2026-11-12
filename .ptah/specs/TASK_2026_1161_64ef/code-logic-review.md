# Code Logic Review — `TASK_2026_1161_64ef`

Scope: whole of `libs/backend/review-core/src/lib/status/review-status-coordinator.service.ts` (+ spec),
`libs/backend/review-github/src/lib/github-review-status.adapter.ts`, `github-review.error.ts`, the
repository queries in `sqlite-review.repository.ts:56-70`, and the callers of `retryDue` /
`recoverOwnPending` (`review-sync-schedule.service.ts:131-155`, `phase-2-libraries.ts:545-549`,
`review-orchestrator.service.ts:127-132`). Verification (lint/typecheck/257 tests) was not rerun.

## Summary

| Metric              | Value          |
| ------------------- | -------------- |
| Overall score       | 7/10           |
| Assessment          | APPROVED       |
| Blocking issues     | 0              |
| Serious issues      | 0              |
| Moderate issues     | 6              |
| Failure modes found | 6              |

Score reasoning: the core behaviour (block per repo, no request while blocked, row kept pending with
`retryAt` = block end, success clears, other failures keep 60 s) is implemented correctly and the error
shape assumption holds. It is above 5-6 because I found no data loss, stranded row or runaway loop. It is
below 8-9 because one test is vacuous, the protection has holes for non-listed persistent errors, and an
operator fix is not noticed for up to 30 min.

## Five logic questions

### 1. How does this fail silently?

- While blocked, `publish()` returns without any log line (`service.ts:127-134`). Between probes (30 min) the
  operator sees nothing in the log, and the only trace is `errorSummary` on the row. The first log is
  emitted once per 10 min per repo+message but a probe only happens every 30 min, so the effective rate is
  one line per 30 min per repo. That is the intended outcome; the 403 text now names the permission
  (`github-review-status.adapter.ts:55-56`), so the single line is actionable.
- If `GitHubReviewError.code` or `.retryAt` is ever renamed, `describeFailure` (`service.ts:21-26`) silently
  returns `code: null` and the old 60 s storm returns with no compile error (review-core cannot import the
  type). The adapter spec does assert `code` for 403 (`github-review-status.adapter.spec.ts:59`) but nothing
  ties the two libs together. See M5.

### 2. What user action produces unexpected behaviour?

- Operator grants the permission or pastes a token while the repository is blocked: nothing is retried until
  the block ends (up to 30 min) or the app restarts. `blocked` has no invalidation hook. See M1.
- Restarting the app while the permission is still missing costs one request per repository (the first row
  of `recoverOwnPending` probes, then re-blocks). That is acceptable: `recoverOwnPending` runs at startup
  and every tick (`review-sync-schedule.service.ts:144`) but only rows with `state='pending'` for ended
  attempts (`sqlite-review.repository.ts:73-74`), and it converts them to `error`, so it does not re-select them.

### 3. What input data produces a wrong answer?

- Rate-limit with `retryAt` in the past or absent: `Math.max(now+60s, failure.retryAt ?? now+60s)` then
  `Math.min(now+1h, ...)` (`service.ts:158-160`). Correct for both ends; a non-`Date` `retryAt` degrades to 60 s.
- `Number(response.headers.get('x-ratelimit-reset'))` for a missing header is `0` and is rejected by `> 0`
  (adapter `:48-51`), falling back to 60 s. OK.
- A 404 (fine-grained token without access to the repository returns 404 on private repos) or 422 is
  `GitHubReviewError('http')` (adapter `:57`), which is not in `BLOCKING_CODES`. See M2.

### 4. What happens when a dependency fails?

- GitHub refuses: handled (blocked). Network down / timeout / 5xx: 60 s retry per row, request storm
  unchanged, log now throttled to one per 10 min per repo+message.
- Persistence of the deferral fails (`saveStatusSync` throws in the blocked branch, `service.ts:130-132`):
  logged, the row keeps its old `retryAt` (null or past), so it is due again next tick, and the block still
  prevents the request. Acceptable.
- `getCurrentAttemptId` throwing (`service.ts:120`) propagates out of `publish` and aborts the whole
  `retryDue` loop. Pre-existing, but with the block it now runs before the cheap check on every deferred row.

### 5. What is missing that the requirements never mentioned?

- No eviction for `lastLogged` and expired `blocked` entries (M4).
- No manual or token-change way to clear a block (M1).
- Progress-comment update is coupled to a successful status write (`service.ts:148-151`), so a repository
  with a permanent status 403 never gets progress comments through this path. Pre-existing; the fix keeps it.

## Failure modes

### Fix not noticed for up to 30 min (M1)
- Trigger: operator adds "Commit statuses: Read and write", or stores a token after `missing-token`.
- Symptom: new rows and final results stay `pending` until `block.until`; no probe, no log.
- Evidence: `service.ts:13,126-134,157-162`; only `blocked.delete` is at `:145` after a success, which cannot
  happen while requests are suppressed.
- Current handling: documented in context.md ("after the block ends or after an app restart").
- Recommendation: for `missing-token`/`authentication` use a short block (for example 5 min), or let a
  token-change event call a `clearBlocks()` method on the coordinator.

### Persistent non-listed errors still storm (M2)
- Trigger: 404 for a repository the token cannot see, 422 for a head SHA that no longer exists, repeated 5xx.
- Symptom: one request per pending row per 60 s again; only the log is throttled.
- Evidence: `service.ts:156` default `RETRY_MS`; adapter `:57`.
- Recommendation: either add 404/422 as a distinct code with the 30 min block, or apply exponential backoff
  keyed by row failure count.

### Log throttle is untested (M3)
- Trigger: any regression that drops the `lastLogged` check.
- Evidence: spec test "logs the same refusal once per quiet window" (spec ~`:111-120`). After the first
  failure the block makes `lensCompleted` and `finished` skip the request, so only one failure ever happens and
  `toHaveBeenCalledTimes(1)` passes with the throttle code removed. The throttle matters only for rate-limit
  windows (60 s to 1 h, shorter than 10 min) and concurrent heads, neither of which is tested.
- Recommendation: test with `rate-limit` (60 s block), advance fake time 61 s, fail again, expect one log;
  advance 10 min, expect a second.

### Unbounded `lastLogged` and `blocked` maps (M4)
- Evidence: `service.ts:33-34,161,168`. Keys are `owner/name|summary`; `summary` is the sanitized error
  message, which for non-`GitHubReviewError` errors (for example Zod messages) can vary per call. Entries are
  never pruned; `blocked` entries survive expiry. Growth is slow, and the service is a singleton for the app lifetime.
- Recommendation: prune `lastLogged` entries older than `LOG_QUIET_MS` when inserting, and delete an expired
  block at `service.ts:127`.

### Duck-typed error contract has no cross-lib guard (M5)
- Evidence: `service.ts:21-26` against `github-review.error.ts:5-14`; port is the adapter directly
  (`phase-2-libraries.ts:476`, `registration.ts:11`) and the adapter rethrows `GitHubReviewError` unwrapped
  (adapter `:60-65`), so the current shape is correct (checked). The coordinator spec fabricates errors with
  `Object.assign(new Error, {code, retryAt})` (spec `:88-89`), so it cannot detect drift.
- Recommendation: make `code` and `retryAt` part of `IReviewStatusPort` docs/contract in
  `review-contracts` (a shared `ReviewStatusPortError` shape or helper), or add a contract test in
  `review-github` asserting `permission`/`rate-limit` errors expose them.

### Block map overwritten by concurrent heads (M6)
- Trigger: the block is per repository, but writes serialize per repo+headSha (`service.ts:108-116`). Two heads
  can both pass the check at `:127` before either fails.
- Symptom: two requests instead of one on first failure; `blocked.set` at `:161` unconditionally overwrites,
  so a later 60 s rate-limit block can shorten an existing 30 min permission block (or the reverse), and a
  late success from an in-flight request clears the block (truthful, harmless).
- Recommendation: keep the later `until`, or `Math.max` with the existing unexpired block.

## Blocking issues

None.

## Serious issues

None found. Items I checked and rejected as defects:

- Superseded-attempt ordering: the supersession check (`service.ts:120-124`) runs before the block check, so
  superseded rows are closed out (`syncPending=false`) even while blocked and cost no request. Correct.
- Stranded rows after restart: the block is in memory, but the deferral is persisted as `retry_at`
  (`:130-131`, `sqlite-review.repository.ts:56-70`), so future-dated rows stay quiet after restart instead of
  storming, and become due at the stored time. A restart-time `recoverOwnPending` probe re-creates the block
  with one request per repository.
- Block that never clears: the block check is time based (`block.until > Date.now()`), so it always expires.
  A row due at `retry_at = block.until` passes the check (`>` is false at equality). If the probe row fails
  again, the remaining due rows are re-deferred with no request.
- `retryDue` `LIMIT 100 ORDER BY updated_at` (`sqlite-review.repository.ts:67-68`): deferral writes bump
  `updated_at`, so blocked rows rotate rather than starve other rows, and they are excluded by `retry_at`
  until due.
- Rate-limit is token-wide but the block is per repository: costs one probe per repository, not a storm.

## Moderate and minor issues

- M1 to M6 above.
- Minor: the new 403 message states the permission cause as fact, but the same branch also serves a GET on
  `/statuses/{sha}` that can 403 for repo-access reasons (`adapter :55-56`). The text is still the right
  first thing to check.
- Minor: `service.ts:157` could use `failure.code` narrowing instead of `BLOCKING_CODES` as `Set<string>`; style only.
- Minor: missing tests for `authentication` and `missing-token` codes, for blocked rows that are superseded,
  and for a block keyed case-insensitively (`Acme/Repo` vs `acme/repo`, implemented at `:125`).

## Data flow

1. `enqueued/claimed/lensCompleted/finished` or `retryDue`/`recoverOwnPending` -> `update`/`serialize`: OK.
2. `update` saves the row `syncPending=true, retryAt=null` (`:102`): OK; a crash here leaves a due row.
3. `publish`: supersession check: OK.
4. Block check, defers with `retryAt=block.until`: OK (M6 for races).
5. `port.upsertStatus` (GET + POST): OK; errors typed `GitHubReviewError`.
6. Success: clears block, saves synced row, posts progress comment: OK.
7. Failure: computes `retryAt`, sets block for listed codes, saves, logs throttled: OK (M2, M4).

## Requirements fulfilment

| Requirement | Status | Gap |
| --- | --- | --- |
| Block on permission/auth/missing-token 30 min | COMPLETE | M1 (no early clear) |
| Rate-limit until reset, min 60 s, max 1 h | COMPLETE | none |
| Blocked publish keeps row pending, retryAt = end, no request | COMPLETE | none |
| Same failure logged once per repo+message per 10 min | COMPLETE | untested (M3), map unbounded (M4) |
| Success clears block | COMPLETE | none |
| Other failures keep 60 s | COMPLETE | storm persists for 404/422 (M2) |
| 403 message names the permission | COMPLETE | none |

Implicit requirements not addressed: operator-driven early re-probe; pruning of in-memory maps.

## Edge cases

| Case | Handled | How | Concern |
| --- | --- | --- | --- |
| App restart during block | YES | persisted `retry_at`, one probe per repo | none |
| Superseded row while blocked | YES | check runs first | none |
| Two heads same repo | PARTIAL | shared block | M6 |
| Repo name case differences | YES | lowercased key | untested |
| Rate-limit reset in the past | YES | max with 60 s | none |
| Clock moves backwards | PARTIAL | block lasts longer | negligible |
| 404/422 persistent | NO | 60 s retry | M2 |

## Verdict

- Recommendation: APPROVE
- Confidence: HIGH (error shape traced end to end; repository query and callers read)
- Top risk: the log-throttle test passes without the throttle, and persistent 404/422 errors still retry every 60 s.
- What a robust implementation would add: a rate-limit throttle test (M3), pruning of both maps (M4),
  `Math.max` when overwriting a block (M6), a shorter block or a clear hook for `missing-token`/`authentication`
  (M1), and a decision on 404/422 (M2).
