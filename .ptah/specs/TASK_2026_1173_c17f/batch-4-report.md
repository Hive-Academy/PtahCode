# Batch 4 report

## Files changed

- `libs/backend/agent-sdk/src/lib/codex-app-server/codex-history-projector.ts`: native card discovery, canonical child linkage, cycle projection, and child terminal statuses.
- `libs/backend/agent-sdk/src/lib/codex-app-server/codex-history-projector.spec.ts`: history regression cases.
- `libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-events.spec.ts`: separate-parent-turn live regression cases.

## Emitted history event shapes

The first native `started` item emits Task `tool_start`, `agent_start`, and native `agent_status` on the first activity id. Further activity emits `agent_status` on that card with `native: { provider: 'codex', agentThreadId, activityId, cycleId, cycleOrdinal, kind }`. Child messages and tools carry the card as `parentToolUseId`. Child terminal status uses the bound cycle and structured `error.message` on failure. Every event uses the supplied parent session id. History `stats` remains `null`; no background agent events or synthetic transcript are emitted.

## Tests added

| Case | Test |
| --- | --- |
| 1 | Parent session asserted for every projected event. |
| 2 | Repeated projection yields identical events and canonical card/agent identifiers. |
| 3 | Two parent turns and two child cycles retain one Task card and one agent start; final status completed. |
| 4 | Parameterized completed/failed persistence with a parent-only follow-up; failed uses structured error message. |
| 5 | Missing child thread retains card, no child text, stats null. |
| 6 | Two live projector instances reuse card, parentToolUseId, agentId, and parent session; interacted emits status but no tool or agent start. |
| 7 | Parent-only activity on the next live projector emits no native status. |

## Verification

- `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/codex-app-server/codex-history-projector.spec.ts libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-events.spec.ts`: 2 suites, 59 tests passed (exit 0), including the final thread-order assertion.
- `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json`: passed, exit 0 after final edit.
- `npx eslint libs/backend/agent-sdk/src/lib/codex-app-server/codex-history-projector.ts libs/backend/agent-sdk/src/lib/codex-app-server/codex-history-projector.spec.ts libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-events.spec.ts`: passed, exit 0 after final edit.
- `ptah_get_diagnostics`: unavailable; scoped compiler check exceeded 45 seconds. Focused TypeScript command passed.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Preserve canonical card from first started item | First started id; per-turn id | Plan contract and runtime seed behavior | Yes |
| Project parent before descendants | Snapshot order; root-first order | Child terminals need the activity cycle and card | Yes |
| Emit child terminal from history turn | Mapper-only replay; direct status | History child projector has no parent native card state; turn has structured status/error | Yes |

## Limitations found

- Pinned binary replay of `thread/read` remains unconfirmed; fixtures use the pinned schema shape.
- A missing descendant read cannot distinguish an absent transcript from an empty one in the event stream; the parent card remains visible and no child text is invented.
