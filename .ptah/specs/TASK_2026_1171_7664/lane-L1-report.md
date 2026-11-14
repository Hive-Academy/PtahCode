# Lane L1 report

## Files changed

- `libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.ts:770-777,1080-1089,1209-1218`: resolve the transport-bound Codex tab ID to a live native thread for agent parent identity and session-child calls. On failed/ambiguous lookup, keep the raw caller ID. The resolver catches lookup errors and debug-logs without credentials. `getParentLevel` remains unchanged under orchestrator decision D6.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.spec.ts:388-423,813-824`: cover native, unknown, ambiguous and Claude session-start IDs, plus native agent parent identity.
- `libs/backend/rpc-handlers/src/lib/chat/codex-host/codex-chat-host-ports.ts:375-408`: reserve the host's `ptah` entry when a session URL exists, remove ignored user `ptah` secret references, and log only the skip. Other user servers merge; a user `ptah` server remains valid when the host has no session URL.
- `libs/backend/rpc-handlers/src/lib/chat/codex-host/codex-chat-host-ports.spec.ts:798-872`: cover host URL and credential reservation, other server merge, and no-host behavior.
- `libs/frontend/chat-streaming/src/lib/agent-monitor.store.spec.ts:1466-1489`: verify a permission for a native thread parent appears under that thread-backed tab and not under the raw tab ID (orchestrator addition).

## Drainer finding

`parent-delivery-drainer.service.ts:200,211,233` checks `isSessionActive(id)` and sends via `sendMessageToSession(id, ...)`. `agent-report-router.service.ts:339,441,585,623` does the same directly or through the drainer. `routing-agent-adapter.ts:151-154,200-203` delegates these calls to the owning adapter. `codex-chat-adapter.ts:606,1206-1207` stores sessions by native ID and checks activity through its controls. The resolved thread ID therefore reaches the native route; no drainer/router code change was needed.

## Approval routing id

`codex-chat-adapter.ts:216-227` resolves a live tab to `session.id`; sessions are keyed by that ID at line 606. `codex-chat-event-callbacks.ts:57,65-68` publishes the native session ID; `codex-chat-host-ports.ts:562-569` publishes by the native ID; `streaming-handler.service.ts:395-397` calls `attachSession` with the event session ID, and `tab-manager.service.ts:2246-2248` stores it as `claudeSessionId`. The native tab therefore uses the thread/session ID, matching the resolved lane parent ID. The new frontend test checks the permission filter for that ID.

## Checks

- `npx jest --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.spec.ts`: PASS, 32 tests (retry after dependency junction); initial run blocked by missing `marked` in worktree.
- `npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.lib.json`: PASS.
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json`: PASS.
- `npx eslint libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.ts libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.spec.ts libs/backend/rpc-handlers/src/lib/chat/codex-host/codex-chat-host-ports.ts libs/backend/rpc-handlers/src/lib/chat/codex-host/codex-chat-host-ports.spec.ts libs/frontend/chat-streaming/src/lib/agent-monitor.store.spec.ts`: PASS, 0 errors; 6 existing warnings (max-lines and non-null assertions).
- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/chat/codex-host/codex-chat-host-ports.spec.ts`: PASS, 84 tests (retry after the secret-map fix; first run found the stale user header secret).
- `npx jest --config libs/frontend/chat-streaming/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat-streaming/src/lib/agent-monitor.store.spec.ts`: BLOCKED on both attempts before test execution by esbuild `spawn EPERM`; 0 tests ran.
- `npx tsc --noEmit --project libs/frontend/chat-streaming/tsconfig.lib.json`: PASS.
- `ptah_get_diagnostics` scoped to changed files: unavailable twice (compiler exceeded its 45-second tool deadline); project `tsc` checks above passed.

## Decisions

- Preserve raw IDs when the trusted native resolver yields no unique live thread. Evidence: resolver contract at `codex-chat-adapter.ts:210-227`. Reversible.
- Keep `getParentLevel` untouched per orchestrator D6; another session owns permission lookup.

## Open issues

Frontend Jest cannot start because esbuild process spawn is denied (`EPERM`); the frontend regression test remains unexecuted. The session-start test uses a spawner stub and asserts the ID supplied to `start`; refusal behavior belongs to the existing spawner guard. The lane parent test verifies the resolver output; it does not run a full spawn or assert persisted `parentSessionId`.

