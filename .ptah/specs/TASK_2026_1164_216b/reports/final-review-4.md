# Independent fourth logic review — TASK_2026_1164_216b

**Verdict: REJECT.** One continuously growing or otherwise never-completing transcript can indefinitely prevent discovery of every other file. This has direct missing-usage impact. Source files were not edited; no Nx, build, e2e, or gate command was run.

## Review-3 findings

| Finding | Status | Evidence and real-path coverage |
| --- | --- | --- |
| Codex `startAfter` dropped by Electron/CLI | **FIXED** | Both hosts bind the exported `listCodexFiles` directly (`apps/ptah-electron/src/di/phase-2-libraries.ts:77,278`; `libs/backend/cli-engine/src/lib/container.ts:114,756`). That function forwards the argument (`codex-rollout-file-source.ts:4-5`) to the actual reader's lexical filter (`codex-rollout-usage.reader.ts:86-96`). `codex-rollout-file-source.spec.ts:12-32` uses 21 real files, a deleted saved path, and a newer insertion. It tests the shared binding function, though not host composition itself. |
| A→B checkpoint correction leaves A suppressed | **FIXED** | The transaction reads prior thread IDs before upsert (`session-stats-repository.ts:278-283`), re-evaluates old and new threads and gathers their sessions (`:337-383`), then recomputes affected session totals (`:429-477`). `session-stats-repository.spec.ts:122-153` tests both Codex provider IDs, separate lane/replay Ptah sessions, ownership, tokens, and costs. Claude rows are excluded by the Codex provider and source filters (`:343-345,362-382`). |
| Incomplete >4 MiB file waits for full sweep | **FIXED** | On the cap, discovery saves `pending: true` (`usage-reconciliation.service.ts:227-234`); the next pass scans that file first from its stored byte cursor (`:178-193,248-264`). `usage-reconciliation.spec.ts:121-141` exercises five 1 MiB chunks across two passes, though it uses a synthetic collector. |

## New finding

### Serious — pending file can starve the rest of the ledger indefinitely

`usage-reconciliation.service.ts:178-193` always enters the pending branch first and returns after scanning that single file. If it supplies at least another 4 MiB with `more=true` on each pass, `:184-186` persists the same pending discovery key and returns again; `:198-245` never runs. Thus a busy append-only transcript can leave other Claude and Codex files unseen indefinitely, despite the per-pass byte cap. `usage-reconciliation.spec.ts:121-141` tests only a file that becomes complete on its second pass. **Fix:** after a bounded pending-file slice, rotate to normal discovery while retaining a separate byte cursor and retry key; cap consecutive pending-only passes. Test a collector that remains incomplete across multiple passes alongside another file and verify that the other file is scanned. This is a release blocker because the feature promises coverage across all profiles and providers.

## Other boundary checks

- A failed pending read returns `complete=false` with fewer than 4 MiB, so the pending flag is cleared and the next path can be reached (`usage-reconciliation.service.ts:248-272,178-193`). A deleted pending file is likewise cleared on `ENOENT`/`ENOTDIR` (`:188-193`); the saved path remains a valid exclusive `startAfter` boundary (`:203-205`). These cases lack focused pending-key tests.
- The affected-session set includes the old and new live threads plus their replay sessions, and updates occur within the repository transaction (`session-stats-repository.ts:278-283,342-383,429-477`). The A→B test checks every affected Ptah session's totals (`session-stats-repository.spec.ts:122-153`).
- Timers are cleared on stop (`usage-reconciliation.service.ts:93-110`) and pass work yields between chunks (`:253-264`). The accepted large-directory sort limitation remains (`codex-rollout-usage.reader.ts:93`). New production diff lines showed no `any`, `@ts-ignore`, `as unknown as`, `console.*`, or deep `/src/` alias imports. Added double-cast occurrences were in specs.

## Five logic questions

1. **Silent failure:** other sources remain undiscovered while a pending file repeatedly fills the pass budget (`usage-reconciliation.service.ts:178-193`).
2. **Unexpected action:** an active, rapidly growing transcript can make unrelated dashboard totals permanently incomplete (`:184-186,198-245`).
3. **Wrong input:** corrected native thread A→B now re-evaluates both ownership sets (`session-stats-repository.ts:278-383`).
4. **Dependency failure:** missing or unreadable pending files do not trap discovery (`usage-reconciliation.service.ts:188-193,265-272`).
5. **Missing requirement detail:** no fairness policy bounds how many consecutive passes one incomplete file can own (`:178-193`).

## Verification and decisions

Inspected review 3 and its fix report, task context and ownership/performance contract (`batches.md:748-760`), changed-path diff, host bindings, collectors, repository SQL, and focused specs. The fix report records passing focused Jest, TypeScript, and ESLint checks; I did not rerun them while the gate was active. `ptah_get_diagnostics` was unavailable after a 45-second scoped timeout; this leaves current compiler status unverified here. Decision: classify indefinite discovery starvation as serious because it causes missing usage; the accepted one-directory sort remains moderate and is not a blocker. No matching skill was listed for this logic review.
