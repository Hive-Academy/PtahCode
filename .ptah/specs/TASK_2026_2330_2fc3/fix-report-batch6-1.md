# Batch 6.1 fixes

Source and spec references are relative to `libs/frontend/setup-wizard/src/lib/services/`.

## Defects

1. **Attempt identity.** Register a local attempt before sending retry or regenerate. Defer state updates during the request and reread the accepted run afterward. Reads that began before the attempt cannot apply to it, even with the same checkpoint ID. `setup-run-attempt.ts:140`, `setup-run.store.ts:1013`.
   - `generation-run-event-adapter.spec.ts:286` — “rereads $workflow after deferred acceptance of $nextId” covers guidance with a new ID and agents with a reused ID.

2. **Detached terminal recovery.** An inconclusive verification makes the current run eligible for the shared poll. Progress pushes and empty poll replies preserve fallback until the run settles. Verification from an earlier attempt cannot re-enable the poll. `setup-run.store.ts:405`, `setup-run-attempt.ts:177`.
   - `generation-run-event-adapter.spec.ts:516` — “restores detached polling after %s terminal verification” covers rejected, missing, running and malformed results. It verifies unseen completion and that polling stops.
   - `generation-run-event-adapter.spec.ts:611` — “does not enable polling for a retry after the previous attempt misses terminal verification”.

3. **Transition ordering.** Streams, verified pushes and poll results use the same attempt and run identity guard. Terminal observations are idempotent, and a late running result cannot reopen a settled record. `setup-run-attempt.ts:161`, `setup-run.store.ts:383`, `setup-run.store.ts:771`, `setup-run.store.ts:815`.
   - `generation-run-event-adapter.spec.ts:392` — “keeps B settled after a delayed stream or terminal push from A”.
   - `generation-run-event-adapter.spec.ts:570` — “ignores a running poll reply after a terminal push settles the same run”.
   - `generation-run-event-adapter.spec.ts:591` — “preserves B established by a push while an unbound poll for A is in flight”.

4. **Blocked owner.** Keep the owner's ID on the attempted start so `whenStarted` resolves the current owner's record before and after settlement. Existing owners must match the workflow and workspace. A same-ID owner resolves the existing backend run through a fresh binding lookup while deferring late pushes. `setup-run.store.ts:318`, `setup-run.store.ts:425`, `setup-run.store.ts:1036`.
   - `setup-run.store.spec.ts:1331` — “redirects a blocked rerun before and after settlement”.
   - `setup-run.store.spec.ts:1368` — “refuses a blocked owner with a foreign binding (%j)” covers each binding field.
   - `setup-run.store.spec.ts:1392` — “tracks a same-id blocked owner as the existing run”.

5. **Envelope validation.** Check push type against workflow, validate supplied lifecycle fields and run identity, and reject malformed events before adoption or poll changes. Verify the RPC result's binding, source and lifecycle before applying it. `generation-run-event-adapter.ts:36`, `setup-run-attempt.ts:84`, `setup-run-attempt.ts:102`.
   - `generation-run-event-adapter.spec.ts:637` — “rejects malformed envelopes before adoption or poll suppression”.
   - `generation-run-event-adapter.spec.ts:516` — “restores detached polling after %s terminal verification” includes invalid lifecycle, source and run ID responses.

6. **Transcript acceptance.** A focused TestBed harness uses the real message router and both registered handlers. For each stream type, one routed push updates `record-x`, appends once to the corresponding real transcript buffer and calls neither tab factory. `generation-run-event-adapter.spec.ts:235` — “routes %s once to both the record and transcript handlers”.

## Checks

- Focused Jest passed all 4 suites and 177 tests, including both Task 6.2 workflow-store specs. Zero snapshots. `.ptah/tmp/fix-batch6-1-jest.log`.
- TypeScript passed for `setup-wizard/tsconfig.lib.json` with 0 diagnostics. Scoped Ptah diagnostics timed out after 45 seconds with 5 files unchecked. The native TypeScript command supplied the library check. `.ptah/tmp/fix-batch6-1-tsc.log`, `.ptah/tmp/fix-batch6-1-ptah-diagnostics.log`.
- ESLint passed on 5 changed source and spec files with 0 errors and 15 existing warnings. The warnings cover the store's size and 14 non-null assertions in its existing spec. `.ptah/tmp/fix-batch6-1-eslint.log`.
- `git diff --check` passed.
- Final `setup-run.store.ts` line count is **1,221**, down from 1,241 on handoff. The existing 700-line ESLint warning remains.

## Decisions

- Reread after acceptance because agents can reuse a checkpoint ID. Keep attempt identity and poll fallback in memory in `setup-run-attempt.ts`. The accepted run ID can advance the record to a new attempt. Unsolicited observations must match the current live attempt. Bound cancellation uses the same guard for its asynchronous lookup and reply.
- Keep settled owner redirects for the current local start until another start replaces it or the attempted record is dismissed. Match existing owners by workflow and normalized workspace.
- Use the Electron renderer's existing handler registrations in the transcript harness, with the actual wizard transcript buffers and no full-app bootstrap. Keep the six Task 6.2 store signatures stable.
- Applied the repository's Angular developer skill from `.claude/skills`. Codex had no matching registered local skill. The Ptah dependency graph stayed in progress during inspection, so Ptah source search supplied the consumer and registration references.
