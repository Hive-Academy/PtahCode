# Phase B re-review: TASK_2026_898_c1a5

**Verdict: APPROVED**

Static review of commit `e35c3888e` against `phase-B-review.md`. No file was edited and no build or test was run, per the brief.

## Findings 1-10

1. [major] in_progress promotion — **Resolved**. The scan includes `in_progress`
   (`apps/ptah-electron/src/activation/task-end-hook.activation.ts:99`), and an open PR
   promotes the task (`libs/backend/task-end-hook/src/lib/close-out/task-pr-reconciler.service.ts:64-68`).
   Specs: `task-end-hook.activation.spec.ts:67,87-90`, `task-pr-reconciler.service.spec.ts:27-33`.
2. [major] `cleanupCompleted` races — **Resolved**. All run work is serialized through the
   `active` chain: `start` joins an existing chain (`task-close-out.service.ts:74-77`),
   `cleanupCompleted` chains onto the current promise (`:98-110`), and `track` removes the
   entry only if it still owns it (`:114-119`). Both prologues are synchronous through
   `track`, so two calls cannot interleave. Spec: `task-close-out.service.spec.ts:87`.
3. [major] unthrottled re-execution — **Partially resolved**. Refused steps are terminal
   unless pending approval and opted in (`task-close-out.service.ts:227-229`); failed steps
   cap at 5 attempts (`:226`); terminal `done` runs are skipped before the PR lookup
   (`task-end-hook.activation.ts:103-107`); scans coalesce per root (`:126-140`). Residual
   (minor): a `done` run with any `failed` step is never skipped (`:105` requires every step
   ok/skipped/refused), so each index event still costs one `gh` lookup per such task, and
   `in_progress` rows get a lookup per event with no per-task throttle. No unbounded step
   re-execution remains.
4. [minor] merge detection assumes `main` — **Partially resolved; squash proof deferred as
   agreed**. Exit 128 now maps to `refused` in both adapters
   (`libs/backend/platform-electron/src/git/task-cleanup.adapter.ts:85,115`;
   `libs/backend/platform-cli/src/git/task-cleanup.adapter.ts:85,115`), so a non-`main`
   default branch no longer retries forever. `merge-base ... main` stays hardcoded
   (`:84`, `:114`); squash/rebase merges still end refused, which is the safe direction.
5. [minor] vanished worktree stuck `failed` — **Resolved**. `lstat` ENOENT plus absence
   from `git worktree list` reports `already-removed`; a registered but missing path stays
   `refused` (`task-cleanup.adapter.ts:68-77`, both adapters). The service records the
   worktree step `ok` (`task-close-out.service.ts:248`) and proceeds to the branch step.
   Spec: `task-close-out.service.spec.ts:125`.
6. [minor] memory step stops early — **Resolved**. Every linked session is curated and the
   verdict aggregates failures and gates after the loop (`task-close-out.service.ts:128-148`).
   Spec: `task-close-out.service.spec.ts:152`.
7. [minor] wiring failure kills the hook — **Resolved**. Each dependency is checked with
   `isRegistered` (`task-end-hook.activation.ts:84-88`) and the reconciler wiring has its own
   catch that disposes only the subscription and reconciler (`:144-150`); the report-only
   hook survives. Cosmetic: the block at `:83-143` is over-indented.
8. [minor] test gaps — **Resolved** (static evidence). New specs cover serialization
   (`task-close-out.service.spec.ts:87`), dirty recheck (`:110`), already-removed (`:125`),
   refusal retention and attempt cap (`:139`), memory aggregation (`:152`), cancelled merge
   and carrier-write failure (`task-pr-reconciler.service.spec.ts:53,61`), and the
   `in_progress` scan (`task-end-hook.activation.spec.ts:67`). Not executed by this review.
9. [minor] identity-conflict log spam — **Resolved**. Warn once per repo+task
   (`task-close-out.service.ts:40,64-72`); the reconciler suppresses the known conflict
   (`task-pr-reconciler.service.ts:87-89`). The run still does not execute, which is the
   chosen fix option.
10. [minor] carrier write blocks close-out; cancelled overwrite — **Resolved**. Cancelled
    tasks return before any write or close-out (`task-pr-reconciler.service.ts:73`); the
    carrier write is caught and close-out proceeds (`:74-90`). Specs: `:53`, `:61`.

## Removal safety (regression check)

No regression found. Both adapters:

- Refuse removal without opt-in (`task-close-out.service.ts:176-177,206-207`) and re-run
  refused steps only under opt-in (`:227-229`).
- Inspect twice in the service (`:178-191`) and again inside `removeWorktree`
  (`task-cleanup.adapter.ts:95-97`); `git worktree remove --` without `--force` (`:98`) and
  `git branch -d --` without `-D` (`:116`).
- Confine paths to `realpath(mainRoot)/.claude-worktrees` before any action, including the
  ENOENT branch (`:51,57,66`). The `already-removed` path requires lstat ENOENT plus absence
  from `git worktree list` (`:68-74`), and `deleteBranch` independently refuses a branch that
  any registered worktree still holds (`:113`), refuses protected and current branches
  (`:104,109`), and requires merge proof (`:114-115`). So the `already-removed` path cannot
  delete a branch that still has a worktree. Adapter specs assert no `--force`/`-D`.

## Concurrency (`task-close-out.service.ts`)

Two executions of the same step can no longer overlap: every entry point funnels through the
per-run `active` chain (`:74-77,98-110,114-119`), and `start`/`cleanupCompleted` run
synchronously through `track`, so a second caller always observes the first caller's entry.
`cleanupCompleted` chains with `.catch(() => run)` (`:99`), so a failed automatic run does
not block manual cleanup. No unhandled rejection: `start` catches its work (`:78-83`) and
`track` attaches `finally` plus `catch` (`:116-118`), so every tracked promise is handled.
Notes (minor, no change required): the store still accepts `running` in `startCloseOutStep`
(`sqlite-task-end.store.ts:220`), which now serves only crash recovery; two runs of one task
(different PR numbers) may call `deleteBranch` concurrently, but the adapters are idempotent
(absent branch → `ok` at `task-cleanup.adapter.ts:111`) and never force, so this converges
safely.

## Retry gating and the manual tool

Manual `ptah_task_close_out` → `closeOut` → `service.start` → `execute`, whose steps run with
the default `manual = false` (`task-close-out.service.ts:125,150,164`). So yes: after 5
failed attempts the manual close-out tool will not retry the failed memory or learning steps,
and `closeOutStatus` still reports `retryable: true` for them
(`libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/task-close-out.namespace.ts:78`).
Only `cleanupCompleted` bypasses the cap (`manual = true`, `task-close-out.service.ts:99-105`),
and it re-runs only the worktree and branch steps.

This matters in part: the manual tool is the documented recovery path, and a capped
memory/learning step becomes unretryable through any tool even after the external cause is
fixed. Severity minor, because five real attempts must fail first and the failure is visible
in the run record. Suggested follow-up: plumb a manual flag through `start`/`execute`, or
reset the attempt counter on a manual invocation.

## New findings

- [minor] `ptah_task_close_out` cannot retry memory/learning steps past the 5-attempt cap,
  and `retryable: true` overstates the state (see above).
- [minor] A `done` run with a `failed` step still costs one `gh` lookup per index event
  (`task-end-hook.activation.ts:103-107` skips only all-terminal runs).
- [minor] In the open-PR promotion path the carrier write is not wrapped in try/catch
  (`task-pr-reconciler.service.ts:66`), unlike the merged path. A throw aborts the rest of
  that scan pass (caught at `task-end-hook.activation.ts:135`) and the next event retries.

## `git diff main...HEAD` scan

147 files. The branch holds the close-out feature (phases A/B) plus session-handoff work that
the phase-A reviews already covered. A scan of the added lines for `--force`, `-D`,
`worktree remove`, `branch -d`, `rmSync`, and `unlink` found production hits only in the two
guarded adapters and their port doc comments; `rmSync` appears only in a spec `afterEach`
temp-dir cleanup, and two adapter specs assert no force flags. No new blocker or major.
