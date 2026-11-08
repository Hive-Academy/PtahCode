# Fix round 1 report

## Fix 1 — recorder typecheck

`session-organization.service.ts`: recorder argument type now removes optionality before applying `Parameters`. The recorder interface returns a typed cleanup result. The existing clear spec checks the count; a new spec checks storage failure.

## Fix 2 — tool descriptions

`tool-description.builder.ts`: shortened all new `worktreePath` schema descriptions without changing budgets. `tool-description.builder.spec.ts`: added the intentional `worktreePath` input to the exact property assertion; pagination and full-row assertions remain.

## Fix 3 — platform-core failures

`git diff main -- libs/backend/platform-core` shows only the optional `clearRemovedWorktree` method added to `session-organization-recorder.interface.ts`; neither release-race nor session-driver endpoint code or tests changed. No changes made to those tests.

## Fix 4 — review findings

- `core`: added a renderer-wide unavailable-root store with 60-second expiry and clear-on-recovery; added expiry/clear spec.
- `git-ui`: dock uses shared exclusions and shows its banner only for the current candidate when cwd/workspace fallback is selected. Worktree creation clears exclusions, including correlated notifications. Dock spec covers unrelated-session banner suppression and recovery.
- `chat`: card and inspector use shared exclusions; successful Git reads clear them, refused reads add them, and organization changes clear affected paths. Session-root spec covers exclusion precedence.
- `session-organization`, `platform-core`, `rpc-handlers`, `vscode-lm-tools`, `cli-agent-runtime`, `ptah-electron`: cleanup returns `{ cleared } | { error }`; storage failures pass a real Error to the injected Logger. Git RPC, MCP, SDK and Electron watcher callers warn while preserving successful Git removal.

## Decisions

- Put shared renderer state in `@ptah-extension/core`, already imported by chat and git-ui, avoiding a dependency cycle. Expiry matches existing 60-second Git-root backoff. Reversible.

## Verification

Scoped `ptah_get_diagnostics` after edits reported TypeScript checking unavailable after a 45-second timeout. The single requested `npm run verify -- -p session-organization,platform-core,vscode-lm-tools,git-ui,chat,shared,core,rpc-handlers,cli-agent-runtime,ptah-electron` attempt stayed at queue position 8 behind three occupied verification slots for several minutes; it was canceled before Nx ran. No lint, typecheck, or test result is available from this sandbox.

## Not done

The changed code has not passed automated verification. Caller warning behavior was added but dedicated warning assertions for all four callers were not added.
