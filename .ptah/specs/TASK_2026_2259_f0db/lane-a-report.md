# Lane A implementation report

Implemented both items: partial-data lanes remain visible, and moving installed lanes preserves uninstalled saved IDs.

## Files changed
- `libs/frontend/core/src/lib/services/providers-orchestration-schema.ts`
- `libs/frontend/core/src/lib/services/providers-settings.types.ts`
- `libs/frontend/core/src/lib/services/providers-settings-state.service.ts`
- `libs/frontend/core/src/lib/services/providers-settings-state.service.spec.ts`
- `libs/frontend/core/src/lib/services/providers-settings-state.orchestration.spec.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-matrix-rows.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-matrix-rows.spec.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.component.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.writes.spec.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/move-preferred-agent-order.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/move-preferred-agent-order.spec.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/preferred-agent-order-save.ts`
- `libs/frontend/chat/src/lib/settings/providers/connection-usage.ts`

## Design note
- Zod validates orchestration fields at the RPC boundary using shared lane-default schemas and a detection schema checked against CliDetectionResult; the parser returns ProvidersOrchestration without casts.
- Missing/non-array arrays become []; each valid array element survives independently. Invalid elements flag their containing top-level field.
- missingFields names required missing/invalid fields and invalid optional fields; absent optional scalar fields remain valid. TTL absence still means auto.
- Service reads always populate missingFields; the public property is optional for existing typed consumers/fixtures. Redetection normalizes clis and carries detectedClis validation failures into its orchestration refresh.
- CliMatrixRows.missing combines boundary metadata with guarded non-array fields. Runtime readers and the order-save undo snapshot guard arrays.
- The existing [error] path already renders one .ptah-table-message-cell alongside rows. Partial-data copy uses it; true section errors take precedence. No grid/table/layout/token changes.
- The pure move helper appends missing installed IDs in display order, then swaps installed neighbors inside the full saved list; edge/unknown moves return null and do not save.

## Decisions
- Reused the existing simultaneous message/rows path after inspecting lanes-table.component.ts; no new input or shared table change was necessary (reversible).
- Kept optional absent host scalar settings compatible with older hosts; required invalid scalars receive safe typed defaults and missing-field metadata (reversible).

## Focused verification: exact commands
- `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/settings/ptah-ai/cli-matrix-rows.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/move-preferred-agent-order.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.writes.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.component.spec.ts libs/frontend/chat/src/lib/settings/providers/connection-usage.spec.ts` ? final PASS: 5 suites, 83 tests; first run: 3 suites/65 tests passed, 2 suites blocked by missing worktree node_modules/marked mapping. Repeated after dependency junction repair.
- `npx jest --config libs/frontend/core/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/core/src/lib/services/providers-settings-state.orchestration.spec.ts libs/frontend/core/src/lib/services/providers-settings-state.service.spec.ts` ? final PASS twice: 2 suites, 116 tests each; first run: 115 passed, 1 failed (TTL default/expected metadata), corrected and rerun.
- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json` ? PASS twice, zero errors.
- `npx tsc --noEmit --project libs/frontend/core/tsconfig.lib.json` ? PASS twice, zero errors.
- `npx eslint libs/frontend/core/src/lib/services/providers-orchestration-schema.ts libs/frontend/core/src/lib/services/providers-settings.types.ts libs/frontend/core/src/lib/services/providers-settings-state.service.ts libs/frontend/core/src/lib/services/providers-settings-state.service.spec.ts libs/frontend/core/src/lib/services/providers-settings-state.orchestration.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/cli-matrix-rows.ts libs/frontend/chat/src/lib/settings/ptah-ai/cli-matrix-rows.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.writes.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/move-preferred-agent-order.ts libs/frontend/chat/src/lib/settings/ptah-ai/move-preferred-agent-order.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/preferred-agent-order-save.ts libs/frontend/chat/src/lib/settings/providers/connection-usage.ts` ? PASS: zero errors, one existing max-lines warning.
- `npx eslint libs/frontend/core/src/lib/services/providers-orchestration-schema.ts libs/frontend/core/src/lib/services/providers-settings-state.service.ts libs/frontend/core/src/lib/services/providers-settings-state.orchestration.spec.ts` ? final PASS: zero errors, one existing max-lines warning.

## Limits and open risks
- Scoped ptah_get_diagnostics called twice after edits; unavailable both times after its 45s compiler timeout. Native focused tsc checks passed.
- ESLint skipped module-boundary checking because no cached Nx ProjectGraph exists; Nx was not run per task restriction.
- Existing service remains above 700 lines; this change reduces it by 35 physical lines. Existing oversized service spec changed one expectation in place. New files and changed chat files remain below 700. No audit baseline was edited; no UI classes added.
- Restored local dependency resolution with node_modules junction to D:/projects/ptah-extension/node_modules; no package files changed.
- Component DOM specs verify one message cell plus readable rows. Electron/browser screenshot verification remains outstanding: no running app URL supplied and build/serve/e2e commands forbidden here.
- Skill discovery/loading is unavailable in this lane's invocable tool catalogue; repository conventions and task instructions were followed.
- Parent notification about screenshot coverage was refused with parent-inbox-full; no pending report was retried.
- No git commands, prohibited checks, e2e-folder edits, or shared table-pattern edits performed.
