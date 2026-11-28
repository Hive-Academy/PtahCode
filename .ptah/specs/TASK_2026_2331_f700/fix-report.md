# Issue #1518 fix report

| Tool | Previous lookup | Electron lookup after this change |
| --- | --- | --- |
| `ptah_session_handoff` | Claude lifecycle | Resolve Claude, Codex or ACP ownership. Use the existing runtime launch path, bind the successor canonical ID to the persisted acknowledgement, and retire the predecessor through its owning runtime. |
| `ptah_artifact_publish` | Claude lifecycle for trusted workspace and tab | Use the resolved host workspace and tab for all three runtimes. |
| `ptah_session_link_task` | Claude and Codex | Resolve the ACP caller to its canonical session ID too. |
| `ptah_harness_propose_config` | Claude and Codex | Associate the proposal with the canonical ACP session. |
| `ptah_cron_create` | Claude and Codex | Associate the schedule with the canonical ACP session. |
| `ptah_git_worktree_add` | Claude and Codex | Attribute the organization record to the canonical ACP session. |
| `ptah_agent_spawn` | Existing parent permission sources omitted ACP chat | Apply the ACP chat permission to the existing lane inheritance logic. |

## Decisions

- Put the port in platform-core and aggregate in Electron because the SDK and MCP consumers already depend on platform-core. An agent-sdk port would add an SDK dependency to the MCP consumer. The Electron binding is reversible and other compositions retain their existing lookup behavior through optional injection.
- Require the native handoff successor to pass the same runtime admission as the predecessor. Reuse the existing host launch path for provider selection and startup policy. This avoids a separate handoff launch path and adds no persisted runtime field. Keep the persisted acknowledgement rules and child/lane authorization in their existing paths.

## Changed files and specs

- `apps/ptah-electron/src/di/live-chat-session-resolver.ts:8`
- `apps/ptah-electron/src/di/live-chat-session-resolver.spec.ts:15`
- `apps/ptah-electron/src/di/phase-2-libraries.ts:261`
- `libs/backend/platform-core/src/live-chat-session.ts:3`
- `libs/backend/platform-core/src/index.ts:250`
- `libs/backend/platform-core/src/di/tokens.ts:12`
- `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle-manager.ts:697`
- `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-registry.service.ts:494`
- `libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-adapter.ts:228`
- `libs/backend/agent-sdk/src/lib/provider-session/provider-session-chat-adapter.ts:215`
- `libs/backend/agent-sdk/src/lib/provider-session/provider-session-chat-ports.ts:179`
- `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts:1097`
- `libs/backend/cli-agent-runtime/src/lib/session-children/child-chat-session-host.port.ts:58`
- `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.spec.ts:573`
- `libs/backend/rpc-handlers/src/lib/chat/provider-session-host/provider-session-pool.ts:264`
- `libs/backend/rpc-handlers/src/lib/chat/provider-session-host/provider-session-chat-host-ports.ts:175`
- `libs/backend/rpc-handlers/src/lib/chat/session/child-chat-session-host.adapter.ts:204`
- `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts:1816`
- `libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.ts:1274`
- `libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.spec.ts:419`
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/http-mcp-server.service.ts:254`
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.ts:2888`
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.spec.ts:581`

The specs cover canonical and tab resolution, missing and ambiguous ownership, Codex and ACP successor acknowledgement and retirement, Claude regression, trusted artifact scope for all three runtimes, ACP git and task dispatch, and ACP cron, harness and lane dependency wiring.

## Checks

- TypeScript returned exit 0 for all five changed library projects and the Electron app.
- The Electron resolver suite passed all 6 tests. The handoff and persisted acknowledgement suites passed all 104 tests.
- ESLint returned exit 0 with 90 warnings. The Nx boundary rule skipped because there was no cached project graph.
- The initial MCP run had a Windows `EPERM` creating a directory symlink in the existing navigation case D15, and the new cron test spied on the barrel instead of the directly imported builder. After correcting the cron spy, 489 MCP tests passed and only D15 failed. The final retry passed 488 MCP tests and skipped both cases labeled D15. The other D15 case had already passed in the 489-test run.
- Scoped `ptah_get_diagnostics` timed out. Native `tsc` supplied the project-level results.

```powershell
npx tsc --noEmit --project libs/backend/platform-core/tsconfig.lib.json
npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json
npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json
npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json
npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.lib.json
npx tsc --noEmit --project apps/ptah-electron/tsconfig.app.json
npx jest --config apps/ptah-electron/jest.config.ts --runInBand --coverage=false --runTestsByPath apps/ptah-electron/src/di/live-chat-session-resolver.spec.ts
npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.service.spec.ts
npx jest --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.spec.ts libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.spec.ts
npx jest --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.spec.ts libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.spec.ts --testNamePattern '^(?!.*\(D15\))'
npx eslint apps/ptah-electron/src/di/live-chat-session-resolver.ts apps/ptah-electron/src/di/live-chat-session-resolver.spec.ts apps/ptah-electron/src/di/phase-2-libraries.ts libs/backend/platform-core/src/live-chat-session.ts libs/backend/platform-core/src/index.ts libs/backend/platform-core/src/di/tokens.ts libs/backend/agent-sdk/src/lib/helpers/session-lifecycle-manager.ts libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-registry.service.ts libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-adapter.ts libs/backend/agent-sdk/src/lib/provider-session/provider-session-chat-adapter.ts libs/backend/agent-sdk/src/lib/provider-session/provider-session-chat-ports.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts libs/backend/cli-agent-runtime/src/lib/session-children/child-chat-session-host.port.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.spec.ts libs/backend/rpc-handlers/src/lib/chat/provider-session-host/provider-session-pool.ts libs/backend/rpc-handlers/src/lib/chat/provider-session-host/provider-session-chat-host-ports.ts libs/backend/rpc-handlers/src/lib/chat/session/child-chat-session-host.adapter.ts libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.ts libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.spec.ts libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/http-mcp-server.service.ts libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.ts libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.spec.ts
```

## Limits

The requested verification is CLI-based. No interactive Electron session, separate renderer check, or standalone VS Code/CLI host check was run. Skill discovery was unavailable in this lane.
