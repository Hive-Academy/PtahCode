# Independent code logic re-review — TASK_2026_1164_216b

**Verdict: REJECT.** The five reported repairs address their immediate cases, but measured Codex checkpoint and lane rows can both remain billable for the same native thread. The discovery budget also bounds files processed while leaving discovery work unbounded. Confidence: high for the ownership defect, medium for performance impact. No source files were edited.

## Earlier findings

| Finding | Status | Evidence and test coverage |
| --- | --- | --- |
| Strict live schema rejected contributions | **FIXED** | `sqlite-session-usage-sink.ts:15-58` accepts native thread, repository, source, coverage and missing-reason fields; `session-stats-repository.spec.ts:94-116` writes lane and SDK-shaped events through the sink into SQLite. |
| Codex replay matched Ptah session ID | **FIXED for observed root threads** | `session-stats-repository.ts:335-356,358-375` matches checkpoint `nativeThreadId`/`runId` and observed lane `nativeThreadId`; `session-stats-repository.spec.ts:74-93` tests distinct Ptah/native IDs with live first, while `usage-cursor-repository.spec.ts:167-183` tests checkpoint before replay. Replay-first Codex and aggregate recomputation with distinct IDs lack a direct assertion. Verified descendants remain outside the implementation's stated evidence. |
| Cursor advanced past rejected events | **FIXED** | `usage-reconciliation.service.ts:223-240` commits the whole chunk once and retains the preceding cursor on failure; `usage-cursor-repository.ts:108-129` parses before committing and rolls back database errors. `usage-reconciliation.spec.ts:78-95` exercises rejection; `usage-cursor-repository.spec.ts:115-119` asserts rollback of cursor and rows. |
| No startup discovery budget | **PARTIAL** | `usage-reconciliation.service.ts:46-48,175-204` caps processed files and read bytes and persists continuation. `usage-reconciliation.spec.ts:97-115` proves 20 stable files resume across passes. It does not bound enumeration to reach the saved numeric index or test the 4 MiB boundary. |
| Empty live models became measured zero | **FIXED** | `sqlite-session-usage-sink.ts:256-285` creates NULL token counters with `billable=false`; `session-stats-repository.spec.ts:119-135` distinguishes that row from a measured zero. Billable aggregates filter on `billable=1` (`session-stats-repository.ts:381-392,612-619`), so the unknown marker contributes no zero tokens. |

## New findings

### Blocker — two measured Codex owners can bill the same thread

`session-stats-repository.ts:331-375` only demotes **replay** rows. When a `codex-checkpoint` and an observed `cli-lane` record the same native thread and overlapping interval, both live rows retain `billable=1` (`:301-329`), regardless of insert order. Their tokens and cost are both included in `session_stats` and workspace groups (`:381-392,612-619`). This violates the checkpoint-over-lane priority in `batches.md:192` and can double charge a normal Codex run. **Fix:** transactionally reevaluate live ownership by native thread and interval on each affected live write, including corrections, then recompute all affected session aggregates. Add checkpoint/lane overlap tests in both orders, with different Ptah session IDs and an aggregate assertion. The new tests at `session-stats-repository.spec.ts:74-93` only test live against replay.

### Major — saved discovery position does not bound discovery work

`usage-reconciliation.service.ts:175-182` increments through every preceding file before reaching `nextFileIndex`; the 16-file cap is checked only afterward. Codex discovery itself walks date directories and sorts every day's entries (`codex-rollout-usage.reader.ts:85-95`). With a large history, later passes repeatedly enumerate the whole prefix, so startup I/O and time grow with history despite the 16-file/4-MiB limits. Inserting a newer file before the saved index shifts the index and may skip an older file until a full sweep resets it (`usage-reconciliation.service.ts:181-184,213-214`); a steady stream of new files can postpone that indefinitely. **Fix:** use a stable source/path continuation key or persisted directory-page state, and apply a discovery work or time budget while advancing it. Test insertion/deletion around the boundary and large-prefix continuation.

### Minor — synthetic cursor identity relies on convention

`usage-cursor-repository.ts:88-105` stores discovery as `(source_id='discovery', source_path='all-roots')` in the same table as real cursors. Current collectors are typed as `claude-jsonl` or `codex-rollout` (`usage-reconciliation.service.ts:15-21`), and exact-key `load` queries keep this row out of source reads, so no present collision or aggregate contamination is evident. The repository accepts arbitrary source IDs (`usage-cursor-repository.ts:97-109`), leaving the reserved identity unenforced. **Fix:** reserve/reject that pair for source commits or give discovery its own table/key namespace. The persistence test at `usage-cursor-repository.spec.ts:60-68` verifies restart only, not isolation.

## Five logic questions

1. **Silent failure:** two live Codex rows remain billable while normal aggregate queries present their sum (`session-stats-repository.ts:331-392`).
2. **Unexpected user action:** opening the dashboard after a checkpointed Codex lane can show duplicate spend if both producers report the run (`session-stats-repository.ts:331-375,612-619`).
3. **Wrong input answer:** adding files ahead of a saved discovery index changes what that index names (`usage-reconciliation.service.ts:181-184`).
4. **Dependency failure:** a rejected chunk leaves its cursor intact and retries later (`usage-reconciliation.service.ts:223-240`); a failed discovery-index save is logged at the root boundary (`:207-210`).
5. **Missing requirement detail:** a processed-file limit does not define a discovery I/O limit or a stable continuation when the file tree changes (`usage-reconciliation.service.ts:175-204`).

## Verification and limits

Read the first review, fix report, ownership/performance contract, changed repository/sink/cursor/reconciler logic and focused tests. The fix report records passing scoped Jest and TypeScript runs; I did not rerun them because the gate is active. Scoped `ptah_get_diagnostics` returned unavailable after its 45-second TypeScript timeout. A focused source scan found no `any`, `@ts-ignore`, `as unknown as`, `console.*`, or empty catches in the repaired persistence/reconciliation paths; catch blocks log or rethrow (`usage-reconciliation.service.ts:139-146,207-210,235-240`; `usage-cursor-repository.ts:126-129`). No skill-loading tool was exposed for this lane.

## Decisions

- Treat the synthetic cursor as a minor reserved-key risk, not an active collision: present collector IDs and exact-key SQL make it distinct. This is reversible by reserving its identity.
- Reject because the written Codex owner priority is not enforced for two live producers. The ownership rule and SQL leave one defensible verdict.
