# Permission routing review fixes

## Review items

| Item | Change and files | Focused test and result |
| --- | --- | --- |
| 1. Copilot owner deadline | `cli-agent-runtime` bridge retains a 60-second non-delivery bound, then arms the routed card's visible ten-minute deadline on confirmed delivery; `chat` panel shows countdown and `chat-streaming` store removes expired cards. | `copilot-permission-bridge.spec.ts`, `agent-monitor.store.spec.ts` passed. |
| 2. VS Code MCP reply | `vscode-core` webview handler consumes MCP IDs before SDK IDs. | `webview-message-handler.service.spec.ts` passed. |
| 3. Lane acknowledgement | `chat` responder bounds the ack to five seconds, clears the in-flight guard, and reconciles with `agent:pendingPermissions` before retry. Failed reconciliation blocks duplicate decisions. | `agent-permission-responder.spec.ts` passed (five regressions). |
| 4. Expired lane card | `chat-streaming` store removes queued cards at backend wall-clock expiry using one shared clock; `chat` panel displays countdown. | `agent-monitor.store.spec.ts` passed. |
| 5. MCP producer owner | `vscode-lm-tools` approval handler accepts verified UUID session binding. Anonymous, CLI/TUI, gateway, workspace/home/internal and stdio/in-process requests lacking that owner are denied. Dispatcher fixture now supplies a verified owner. | `approval-prompt.handler.spec.ts` and `protocol-dispatcher.spec.ts` passed. |
| 6. Sessionless Always | `chat-ui` card hides Always without a session; `agent-sdk` coerces forged sessionless always_allow to one-time allow with no rule. | Card and `sdk-permission-handler.spec.ts` passed. |
| 7. Electron IPC validation | `ptah-electron` IPC bridge Zod-parses SDK, AskUserQuestion and lane reply payloads. | `ipc-bridge.agent-permission.spec.ts` and `ipc-bridge.codex-permission.spec.ts` passed. |
| 8. Replay diagnostic | `chat-streaming` store logs replay RPC errors through injected logging service. | `agent-monitor.store.spec.ts` passed. |
| 9. RPC surface | `ptah-electron` surface asserts `agent:pendingPermissions`; `rpc-handlers` manifest claims it once. | `rpc-surface.spec.ts`, `rpc-allowlist.spec.ts`, `manifest.spec.ts`, `agent-rpc.handlers.decision-model.spec.ts` passed. |
| 10. Stray logs | Removed two `agent-output-*.md` task-folder lane logs. | Absence checked. |

Focused commands used `npm run verify -- -t test -p <project> -- --testPathPatterns=<spec>`. Project/spec pairs were: (1) `@ptah-extension/cli-agent-runtime` / `copilot-permission-bridge.spec.ts` and `@ptah-extension/chat-streaming` / `agent-monitor.store.spec.ts`; (2) `@ptah-extension/vscode-core` / `webview-message-handler.service.spec.ts`; (3) `@ptah-extension/chat` / `agent-permission-responder.spec.ts`; (4, 8) `@ptah-extension/chat-streaming` / `agent-monitor.store.spec.ts`; (5) `@ptah-extension/vscode-lm-tools` / `approval-prompt.handler.spec.ts|protocol-dispatcher.spec.ts`; (6) `@ptah-extension/chat-ui` / `permission-request-card.component.spec.ts` and `@ptah-extension/agent-sdk` / `sdk-permission-handler.spec.ts`; (7) `ptah-electron` / `ipc-bridge.agent-permission.spec.ts|ipc-bridge.codex-permission.spec.ts`; (9) `ptah-electron` / `rpc-surface.spec.ts` and `@ptah-extension/rpc-handlers` / `rpc-allowlist.spec.ts|manifest.spec.ts|agent-rpc.handlers.decision-model.spec.ts`. All named focused regressions passed.

The phase-2 Electron smoke spec now asserts the lazy SDK lane-owner binding within an existing test. `npm run verify -- -t test -p ptah-electron -- --testPathPatterns=container.smoke.spec.ts` passed all 56 assertions but Jest exited 1 after an asynchronous SQLite reconciliation required `better-sqlite3` after teardown. The same command and error reproduced in the main checkout with 56 passing assertions.

### Main files and focused commands by item

| Item | Main files | Verify command (result) |
| --- | --- | --- |
| 1 | `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/copilot-permission-bridge.ts`, `libs/backend/cli-agent-runtime/src/lib/wiring/agent-events.ts`, `libs/frontend/chat-streaming/src/lib/agent-monitor.store.ts`, `libs/frontend/chat/src/lib/components/organisms/agent-monitor-panel.component.ts` | `npm run verify -- -t test -p @ptah-extension/cli-agent-runtime -- --testPathPatterns=agent-events.spec.ts` (pass); bridge and store focused specs also passed. |
| 2 | `libs/backend/vscode-core/src/services/webview-message-handler.service.ts` | `npm run verify -- -t test -p @ptah-extension/vscode-core -- --testPathPatterns=webview-message-handler.service.spec.ts` (pass). |
| 3 | `libs/frontend/chat/src/lib/services/agent-permission-responder.ts` | `npm run verify -- -t test -p @ptah-extension/chat -- --testPathPatterns=agent-permission-responder.spec.ts` (pass). |
| 4 | `libs/frontend/chat-streaming/src/lib/agent-monitor.store.ts`, `libs/frontend/chat/src/lib/components/organisms/agent-monitor-panel.component.ts` | `npm run verify -- -t test -p @ptah-extension/chat-streaming -- --testPathPatterns=agent-monitor.store.spec.ts` (pass). |
| 5 | `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/approval-prompt.handler.ts` | `npm run verify -- -t test -p @ptah-extension/vscode-lm-tools -- --testPathPatterns=approval-prompt.handler.spec.ts` (pass); dispatcher focused spec passed. |
| 6 | `libs/frontend/chat-ui/src/lib/molecules/permissions/permission-request-card.component.ts`, `libs/backend/agent-sdk/src/lib/sdk-permission-handler.ts` | `npm run verify -- -t test -p @ptah-extension/agent-sdk -- --testPathPatterns=sdk-permission-handler.spec.ts` (pass); card focused spec passed. |
| 7 | `apps/ptah-electron/src/ipc/ipc-bridge.ts` | `npm run verify -- -t test -p ptah-electron -- --testPathPatterns=ipc-bridge.agent-permission.spec.ts` (pass); Codex IPC focused spec passed. |
| 8 | `libs/frontend/chat-streaming/src/lib/agent-monitor.store.ts` | `npm run verify -- -t test -p @ptah-extension/chat-streaming -- --testPathPatterns=agent-monitor.store.spec.ts` (pass). |
| 9 | `apps/ptah-electron/src/di/rpc-surface.spec.ts`, `libs/backend/rpc-handlers/src/lib/handlers/agent-rpc.handlers.ts` | `npm run verify -- -t test -p ptah-electron -- --testPathPatterns=rpc-surface.spec.ts` (pass); RPC manifest focused specs passed. |

## Per-producer deadline rule

| Producer | Delivered to verified owner | Missing owner, non-delivery, or renderer loss |
| --- | --- | --- |
| SDK chat | Existing unbounded wait while owning tab is present. | Unverified owner cannot create an answerable card; non-delivery has a 60-second deny bound. |
| SDK lane | Ten-minute deadline displayed on lane card and removed at expiry. | Unattached identity denied; lane exit or abort settles pending prompts. |
| Copilot lane | Ten-minute deadline is set when routed, armed on confirmed delivery, displayed on card and removed at expiry. | No listener or failed push denies immediately; unconfirmed push has a 60-second bound. Renderer loss settles by visible deadline or lane exit. |
| Codex chat | Native expiresAt or 60-second maximum displayed on card; backend declines at that time. | Failed delivery and window loss decline outstanding prompts. |
| MCP approval | Sixty-second backend deadline displayed on card. | No verified owner or failed delivery denies immediately; window loss settles outstanding prompts. |
| AskUserQuestion | Existing five-minute idle deadline chooses recommended options. | Failed delivery or abort settles pending questions. |

## Coordinator failure classification

- The SDK unattended-session test failed because verified chat had acquired an invisible ten-minute deadline. Restored unbounded verified chat; unchanged unattended spec and handler spec passed.
- The VS Code in-app dispatcher fixture lacked a verified owner. Added one; focused suite passed.
- The RPC handler manifest omitted `agent:pendingPermissions`; added it. Manifest and Electron surface focused specs passed.
- The CLI runtime registration initially introduced a branch-caused DI cycle through eager `AgentProcessManager` injection. A lazy owner-lookup token now resolves at prompt time. Focused CLI registration smoke and SDK handler specs passed.
- Agent SDK plugin-loader symlink alias failures reproduced in main (two failed tests). The SDK real argv compaction spec passed in both checkouts when focused.
- Worker runtime TokenStore/admin-key/paths failures reproduced in main (six failures across three suites).
- CLI real argv compaction and account-persistence suites passed in main. The branch combined run initially failed due to the DI cycle; the registration smoke passed after the fix.
- Electron container smoke teardown error reproduced in main and is pre-existing.
- SDK lint found a task-caused `prefer-const` error in a late-lane-attachment test. Its mutable fixture object now preserves the behavior without a reassigned local.
- The full scoped run found a stale Copilot wiring assertion expecting `timeoutAt: 0`. The routed card now carries its visible ten-minute deadline. Updated `agent-events.spec.ts` to assert that deadline and successful response just before expiry; `npm run verify -- -t test -p @ptah-extension/cli-agent-runtime -- --testPathPatterns=agent-events.spec.ts` passed.

## Verification

Final scoped command: `npm run verify -- -p @ptah-extension/shared,@ptah-extension/agent-sdk,@ptah-extension/cli-agent-runtime,@ptah-extension/rpc-handlers,@ptah-extension/vscode-lm-tools,@ptah-extension/codex-runtime,@ptah-extension/worker-runtime,@ptah-extension/chat-streaming,@ptah-extension/chat,@ptah-extension/chat-ui,ptah-electron`. It confirmed the 11 requested projects. Lint/typecheck: **21/22 targets succeeded**, one SDK lint error in the late-lane fixture, fixed after that phase. Tests: **18/21 targets succeeded**; SDK **2 failed/5478 total** (both plugin-loader symlink EPERM, reproduced in main), CLI runtime **1 failed/3385 total** (the stale Copilot assertion, fixed and focused pass), worker runtime **11 failed/143 total** (token-file mode and related Windows baseline, reproduced in main). Other projects passed. After the two fixes, `npm run verify -- -t lint,typecheck -p @ptah-extension/agent-sdk,@ptah-extension/cli-agent-runtime` passed **4/4 targets** and the focused CLI wiring spec passed. Scoped `ptah_get_diagnostics` on changed SDK, CLI runtime and Electron files timed out after 45 seconds; the scoped verify supplied compiler evidence.

## Decisions

- **Verified SDK chat:** keep the unbounded wait while the owner is present. A visible countdown was possible; the binding rule and unchanged unattended regression support existing behavior. Reversible.
- **Lane owner lookup:** use a lazy token rather than eager manager injection, because the latter produced a real DI cycle. Reversible.
- **Ownerless MCP:** deny rather than expose a card in an unrelated tab. CLI/TUI and gateway call sites currently lack a verified session mapping. Reversible when a verified owner is supplied.

## Open issues

- Remote worker approval relay remains unavailable as noted in the original implementation report.
