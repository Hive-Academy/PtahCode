# Batch A4 report

## Files changed

- `libs/frontend/chat-state/src/lib/tab-manager.service.ts`: awaitable exact-binding close helper and programmatic confirmation skip.
- `libs/frontend/chat-state/src/lib/tab-manager.cross-workspace.spec.ts`: cross-workspace exact-pair coverage.
- `libs/frontend/chat/src/lib/services/auto-handoff-source-closer.service.ts` and its spec: host-ack close, safety checks, and result RPC tests.
- `libs/frontend/chat/src/lib/services/chat-message-handler.service.ts`: registered `SESSION_HANDOFF_CLOSE_PREDECESSOR` alongside `SESSION_HANDOFF_OPENED` (additional registration file).
- `libs/frontend/chat/src/lib/services/agent-session-adoption.service.ts` and its spec: removed early-open arm call and expectations, per parent decision 14.
- This report.

## Preserve list

The predecessor close still goes through TabManager's normal close event and session-end path, across active and background workspaces. The prior TASK_2026_863 safety blockers now run on the host close request: streaming/resuming/switching state, non-loaded state, dirty input, queued follow-up, background work, pending permission prompt, and Command Center origin. A blocker leaves the tab open, logs the reason, and replies false. The adoption and canvas focus path on `sessionHandoff:opened` remains. History is not deleted or archived.

## What was implemented

The handler validates the incoming payload, finds only the exact predecessor tab ID and SDK binding, awaits TabManager's close, and replies through `ClaudeRpcService` with `session:handoffCloseResult`. It sends no explicit `chat:abort`; the backend has already stopped the predecessor before pushing this message (parent decision 14). The old automatic arm-on-open machinery was removed.

## Verification

- `ptah_get_diagnostics` after the final edit: no diagnostics in the requested changed files; 341 errors reported in unrelated sibling files by the broader TypeScript scan.
- `npm run verify -- -p @ptah-extension/chat-state,@ptah-extension/chat 2>&1 | Select-Object -Last 80`: PASS, exit 0. Lint/typecheck: 4 succeeded (2 cached). Test: 2 succeeded (1 cached). The prior run failed because eager closer injection made `ChatMessageHandler` tests construct unrelated dependencies; lazy resolution on the close message fixed it.

## Decisions

- Apply the existing safety blockers at acknowledgement time. Alternative: leave eligibility checks armed on `sessionHandoff:opened`. Evidence: parent decision 14 and host message timing. Reversible: yes.
- Remove the explicit abort. Alternative: send a second abort from the UI. Evidence: backend stops execution before sending the close request; normal tab close event still runs. Reversible: yes.

## Proposed Removals

- `sessionBudget.closeSourceAfterAutoHandoff` is now unused by this close path. Leave the setting in place pending a separate scope decision.

## Handoff

Decision 14 is applied. The close request retains safety blockers and uses the ordinary tab close event. Scoped verify passes. The setting named under Proposed Removals remains untouched. Skill discovery was unavailable in this lane.
