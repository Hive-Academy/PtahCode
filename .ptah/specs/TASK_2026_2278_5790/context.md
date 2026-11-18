# TASK_2026_2278_5790 — Settings field info hints

Child "I" of epic TASK_2026_1177_9109. Base: origin/main 8826c7262.

## User decision

Long help text below an input goes behind an info icon at the end of the input (`ptah-field info`,
popover). A hint of one short line stays below the field.

## Plan

1. Codex lane: move long hints to `info` in
   - `libs/frontend/chat/src/lib/settings/ptah-ai/lane-guards-settings.component.ts` (+ `.logic.ts`, spec)
   - `libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-settings.component.ts` (+ spec)
   - `libs/frontend/chat/src/lib/settings/ptah-ai/local-stt-panel.component.ts` (+ spec)
   - `libs/frontend/chat/src/lib/settings/ptah-ai/local-tts-panel.component.ts` (+ spec)
   Session budget fields copy the Context budgets markup of
   `advanced/advanced-settings-group.component.ts` (value left, unit right, info at the end,
   one short range hint).
2. Coordinator: Electron gate shots (before on base, after on head) and a select stacking check
   on Search & Voice and its drawers. A fix, when needed, goes in
   `search-voice-settings.component.ts` plus one trial-click assertion in
   `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings-advanced-search-voice.e2e.spec.ts`.
3. Optional (c) `ptah-select info`: not done. Every select in scope is inside a `ptah-field`,
   which already gives the info button for a projected `ptah-select`. A standalone variant has
   no consumer in this scope.

## Out of scope

Providers files (PR #1419): `ptah-ai/cli-*`, `lanes-*`, `ptah-cli-*`, `agent-orchestration-*`,
`providers/*`, `settings.component.html`.
