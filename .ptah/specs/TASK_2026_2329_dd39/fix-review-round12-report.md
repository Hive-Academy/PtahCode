# PR #1517 · CodeRabbit round 12

## PRRT_kwDOPngTds69D2zT — Fixed

The shared row filter admitted future timestamps before lane funnel aggregation. It now enforces the inclusive evidence window. The focused spec covers unclassified rows just outside both bounds and exactly on each bound.

- `libs/backend/lane-routing/src/lib/matrix/choice-evidence.ts`
- `libs/backend/lane-routing/src/lib/matrix/choice-evidence.spec.ts`

PR reply — Lane funnels now exclude future runs and include runs ending exactly at either evidence-window boundary.

## PRRT_kwDOPngTds69D2zW — Fixed

The after-render effect marked the target handled and emitted consumption even when setup was blocked. It now tracks setup readiness and whether a wizard is already open, keeping the target pending until it can open the requested wizard. The focused spec checks that no consumption occurs during connection and scope loading or other setup gates, and that recovery opens the wizard automatically and emits once.

- `libs/frontend/chat/src/lib/settings/providers/providers-settings.component.ts`
- `libs/frontend/chat/src/lib/settings/providers/providers-settings.component.spec.ts`

PR reply — Connect a provider requests stay pending through loading and are consumed once the setup wizard opens.

## Checks

- Focused Jest passed all 114 tests across the two changed specs (102 for Providers settings and 12 for choice evidence).
- `git diff --check` passed.
- TypeScript `--noEmit` passed for Electron, the renderer, the lane-routing spec configuration, and the chat library.
- The chat spec TypeScript configuration exited 2 with existing fixture and compiler-target errors. The diagnostics in the changed Providers spec point to existing fixture declarations and assignments. No diagnostic points to a changed line.
- ESLint passed on the four changed TypeScript files with the existing `max-lines` warning in `providers-settings.component.ts`.
- Ptah reported a partial dependency index. A local `rg` search confirmed the direct source callers.
- Native skill invocation was unavailable in this lane. I read the repository’s Angular frontend patterns skill directly.
- Electron visual verification was unavailable because Ptah reported no active browser session and starting the app was outside the permitted commands.
