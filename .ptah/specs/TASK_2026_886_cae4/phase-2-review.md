# Phase 2 review

Scope: Phase 2 diff (afb4fb11f..5b3047ffe), Batches 11–15, current worktree source, approved Rev 2 plan, context, task description, repository guidance, and the earlier Phase 1 style review. Read-only inspection; no git, build, test, Nx, npm, or npx command was run. Ptah diagnostics reported zero TypeScript errors in the store, worker, and detector. The recorded Batch 15 verification was 18 suites / 580 tests with scoped lint and typecheck passing; the 12 host-port DI errors are expected until Batch 17. Diagnostics and happy-path tests do not establish the shutdown and git-error cases below.

## Logic

Verdict: REVISE
Score: 5/10

1. **L1 — Serious — `libs/backend/task-end-hook/src/lib/steps/close-curate.step.ts:407`.** If shutdown aborts `curateEndedSession` and the port rejects, the catch writes terminal `failed/curator-failed` at line 415. The worker has already aborted its signal (`worker/task-end-run-worker.ts:172-179`), so the next startup cannot resume that session's curation. This conflicts with the worker's stated durable-resume contract and loses the intended learning attempt. Check `signal.aborted` before recording; leave the entry in its resumable running/pending representation, and cover an abort during the await followed by restart. The same check is needed after a port resolves despite abort, before recording its result at line 428.
2. **L2 — Serious — `libs/backend/task-end-hook/src/lib/trigger/repository-identity.ts:147`.** Every exit 128 with empty stdout becomes a cached `nogit:` identity, regardless of stderr. Git's dubious-ownership error also exits 128 with empty stdout; a transient ownership/access failure is consequently treated as a different repository. The detector then baselines that false identity (`trigger/task-end-transition-detector.ts:421-434`) and can miss the terminal transition rather than retry it when access is repaired. Classify only the specific “not a git repository” fatal response as `nogit`; treat other exit-128 failures as unresolved and do not cache them. Add a dubious-ownership result fixture and recovery test.

### Five logic questions

1. **Silent failure:** L2 creates a false baseline and loses the first terminal transition under the real identity.
2. **Unexpected user action:** Closing the host while curation is in flight produces a permanent failure instead of a resumable step (L1).
3. **Wrong input answer:** A git exit 128 for ownership produces `nogit` instead of an unverifiable repository result (L2).
4. **Dependency failure:** Store errors propagate to the worker's logged backoff (`worker/task-end-run-worker.ts:229-248`); reader errors propagate to its caller (`read/task-end-run.reader.ts:47`); curation abort is mishandled (L1).
5. **Unspecified case:** A git fatal exit is not proof that the directory lacks a repository; its stderr must be classified (L2).

### Required risk checks

- **Open handles:** Checked `worker/task-end-run-worker.ts:194-213` and `trigger/task-end-transition-detector.ts:254-264,327-335`: timers are unref'd and cleared on dispose. Both specs dispose instances and restore timers (`worker/task-end-run-worker.spec.ts:290-298`; `trigger/task-end-transition-detector.spec.ts:389-398`). The reported Jest process-exit warning has no confirmed cause from these paths; no new handle defect established.
- **Curation abort:** L1.
- **Dubious ownership:** L2.
- **Connection teardown:** Checked `di/register.ts:107-123`: wake subscription is disposed before detector and worker, and repeated `dispose()` is guarded. `awaitStopped()` waits for detector idle and worker completion. OK.
- **Run reader:** Checked `read/task-end-run.reader.ts:41-58`: it omits a run missing a step kind; store exceptions propagate rather than returning an empty run. The recorded builder contract omits `endHook` on that exception. OK.
- **C1/C3:** Checked the Phase 2 diff and read-only git vector gate (`ports/read-only-git.ts:118-217`): no file removal, move, archive writer, or `git fetch` path was found. `effectiveMode` is the literal `off` (`steps/dispose-evaluate.step.ts:64-72`); cancelled tasks and untracked files block eligibility (`dispose/decide-disposal.ts:82,166-182`). The ancestor command uses local `refs/remotes/origin/main` (`ports/read-only-git.ts:191-196`). The seventh command is the approved `gh pr list` read, outside the six git vectors. OK.
- **Store:** Checked migration 0072 registration (`persistence-sqlite/src/lib/migrations/index.ts:499-501`), schema, and store. Journal and run/steps creation are transactional (`persistence/sqlite-task-end.store.ts:144-150,678-733`); runtime step/outcome mismatch throws (`:374-387`); attempts increment on `markStepRunning` (`:349-371`); orphan creation is per-orphan transactional (`:153-201`); queue cap counts settling and queued at admission (`:671-675`). The mapper treats interrupted `running` steps with null reason as pending (`persistence/task-end-row.mapper.ts:189-209`). OK for these checks.

The logic score is below the sound 7–8 band because two probable failure boundaries permanently misclassify work. It is above the 3–4 band because the journal, step schema, queue admission, and report-only safety boundaries are coherent. Remaining uncertainty: no checks were executed in this read-only assignment, and the Jest exit warning remains unattributed.

## Style

Verdict: APPROVED
Score: 8/10

1. **S1 — Minor — `libs/backend/task-end-hook/src/lib/di/register.ts:20`.** The registration comment says 11 library tokens, but lines 40–74 register 10: store, settings, census, four steps, detector, worker, and reader. Correct the count or omit it so host integrators can trust the contract description.
2. **S2 — Minor — `libs/backend/task-end-hook/src/lib/persistence/sqlite-task-end.store.ts:118`.** The store is 793 lines and carries journal, run, step, census, and row loading operations in one class. It remains one persistence boundary, but locating a transaction's related reads and writes is harder. Move the pure row mapping and SQL statement groups into focused local modules if the store grows again; preserve the single transactional entry points.

Public exports are type-only where appropriate (`src/index.ts:9-44,52-54`), host ports remain outside the feature implementation, the read path is focused (`read/task-end-run.reader.ts:31-65`), and DI registration resolves no host port until connection (`di/register.ts:34-36,100-107`). The minor issues do not warrant revision. The score is below 9–10 because the registration contract is inaccurate and the store is large; it is above 5–6 because the layering and public surface remain clear.

## Decisions

- **Treat an abort as resumable.** Options: record terminal curator failure or preserve the step for restart. The worker and plan promise unfinished steps resume (`worker/task-end-run-worker.ts:167-170`, plan Component 5); preserving it is reversible and recommended. L1 records the current contradiction.
- **Treat ambiguous exit 128 as unresolved.** Options: classify every empty-stdout exit as `nogit`, or inspect stderr and accept only the explicit non-repository fatal message. The current resolver caches the first result (`trigger/repository-identity.ts:110,147-160`) and D34 notes dubious ownership; precise classification is reversible and recommended. L2 records the effect.
- **Keep the seventh read command outside the git vector gate.** The approved plan's command table lists six git vectors plus `gh pr list`; `ports/read-only-git.ts:118-197` correctly gates the six git vectors. Reversible: yes.
- **Accept expected DI errors as Phase 3 work.** Batch 17 owns host-port bindings; no Phase 2 defect is raised for the 12 listed errors. Reversible: yes.
