# Code Logic Review — TASK_2026_2179_c70e, round 5

**Verdict: APPROVED. Score: 8/10.** Both round 4 findings are fixed. No new confirmed behavioral defect was found in these two fixes. The score is above the 5–6 band because the two identified failure paths are closed and scoped checks pass; it remains below 9–10 because the specs do not exhaustively exercise cross-process replacement races or every storage failure timing.

## Round 4 findings

1. **FIXED — settlement can change another successor's `starting` record.** The normal settlement passes `ackRecord.successorTabId` to `compareAndSet` at `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts:750-760`. The late settlement passes `record.successorTabId` at `:1258-1271`. Both objects are built from the successor tab ID (`:737-745`, `:662-669`), and the store rejects an identity mismatch before mutation at `session-handoff-ack.store.ts:360-373`.
2. **FIXED — temporary candidate read failure can create a generation tie.** `session-handoff-ack.store.ts:300-310` obtains the generation maximum with `readCandidates(true)` before the write at `:328`. `readCandidates` throws when any candidate fails in complete mode (`:184-197`). The new spec at `session-handoff-ack.store.spec.ts:121-147` asserts rejection and that the destination document remains unwritten.

## New findings

None confirmed from these two fixes. The stricter candidate read can reject provisional or fallback `record()` calls (`session-handoff.service.ts:568-583, 761-766, 1273-1284`); those callers already catch or retry a rejected write and do not treat an unwritten acknowledgement as persisted. The normal and late settlement arguments refer to their own successor records.

## Five logic questions

1. **How does it fail silently?** A candidate read failure during `record()` now rejects before the new record is written (`session-handoff-ack.store.ts:300-328`). The service reports the rejection (`session-handoff.service.ts:580-582, 765-766, 1277-1283`). No new silent failure was confirmed.
2. **What user action produces unexpected behavior?** Replacing a provisional successor before an older start settles now makes that older settlement return false (`session-handoff.service.ts:750-760, 1258-1271`; `session-handoff-ack.store.ts:366-373`), preserving the replacement.
3. **What input produces a wrong answer?** An unreadable candidate cannot be omitted from the generation maximum for a new write (`session-handoff-ack.store.ts:184-197, 300-310`). No new wrong-answer input was confirmed.
4. **What happens when a dependency fails?** Complete candidate reads reject on any storage failure before `write()` (`session-handoff-ack.store.ts:184-197, 300-328`); the service handles that rejection at its record call sites cited above.
5. **What requirement is missing?** No new requirement gap was established for these two changes. Cross-process interleavings remain outside the three scoped specs.

## Decisions

- **Approve the two fixes.** Options were approve or request another change. The exact successor IDs match the records being settled, and complete candidate reads precede writes. This review verdict is reversible if a new failing interleaving is demonstrated.

## Verification

- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.store.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.service.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.spec.ts` — **PASS**, 3 suites, 105 tests.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json` — **PASS**, exit code 0.
- `ptah_get_diagnostics` for the two changed source files — unavailable while its TypeScript check was still running; the scoped `tsc` command above completed successfully.

Reviewed the round 4 findings, the uncommitted diff for `libs/backend/cli-agent-runtime`, the store implementation and the service paths that create and settle acknowledgement records. This round reports only defects introduced by the two requested fixes; none were confirmed.
