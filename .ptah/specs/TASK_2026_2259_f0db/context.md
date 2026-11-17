# TASK_2026_2259_f0db — PR A (data fixes) of the settings fix program

Program: TASK_2026_1177_9109. Gap analysis: TASK_2026_2255_53ce (sections 2.3, 5 steps 1-2, 6).

## Scope (three items only)

1. fix(chat): keep the lanes matrix visible on partial data.
   - `agent:getConfig` data reaches `cliMatrixRows` without validation. In the e2e capture
     profile the renderer threw `e.detectedClis is not iterable`.
   - Parse at the boundary (`ProvidersSettingsStateService.refreshOrchestration`) with Zod.
     A missing or non-array value becomes `[]` and is recorded as missing.
   - Rows that can render, render. Missing data shows as one `.ptah-table-message-cell` row.
2. fix(chat): keep uninstalled lanes in the saved order.
   - `moveLane` swaps ids inside the full saved `preferredAgentOrder`.
   - Backend (`agent-rpc.handlers.ts` getConfig/setConfig): no normalization. setConfig stores
     the array verbatim, getConfig reads it back with a default of `[]`.
3. Screenshot fixture: `apps/ptah-electron-e2e/src/design-preview/settings-lanes.shot.ts`
   with mocked RPC data (installed lanes, one uninstalled lane, one Ptah CLI instance,
   connections). Used by PRs B and D.

## Out of scope

Layout, widths, tokens, `lanes-table.component.ts` layout (PR B), `libs/frontend/ui` table
files (PR C).

## Executors

- Lane `codex` A: items 1 and 2 (libs/frontend/chat, libs/frontend/core).
- Lane `codex` B: item 3 (apps/ptah-electron-e2e/src/design-preview).
