# TASK_2026_2179_c70e — handoff ack "handoff record missing"

Relates to: TASK_2026_1168_7335 (agent permissions program; seen in its cleanup tail).
Branch: fix/handoff-ack-record-missing. Workflow depth: Partial (2-4 files + specs).

## Problem
`ptah_session_handoff_ack` returns `refused: handoff record missing` again and again. The
predecessor then never closes, because the tool text says not to retry a refused result.

## Root cause (verified in code)
- Only emitter: `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts:389`.
- A real miss returns retryable `handoff record not yet available` (`:298-299`), so the first read
  (`:281`) found a `recorded` record. Then `compareAndSet` (`:380`) returned false and a second
  `findByPredecessor` (`:387`) found nothing -> final `refused`.
- `SessionHandoffAckStore` (`session-handoff-ack.store.ts:48`) uses `WORKSPACE_STATE_STORAGE`.
  In Electron/CLI this is `WorkspaceAwareStateStorage` (vscode-core), which selects the delegate of
  the active workspace at call time. Each store call re-reads, so reads in one ack can hit
  different workspace documents. The record stores `workspaceRoot` but the store ignores it.
- Full lane report: main checkout `.ptah/tmp/handoff-ack-missing-record-report.md`.

## Plan
1. Atomic store `transition(predecessorTabId, from, patch)` -> `'moved' | 'already' | 'missing'`
   in one serialized read-modify-write. Service uses it at `:379-390`. `missing` -> retryable +
   Logger warning with predecessor id, record workspaceRoot. No more terminal refusal there.
2. Pin the store to the record's workspace: when the storage has `getStorageForWorkspace` /
   `getAllWorkspacePaths` (structural guard, no vscode-core import), writes and CAS for a record
   use `record.workspaceRoot`; lookups search active storage first, then other known workspaces.
3. Specs for both.
