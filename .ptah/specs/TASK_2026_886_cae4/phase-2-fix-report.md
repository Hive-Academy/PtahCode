# Phase 2 fix round 1 — TASK_2026_886_cae4

Inputs: `phase-2-review.md` (L1, L2, S1), batches.md executor rules, D34, D35, plan Component 4 (repository identity) and Component 5 (durable resume).

## L1 — CONFIRMED, fixed

Evidence: `steps/close-curate.step.ts` (pre-fix :407-415) recorded `failed/curator-failed` for any rejection, and :428 recorded any resolved result, even after the worker had aborted the signal in `dispose()` (`worker/task-end-run-worker.ts:172-179`). `markStepRunning` (`persistence/sqlite-task-end.store.ts:349-371`) has already left the row as `running` with `reason = NULL`. The mapper reads that row back as pending (`persistence/task-end-row.mapper.ts:189-209`). So if the step records nothing, the entry stays resumable.

Change (`libs/backend/task-end-hook/src/lib/steps/close-curate.step.ts`):
- `curateSession` now returns `CloseCurateRecorded | null`. It returns `null` and records nothing in three cases: `signal.aborted` before `markStepRunning`, an abort seen in the catch (the port rejected after the abort), or an abort seen after the port resolved. Each interrupted case writes a debug line, `[task-end-hook] close-curate interrupted by shutdown`, with `{ runId, sessionId }`.
- `run()` stops the session loop on `null`. `retry()` returns `null`, which the worker already handles (`worker/task-end-run-worker.ts:454`).
- A rejection without an abort still records `failed/curator-failed`.
- The degradation-audit marker sits at the top of the catch body, so it attaches to that catch.
- The file header comment and the `retry()` doc now describe this contract.

Tests (`steps/close-curate.step.spec.ts`), in the `shutdown abort while the curator call is in flight (L1)` block plus one retry case:
1. Abort during the await, then the port rejects: no `upsert` for s1, the stored state stays `running`, `getRun` reads it as pending, the interrupted debug line is written, and s2 is not curated.
2. Abort, then the port resolves `ran`: no `upsert` and nothing recorded.
3. Restart resumes: a second `run()` with a fresh signal curates s1 again and records `succeeded`. `attempts` is 2.
4. Contrast case: a rejection without an abort still gives `failed/curator-failed`.
5. `retry()` aborted during the await returns `null` and the entry stays `running`.

## L2 — CONFIRMED, fixed

Evidence: `trigger/repository-identity.ts:148` (pre-fix) mapped every exit 128 with empty stdout to a cached `nogit:` identity. `resolve()` caches every `ok` result (:110). The detector baselines whatever `ok` identity it gets (`trigger/task-end-transition-detector.ts:421-434`). For an `error` result it logs `repository identity unresolved` and returns without baselining (:400-405), so classifying ambiguous fatals as `error` is enough.

Change (`libs/backend/task-end-hook/src/lib/trigger/repository-identity.ts`):
- `probe` now reads `stderr`. The result is `nogit` only when exit is 128, stdout is empty and stderr matches `/^fatal: not a git repository\b/im` (`NOT_A_REPOSITORY`). Every other exit-128 fatal, including "detected dubious ownership" and an empty stderr, is `{ kind: 'error', error: 'common-dir-unexpected-exit' }`. That result is not cached, so a later flush retries.
- The header and the `common-dir-unexpected-exit` doc are updated.

Tests:
- `trigger/main-root-resolver.spec.ts`, `describe('RepositoryIdentityResolver')`:
  - A real dubious-ownership fixture (exit 128, `fatal: detected dubious ownership in repository at '/owned'` plus git's safe.directory hint) gives `common-dir-unexpected-exit` and `cachedRepoId` stays `null`. After the repair, the next call runs git again and resolves the git identity. Two git calls in total.
  - Exit 128 with empty stderr gives an error, not `nogit`.
  - Not-a-repository gives `nogit`, and it is cached (the second call runs no git).
  - The existing not-a-repository → `nogit` case still passes.
- `trigger/task-end-transition-detector.spec.ts`: `FakeGit.dubious`, plus "a dubious-ownership root is not baselined as nogit and is retried once repaired". The first startup baselines nothing and logs the warning with `common-dir-unexpected-exit`. After the repair, `reconcileStartup()` baselines one repo whose `repo_id` does not start with `nogit:`. The later `done` transition creates its watcher run.

## S1 — DISPUTED, no change

`libs/backend/task-end-hook/src/lib/di/register.ts:20-23` (the same at HEAD 5b3047ffe) gives no token count. It lists the store, settings reader, census coordinator, four step runners, detector, worker and run reader. That is exactly the 10 registrations at :40-74. The "seven" host-port tokens at :25 matches the seven port tokens in `di/tokens.ts:19-33`. A search of `libs/backend/task-end-hook/src` for any "11"/"eleven" token or registration claim found none. The comment is already accurate, so nothing changed.

## Decisions

- **Locale of the stderr match.** Options: (a) match the C-locale English text, relying on the runner's environment; (b) add `LC_ALL=C` to `GitReadRunOptions`; (c) treat every exit 128 as unresolved, which would mean no `nogit` at all. Evidence: the port contract says Electron binds `GitReadRunner` to `execGit` (`ports/git-read-runner.port.ts:18`, plan line 64). `execGit` forces `LC_ALL=C`/`LANG=C` on every call (`libs/backend/vscode-core/src/utils/exec-git.ts:527-543`). The repository already classifies this message the same way (`vscode-core/src/services/git-info.service.ts:142`, `git/git-history.reader.ts:267`). Chosen: (a). A localized message falls into `error`, which fails closed: it retries and never caches a false `nogit`. The cost is a non-git folder under a non-C runner is never baselined, which is visible in the warning log. Reversible: yes. The Batch 17 host binding must keep using `execGit` (or pin `LC_ALL=C`). That is outside this scope (apps/ptah-electron).
- **Port result after abort is not recorded.** Options: record a resolved result that arrived after the abort, or drop it and resume. Chosen: drop and resume, as the review asks. The engine owns observation marking, and re-curating an ended session is the engine's existing idempotent path. Reversible: yes.
- **Interrupted retry resumes as attempt 1.** A retry (attempt 2) that is interrupted leaves the row `running`/null. That row reads back as pending, so after a restart the first pass re-curates it with attempt-1 mapping (a retryable code defers again, then gets its single retry). The stored `attempts` counter still increments. This follows the existing mapper rule (D16) and needs no schema change. Reversible: yes.
- **Interrupted log level is debug.** The step's logger type is `Pick<Logger, 'debug' | 'warn'>`. Widening it would change the worker spec fakes, and shutdown is not a warning condition.

## Files modified

- /home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/steps/close-curate.step.ts
- /home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/steps/close-curate.step.spec.ts
- /home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/trigger/repository-identity.ts
- /home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/trigger/main-root-resolver.spec.ts
- /home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/trigger/task-end-transition-detector.spec.ts

## Verification

- `TMPDIR=/var/tmp/b886 PTAH_VERIFY_LOCK_DIR=/tmp/ptah-verify-lock npm run verify -- -p @ptah-extension/task-end-hook -- --output-style=static` exited 0 on the final tree (lock released 2026-11-07T17:06:17Z):
  ```
  NX   Successfully ran targets lint, typecheck for project @ptah-extension/task-end-hook
  Test Suites: 18 passed, 18 total
  Tests:       589 passed, 589 total
  NX   Successfully ran target test for project @ptah-extension/task-end-hook
  ```
  589 = the 580 recorded at Batch 15 plus the 9 tests added here. The second run printed Jest's "A worker process has failed to exit gracefully" warning once. D34(a) already records this warning as unattributed, and the suites still pass.
- An earlier run failed typecheck (TS2339: `info` is not on `Pick<Logger, 'debug' | 'warn'>`). The fix logs the interruption at debug.

- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: `degradation-audit: TOTAL 216 unsuppressed site(s)`, unchanged from 216, with no task-end-hook entry. A first placement of the marker (inside the `if`) gave 218 (`catch-return-sentinel` plus `orphaned-suppression` at close-curate.step.ts:421/423). Moving it to the top of the catch body fixed that.
- No git command was run that changes anything. I ran only read-only `git show HEAD:…/register.ts` and `git status --short` to check the S1 comment at HEAD and the changed-file list; nothing was staged, committed, stashed, restored or checked out. C1: nothing is deleted, moved or archived. C3: no `git fetch`.
