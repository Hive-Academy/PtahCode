# Implementation notes

## Files changed

- `libs/shared`: RPC abort source type and session end causes.
- `libs/backend/agent-sdk`: accepted end cause values.
- `libs/backend/rpc-handlers`: source mapping, RPC validation and logging, CLI abort cause, stream abort cause.
- `libs/backend/cli-agent-runtime`: child outcome words, kinds and succession route.
- `libs/backend/worker-runtime`: worker abort source.
- `libs/frontend/chat-state`: tab reset abort reason.
- `libs/frontend/chat`: Stop, tab close, reset and carry-over sources.
- `libs/frontend/core`: workspace removal source.
- `libs/frontend/mcp-apps-page`: Stop and reset sources.
- `libs/frontend/command-center`: command center source.

## Cause map

- `stop-button`, `apps-stop` -> `user-stop`.
- `tab-close` -> `tab-close`.
- `workspace-remove` -> `workspace-close`.
- All other sources and missing source -> `internal-abort`.

## Specs

- Added `abort-end-cause.spec.ts` for every source and missing source.
- Updated ChatSessionService abort, stream broadcaster, child outcome, closed tab and conversation specs.
- Added RPC schema validation coverage for abort source.

## Verification

- Command: `npm run verify -- -p @ptah-extension/shared,@ptah-extension/agent-sdk,@ptah-extension/cli-agent-runtime,@ptah-extension/rpc-handlers,@ptah-extension/worker-runtime,@ptah-extension/chat-state,@ptah-extension/chat,@ptah-extension/core,@ptah-extension/mcp-apps-page,@ptah-extension/command-center 2>&1 | Select-Object -Last 60`
- Result: failed before lint, typecheck, or tests ran. Nx daemon socket connect returned EPERM. Nx plugin workers also returned spawn EPERM. No failing test names were reported.
- Scoped Ptah diagnostics were unavailable after 45 seconds; no TypeScript result was returned.
