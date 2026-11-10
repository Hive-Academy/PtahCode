# Batch B4 report

## Files changed

- `libs/backend/agent-sdk/src/lib/helpers/session-end-callback-registry.ts` and new `.spec.ts`: schema, parser, normalized delivery and boundary specs.
- `libs/backend/agent-sdk/src/lib/helpers/index.ts`, `src/index.ts`: public exports.
- `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-control.service.ts` and `.spec.ts`: cause through single, token-matched, bulk, and workspace teardowns; tests.
- `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle-manager.ts` and `.spec.ts`: forwarding and bulk test.
- `libs/backend/agent-sdk/src/lib/sdk-agent-adapter.ts` and `.spec.ts`: forwarding, config and shutdown classification.
- `libs/shared/src/lib/types/ai-provider.types.ts`, `agent-adapter.types.ts`: optional host-neutral cause arguments.
- `libs/backend/rpc-handlers/src/lib/chat/streaming/chat-stream-broadcaster.service.ts` and `.spec.ts`: stream exit, error, watchdog and compaction causes.
- `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts`, `chat-session-abort-resume-state.spec.ts`, `chat-slash-command-router.service.ts`, `chat/ptah-cli/chat-ptah-cli.service.ts`: stop and cleanup causes.
- `libs/backend/gateway-chat-bridge/src/lib/gateway-chat-bridge.ts`: drained turn cause.
- `libs/backend/memory-curator/src/lib/knowledge-agents/knowledge-agent.service.ts`: intentional reprime stop.

## Nx projects edited

`@ptah-extension/agent-sdk`, `@ptah-extension/shared`, `@ptah-extension/rpc-handlers`, `@ptah-extension/gateway-chat-bridge`, `@ptah-extension/memory-curator`.

## CALL-SITE TABLE

Search scope: `libs/**/src/**/*.ts` and `apps/**/src/**/*.ts`, excluding specs. No matching call in `apps/**`. Lines below are from the final scoped search; adjacent edits may shift a line by a few positions.

| File:line | Function | Trigger | Cause passed | Confidence |
| --- | --- | --- | --- | --- |
| `agent-sdk/sdk-agent-adapter.ts:337` | configChanged listener | settings/auth change | via requestConfigReinit -> `config-reinit` | high |
| `agent-sdk/sdk-agent-adapter.ts:424` | requestConfigReinit | config change | `config-reinit` | high |
| `agent-sdk/sdk-agent-adapter.ts:829` | dispose | host disposal, or reset | `host-shutdown` by default; `config-reinit` from reset | high |
| `agent-sdk/sdk-agent-adapter.ts:1173` | endSession | supplied by caller | forwarded, default `unknown` | high |
| `agent-sdk/sdk-agent-adapter.ts:2067` | interruptSession | supplied by caller | forwarded, default `unknown` | high |
| `agent-sdk/session-lifecycle-manager.ts:760` | endSession | supplied by caller | forwarded, default `unknown` | high |
| `agent-sdk/session-lifecycle-manager.ts:789` | disposeAllSessions | supplied by caller | forwarded, default `unknown` | high |
| `agent-sdk/session-lifecycle-manager.ts:809` | disposeAllSessionsForShutdown | host shutdown | `host-shutdown` | high |
| `agent-sdk/session-lifecycle-manager.ts:966` | executeSlashCommandQuery | replace old record for slash command | `parent-stop` | medium |
| `agent-sdk/session-control.service.ts:408` | disposeAllSessions | caller supplies cause | forwarded, default `unknown` | high |
| `rpc-handlers/chat-stream-broadcaster.service.ts:404` | streamEventsToWebview catch | failed zero-event start/resume | `provider-error` | high |
| `rpc-handlers/chat-stream-broadcaster.service.ts:459` | streamEventsToWebview finally | token-matched loop exit | `stream-exit`, `provider-error`, `user-stop`, or `compaction-abort` from loop outcome | high |
| `rpc-handlers/chat-session.service.ts:2333` | abort handler | chat abort RPC | `user-stop` | high |
| `rpc-handlers/chat-session.service.ts:2618` | resume cleanup | dead record before resume | `stream-exit` | high |
| `rpc-handlers/chat-session.service.ts:2915` | endDeadRecordBeforeSlashCommand | dead record before slash command | `stream-exit` | high |
| `rpc-handlers/chat-slash-command-router.service.ts:239,244` | native clear routing | user `/clear` | `user-stop` | medium |
| `rpc-handlers/chat-ptah-cli.service.ts:296` | abort Ptah CLI | user chat abort | `user-stop` | high |
| `gateway-chat-bridge/gateway-chat-bridge.ts:762` | endSessionAfterTurn | gateway turn stream drained | `stream-exit` | high |
| `memory-curator/knowledge-agent.service.ts:164` | reprimeCorpus | intentional corpus session replacement | `parent-stop` | high |
| `agent-sdk/routing-agent-adapter.ts:144,199` | endSession, interruptSession | dispatch to selected adapter | forwards caller arguments | high |
| `agent-sdk/codex-chat-adapter.ts:265,960,985` | dispose/endSession/interruptSession | Codex app-server local controls | no SessionEndCallbackRegistry path; cause unavailable here | high |
| `rpc-handlers/subagent-rpc.handlers.ts:491` | subagent interrupt RPC | user interrupts subagent | separate dispatcher, not SDK session-end signal | high |
| `cli-agent-runtime/session-children/session-spawner.service.ts:757,1366,1469` | child stop/cap/recovery | parent stop | `parent-stop` (other batch; untouched) | high |
| `cli-agent-runtime/session-children/session-handoff.service.ts:756` | handoff predecessor stop | parent stop | `parent-stop` (other batch; untouched) | high |

Comments and method declarations returned by the text search are not call sites. The workspace-specific auth change path calls `endSessionsForWorkspace`, which now forwards `config-reinit`. No direct workspace-close call to this chain was found in the specified search.

## Spec cases added or updated

- Registry: every valid cause, invalid string, non-string, undefined; notifyAll missing, invalid and valid cause delivery.
- SessionControl: default `unknown`, explicit `user-stop`, bulk `config-reinit` for two records; updated exact payload assertion.
- Lifecycle manager: existing real-registry bulk test now sends `config-reinit` and checks all three notifications.
- Stream broadcaster: existing token-matched teardown assertions now check provider error, user abort and normal stream exit causes.
- Chat abort: existing assertion checks `user-stop`.
- Adapter: config-change test checks `config-reinit` disposal argument.

## Extra files read

`batch-4-brief.md`; `agent-sdk/package.json`; the project.json files for all five edited projects; neighboring callback registry spec; `no-activity-watchdog.ts`; `session-query-executor.service.ts`; Codex adapter declarations; `gateway-chat-bridge.ts` around the call; memory curator reprime context; scoped matching specs. No prohibited lane-owned file was edited.

## Decisions

- Keep the adapter argument optional and default cause to `unknown`: this preserves existing implementers and makes unclassified paths explicit. Reversible.
- Define the host-neutral union in shared and retain the mandated zod-inferred type in agent-sdk. A type-only dependency from shared to agent-sdk would reverse the dependency direction. Reversible.
- Treat workspace-scoped auth reconfiguration as `config-reinit` based on `applyWorkspaceAuthChange` and provider-key paths. Reversible.
- Treat `/clear` as a user-requested stop and slash query record replacement as `parent-stop`; those are distinct paths. Reversible.
- Use error outcome in the stream loop to distinguish user abort, provider error, no-activity recovery and compaction dwell from a clean loop exit. Reversible.

## Not done

- No npm, npx, nx, Jest, build, lint or package commands were run per brief. The orchestrator must verify the five scoped Nx projects.
- Git status/diff were not run: the backend-developer role prohibits git commands, including read-only git commands.
- `cli-agent-runtime/src/lib/session-children/**` and `vscode-lm-tools/**` were not edited; their parent-stop calls belong to other lanes.
- `ptah_get_diagnostics` was requested twice after edits; TypeScript remained unavailable because its background check exceeded 45 seconds, so no clean diagnostic result was obtained.
