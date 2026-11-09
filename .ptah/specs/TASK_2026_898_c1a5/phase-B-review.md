# Phase B Review: TASK_2026_898_c1a5

**Verdict: CHANGES REQUESTED**

Scope: `git diff da094a578^..HEAD` (B1..B9). I read the close-out service, PR reconciler, SQLite journal, migration 0073, both git adapters, the Electron activation and composition, and the MCP namespace and tool.

No checks were run. This was a static review only, so the findings below are not confirmed by execution. Per the brief, the 7 Windows symlink-EPERM task-end-hook suites are ignored.

## Removal-safety summary (the primary focus)

I found no path that removes a worktree or deletes a branch without opt-in, clean and merged. Every removal goes through these layers:

- `cleanupSteps` refuses unless `autoRemoveMergedWorktreeAndBranch` is true (`task-close-out.service.ts:147-149`, `:178-179`).
- It inspects twice, and the adapter re-checks inside `removeWorktree`.
- The adapter uses `git worktree remove` with no `--force`, and `branch -d` with no `-D`.
- The adapter confines paths to `<realpath(root)>/.claude-worktrees`, requires a registered worktree, requires a matching branch, and refuses main/master and the current branch (`task-cleanup.adapter.ts`).
- The branch step is gated on the worktree step being `ok`.

Residual risk is only the TOCTOU between inspect and remove, which `git worktree remove` without `--force` covers for a dirty tree.

## Five logic questions

1. **Happy path:** the open-PR promotion to `in_review` is unreachable (finding 1), so the headline flow breaks at step 1.
2. **Failure at boundaries:** a failed `gh` call, a git failure or a store error each become a logged `failed`/`unknown` result. That part is sound. A vanished worktree retries forever (finding 5).
3. **Concurrency:** `cleanupCompleted` is unguarded (finding 2).
4. **Unspecified cases:** a squash merge, a non-`main` default branch, and a reconcile storm are not specified (findings 3, 4 and 6).
5. **Evidence:** I did not verify which tests assert the concurrency or promotion behavior. Finding 8 lists what looks missing.

## Findings

### 1. [major] The "PR opens → `in_review`" transition can never fire from the host scan
- Evidence: `apps/ptah-electron/src/activation/task-end-hook.activation.ts:92` skips every row whose status is not `in_review` or `done`. The only callers of `setCarrierStatus(..., 'in_review')` are in `task-pr-reconciler.service.ts:66`, which is reached only via `scan`. `git grep in_review` shows no other promoter.
- Impact: a task in `in_progress` with an open PR is never promoted, so the feature's first step is dead on the automatic path. The reconciler also never watches the task until it is already `in_review`.
- Fix: include `in_progress` (and `backlog` if desired) in the scan filter. Cap PR lookups for non-review rows, for example with a cheap "has a linked worktree and branch" precondition plus per-task throttling. Add an activation test that an `in_progress` row with an open PR is promoted.

### 2. [major] `cleanupCompleted` races with itself and with `start()`
- Evidence: `task-close-out.service.ts:81-97`. After `await active`, `cleanupSteps` runs without being registered in `this.active`.
  - Two concurrent `cleanupCompleted` calls both pass `step()`'s `state !== ok` check. `startCloseOutStep` also accepts `running` (`sqlite-task-end.store.ts:212`), so both run `removeWorktree`/`deleteBranch`.
  - The first `finishCloseOutStep` moves the step to `ok`; the second throws `close-out step unavailable` (`:208-218`). That surfaces as a spurious `retryable-failure` from the tool, or as a `failed` step overwrite.
  - A `start()` call arriving while `cleanupCompleted` is in flight sees no active entry and launches a concurrent `execute`.
- Fix: serialize all work per run through `this.active` (chain `cleanupCompleted` onto the existing promise and register the chain). In the store, make `startCloseOutStep` reject `running` unless the row is stale (a recovery path with a timestamp or boot epoch).

### 3. [major] Unthrottled re-execution on every index change and startup
- Evidence: `task-end-hook.activation.ts:89-113` and `task-pr-reconciler.service.ts:72-82`. Every `onDidChangeIndex` event scans every `in_review`/`done` task with a worktree. It runs a `gh` PR lookup for each, and for a merged PR calls `closeOut.run`. `step()` re-runs `refused` and `failed` steps and increments `attempts` each time (`startCloseOutStep`). `refused` is the normal `pending-user-approval` state.
- Impact:
  - Historical `done` tasks trigger a `gh` call on every index event.
  - Failed `memory`/`learning` steps re-run unbounded, calling the curator and harvester.
  - The `attempts` counter and `updated_at` churn.
- Fix: persist a retry policy. Do not re-run a `refused` step with the same opt-in snapshot. Back off `failed` steps by attempts and `updated_at`, and cap attempts. Debounce `scan` per root. Skip `done` tasks whose run record already has all steps terminal.

### 4. [minor] Merge detection assumes local `main` and ancestry
- Evidence: `task-cleanup.adapter.ts:70` and `:99` hardcode `merge-base --is-ancestor <branch> main`.
- Impact:
  - Squash and rebase merges are never ancestors, so removal always ends `refused: worktree-not-clean-and-merged`.
  - Repos whose default branch is not `main` fail with exit 128, mapped to `failed` and retried forever (see finding 3).
  - Local `main` that is behind origin never shows as merged.
  - This is safe but makes the opt-in largely ineffective, and `failed` is misleading.
- Fix: resolve the default branch (`origin/HEAD`) and treat a confirmed GitHub merged PR (`headRefOid` equals the branch tip) as an alternative merge proof. Map exit 128 to `refused` rather than `failed`.

### 5. [minor] A vanished worktree is permanently `failed`
- Evidence: `candidate()` calls `realpath(worktreePath)`, which throws `ENOENT` and returns `failed: Unable to inspect task worktree`. The worktree step never reaches `ok`, so the branch step stays `refused: worktree-removal-pending`.
- Fix: if the path no longer exists and is absent from `git worktree list`, treat the worktree step as `ok` (`already-removed`) and continue to the branch step.

### 6. [minor] The memory step stops at the first gated or failed session
- Evidence: `task-close-out.service.ts:118` returns `skipped` on the first `gated` result, so remaining sessions are never curated. A `failed` result also returns early, so later sessions are skipped.
- Fix: iterate all sessions, then aggregate. Any `failed` → `failed`; all `gated` → `skipped`; otherwise `ok`.

### 7. [minor] The Electron activation disables the whole hook if the reconciler wiring cannot resolve
- Evidence: `task-end-hook.activation.ts:83-86` resolves four dependencies unguarded after `worker.start()`. The shared `catch` at `:123` calls `dispose()`, which tears down the worker and detector too. These resolves are only guarded by `isRegistered(PR_RECONCILER)`.
- Impact: this does not crash startup, because it is caught. But a missing task-index or organization store silently kills the existing report-only hook.
- Fix: wrap the reconciler wiring in its own try/catch that disposes only the reconciler subscription. Check `isRegistered` for each dependency.

### 8. [minor] Test gaps, from the diff
- Not verified by execution, but I did not find tests that assert any of these:
  - concurrent `cleanupCompleted` calls, or `cleanupCompleted` racing `start()`;
  - an `in_progress` row with an open PR being promoted (this would have caught finding 1);
  - re-execution count across repeated scans (finding 3);
  - a worktree inspected clean on the first call and dirty on the recheck.
- Fix: add specs for each.

### 9. [minor] Identity conflict is raised on every scan
- Evidence: `sqlite-task-end.store.ts` `getOrCreateCloseOut` throws `close-out identity conflict` if `worktreePath` or `branch` differs from the stored row. The scan picks the first linked session that has a worktree, so a changed link repeats the error log on every index event. The run is never executed.
- Fix: log at warn once per task, or record the conflict state in the journal.

### 10. [minor] Carrier write happens before close-out, and it can overwrite a terminal status
- Evidence: `task-pr-reconciler.service.ts:73` runs `setCarrierStatus('done')` and awaits it before `closeOut.run`. If the write throws (frontmatter shape, realpath), close-out never starts for the merged PR.
- Impact: a `cancelled` task with a merged PR is also rewritten to `done`.
- Fix: start close-out independently of the status write (log the write failure). Never overwrite `cancelled`.

## Checked and found sound
- **Migration 0073:** `UNIQUE(repo_id, task_id, pr_number)`, a CHECK on the step enum and the state enum, `IF NOT EXISTS`, the version-73 registration, and the bumped migration specs are consistent.
- **Journal creation:** `getOrCreateCloseOut` runs in a transaction using `INSERT OR IGNORE`, so a double start from two callers is safe.
- **Unhandled rejections:** the detached close-out promises in `start()` (`:67`) and in the reconciler have `.catch` handlers.
- **Path validation:** the MCP namespace canonicalizes `workspaceRoot` and compares it to the open workspace root. `cleanupCompleted` also verifies that the run's `taskId` and `mainRoot` match.
- **MCP tool args:** they use a strict Zod schema with a task id regex.
- **DI:** `TaskCloseOutService` and `TaskPrReconcilerService` are registered only in the Electron composition, where the cleanup port is also registered. The `PtahAPIBuilder` injection is `isOptional`, so no host crashes on an unregistered service.
- **Stop-hook harvest:** removal from `SkillTriggerService` is clean, with no leftover timers.
