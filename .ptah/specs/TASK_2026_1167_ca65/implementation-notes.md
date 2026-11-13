# Watchdog fix: background SDK task (scope 3) — implementation notes

## Files changed
- `libs/backend/agent-sdk/src/lib/helpers/no-activity-watchdog.ts`
- `libs/backend/agent-sdk/src/lib/helpers/no-activity-watchdog.spec.ts`

No other source files. Not committed, not pushed.

## Design summary
- `tasks` is now `Map<task_id, TaskRecord>` (query-local). A record holds `toolUseId`,
  optional `runId`, `keepsAlive`, `background`, `lastActivityMs`.
- A record is created only on `task_started` whose `tool_use_id` is an open root tool.
  `keepsAlive` is false for tasks with `parent_task_id`, `ambient` or `skip_transcript`:
  those still release their root tool, but never extend the deadline.
- `task_updated.patch.is_backgrounded` releases the root tool but keeps the record
  (`background = true`). Terminal update status (`completed|failed|killed`) or a
  `task_notification` removes the record and kicks (full normal 180 s window).
- Qualifying activity for a live background record (`touch`): `task_progress`,
  nonterminal `task_updated`, and child messages whose `parent_tool_use_id` equals the
  record's root tool id. Unknown task ids and unrelated children do nothing.
- `run_id` match (`sameRun`): when both record and event carry a `run_id` and they
  differ, the event is ignored (no close, no refresh).
- New `BACKGROUND_TASK_QUIET_TIMEOUT_MS = 600_000` next to `NO_ACTIVITY_TIMEOUT_MS`.
  In `arm()`, after the normal window with no open root tool: if a live background
  task is still inside its quiet window, call `onOverdue(['background task'])` and
  re-arm for `min(180 s, quiet remaining)`. Else fire once with cause `'no-activity'`
  (cause chain unchanged). The timer never fires earlier than the existing 180 s rule.
- `beginTurn` / `endTurn` / `stop` clear the records (existing `tasks.clear()` calls).
- Root tool and compaction paths are unchanged.

## Failing-before (step 1, coordinator-confirmed from `.ptah/tmp/run-before.log`)
`Tests: 1 failed, 31 passed, 32 total` —
`NoActivityWatchdog › compaction dwell bound (TASK_2026_597 A8) › background SDK tasks ›
reproduces a root abort while a background task is active` —
`Expected number of calls: 0, Received number of calls: 1`.

## Passing-after (step 5)
Command: `npm run verify -- -t test -p @ptah-extension/agent-sdk -- --testPathPatterns=no-activity-watchdog`
- Header: `Running target test for project @ptah-extension/agent-sdk` (1 project).
- `Test Suites: 2 passed, 2 total` / `Tests: 42 passed, 42 total` (exit 0).
- The first run used dynamic output; a second identical run with `--output-style=static`
  replayed the cached result to show the counts (cache hit, no new test work).

## Specs added (describe `background SDK tasks`)
1. reproduces a root abort while a background task is active (repro, final assertion)
2. progress, updates and correlated child messages keep a backgrounded root turn alive past 180 s — (a)
3. a terminal notification restores a full normal window — (b)
4. a stale run_id does not close or refresh a newer run — (b)
5. a matching run_id notification closes the run — (b)
6. a dead background task times out exactly once with no-activity at 600 s quiet — (c)
7. unknown task and unrelated child traffic cannot keep a dead task alive — (d)
8. ambient and skip_transcript tasks get no background extension — (d)
9. a root assistant message during a silent background task never times out earlier than 180 s after it — (e)
10. a root tool during a silent background task keeps the normal uncapped tool rule — (e)
11. endTurn clears the records: a task that outlives its turn cannot affect the next turn — (f)

Spec messages use typed builders (`taskStarted`, `taskUpdated`, `taskProgress`,
`taskNotification`, `assistantMessage`). No new `as unknown as` (count stays 6, all
pre-existing). `assistantMessage` uses one plain `as SDKAssistantMessage['message']` on a
`Partial` content object.

## Risks / deviations
- Behavior change: a backgrounded root task now keeps the turn alive up to 600 s of
  quiet (before: released at once, timeout at 180 s). Sustained real progress can run
  longer than 600 s by design (quiet bound, not a runtime cap).
- A task whose `task_started` arrives without `tool_use_id`, or after its root tool
  closed, is not recorded (unchanged from before; it is not attributed to the root).
- `task_notification` with a non-matching `run_id` is ignored even when it carries a
  `tool_use_id`; the root tool then waits for its own result or terminal hook.
- Nested tasks (`parent_task_id`) are excluded from keep-alive, as the proposal says.
- Overdue diagnostics while only background tasks run use the operation label
  `'background task'`.
- No full lint/typecheck was run (coordinator owns those). Prettier was run on the 2 files.
