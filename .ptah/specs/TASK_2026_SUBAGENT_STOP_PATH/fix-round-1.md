## Fixes

1. **Stopped teammate name:** `subagent-budget-monitor.ts:459,678-698,1131,1191-1203` retains SDK id, spawning tool call id, and teammate name in a 256-entry process-lifetime index independent of completed registry records. A live match takes priority over an older stopped name. `subagent-budget-monitor.spec.ts:347` removes the registry record before lookup; `sdk-permission-handler.spec.ts:119` checks the raw name path.
2. **Inactive budget and nonexistent record:** `subagent-budget-monitor.ts:679` returns no budget state when disabled; `chat-subagent-context-injector.service.ts:383-400` excludes disabled budget usage; `subagent-resume-advice.ts:11-19` and injector `:390-394` give context guidance when no record path exists. Specs: monitor `:357`, resume advice, injector disabled advice.
3. **Transcript path:** `subagent-hook-handler.ts:439` passes SubagentStop `agent_transcript_path` to the monitor; `subagent-budget-monitor.ts:238-257,701-718,1298-1302` accepts an existing exact agent JSONL inside the expected session directory, or derives that path when present. Missing or unsafe paths remain `unknown`. Specs: monitor transcript resolver `:324`, hook handler callback.
4. **Secret redaction:** `subagent-budget-monitor.ts:222-234,619,1148,1309,1323` redacts Bearer/Basic headers, quoted JSON keys, secret/token/key assignments, AWS access key ids, common provider tokens, and PEM blocks before the 2,000-character progress cap and before handoff/notice writes. Pattern and long-PEM specs: monitor `:306-345,431`.
5. **Warning re-arm:** `subagent-budget-monitor.ts:646` treats an unknown prior task id as different from the new id. Spec `:375`.
6. **One parent stop correlation:** `session-query-executor.service.ts:229,362-365,443,1645-1653` signals and logs once per tool call id, clearing on release. `permission.types.ts:111-112` declares the two optional permission-handler methods. Spec: executor `:1722`.
7. **Running-agent steering:** `subagent-resume-advice.ts:11-14` allows messages to running agents at or above 85%; `subagent-budget-monitor.ts:685-698` reports running status and prefers a live name match. Specs: resume advice and permission handler `:127`.
8. **Stop window:** `subagent-budget-monitor.ts:1087,1130-1158,689` exposes `stopInFlight` as stopped before awaiting `stopSubagent`, and clears it on rejection; a successful stop retains the stopped state. Spec `:363`.
9. **Missing regression coverage:** `subagent-budget-monitor.spec.ts:412-442` verifies `tool_result` outcome and the ten-call cap. The other new cases above cover the review's missing name, disabled-budget, executor, and redaction paths. `subagent-hook-handler.spec.ts` checks hook forwarding.

## SendMessage to field evidence

The built-in tool is named `SendMessage` in `libs/backend/agent-sdk/src/lib/helpers/claude-builtin-catalog.ts:140`. The installed SDK documents the target only in `node_modules/@anthropic-ai/claude-agent-sdk/sdk-tools.d.ts:772`: `SendMessage({to: name})` addresses the spawned agent by name while running. The declaration provides no typed SendMessage input schema. The guard in `sdk-permission-handler.ts:518-524` reads `input['to']` only when it is a string; missing or non-string `to` follows the existing permission path (allow in the YOLO spec). `sdk.d.ts:173` has hook `transcript_path`; assistant messages at `:3405` do not carry it, and SubagentStop input has `agent_transcript_path` at `:9100`.

## Verification

Final commands (PowerShell output filtered with `Select-Object -Last 40`, equivalent to `tail -40`):

1. `npm run verify -- -t test -p agent-sdk,rpc-handlers -- --testPathPatterns="sdk-permission-handler|session-query-executor.service.spec|subagent-resume-advice|subagent-budget-monitor.spec|subagent-rpc.handlers|chat-subagent-context-injector"` — **NX 2 tasks: 2 succeeded**, exit 0, 2026-11-07 18:22:42.
2. `npm run verify -- -t lint,typecheck -p agent-sdk,rpc-handlers` — **NX 4 tasks: 4 succeeded**, exit 0, 2026-11-07 18:23:30.

Earlier failed runs, corrected before the final pass: first test run failed `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-query-executor.service.spec.ts` and `libs/backend/rpc-handlers/src/lib/chat/session/chat-subagent-context-injector.service.spec.ts`; second test run failed only `libs/backend/rpc-handlers/src/lib/chat/session/chat-subagent-context-injector.service.spec.ts` because its second fixture also omitted `enabled`. Final failed suite paths: **none**. Scoped `ptah_get_diagnostics` after the last monitor edit: 0 errors, 0 warnings.

## Decisions

- Kept a bounded in-memory stopped-identity index through session release; it addresses registry cleanup during the process lifetime. A process restart does not restore that index. This is reversible if a persisted identity contract is later required.
- A newly running agent with the same teammate name wins over an older stopped identity, so SendMessage can steer the active agent. An idle/completed agent at or above 85% is refused.
- Supplied and derived transcript paths must resolve to the exact existing `agent-<agentId>.jsonl` inside the expected Claude session directory. A late SubagentStop hook may arrive after a handoff record was written; the existing-file derivation covers the ordinary earlier-write path, otherwise the record says `unknown`.
- The prescribed filtered test command does not include `subagent-hook-handler.spec.ts`; its new callback assertion was typechecked but not executed by that filter. No skill catalog or skill-loading tool was exposed in this lane.
