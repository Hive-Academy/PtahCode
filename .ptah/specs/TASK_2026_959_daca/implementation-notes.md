# Implementation notes

## Changes

Files changed: `CLAUDE.md`; `libs/shared/src/lib/types/task-spec.types.ts`; `libs/backend/task-specs/src/index.ts`, `src/lib/di/tokens.ts`, `src/lib/task-index.service.ts`, `src/lib/task-index.service.spec.ts`, `src/lib/task-status-overlay.ts`, `src/lib/task-status-overlay.spec.ts`; `libs/backend/task-end-hook/src/lib/close-out/task-pr-reconciler.service.ts`, `src/lib/close-out/task-pr-reconciler.service.spec.ts`, `src/lib/close-out/task-close-out.service.spec.ts`, `src/lib/di/register.ts`, `src/lib/persistence/task-end-store.interface.ts`, `src/lib/persistence/sqlite-task-end.store.ts`, `src/lib/ports/pr-status.port.ts`, `src/lib/trigger/task-end-transition-detector.ts`, `src/lib/trigger/task-end-transition-detector.spec.ts`; `apps/ptah-electron/src/activation/task-end-hook.activation.ts`, `src/activation/task-end-hook.activation.spec.ts`, `src/di/phase-2-libraries.ts`, `src/di/container.smoke.spec.ts`, `src/di/task-end-hook-composition.ts`, `src/di/task-end-hook-composition.spec.ts`; this note.

- `libs/shared/src/lib/types/task-spec.types.ts`: additive `carrierStatus` field; `status` is the effective status returned to readers.
- `libs/backend/task-specs`: a pure `effectiveTaskStatus` function and optional overlay port; list and detail expose both effective and raw carrier status. All list filters run after projection, including legacy `status` and multi-axis `filter.statuses`. The index can notify listeners after a host-side status change.
- `libs/backend/task-end-hook`: the existing close-out table provides merged task IDs per repository, so no migration is needed. The overlay is registered in task-end-hook DI and resolves repository identity through the detector. The reconciler persists merged PR identity before detached close-out and notifies the index. It no longer writes task carriers; the detector writer was removed. Unknown lookups retry for both active statuses.
- `apps/ptah-electron/src/activation/task-end-hook.activation.ts` and `src/di/phase-2-libraries.ts`: complete close-outs are skipped regardless of carrier status; reconciler decisions receive `carrierStatus`; skip reasons are logged; lookup failures are aggregated once per scan. A previous close-out identity supplies branch and worktree path when the session link is absent. Index warm-up now follows overlay registration, and activation broadcasts when persisted merges become readable after repository identity is cached.
- `CLAUDE.md`: lifecycle description now says the host derives done from the close-out store and agents set in_review.
- Regression tests updated for the removed writer and added for the pure status function and reconciler merge handling.

## Gate 2

Task carrier frontmatter has no branch or PR identity field. Task IDs do not encode a branch, and a repository can have multiple worktrees, so `git worktree list` cannot reliably identify a task PR. The scan reuses a prior close-out identity if present; otherwise it logs `no-session-link` or `no-branch` and skips. Recovery of an unrecorded PR after the session link disappears remains unimplemented without a durable task-to-PR link.

## Verification

- The worktree had no dependencies. A temporary `node_modules` junction to the main checkout dependencies was created for the scoped commands and removed with `cmd /c rmdir node_modules` afterward. Verification retries used the PowerShell prefix `$env:NX_DAEMON='false'; $env:NX_ISOLATE_PLUGINS='false';` followed by the exact `npm run verify` command listed below.
- `npm run verify -- -t typecheck -p @ptah-extension/shared,@ptah-extension/task-specs,@ptah-extension/task-end-hook,ptah-electron`: reached Nx after the shared verify lock, then failed before typechecking because the sandbox denied Nx daemon and plugin worker processes (`spawn EPERM`). No project result or count.
- Same scoped typecheck with `NX_DAEMON=false` and `NX_ISOLATE_PLUGINS=false`: wrapper exit 0, but the filtered output had no Nx target header or per-project counts; this is inconclusive rather than a confirmed pass. Nx emitted Jest config module warnings.
- A final run of that same scoped typecheck with a plain output tail exited 0 after emitting Jest config module warnings, but still printed no Nx target header or per-project results. It is inconclusive.
- `npm run verify -- -t test -p @ptah-extension/shared,@ptah-extension/task-specs,@ptah-extension/task-end-hook,ptah-electron` with those same environment variables: Nx task runner reported `spawn EPERM` for every attempted task. The required `Running target test for 4 projects` header did not appear, and no Jest suite/result counts were produced. The wrapper misleadingly exited 0. **Tests were not executed.**
- `npm run verify -- -t lint -p @ptah-extension/shared,@ptah-extension/task-specs,@ptah-extension/task-end-hook,ptah-electron` with the same environment variables: wrapper exit 0 but no Nx target header, per-project results, or lint counts appeared. Treat as inconclusive.
- Tests were not run against old code first; old code demonstrably calls `setCarrierStatus` in both open and merged branches.
- No run showed the required `Running target test for 4 projects` header. Test pass/fail counts: unavailable (zero suites ran). Lint and typecheck pass/fail counts: unavailable because no project target results appeared. `git diff --check` reported no whitespace errors.

## Remaining gaps

- An unrecorded PR cannot be discovered after its session link disappears: there is no reliable task-to-branch mapping in the carrier or worktree list.
- Polling lookup failures are logged per poll, while scan lookup failures are aggregated into one warning. The Electron PR adapter flags unavailable/error results instead of logging once per task.
- The shared RPC task contracts use `TaskSpecSummary` and `TaskSpecDetail` directly; no Zod response schema enumerates their fields.

## Raw carrier readers

`TaskDoctorService` reads the raw file to diagnose and repair that file; using the overlay would conceal the state being repaired. `TaskSweepService` uses raw terminal status as a safety gate before deleting a folder, so a remote merge alone cannot make an in-review carrier sweepable. The disposal collector and worker carrier reader inspect the file as evidence for cleanup and journal observation; these retain raw semantics. Board list/detail, RPC, and MCP index readers receive the overlay.
