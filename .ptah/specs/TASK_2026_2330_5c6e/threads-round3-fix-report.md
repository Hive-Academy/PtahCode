# PR #1516 round 3 review fixes

## New threads

| Review location | Verdict | Current code and focused coverage |
| --- | --- | --- |
| `agent-message-dispatcher.ts:149` | Fixed | `agent-message-dispatcher.ts:96` and `:149` hold first sends and retries when a candidate command's catalog is unavailable. Delivery stops before journaling a dispatch or starting a turn. `agent-message-dispatcher.spec.ts:150` covers missing and rejected catalogs. `agent-message-coordinator.lane-messaging.spec.ts:481` covers retrying the same message as a raw skill after discovery recovers. |
| `codex-app-server-lane.adapter.ts:957` and `:960` | Fixed | `lane-command-filter.ts:21` excludes path separators inside the command token. The startup guard at `codex-app-server-lane.adapter.ts:958` now skips discovery for nested POSIX paths. Drive-qualified paths already bypassed the guard. `codex-app-server-lane.adapter.spec.ts:697` checks that both forms reach the initial turn without issuing a skill lookup. |
| `chat-slash-command-router.service.ts:417` | Fixed | `chat-slash-command-router.service.ts:410` opens an inactive thread without the request's model or effort. `codex-chat-adapter.ts:1005` only runs the settings callback after resolving an enabled skill and checking session ownership, before sending the turn. `chat-slash-command-router.native.spec.ts:323` covers refusals with both open and inactive sessions, and `codex-chat-adapter.spec.ts:584` checks the real adapter's callback and send ordering. |
| `agent-message-coordinator.service.ts:563` | Fixed | `agent-message-coordinator.service.ts:564` invalidates the live catalog when answering for a stopped lane with a stopped-catalog provider. Composer requests and command admission read current skills on demand. `agent-message-coordinator.lane-messaging.spec.ts:498` checks the refreshed composer view and raw delivery of a newly available skill. |

## Older threads

| Review location | Verdict | Re-check |
| --- | --- | --- |
| `codex-app-server-lane-catalog.ts:46` | Fixed before this round | `codex-app-server-lane-catalog.ts:15` passes the skill deadline to the RPC and `:46` retains the model result when skill discovery rejects. The skill RPC timeout removes only the pending request at `codex-app-server-process.ts:327`. |
| `agent-message-dispatcher.ts:150` | Fixed before this round | `agent-message-coordinator.service.ts:621` distinguishes unavailable discovery from a definite absence. At `agent-message-dispatcher.ts:149` an outage is retryable and at `:150` a formerly admitted raw skill that has been removed is refused. Existing live and stopped retry specs cover both outcomes. |
| `chat-slash-command-router.service.ts:422` | Fixed and preserved | The router still forwards client message ID, files and images at `chat-slash-command-router.service.ts:418`. The model and effort selected for an accepted skill apply before its turn on both open and resumed sessions, through `codex-chat-adapter.ts:1018`. |

GitHub CLI authentication was unavailable. The older thread descriptions came from the local round 1 and round 2 review reports and were checked against current source. Native CLI skill discovery was unavailable in this lane. Repository orchestration guidance was consulted within the parent-assigned implementation scope.

Stopped skill lists refresh on demand. A slash-prefixed single segment can be either a POSIX root child or a skill name, so a token such as `/home` remains a command candidate. Nested POSIX, UNC and drive-qualified paths bypass discovery.

## Checks

- CLI agent runtime Jest passed 219 tests across five suites, including dispatcher, coordinator, lane command filter, and Codex lane adapter coverage.
- Ptah dependency indexing remained in progress. Local `rg` and PowerShell source reads were used to trace the shared consumers and inspect related code.
- RPC handlers Jest passed 56 tests across native slash routing, Codex resume, and idle coalescing.

- Agent SDK Jest passed all 129 Codex chat adapter tests. The three Jest invocations emitted a config-loader warning and exited successfully.
- TypeScript passed for `apps/ptah-electron/tsconfig.app.json` and `apps/ptah-extension-webview/tsconfig.app.json`.
- TypeScript passed for `libs/backend/platform-cli/tsconfig.lib.json`.
- TypeScript passed for `libs/backend/cli-engine/tsconfig.lib.json`.
- ESLint passed on all 11 changed TypeScript files with zero errors and three existing `max-lines` warnings in the chat adapter, lane adapter, and message coordinator.
