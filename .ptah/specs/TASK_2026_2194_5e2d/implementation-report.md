# Implementation report

## Root cause

`plugin-loader.service.ts:12,2005` treated all bundled plugins as opt-in. Fresh storage normalized to an empty enabled list, so `ptah-core` was absent from the overlay and SDK plugin options (`sdk-query-runner.service.ts:467` logged `pluginCount:0`). Electron's mirror used that same empty configuration (`plugin-activation.ts:292,354`), leaving `/orchestrate` and the orchestration skill unavailable.

## Changes

- `libs/backend/agent-sdk/src/lib/helpers/plugin-loader.service.ts`: distinguishes missing workspace storage value from a saved config. A missing value defaults `ptah-core` on in display, effective layered resolution, and current plugin paths. A saved enabled list without core remains off, including when a broader layer enables core. Explicit deny and enable entries remain authoritative. Other bundled plugins keep opt-in behavior. This shared service supplies Electron, VS Code, and CLI, so no host-specific default was added.
- `libs/backend/agent-sdk/src/lib/helpers/plugin-loader.service.spec.ts`: covers fresh core path in the effective overlay used for SDK plugins, other bundled plugin remaining off, saved empty choice, and explicit disable. Existing explicit-on tests remain green.
- `libs/frontend/chat-ui/src/lib/molecules/setup-plugins/plugin-catalog-panel.component.ts`: saving with core toggled off includes `ptah-core` in `disabledPluginIds`; the panel already checks IDs returned by `plugins:get-config`, which now includes core for fresh storage.
- `libs/frontend/chat-ui/src/lib/molecules/setup-plugins/plugin-catalog-panel.component.spec.ts`: updates the toggle-off payload assertion.

## Behaviour matrix

| Workspace choice | ptah-core | Other bundled plugins |
| --- | --- | --- |
| No saved config | On | Off |
| Saved empty enabled list or explicit `disabledPluginIds` entry | Off | Off unless selected |
| Explicit `enabledPluginIds` entry | On unless denied | Only selected IDs on |

## Migration effect

Existing workspaces with a persisted config, including a saved empty enabled list, keep core off. Workspaces with no saved config turn core on at next resolution. The UI writes an explicit deny when a user turns it off. No storage migration is required.

## Checks

- `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/helpers/plugin-loader.service.spec.ts libs/backend/agent-sdk/src/lib/helpers/plugin-loader.service.capabilities.spec.ts`: passed, 127 tests.
- `npx jest --config libs/frontend/chat-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat-ui/src/lib/molecules/setup-plugins/plugin-catalog-panel.component.spec.ts`: blocked before tests by esbuild `spawn EPERM`.
- `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json`: passed.
- `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.spec.json`: passed.
- `npx tsc --noEmit --project libs/frontend/chat-ui/tsconfig.lib.json`: passed.
- `npx tsc --noEmit --project libs/frontend/chat-ui/tsconfig.spec.json`: failed on existing errors in other specs and shared files; no error was reported in the changed component or its spec.
- `npx eslint libs/backend/agent-sdk/src/lib/helpers/plugin-loader.service.ts libs/backend/agent-sdk/src/lib/helpers/plugin-loader.service.spec.ts libs/frontend/chat-ui/src/lib/molecules/setup-plugins/plugin-catalog-panel.component.ts libs/frontend/chat-ui/src/lib/molecules/setup-plugins/plugin-catalog-panel.component.spec.ts`: zero errors; existing max-lines warnings on the two implementation files. Module-boundary rule skipped because Nx ProjectGraph cache was unavailable.
- `ptah_get_diagnostics` scoped to four changed TypeScript files: unavailable after its 45-second compiler timeout; native TypeScript commands above supplied checks.

## Decisions

- **Default only for missing persisted config.** Options were defaulting every empty list or distinguishing unsaved storage. The storage API returns `undefined` for unsaved state, while saved empty lists are valid user choices. This is reversible and preserves explicit choices.
- **Keep default in shared loader.** Electron mirror and SDK both consume its configuration; no host evidence justified an Electron-only default. Reversible.

## Open risks

- Frontend Jest could not start in this sandbox (`spawn EPERM`), so its changed assertion has not run here.
- Fresh packaged Electron first-chat timing was not exercised end to end; the resolved path and mirror inputs are covered at the shared service level.
