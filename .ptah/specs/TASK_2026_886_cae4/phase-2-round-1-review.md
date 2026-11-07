# Phase 2 round 1 review

Scope: Round 1 fix diff, implementer report, original Phase 2 review, and current task-end-hook source and callers. Electron Batch 17 changes are outside this review. This was source inspection only; no git, Nx, npm, npx, build, or test command was run.

## Logic

Verdict: APPROVED
Score: 8/10

1. **L1 — Resolved — `libs/backend/task-end-hook/src/lib/steps/close-curate.step.ts:412`.** `curateSession` returns `null` before `markStepRunning` when the signal is aborted, and lines 427–443 return `null` without recording when the port rejects or resolves after an abort. A started entry remains `running` with no reason, which the mapper reads as pending (`persistence/task-end-row.mapper.ts:200-209`). `run()` stops its session loop on `null` (:336-343); `retry()` passes `null` through (:369), and the worker accepts it (`worker/task-end-run-worker.ts:449-456`). The new specs cover rejection, resolution, restart, ordinary rejection, and retry interruption. No remaining L1 defect found.
2. **L2 — Resolved — `libs/backend/task-end-hook/src/lib/trigger/repository-identity.ts:159`.** The resolver requires exit 128, empty stdout, and the explicit C-locale `not a git repository` fatal before returning `nogit`; every other nonzero exit is an uncached error (:177-179). The detector logs and skips unresolved identity without baselining (`trigger/task-end-transition-detector.ts:400-405`). The new resolver and detector specs cover dubious ownership, an empty-stderr fatal, normal `nogit`, and recovery. `execGit` pins `LC_ALL=C` (`libs/backend/vscode-core/src/utils/exec-git.ts:539-542`); a runner with a different locale fails closed as an error. No remaining L2 defect found.

No new logic defects found in the changed paths or their inspected callers. The fix diff changes no command vector, contains no `git fetch` path, and introduces no delete, move, or archive action. C1's literal `effectiveMode: 'off'` behavior remains outside the changed lines.

## Style

Verdict: APPROVED
Score: 8/10

1. **S1 — Accepted dispute — `libs/backend/task-end-hook/src/lib/di/register.ts:20`.** The comment gives no count for library registrations. Its list matches the ten registrations at lines 40–74: store, settings reader, census coordinator, four steps, detector, worker, and run reader. The seven host ports listed at lines 25–30 are a separate, accurate count. The original S1 was based on a misread; no fix is needed.

No new style defect warranting a finding in this fix. The new close-curate header comment at line 29 is long and could be wrapped during routine cleanup, but it does not alter the verdict.

## Decisions

- Accept an interrupted curation result as unrecorded, including a port that resolves after abort. The stored running/no-reason row resumes as pending; an interrupted attempt-2 retry consequently resumes through the first-pass mapping on restart. This follows the existing mapper and worker contracts.
- Accept the C-locale stderr match for `nogit`. Ambiguous or localized exit-128 failures stay unresolved and uncached, avoiding a false repository baseline. The Electron host runner binding is outside this review.
- Accept the implementer's S1 dispute: the original registration-count finding is withdrawn.
- The implementer reports 18 passing suites and 589 tests after the fix. Those results were not independently rerun under this read-only instruction; the earlier Jest exit warning remains unattributed.
