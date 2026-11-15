# D3: reports and children lost after parent handoff

## Executive summary

Child ownership is stored as a parent tab/SDK ID on each child record, while report delivery tests that recorded parent ID directly against adapter liveness. A parent handoff creates a new parent session, but successor creation, child reparenting, and acknowledgement-record persistence are separate steps. If adoption is skipped, reverted after a timeout, or faults, children remain assigned to the predecessor; once it closes, their reports are refused as `parent-session-not-active` and are not queued for the successor. The successor's `handoff_ack` can independently say `handoff record missing` because the durable acknowledgement record is written only after successful startup and its write failure does not undo the handoff.

## Code locations

- `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts:363-469` — parent handoff provisionally calls `adoptWork`, awaits startup under a deadline, reverts adoption on timeout/failure, and writes the acknowledgement record only after success; record-write errors are logged and swallowed.
- `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts:567-643` — child inheritance is a best-effort loop over `registry.childrenOf([caller.tabId, caller.realSessionId])`; an exception leaves remaining children with the old parent, and a failed/timed-out start reparents children back.
- `libs/backend/cli-agent-runtime/src/lib/session-children/session-child.registry.ts:330-357` — ownership is represented by `parentSessionId` and optional `parentSdkSessionId`; `reparent` is the operation that changes them.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-report-router.service.ts:573-607,626-651` — child reports use the first recorded parent ID, refuse if it is inactive, and only send to that ID. Refusal increments a counter; the report body is not held for a successor.
- `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts:215-230` and `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.store.ts:100-126` — acknowledgement requires a stored predecessor record; lookup returns missing if no record was persisted.
- `libs/backend/rpc-handlers/src/lib/handlers/session-handoff-rpc.handlers.ts:39-106` — the handoff-chain RPC only reads lineage; it does not migrate child ownership or provide a report fallback.

## Specific defect cause

Handoff has no atomic commit spanning the new chat session, child registry, report routing, and acknowledgement store. A successor can exist without inherited children or a durable ack record. The report router does not follow handoff lineage and deliberately does not try another recorded parent when the first is inactive. Consequently reports addressed to the closed predecessor are rejected rather than delivered to the successor. `refused: handoff record missing` is the corresponding persistence gap: `acknowledgeOnce` has no record to find because `guardAndStart` saved it after launch, conditionally, and treated save failure as nonfatal. The observed missing children and missing acknowledgement are therefore two effects of the same non-atomic handoff, while report loss follows from fixed parent-ID routing.
