# Code Logic Review (re-review of fixes) — TASK_2026_901

## Verdict

APPROVED (final, after Round 3; earlier rounds were CHANGES_REQUIRED)

Review family: claude (in-process subagent); implementer family: codex
Subagent reason: antigravity quota exhausted (429), Glm/grok/kimi at limit, codex is the implementer family

All five original findings are fixed. One new Major defect (stale record replay in the retry path) was introduced or left exposed by the new serialization design.

## Fix verification

1. Progress keeps walkthrough body — CORRECT. `github-review-publication.adapter.ts:176-189`: prefix `<!-- ptah-review:progress -->…\n\n` is stripped by regex and re-prepended; length guard `prior.length + progress.length + 2 <= MAX_BODY_CHARS` keeps the 65,536 limit; progress-only body is `progress\n\nmarker` (`github-body-budget.ts:24`), so the strip regex also matches it and progress lines do not accumulate. When the budget is full, progress is silently dropped (documented decision, acceptable).
2. Nested thread comment pagination — CORRECT. `github-review.adapter.ts:220-246`: per-thread comment cursor loop, repeated-cursor and page-limit checks throw `malformed-response`, GraphQL `errors`/null node throw. Traversal failure is not swallowed.
3. Cron handler returns promptly — CORRECT. `review-sync-schedule.service.ts:104-125`: work is detached with `.catch` (fixed message) and `.finally` clearing `tickActive`/`tickController`; synchronous throw path resets `tickActive`; `dispose` aborts the owned controller. The controller is independent of the cron signal, which is correct for work outliving the handler.
4. Older retry must not overwrite newer — INCOMPLETE. Serialization by repo+SHA (`review-status-coordinator.service.ts:81-88`) and the latest-attempt check (`:91`, `sqlite-review.repository.ts:45-53`) fix the cross-attempt case, and the regression spec (`review-status-coordinator.service.spec.ts:30`) fails without the fix. The same-attempt case is not covered; see New defect 1.
5. Cleanup after retry-state save failure — CORRECT. `review-status-coordinator.service.ts:118-120` catches the nested save failure and logs a fixed message; `review-orchestrator.service.ts:284-289` runs `releaseAttemptSource` in `finally` after `finished`, so a throw from `finished` (for example from `getStatusSync`/`saveStatusSync` in `update`, which are uncaught) still cleans up. Both specs would fail without the fix.

## New defects

1. Major — `libs/backend/review-core/src/lib/status/review-status-coordinator.service.ts:44-53` (with `:90-111`): `retryDue` snapshots `record` rows from `getPendingStatusSync`, then loops sequentially with `await getAttempt` and a network write per row. `writeOrdered` publishes the captured `record` without re-reading the row. If the same attempt gets a newer status in the meantime (for example `finished` saves and publishes `success` while an earlier `pending` retry row is queued), the stale `pending` is published after `success` (the attempt id still equals the current attempt, so the supersession check passes) and then overwrites the DB row with `syncPending=false`. The PR commit status can be stuck on `pending` while storage says it is synced; the progress comment can also regress. Suggested fix: at the start of `writeOrdered`, re-read `getStatusSync(target.attemptId)`; if the stored row differs from `record` in state or description, or is no longer `syncPending`, drop the stale write and use or skip to the newer row.
2. Moderate — `review-status-coordinator.service.ts:76-78` with `:110-111`: `update` persists the new record outside the per-key queue, while an in-flight older write later saves its own older `record` over it (`syncPending:false`, older state). Until the newer write completes, the DB row is stale; a crash in that window loses the newer pending sync (restart recovery only turns pending rows into `error`). Suggested fix: do the `saveStatusSync` inside the serialized section, or make the post-write save conditional on the stored row still matching `record`.

## Round 2

Verdict: CHANGES_REQUIRED

Defects 1 and 2: design CLOSED. `update` (`review-status-coordinator.service.ts:77-88`) now reads, saves and publishes inside one `serialize` section, and `retryDue` (`:54-59`) re-reads the row and drops it when it is not `syncPending`. There is no nested `serialize` (update and retryDue call `publish`, which does not serialize), so no deadlock. A rejection in `work` still propagates to callers, and the `prior.catch` keeps the chain alive. Callers in `review-queue.service.ts` and `review-orchestrator.service.ts` see the same promise contract.

New defect:

1. Critical — `libs/backend/review-core/src/lib/status/review-status-coordinator.service.ts:106`: the progress regex lost its backslashes: it reads `/^Reviewing… (d+)/(d+) lenses$/`. The unescaped `/` ends the literal early, so this is a syntax error (and, if it parsed, it would match a literal `d`). The file cannot compile, and even with only the slash escaped, `(d+)` would not match digits, so progress would always report 0/0. Fix: `/^Reviewing… (\d+)\/(\d+) lenses$/`. Check that the spec exercises a progress description with non-zero counts (the `lensCompleted` arguments are no longer passed, so this regex is now the only source of the counts).

## Round 3

Verdict: APPROVED

Line 106 of `review-status-coordinator.service.ts` now reads `/^Reviewing… (\d+)\/(\d+) lenses$/`, which matches the description built at `:30` and `:35` (`Reviewing… ${completed}/${total} lenses`). The spec (`review-status-coordinator.service.spec.ts:73-81`) calls `lensCompleted(attempt, 2, 3)` and asserts `progress: { completedLenses: 2, totalLenses: 3 }`, so a regression to 0/0 would fail. Defect 3 (regex) is closed. No remaining defects. I ran no tests; the coordinator owns verification.
