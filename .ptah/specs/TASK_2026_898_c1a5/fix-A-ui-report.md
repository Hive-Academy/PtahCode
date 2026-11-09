# Phase A UI fix report

## Findings

| Finding | Status | Why | Spec |
| --- | --- | --- | --- |
| 1. Null SDK binding | Fixed | Both the closer and TabManager now require an unset tab session for a null expected SDK id. A bound tab replies false. | `auto-handoff-source-closer.service.spec.ts`: null matching and nonmatching; `tab-manager.cross-workspace.spec.ts`: null background binding cases |
| 2. In-flight cleanup | Fixed | `processingRequests` is cleared in `finally`, including when reply handling throws. | `auto-handoff-source-closer.service.spec.ts`: concurrent duplicate request |
| 3. RPC failure result | Fixed | `replyOnce` checks `RpcResult.success` and logs a failed result or rejection. The request remains answered to preserve one reply per ID. | `auto-handoff-source-closer.service.spec.ts`: RPC rejected and failed result |
| 4. Invalid payload during processing | Fixed | An invalid payload with an in-flight ID is ignored. | `auto-handoff-source-closer.service.spec.ts`: invalid payload with in-flight request ID |
| 5. Handler injection/dispatch | Fixed | The handler catches and logs synchronous injection/dispatch errors. | Covered by scoped typecheck; no new handler spec |
| 6. TabManager caller contract | Fixed | Doc comment limits `closeHandoffPredecessor` to the blocker-checking closer. The real service specs cover background closing and `closeTab(id, true)` skipping confirmation. | `tab-manager.cross-workspace.spec.ts`: background predecessor, skip confirmation |
| 7. Nonloaded states blocked | Intentionally not changed | Decision 16 keeps the safe over-block. | Existing `it.each` blocker cases in `auto-handoff-source-closer.service.spec.ts` |

A missing predecessor now replies `closed:true` so a retry succeeds after the backend has already stopped it. A still-present predecessor with a different binding, a blocker, or a failed close replies false. The 128-entry answered-request eviction has a regression case.

## Verification

Command, run once: `npm run verify -- -p @ptah-extension/chat-state,@ptah-extension/chat 2>&1 | Select-Object -Last 40`.

- `NX   4 tasks: 4 succeeded` (lint and typecheck).
- `NX   2 tasks: 2 succeeded` (tests).
- `lock released after 479.0s, exit code 0`.
- Scoped `ptah_get_diagnostics` was unavailable after a 45-second timeout; the project verification completed successfully.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Keep one reply attempt per request ID and log RPC failures | Retry same ID, or preserve one-reply behavior | Review finding 3 requests an explicit choice; existing request deduplication and one-reply contract | Yes |
| Treat an absent tab as closed | Reply true or false | Task decision 16 and backend completion before UI close | Yes |
| Keep nonloaded states blocked | Broaden eligible states or preserve over-block | Task decision 16 explicitly keeps finding 7 | Yes |
