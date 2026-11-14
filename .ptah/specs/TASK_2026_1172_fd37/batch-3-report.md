# Batch 3 report

## Files changed

- `libs/backend/rpc-handlers/src/lib/handlers/agent-config/cli-lane-defaults-config.spec.ts` (new): focused fake configuration store regression tests.
- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-provider-card.component.ts`: renamed the fixed note row and added the requested explanatory title; badge unchanged.
- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-provider-card.component.spec.ts`: added label and title assertion.

## Tests added

- `reads a saved Codex row ahead of an explicit stale legacy Plan value after reload`
- `uses explicit legacy read-only as Plan only when the Codex row is absent`
- `round trips a non-Codex row without writing the legacy Codex key`
- `labels native CLI behavior separately from the saved Lane default`

The existing `agent-rpc.handlers.set-config.spec.ts` already covers a Codex save writing both keys and rollback when the second write fails (lines 314-347), so that case was not duplicated. The new backend spec uses a local map-backed workspace because the nearby handler harness tests the full RPC surface and would obscure direct read-after-write precedence.

## Checks

- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/handlers/agent-config/cli-lane-defaults-config.spec.ts` — no test result; after ~2 minutes the process had only printed `Warning: Failed to load the ES module: ...\libs\backend\rpc-handlers\jest.config.ts`; stopped the stalled process (exit 1).
- `Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue; npx jest -c libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/handlers/agent-config/cli-lane-defaults-config.spec.ts` — the permitted retry again printed `Warning: Failed to load the ES module: ...\libs\backend\rpc-handlers\jest.config.ts`; stopped the stalled process (exit 1). No backend tests executed.
- `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/settings/ptah-ai/cli-provider-card.component.spec.ts` — exit 1: `FAIL chat ...cli-provider-card.component.spec.ts`; `spawn EPERM` at esbuild `ensureServiceIsRunning`; `Test Suites: 1 failed, 1 total`; `Tests: 0 total`.
- `npx eslint libs/backend/rpc-handlers/src/lib/handlers/agent-config/cli-lane-defaults-config.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/cli-provider-card.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/cli-provider-card.component.spec.ts` — exit 0; only `No cached ProjectGraph is available. The rule will be skipped` warnings from `@nx/enforce-module-boundaries` (three times).
- Scoped `ptah_get_diagnostics` after edits and retry — unavailable: `TypeScript check still running after 45s`; three changed files unchecked. No typecheck pass claimed.

## Decisions

- Retain the existing rollback test rather than repeat it in the new focused spec. Evidence: the handler spec asserts both stored keys return to their previous values when the second write fails. Reversible: yes.
- Put the explanatory title on the row label, preserving the badge's existing detail title and badge text. Evidence: the requested distinction concerns the label users read as a lane setting. Reversible: yes.

## Defect found

No new production defect was exposed. Production settings code was not changed. Test execution is currently blocked by Jest config loading/stalling on the backend and esbuild `spawn EPERM` on the frontend; four added assertions remain unverified by Jest.
