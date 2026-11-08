# Permission routing implementation report

## Findings

| Finding | Change | Main files | Regression test |
| --- | --- | --- | --- |
| 1. MCP Electron approval | Electron IPC routes MCP answers to `PermissionPromptService`; MCP approval has a 60 s backend deadline, rejects failed renderer delivery, and requires a verified session-bound owner. | `apps/ptah-electron/src/ipc/ipc-bridge.ts`, `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/approval-prompt.handler.ts`, `libs/backend/vscode-lm-tools/src/lib/permission/permission-prompt.service.ts` | Electron IPC, MCP approval prompt specs |
| 2. Copilot bridge | No forwarding listener or failed broadcast denies immediately; unanswered requests deny after 60 s; settlement clears timers. | `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/copilot-permission-bridge.ts`, `apps/ptah-electron/src/ipc/webview-manager-adapter.ts` | Copilot bridge and Electron adapter specs |
| 3. Unverified owner | SDK chat fallback no longer exposes ownerless prompts on the active tab; tab owner must match the session. MCP ownerless requests deny before publication. SDK backend routes retain a finite deadline. | `libs/frontend/chat-streaming/src/lib/permission-handler.service.ts`, `libs/frontend/chat/src/lib/services/chat-store/message-dispatch.service.ts`, `chat-attention-source.service.ts`, MCP approval handler | Permission handler, message dispatch, attention source, MCP approval specs |
| 4. Lane owner and replay | Copilot and SDK lane cards carry parent session and process generation. Renderer validates both against the current lane and rejects missing or stale metadata. `agent:pendingPermissions` now returns pending Copilot and SDK requests; store replays on lane spawn/resume. | `libs/backend/cli-agent-runtime/src/lib/wiring/agent-events.ts`, `libs/backend/agent-sdk/src/lib/sdk-permission-handler.ts`, `libs/backend/rpc-handlers/src/lib/handlers/agent-rpc.handlers.ts`, `libs/frontend/chat-streaming/src/lib/agent-monitor.store.ts`, `libs/shared/src/lib/types/agent-permission.types.ts` | Agent events, SDK handler, RPC handler and monitor store specs |
| 5. Consumed acknowledgement | SDK response returns a consumed boolean; lane RPC reports success only for a pending request. Renderer keeps a card until positive RPC acknowledgement, shows a fixed error for stale or failed answers, and permits retry. Remote worker rejects an answer after SDK expiry instead of logging it as accepted. | `libs/shared/src/lib/types/permission.types.ts`, `libs/backend/agent-sdk/src/lib/sdk-permission-handler.ts`, `libs/backend/rpc-handlers/src/lib/handlers/agent-rpc.handlers.ts`, `libs/frontend/chat/src/lib/services/agent-permission-responder.ts`, `libs/backend/worker-runtime/src/lib/pending-permissions.ts` | SDK, RPC, responder and worker pending-permissions specs |
| 6. Always Allow scope | Rule lookup and sibling auto-resolution use the same session; UI copy says “Always in session.” | `libs/backend/agent-sdk/src/lib/permission/permission-rule-store.ts`, `sdk-permission-handler.ts`, chat UI permission and compact-session components | SDK permission handler and compact-session specs |
| 7. Lane identity | Ptah CLI registry seeds its agent ID holder before query start; SDK route classifier prefers the lane ID over a chat UUID and briefly awaits attachment before denial. | `libs/backend/cli-agent-runtime/src/lib/ptah-cli/ptah-cli-registry.ts`, `libs/backend/agent-sdk/src/lib/sdk-permission-handler.ts` | Ptah CLI registry routing and SDK handler specs |
| 8. Codex chat deadline | Every presented Codex approval has a backend timer capped at 60 s or earlier native expiry; failed delivery and timeout decline. | `libs/backend/codex-runtime/src/lib/codex-approval-bridge.ts`, Electron IPC/adapter | Codex host port and Electron IPC specs |
| 9. ACP option | Automatic ACP choice is `allow_once`; persistent-only choices cancel. | `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/acp/acp-permission-policy.ts` | ACP permission policy spec |

## Decisions

- **Ownerless prompts:** Chose deny and a bounded backend wait over an ownerless global approval surface. The transport already stamps and authenticates MCP session ownership; the chat SDK can safely expire an unroutable request. Reversible: yes.
- **Lane generation:** Used the recorded process `startedAt` timestamp, shared by backend dispatch and monitor records. Reversible: yes.
- **Replay:** Extended the existing `agent:pendingPermissions` RPC with SDK pending cards, filtered to requests still waiting; this avoids a second replay channel. Reversible: yes.
- **Rule scope:** Kept current rule-store policy behavior but keyed tool rules and sibling resolution to the owning session. Reversible: yes.

## Verification

The exact verification commands used were project scoped. `npm run verify` printed the matching `starting verify test (@ptah-extension/...)` header for each focused run. Current passing focused runs:

- `npm run verify -- -t test -p @ptah-extension/agent-sdk -- --testPathPatterns=sdk-permission-handler.spec.ts --coverage=false --maxWorkers=2 --forceExit` — passed, including the replay assertion.
- `npm run verify -- -t test -p @ptah-extension/chat-streaming -- --testPathPatterns=permission-handler.service.spec.ts --coverage=false --maxWorkers=2 --forceExit` — passed after owner-aware fixture updates.
- `npm run verify -- -t test -p @ptah-extension/cli-agent-runtime -- --testPathPatterns=ptah-cli-registry-permission-routing.spec.ts --coverage=false --maxWorkers=2 --forceExit` — passed.
- `npm run verify -- -t test -p @ptah-extension/chat -- --testPathPatterns=chat-attention-source.service.spec.ts --coverage=false --maxWorkers=2 --forceExit` — passed after background owner fixture update.
- `npm run verify -- -t test -p @ptah-extension/rpc-handlers -- --testPathPatterns=agent-rpc.handlers.spec.ts --coverage=false --maxWorkers=2 --forceExit` — passed after the shared snapshot and `void` RPC fixture updates.
- `npm run verify -- -t test -p @ptah-extension/chat -- --testPathPatterns=agent-permission-responder.spec.ts --coverage=false --maxWorkers=2 --forceExit` — passed, 11 tests.
- `npm run verify -- -t test -p @ptah-extension/cli-agent-runtime -- '--testPathPatterns=copilot-permission-bridge.spec.ts|acp-permission-policy.spec.ts|agent-events.spec.ts' --coverage=false --maxWorkers=2 --forceExit` — passed.
- `npm run verify -- -t test -p @ptah-extension/chat-streaming -- --testPathPatterns=agent-monitor.store.spec.ts --coverage=false --maxWorkers=2 --forceExit` — passed.
- `npm run verify -- -t test -p @ptah-extension/chat -- --testPathPatterns=message-dispatch.service.spec.ts --coverage=false --maxWorkers=2 --forceExit` — passed after adding an owner to the old streaming permission fixture.
- `npm run verify -- -t test -p @ptah-extension/worker-runtime -- --testPathPatterns=pending-permissions.spec.ts --coverage=false --maxWorkers=2 --forceExit` — passed.
- `npm run verify -- -t test -p @ptah-extension/vscode-lm-tools -- '--testPathPatterns=approval-prompt.handler.spec.ts|permission-prompt.service.spec.ts' --coverage=false --maxWorkers=2 --forceExit` — passed.
- `npm run verify -- -t test -p @ptah-extension/codex-runtime -- --testPathPatterns=codex-approval-bridge.spec.ts --coverage=false --maxWorkers=2 --forceExit` — passed.
- `npm run verify -- -t test -p ptah-electron -- '--testPathPatterns=ipc-bridge.codex-permission.spec.ts|ipc-bridge.agent-permission.spec.ts|webview-manager-adapter.spec.ts' --coverage=false --maxWorkers=2 --forceExit` — passed; Nx reported 11 dependency tasks passed, 0 failed for this Electron target.

Each command above except Electron completed with **1 project task passed, 0 failed**. Intermediate focused runs found stale fixture assumptions (ownerless prompts previously counted on the active tab, and a `void` RPC was passed to a test helper typed as `Record`); those fixtures were corrected and the focused commands rerun. No final full-project pass is claimed. Scoped `ptah_get_diagnostics` remained unavailable: the last multi-file call left **4 files unchecked**, and the final single-file retry left **1 unchecked**, after their 45 s TypeScript deadlines.

Earlier broader project-scoped runs from the collaborating lanes failed before their final edits: one saw obsolete Codex/MCP timeout expectations and concurrent boolean-return type errors; another saw a pinned CLI SDK version mismatch and pre-fix chat assertions. Those runs are not evidence of a clean final tree. Multiple scoped `ptah_get_diagnostics` calls returned unavailable because TypeScript still ran after 45 s.

## Unverified paths and open issues

- Remote worker relay is a real gap: `MachinesService` broadcasts `MACHINES_EVENT`, but no app or frontend consumer of `MACHINES_EVENT` or `machines:permission.answer` was found. A remote worker therefore has no Electron approval surface. The worker's SDK permission deadline prevents an indefinite wait, and the pending index now refuses an answer after that expiry, but remote approval remains unavailable. `PendingPermissionIndex` also keys by request ID, so an ID collision across sessions is possible. This requires a remote-session UI/relay contract and was not implemented here.
- Unexpected native Codex lane server approvals are already declined: the lane execution profile uses `approvalPolicy: 'never'`, and its app-server adapter declines command, file, permissions and MCP elicitation requests. The existing adapter spec covers that path.
- A renderer lost after a successful push is settled by the backend deadline; no immediate window-close subscription was added.

## Manual Electron live test

1. Open two chat sessions and a Ptah CLI lane in one session. Trigger tool approval and AskUserQuestion in each; verify each card appears only with its owning session/lane and each answer resumes only that process. Make the lane's first tool call immediately after spawn to exercise ID attachment.
2. In one session trigger two pending calls of the same tool, select **Always in session**, and verify both settle. Trigger the same tool in the other session and verify it still asks.
3. Trigger a lane prompt, switch tabs, then resume that lane; verify parent and generation are retained and the pending card reappears. Answer once; attempt a stale answer and verify the card remains with an error.
4. Trigger a Copilot and a Codex approval, then close the Electron renderer or remove its active window; verify backend denial by the deadline and no stuck process. Repeat with an MCP `approval_prompt` from a bound session and verify its reply reaches the waiting MCP call.
5. Trigger an ACP permission request whose options include `allow_once` and `allow_always`; verify only the once option is used automatically. With persistent-only options, verify cancellation.
6. Trigger a request with no valid owner using an MCP test caller or a disconnected tab. Verify no unrelated active tab can answer it and the backend denies it by its deadline.


