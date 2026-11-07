# Phase 3 review

## Logic

Verdict: REVISE  
Score: 6/10

1. **L1 — Serious — `libs/backend/task-end-hook/src/lib/task-end-hook.integration.spec.ts:508-511`.** `splice(0)` empties `h.boots` before the next loop, so `awaitStopped()` is never called. The test then closes SQLite while a detector, worker, or census continuation may still be settling, especially after an early assertion failure. This can leak handles or turn a real lifecycle defect into a later test's intermittent failure. Save the removed boots in a local array, dispose each, await each `handle.awaitStopped()`, then close the database; restore real timers in a `finally` even if cleanup rejects.
2. **L2 — Moderate — `libs/backend/task-end-hook/src/lib/task-end-hook.integration.spec.ts:526-530`.** The filesystem spies are installed after `endTask`, which writes the carrier, fires the index event, advances debounce, and waits for detection. Thus the advertised zero-mutating-fs assertion does not cover the full detection-to-completion run. Keep fixture writes outside the spy window, then install spies before firing the terminal index event. The fake git captures its calls and the read-only allow-list is asserted at lines 565-578; that side of the claim is covered.

### Five logic questions

1. **Silent failure:** an unregistered engine rejects inside the lazy port call and the step records its closed failure code (`apps/ptah-electron/src/di/task-end-hook-composition.ts:202-210,223-250`); no success-looking result was found there. The spec's teardown silently skips its intended await (L1).
2. **Unexpected user action:** ending a task while the app shuts down aborts reconciliation and disposes the hook (`apps/ptah-electron/src/activation/task-end-hook.activation.ts:55-70`); shutdown waits up to five seconds before SQLite close (`apps/ptah-electron/src/activation/shutdown.ts:409-419`). The unfinished run is recoverable by the worker on restart. The integration spec's early-failure path is not safe (L1).
3. **Wrong input answer:** `harvestTask` rejects a task id containing separators, dot segments, or NUL and checks the real specs root (`libs/backend/skill-synthesis/src/lib/spec-harvester.service.ts:207-223`). Main's `SpecSkipCache` is used only by the directory scan at lines 467-496; the single-task path uses `extractSpec` directly, so a stale skip entry cannot hide it. No wrong-answer case found in this boundary.
4. **Dependency failure or malformed result:** `curateSessionForTaskEnd` returns a closed `threw` result through its outer catch and releases an acquired claim (`libs/backend/memory-curator/src/lib/triggers/memory-trigger.service.ts:723-735`); the pass catch also returns a closed result (`:1276-1294`). A `null` curator reason maps to the step fallback rather than raw error text (`apps/ptah-electron/src/di/task-end-hook-composition.ts:111-148`). TypeScript exhaustiveness covers the declared reason unions, not malformed runtime data from an untyped provider.
5. **Unspecified case:** the spec does not prove absence of filesystem mutation during detection, and its failed-assertion cleanup can close the DB before asynchronous work settles (L1-L2). Both need test coverage even though the happy-path record is asserted.

### Risk checks

- **Batch 16:** `harvest()` still counts `harvested` and `marker-failed` at `spec-harvester.service.ts:172-182`; both paths share `harvestCompletedSpec` at `:241-277`. `harvestTask` containment and the merged skip cache are checked above. Curation has a total catch and claim cleanup at `memory-trigger.service.ts:646-735`, with no raw error in its return type. `failedPasses` is cleared after `ran` or the retry cap at `:1222-1257`, and on session-end teardown at `:1051-1059`; a stalled session can retain one counter entry until teardown. This is bounded by session count and matches D32, so it is not a Phase 3 defect.
- **Batch 17:** engine resolution occurs inside port methods (`task-end-hook-composition.ts:223-295`); reason mapping is exhaustive in both directions (`:87-109`); `execGit` is called without an `env` override (`:451-463`), preserving its `LC_ALL=C` default. `AbortSignal.any` joins the census signals at `:281-295`; it does not add explicit listeners in this adapter. Activity probes use live lifecycle records and tracked agent working directories (`:369-415`). Ports register before the library at `:475-500`, and composition is called during phase 2 before the API builder. The PR lookup is the only `gh` read (`:419-443`); no fetch vector is introduced.
- **Batch 18:** `taskEndHookClaimed` is set synchronously before the awaited start (`boot-heavy-services.ts:186-189,526-536`), giving one process attempt across roots. Reconcile abort and idempotent dispose are at `task-end-hook.activation.ts:54-79`. Shutdown calls dispose and gives `awaitStopped()` a 5 s budget before SQLite close (`shutdown.ts:275,409-419`). Activation logs fixed errors at `task-end-hook.activation.ts:46-50,70-76`; no secret text is interpolated there.
- **Batch 19:** the git fake and allow-list assertion cover every recorded git vector (`task-end-hook.integration.spec.ts:565-578`). The filesystem spy starts too late (L2), and teardown never awaits the stopped handles (L1). `afterEach` normally restores real timers and closes the DB at `:507-514`, but an exception in cleanup skips timer restoration.
- **Binding decisions:** the record asserts literal `effectiveMode: 'off'` (`task-end-hook.integration.spec.ts:557-563`), and the reviewed Phase 3 production code has no delete, move, archive, or `git fetch` path. The already reviewed disposal evaluator retains the cancelled-task and untracked-file gates; Phase 3 calls it through its existing port contract.

## Style

Verdict: APPROVED  
Score: 8/10

No new style defect. The new public engine methods have typed, closed results and keep host integration behind ports (`spec-harvester.service.ts:207-233`; `memory-trigger.service.ts:646-735`; `task-end-hook-composition.ts:223-295`). The 1,795-line memory trigger is an accepted pre-existing size issue under D32; a split is outside this phase. The style score is below exemplary because the large existing service and 501-line composition still raise navigation cost, but above the real-gap band because responsibilities and contracts are explicit.

## Decisions

- **Accept the `failedPasses` lifetime.** Options: split or evict entries immediately; retain D32's retry state. Evidence: `memory-trigger.service.ts:1222-1257,1051-1059`; it is at most one counter per session and necessary for retry behavior. Reversible.
- **Accept the one-process start claim.** Options: retry on a later root after a failed start; claim once per process. Evidence: `boot-heavy-services.ts:186-189,526-536` and Batch 18 acceptance explicitly require once per process. Reversible.
- **Accept `AbortSignal.any` in the census adapter.** Options: manual listener wiring; native signal joining. Evidence: `task-end-hook-composition.ts:281-295`; there is no manually retained listener in the adapter. Reversible.

## Evidence and limits

Read the supplied Phase 3 diff, current source and integration spec, plan Components 7a/7b, 10 and 12, Batches 16-19 and their D32-D39 decisions, repository instructions, and the existing style review. The team-leader's batch notes report scoped verification; I did not rerun it under this review's read-only command restriction. `ptah_get_diagnostics` was requested for the five principal changed files, but its TypeScript check was still running after 45 seconds and returned all five unchecked. No Nx, npm, npx, git, build, or test command was run.
