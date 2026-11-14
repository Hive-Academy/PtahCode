# Independent third review — TASK_2026_1164_216b

**Verdict: REJECT.** The live ownership repair covers its tested write orders, but Electron and CLI drop Codex's discovery continuation argument. With more than 16 Codex files, later files are never scanned. No source was edited; no build, Nx, e2e, or gate command was run.

## Review 2 findings

| Finding | Status | Evidence and test coverage |
| --- | --- | --- |
| Two live Codex owners billable for one thread | **PARTIAL** | `session-stats-repository.ts:331-375` re-evaluates lane and replay rows by native thread in the live write transaction, and `:422-469` updates affected Ptah aggregates. `session-stats-repository.spec.ts:93-119` tests checkpoint-first, lane-first, and a correction that makes a checkpoint unmeasured, with different Ptah IDs and token/cost assertions. `:122-136` tests nonoverlap and Claude isolation. The tests use `codex` only and do not cover a correction that changes the native thread; see finding below. |
| Discovery continuation by numeric index | **PARTIAL** | `usage-reconciliation.service.ts:181-226` saves a path key and limits processing to 16 files, 4 MiB, or 64 yielded paths. `usage-reconciliation.spec.ts:97-164` exercises stable continuation and insertion/deletion, but uses an injected Claude enumerator that honors `startAfter`. Electron and CLI Codex adapters discard that argument (`phase-2-libraries.ts:278`, `container.ts:756`). |
| Reserved discovery cursor identity | **FIXED** | `usage-cursor-repository.ts:106-125,134-137` stores the path key in the reserved row's `last_event_key` and rejects normal load/commit for `(discovery, all-roots)`; `usage-cursor-repository.spec.ts:60-70` exercises isolation. The older index methods remain but do not defeat that guard. |

## New findings

### Blocker — Codex discovery restarts at the newest files forever

`usage-reconciliation.service.ts:186-192` passes `startAfter` into `listCodexFiles`. Both actual host bindings ignore it: `apps/ptah-electron/src/di/phase-2-libraries.ts:278` and `libs/backend/cli-engine/src/lib/container.ts:756` call `listCodexRolloutFiles(root)`, although its second parameter controls the lexical boundary (`codex-rollout-usage.reader.ts:86-96`). After the first 16 files, each pass sees those same 16 again, reaches the 17th, saves the unchanged key, and stops. Older rollouts are permanently absent from the ledger and repeated reads consume main-process work. **Fix:** forward `(root, startAfter)` in both bindings; add host-wiring tests with at least 20 Codex files across passes, including insertion/deletion around the saved path. The reader's start-after unit test alone does not exercise these bindings.

### Serious — moving a corrected checkpoint leaves the old thread suppressed

`session-stats-repository.ts:282-335` overwrites `native_thread_id` and derives only the **new** `liveCodexThread`; `:336-375` re-evaluates only that thread. If a revision corrects a checkpoint from thread A to B, A's lane remains `billable=0` and A's replay remains demoted, while B is re-evaluated. `:422-469` likewise omits A's Ptah aggregates. This loses measured usage after a valid identity correction. **Fix:** capture the prior native thread/run ID before upsert, re-evaluate both old and new threads and their affected session aggregates in the same transaction; test A→B with distinct Ptah IDs, replay rows, both provider IDs, and token/cost totals. Existing correction test (`session-stats-repository.spec.ts:113-118`) keeps the same thread.

### Moderate — incomplete large files wait for a full discovery sweep

`usage-reconciliation.service.ts:206-215` advances the path key before scanning. When a file reaches the 4 MiB pass cap with `complete=false`, the next pass starts **after** that path (`:186-188`), so its remaining bytes are revisited only after the whole tree resets the key (`:225-226`). On a large profile this can delay historical usage materially; the current tests do not exercise a 4 MiB partial file. **Fix:** preserve an inclusive resume key for incomplete files, or keep a separate pending-file cursor, and test a file larger than the pass cap. The per-file byte cursor already allows safe continuation.

### Moderate — one directory can exceed the discovery budget

Electron and CLI Claude enumerators materialize and sort an entire directory (`phase-2-libraries.ts:85`, `container.ts:324`); Codex does the same for a day (`codex-rollout-usage.reader.ts:93`). The 64-path limit applies only after paths are yielded (`usage-reconciliation.service.ts:189-195`). A very large directory can therefore delay the Electron main process before the first yield. This is a performance limitation with plausible latency impact, but no concrete profile size or observed stall establishes a release blocker. **Fix:** use paged directory traversal or a persisted directory index if strict per-pass latency is required.

## Five logic questions

1. **Silent failure:** Codex's dropped continuation repeats the first page and leaves older usage missing (`phase-2-libraries.ts:278`, `container.ts:756`; `usage-reconciliation.service.ts:186-192`).
2. **Unexpected user action:** opening a dashboard after a large Codex history scan shows incomplete totals because older rollouts never reach `scanFile` (`usage-reconciliation.service.ts:189-210`).
3. **Wrong input answer:** correcting a checkpoint's thread ID leaves the old thread's lane/replay ownership stale (`session-stats-repository.ts:282-375`).
4. **Dependency failure:** a failed file read logs and retains its byte cursor (`usage-reconciliation.service.ts:230-254`); it is retried after discovery wraps.
5. **Missing requirement detail:** the 4 MiB budget does not specify whether an incomplete file resumes on the next pass; current path advancement delays it (`usage-reconciliation.service.ts:206-226`).

## Verification and decisions

Read both earlier reviews, both fix reports, the task ownership/performance contract, the revised repository/reconciler/cursor code, host bindings, and focused tests. The fix report records passing scoped Jest and TypeScript checks; I did not rerun them while the gate runs. Scoped `ptah_get_diagnostics` was unavailable after a 45-second TypeScript timeout, so this review makes no fresh type-check claim. No new `any`, `@ts-ignore`, `as unknown as`, `console.*`, or silent catch was found in the inspected repaired logic. No skill-loading tool was exposed for this lane. The one-directory issue is moderate given concrete directory materialization but no demonstrated stall. The verdict follows from deterministic Codex pagination starvation in both actual host bindings.
