# Batch 3 report

## Files changed

- `libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-events.ts`: projects native activity and child terminal status; reuses extracted v1 Task and agent start builders.
- `libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-events.spec.ts`: focused native projection coverage.

## Emitted event shapes

- First native `started`: Task `tool_start` and `agent_start` with canonical card id, then native `agent_status` running.
- Later native activities: one native `agent_status` each; interrupted maps paused, completed maps completed. All use parent session id and card parentToolUseId.
- Native child terminal: one `agent_status` per card/cycle/status, completed or failed; failure message comes only from structured `error.message`. Child output remains nested under the card. No native background events, fabricated usage or lane records.

## Cross-turn instance finding

`codex-chat-turn-stream.ts:331` constructs a new `CodexChatEvents` per parent turn. The projector accepts events only for its construction turn and closes on parent terminal, so its native card set cannot deduplicate across parent turns. Cross-turn deduplication depends on runtime canonical card ids and frontend store. No stream file was edited.

## Tests added

- Started card, parent session, nested child text/tool output, child completion, duplicate terminal, later interaction on the same projector/card, no invented usage and no background events.
- Structured failed child terminal.
- Existing v1 spawn tests retained unchanged.

## Verification

- `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-events.spec.ts`: exit 0; 1 suite, 34 tests passed. Jest printed an ES module config warning before running.
- `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json`: exit 0, no diagnostics.
- `npx eslint libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-events.ts libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-events.spec.ts`: exit 0; two Nx ProjectGraph cache warnings; module-boundary rule skipped.
- `ptah_get_diagnostics` after edits: unavailable; scoped TypeScript check exceeded its 45 s tool timeout. The requested project tsc passed.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Reuse Task/agent start builders | Duplicate shapes; shared local methods | Existing v1 projection in `codex-chat-events.ts:349-369,483-510`; same flat event contract | Yes |
| Hold native card metadata in projector | Per-card map; infer from child terminal | Native terminal lacks activity/cycle identity; `subagentActivity` supplies it | Yes |
| Keep per-turn construction unchanged | Edit stream lifecycle; honor scope | `codex-chat-turn-stream.ts:331` and explicit read-only scope | Yes |

