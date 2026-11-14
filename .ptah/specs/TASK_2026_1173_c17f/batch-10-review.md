# Batch 10 logic review: 69fb0b851 (native Codex child state on reload)

Static review only. No jest, tsc or nx was run. Ptah MCP was unavailable, so I used rg and git show.
Scope: the 4 source diffs plus the callers of `SubagentHistoryRegistrar`, `projectCodexHistory` and `resumableSubagents`.
I did not read the spec files.

## Verdict: APPROVE_WITH_FIXES

Both defects (A and B) are fixed on the reload path. I found no Blocking issue.
There are two hardening gaps and one residual-path concern (F1, F2, F3 below).

## Findings

| id | severity | file:line | finding | suggested fix |
| --- | --- | --- | --- | --- |
| F1 | Serious | libs/frontend/chat/src/lib/services/chat-store/conversation.service.ts:246-258 | The abort path takes `resumableSubagents` from the backend result. It calls `setResumableSubagents` and `markAgentsAsInterruptedByToolCallIds` with no native filter. It is safe today only because the live registry is fed by Claude SDK hooks (`subagent-hook-handler.ts:281,393`) and no Codex code registers. If any native child reaches the registry, the abort path bypasses the new guard. The guard also lives only in the history builder and the registrar. `resumableSubagents` has no central filter. | Add one defence-in-depth filter. Either make `getResumableBySession` skip records matching `isNativeCodexControl` (`native-codex-control-reason.ts:7`), or filter in `chat-view.component.ts:984` (`resolvedResumableSubagents`) and in the abort handler. |
| F2 | Minor | libs/backend/codex-runtime/src/lib/codex-session-history.ts:~250-262 | Removing `processFailed` means that after a `processFailure` in the list loop, the new child `thread/read` loop still runs once per linked id. It has no `processFailure` break (the break was also dropped from the hydrate loop). Each call probably rejects fast on a dead process, because `assertOpen` and `call` are the same as before. The loop is bounded by the number of distinct linked ids, not by a time limit. If `call` can wait on a restart or a timeout, the latency is N times that wait. Failures are still recorded, so the result is partial but explicit. | Break the read and hydrate loops on `CodexSessionHistoryError` with code `processFailure`, as the old hydrate loop did. Keep recording the failure. |
| F3 | Minor | codex-session-history.ts:~246-258 | The linked-id scan covers only `threads[0]` (the root). A grandchild that only a child's items name, when `thread/list` omits it, is not discovered. The `selected` loop only walks `candidates` and cannot see it. | Accept as a known limit, or scan hydrated children for links and iterate. Document the limit. |
| F4 | Minor | codex-history-projector.ts:~106-109 | `parentTool.set` now overrides unconditionally for native cards. A child named by both a `subAgentActivity` item and a `collabAgentToolCall` spawn item keeps the spawn `tool_use` as its own card. The `spawnReceivers` held result is placed relative to the last receiver terminal. That terminal is now `agent_status` on the activity card, so ordering relies on the timestamp and ordinal tie-break. | Confirm a regression test covers the spawn-result ordering with a tied timestamp. |
| F5 | Info | subagent-history-registrar.ts:79-84, 120-123; history-message-builder.service.ts:180-185 | The native marker logic is duplicated in the backend and the frontend. The two copies can drift. | Move it to one shared helper in `libs/shared`. |
| F6 | Info | codex-chat-events.ts:530 | Live `agent_start` uses `subagent_type` when present, else `'codex'`. A native child with a custom type does not match the `agent_start` branch. It is still caught by `agent_status` with `native.provider==='codex'` (`projector:~344-356`). | None. The coverage is correct, but it depends on a terminal `agent_status` existing. An in-progress turn emits no terminal status, so such a child may still be treated as ordinary (see Q1). |

## Focus questions

1. **Other resumable paths.** Not through reload.
   - Reload: the registrar skip at `subagent-history-registrar.ts:120-123`, plus the builder filter at `history-message-builder.service.ts:187-190` and the interrupted-conversion guard at `:282-289`. `chat-session.service.ts:2466` is the only `registerFromHistoryEvents` caller.
   - Live: the live registry is populated only by `subagent-hook-handler.ts:281,393`, which are Claude SDK hooks. Codex events go through `codex-chat-events.ts` and never register.
   - The abort path at `conversation.service.ts:246-258` is unfiltered (see F1).
   - Residual: an in-progress native child with a custom `subagent_type` and no `agent_status` yet has no marker. A history replay of a session that crashed mid-turn could register it. The UI also shows a native-control reason for these, via `native-codex-control-reason.ts:7`.
2. **Claude behaviour.** Unchanged.
   - The marker requires `agent_status.native.provider==='codex'`, which only the Codex projector emits.
   - Alternatively it requires `agent_start` with `agentType==='codex'` and `parentToolUseId===toolCallId`. For Claude, `parentToolUseId` is the parent's tool id and never equals the child's own `toolCallId` (`assistant-message.transformer.ts:192-279`).
   - A user-defined Claude agent literally named "codex" is therefore still not matched, because of the `parentToolUseId` check.
3. **Process failure and the child loop.** No infinite hang. The loops are finite and sequential but unbounded per child (F2). The direct-child check is correct: it requires `child.id===childId` and `child.parentThreadId===rootThreadId`, and it skips the root and already-listed ids. A non-direct thread is dropped. A mismatched id from `thread/read` is dropped without recording a failure, which is acceptable. Grandchildren are covered only if `thread/list` returns them (F3).
4. **Projector override.**
   - With only a collab `spawnAgent` item there are no native cards, so the loop is a no-op and the old spawn-linked behaviour holds.
   - With only a native activity, the card is canonical, as before.
   - With both, the native card wins, which is the intent. The spawn item stays a plain tool call.
   - v1 linkage (`parentTool` from the `!previous || spawnAgent` branch) is only overridden for ids that have a native card. The risk is limited to the F4 ordering.

## Decisions
- Severity is not Blocking, because the reload defects are closed and no Claude behaviour changes. F1 is Serious as hardening against future registration, not a current defect.

## Orchestrator disposition (one fix round)

| id | disposition |
| --- | --- |
| F1 | Fixed. `withoutNativeCodexAgents()` in `native-codex-control-reason.ts` (unit test in its spec) filters `resolvedResumableSubagents` in `chat-view.component.ts`, the input of the Resume banner. A backend filter is not possible: the backend `SubagentRecord` has no native marker. The abort path can still mark a matching card interrupted, but no native child enters the registry (live hooks are Claude only; the history registrar skips natives), and the banner never offers it. |
| F2 | Fixed. The linked-child read loop and the hydrate loop stop after a `processFailure`, as before. |
| F3 | Accepted limitation: grandchildren named only by a child's items, and omitted by `thread/list`, are not discovered. |
| F4 | Accepted. Spawn-result ordering relies on the existing timestamp and ordinal tie-break; no regression seen in the projector suite. |
| F5 | Follow-up: move the duplicated native marker to one shared helper. |
| F6 | Accepted limitation: a native child with a custom `subagent_type` and no `agent_status` yet has no marker. The UI banner filter (F1) still uses the monitor record (`nativeCycleId`). |
