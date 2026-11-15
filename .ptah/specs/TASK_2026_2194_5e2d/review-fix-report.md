# Review fix report

## Changes

- F1: Removed the saved-workspace core filter from effective policy layering. Global and ancestor `on` choices now survive a saved workspace with no core entry. Added global and ancestor regression cases in `plugin-loader.service.capabilities.spec.ts`.
- F2: Added `getWorkspacePluginConfigForWrite` to read the stored workspace layer and preserve core on a first unrelated save only when effective policy enables it. Global and ancestor denies remain off. Updated the capability resolver, external-plugin activation/deactivation, and harness start writers. Added first-save tests for default on, global off, and ancestor off.
- F3: Kept saved empty lists off when no broader policy enables core. Added tests for saved empty policy and an explicit empty save.
- F4: `PluginCatalogPanelComponent.saveConfiguration` now returns while the catalog is loading. Added tests for selected core excluding the deny and saving before load; the existing unticked-core test checks that the deny is sent.
- F5: Added a corrupt workspace-config test that verifies policy remains unknown and the write reader throws.

## Files

`libs/backend/agent-sdk/src/lib/helpers/plugin-loader.service.ts`, `plugin-loader.service.capabilities.spec.ts`; `libs/backend/cli-agent-runtime/src/lib/capabilities/capability-resolver.service.ts`; `libs/backend/rpc-handlers/src/lib/handlers/plugin-rpc.handlers.ts`, `plugin-rpc.handlers.spec.ts`, `harness-rpc.handlers.ts`, `harness-rpc.handlers.spec.ts`; `libs/frontend/chat-ui/src/lib/molecules/setup-plugins/plugin-catalog-panel.component.ts`, `plugin-catalog-panel.component.spec.ts`.

## Checks

- `agent-sdk` capability Jest spec: 25 tests passed.
- `rpc-handlers` plugin Jest spec: passed in combined run (169 passed overall); harness spec passed on rerun (94 tests) after fixture correction.
- TypeScript checks passed for `agent-sdk`, `cli-agent-runtime`, `rpc-handlers`, and `chat-ui` library projects.
- ESLint on nine changed source/spec files: 0 errors, 5 existing warnings (file length and one non-null assertion).
- `chat-ui` Jest spec: blocked by `esbuild` `spawn EPERM` before tests ran.
- Rendered UI screenshot: unavailable because the permitted checks exclude build, serve, and dev targets; the panel's loading and deny behavior was checked through component specs, with the Angular run blocked as above.
