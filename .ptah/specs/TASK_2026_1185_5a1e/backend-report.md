# Backend report — TASK_2026_1185_5a1e

## Files changed

- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/http-mcp-server.service.ts`
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/http-mcp-server.service.concurrency.spec.ts`

## Design summary

- `ensureRegisteredForSubagents` returns immediately when its active Claude slot is owned at the current port and the disk entry still points to that port. Otherwise it races its queued operation against `MCP_CHAT_REGISTRATION_DEADLINE_MS` (3000 ms), returning `{ registered: false, reason: 'timeout' }` and warning on expiry. The queued operation continues; `Promise.race` observes its settlement.
- Active-root registration and retained-root registration now plan and write only workspace slots for that root. Releasing a root removes only its owned workspace slots, preserving entries for open workspace roots. Startup and workspace changes retain the full reconcile.
- Pending workspace repoints share one promise, so additional requests do not add full reconciles to the queue. Slow successful slot registrations warn with prepare, write, commit, and total durations.
- Existing callers in chat-session, chat-ptah-cli, and gateway-turn-preparation use the bounded service method without call-site changes.

## Verification

- `npx jest --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/http-mcp-server.service.concurrency.spec.ts`: **PASS**, 1 suite, 9 tests. An initial attempt failed before running tests because this worktree lacked `node_modules/marked`; a worktree-local `node_modules` junction to the parent checkout's installed dependencies resolved it.
- `npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.lib.json`: **PASS** (exit 0).
- `npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.spec.json`: **PASS** (exit 0).
- `npx eslint libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/http-mcp-server.service.ts libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/http-mcp-server.service.concurrency.spec.ts`: **PASS** (exit 0, 0 errors). Three pre-existing warnings remain in `http-mcp-server.service.ts` at lines 866, 870, and 896. Nx module-boundary rule reported no cached project graph and was skipped.

## Decisions

- Applied the deadline centrally to all `ensureRegisteredForSubagents` callers; this is additive to the existing typed outcome contract and is reversible.
- Root-scoped operations omit home-scoped targets, which have no unique root owner; full reconciliation continues to manage those targets on startup and workspace changes. This follows the task's explicit own-root scope and is reversible.

## Open risks

- The fast path checks the owned port and a matching HTTP URL prefix on disk; it does not revalidate the credential token itself. The existing credential state and later queued repairs remain the authority for token lifecycle.
- Home-scoped MCP targets are refreshed by full reconciliation, not chat-start root registration.
