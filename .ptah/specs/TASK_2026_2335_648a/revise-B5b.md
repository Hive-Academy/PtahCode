# B5b revision round 1

Source paths below are relative to `libs/frontend/chat/src/lib/settings/pro-features/`.

1. Workspace ownership. The row derives its gate from status keyed to the active workspace. A scope change triggers a fresh load, and only the current request can publish its result. Save and Undo capture the workspace at the change event. Read-back only affects the originating workspace while it is active. See `agent-behaviour-section.component.ts:349`, `:457`, `:524`, and `:577`. The regression at `agent-behaviour-section.component.spec.ts:252` switches from A with content to B without content, releases a late A response, and checks that Undo still writes to A.
2. Generation completion and reopen. The drawer reports generation completion and successful open/reopen observations with their workspace path. The row refreshes only when the output workspace matches its current scope. See `system-prompt-drawer.component.ts:498` and `:601`, and `agent-behaviour-section.component.ts:314` and `:516`. The tests at `agent-behaviour-section.component.spec.ts:930` use the actual deferred drawer and check the missing-to-generated transition makes the switch enabled and checked.
3. Accessible session scope. The hidden active status uses “Applies to new sessions” to match the visible hint. See `agent-behaviour-section.component.ts:178` and `agent-behaviour-section.component.spec.ts:579`.
4. Disabled switch keyboard behavior. The test checks focusability and Tab pass-through, then confirms Space is cancelled, the checkbox stays unchecked, and no write occurs. See `agent-behaviour-section.component.spec.ts:235`. Jest DOM does not implement native Tab navigation.

## Files changed

- `agent-behaviour-section.component.ts`
- `agent-behaviour-section.component.spec.ts`
- `system-prompt-drawer.component.ts`
- This report

## Verification

- `git diff --check -- libs/frontend/chat` passed.
- Chat library TypeScript passed with exit 0 and zero diagnostics via the TypeScript package entry point. The shared `.bin/tsc.cmd` launcher was missing.
- ESLint exited 1 before linting any file because the shared `@angular-eslint/eslint-plugin/dist/index.js` entry point was missing.
- The first focused Jest attempt stalled silently and was stopped. The retry ran through the Jest package entry point and exited 1 with 2 suites failed during setup and 0 tests or snapshots executed. Both suites could not resolve the shared `@angular/core` package. Its package manifest and runtime entry point were absent when checked after the run. Jest and ESLint verification require the shared dependencies to be restored.
- Ptah's dependency graph was still indexing, so tracked source search was used for caller discovery. The Angular frontend patterns skill was read from the repository. The session did not expose a native skill loader.
- Electron visual verification was unavailable. No Electron process or active Ptah browser session was present. No design reference was supplied.



