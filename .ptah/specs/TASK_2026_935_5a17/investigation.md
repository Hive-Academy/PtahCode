# Investigation: phantom "Sub-agent" cards for background shell commands

Read-only investigation. No source edits. All paths are relative to the worktree root.

## Summary

The phantom card comes from a backend `agent_completed` event that names a background
Bash/PowerShell task as an agent. The frontend reducer then creates a subagent record from that
event alone. The backend has a `local_bash` guard, but the guard lives in per-stream memory and is
lost in two cases: (1) a compact boundary clears it, and (2) the notification arrives in a stream
that never saw the `task_started`. `task_notification` itself carries no `task_type`, so the
backend cannot classify the task again at that point.

## 1. Code path (file:line)

1. `task_started` with `task_type: 'local_bash'` is rejected and marked non-agent:
   `libs/backend/agent-sdk/src/lib/message-transform/system-message.transformer.ts:218-229` →
   `markNonAgentTask` at `libs/backend/agent-sdk/src/lib/sdk-message-transformer.ts:718-734`.
   Only `local_bash` counts as non-agent: `libs/shared/src/lib/type-guards/guards/exec.ts:343-351`.
2. `task_notification` decides "agent or shell" ONLY from that in-memory mark:
   `system-message.transformer.ts:708` (`state.isNonAgentTask(msg.task_id)`). If the mark is
   present it emits a `tool_result` for the Bash node (`:745-756`). If not, it emits
   `agent_completed` with `parentToolUseId = msg.tool_use_id` (the Bash tool id) and
   `summary = msg.summary` (`:760-808`).
3. The SDK notification type has no `task_type` (only `task_id`, `tool_use_id`, `status`,
   `reason`, `summary`, `usage`): `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:6401-6425`.
4. Mark lost, case A — compaction: `system-message.transformer.ts:89` calls
   `clearStreamingState()`, which runs `this.nonAgentTaskIds.clear()` at
   `sdk-message-transformer.ts:546` and drops the task→parent entry of every non-announced task
   (`:538-542`). The Bash link map `bashTaskToolUseIdsBySession` is NOT cleared (`:521-547`).
5. Mark lost, case B — new stream: each session stream gets a fresh
   `messageTransformer.createIsolated()` (`libs/backend/agent-sdk/src/lib/helpers/stream-transformer.ts:580-597`).
   A shell started in an earlier stream (query restart, resume, SDK `reason: 'worker_restart'`,
   `sdk.d.ts:6411-6414`) has no mark in the new stream.
6. Frontend: `accumulator-core.service.ts:630-634` (`libs/frontend/chat-streaming/src/lib/`) calls
   `AgentMonitorStore.onAgentCompleted`, which creates a record when none exists, with no check
   of the parent tool (`libs/frontend/chat-streaming/src/lib/agent-monitor.store.ts:2731-2767`).
   `agentType`, `teammateName`, `description` are undefined, `startedAt = completedAt =
   event.timestamp` (→ "0s"), tokens undefined (→ "—"), `latestSummary` = the shell summary.
7. Roster row name falls back to `'Sub-agent'`:
   `libs/frontend/chat/src/lib/services/session-agents/session-agent-roster.ts:141,158`. Lane title
   uses the same fallback: `libs/frontend/chat/src/lib/components/organisms/subagent-lane/subagent-lane.component.ts:260-265`.
   The single message is `finishedSummary` (no nodes, not live): same file `:270-287`.

Commit history:
- `c49c318fa` (2026-08-24, "stop a background bash pretending to be a subagent", reached main
  via the merge chain ending at PR #441) added the mark-based guard AND the
  `nonAgentTaskIds.clear()` in `clearStreamingState` (`git log -S"nonAgentTaskIds.clear()"`).
  It did not cover cases A and B. `ac43b0818` later added the `tool_result` settle branch
  (`git log -S"local_bash tasks never become agent cards"`).
- PR #883 (`8b3553e9c`, branch `feat/background-task-surface`) made background commands
  visible: `5fe20b734` ("show live SDK background tasks in agent roster") and `541f31a16`
  ("show background tasks as tiles above composer"). These commits added the snapshot/tile path
  and the Bash command links. They do not emit `agent_completed`. They are NOT the direct cause.
  They only make long-lived background shells (for example a screen recorder) more common, so
  cases A/B are hit more often. Root cause: the guard in `c49c318fa`.

## 2. Behavior per kind today

| Kind | Live path | Phantom "Sub-agent"? | "could not be linked"? |
|---|---|---|---|
| (a) background shell | `tool_result` on the Bash node if the mark exists; `agent_completed` if the mark is lost (A/B) | YES when the mark is lost | YES, always for the phantom |
| (b) background Agent subagent | `agent_start` + `background_agent_started` + `agent_completed` | No | Only if `agentId` is missing and correlation fails |
| (c) foreground Agent subagent | `agent_start` → `agent_completed` | No | Same condition as (b) |
| (d) CLI lane (`ptah_agent_spawn`) | separate `cliAgents` rows (`session-agent-roster.ts:159-177`) | No | No (other output store) |

"Saved output for this agent could not be linked." is in
`subagent-lane.component.ts:169-171` and `libs/frontend/chat/src/lib/components/organisms/execution/inline-agent-bubble.component.ts:475-477`.
It shows when `history === 'unresolved'`. The backend returns `'unresolved'` when the record has
no `agentId` and `correlateAgentId` finds no transcript
(`libs/backend/agent-sdk/src/lib/session-history-reader.service.ts:215-232,282-283`). A shell task
has no `agentId` and no `agent-*.jsonl`, so it always fails. A real subagent fails only if no
`agentId` arrived AND the Task tool_use cannot be correlated. That is a separate, real case.
History replay is safe: it emits `agent_completed` only for a `<task-notification>` whose tool id
has a replayed `agent_start` (`libs/backend/agent-sdk/src/lib/helpers/history/session-replay.service.ts:229-245`).

(b), (c) and (d) are unaffected by this bug. These existing tests show it:
`system-message.transformer.spec.ts` "rejects a local_bash task_started…" (`:530`),
`sdk-message-transformer.spec.ts` "settles an announced background task whose notification omits
tool_use_id" (`:1225`), and `session-agent-roster.spec.ts` "carries subagent start and completion
times into its row" (`:15`). No test covers `local_bash` + compaction + notification with
`tool_use_id`, or a notification in a fresh stream.

## 3. Why "stopped"

`agent_completed.status = msg.status` (`system-message.transformer.ts:785`). The SDK sends
`'stopped'` for a killed shell (TaskStop/KillShell, query end) and for an orphaned task after
`reason: 'worker_restart'` (`sdk.d.ts:6410-6414`). Case B matches that: the resumed process has
no `task_started` for the shell, so its stop notice becomes an `agent_completed` with
status `stopped`. `'completed'` maps to "done".

## 4. Minimal fix design

Backend (primary):
1. `sdk-message-transformer.ts`: keep the non-agent identity across compaction. Do not clear
   `nonAgentTaskIds` in `clearStreamingState` (`:546`). Also add
   `isBackgroundShellToolUse(toolUseId, sessionId)`, backed by `bashTaskToolUseIdsBySession` and
   `pendingBashCommands` (both survive compaction). Add it to the interface in
   `message-transform/transformer-state.ts:108-112`.
2. `message-transform/assistant-message.transformer.ts:153-164`: record `PowerShell` with
   `run_in_background: true`, not only `Bash` (use a shared `SHELL_TOOLS` set, as in
   `helpers/compaction/tool-output-capper.ts:61`).
3. `message-transform/system-message.transformer.ts:708`: `isNonAgentTask =
   state.isNonAgentTask(id) || state.isBackgroundShellToolUse(parentToolUseId, session)`.
   For an unknown task (no mark, no parent link, no `task_started` in this stream, no registry
   entry for `parentToolUseId`), do not emit `agent_completed`. Emit the `tool_result` only.
   Log at debug with `{taskId, reason}`.
4. Optional: add the Monitor task type to `NON_AGENT_TASK_TYPES` (`exec.ts:343`). The SDK lists
   "shell, monitor or workflow" as task kinds (`sdk.d.ts:3858`). Confirm the exact literal first.

Frontend (defense, case B after a reload):
5. `agent-monitor.store.ts:2731`: in `onAgentCompleted`, do not create a NEW record when there
   is no existing record, no `agentId`, and no Agent/Task tool node. A simple rule: pass a
   `parentToolName` from `accumulator-core.service.ts:630-634` (read from the tool node in
   `state`), and skip creation when `!isAgentDispatchTool(parentToolName)`. Keep merges into
   existing records unchanged, so (b)/(c) keep name, type, tokens and time.
6. The inline notice stays as it is: the Bash node gets the `tool_result`, and the turn-state
   snapshot already removes the task (`system-message.transformer.ts:677-690`). The roster and
   header totals then exclude it automatically (`session-agent-roster.ts:155-158`).

Contracts: no RPC or Zod change is needed. `AgentCompletedEvent`
(`libs/shared/src/lib/types/execution/stream-background.ts:188`) is a TS type with no Zod schema
in `libs/shared`. No DI token or RPC guard spec changes. If step 5 adds a parameter, only the
`AgentMonitorStore.onAgentCompleted` signature changes (internal to `chat-streaming`).

"could not be linked" on a real failure with a reason: optional follow-up. Add a `reason`
(`'no-agent-id'` | `'no-transcript'`) to the `'unresolved'` result of
`session-history-reader.service.ts:282` and the `HistorySnapshot` in
`libs/frontend/chat-streaming/src/lib/subagent-execution.store.ts:77-80`. This touches the
subagent-history RPC response type. Find the exact type with `ptah_code_search_symbols
"subagent history"` before you edit.

## Regression tests (where and with which helpers)

- (a) compaction: `libs/backend/agent-sdk/src/lib/sdk-message-transformer.spec.ts`, in
  `describe('SdkMessageTransformer — task_notification after compact_boundary')` (`:1187`).
  Reuse `build()`, `notification()`, `completionsOf()`, `makeCompactBoundary()` (`:96`),
  `makeAssistantWithToolUse()` (`:646`) and a `local_bash` `task_started` (`taskStarted()` at
  `:328`). Expect no `agent_completed` and one `tool_result` on the Bash id. Add a PowerShell variant.
- (a) fresh stream: same file. Call `createIsolated()` twice and send the notification with
  `tool_use_id` and `status: 'stopped'`, `reason: 'worker_restart'` to the second stream.
- (a) frontend: `libs/frontend/chat-streaming/src/lib/accumulator-core.service.spec.ts`. Reuse
  `toolStart({ toolName: 'Bash' })` (`:128`). Feed an `agent_completed` for that id. Expect
  `AgentMonitorStore` to have no subagent.
- (b): `system-message.transformer.spec.ts` (`makeState()` `:8`, `makeHelpers()` `:102`). A
  `local_agent` + `is_backgrounded` task still emits `agent_completed` and the background terminal.
- (c): `libs/frontend/chat-streaming/src/lib/agent-monitor.store.spec.ts`
  (`describe('monotonic background and history settlement')`, `:190`). `agentStart` then
  `onAgentCompleted` keeps `agentType`, tokens and `startedAt`.
- (d): `libs/frontend/chat/src/lib/services/session-agents/session-agent-roster.spec.ts`. Reuse
  `lane()` (`:5`). A CLI lane row is still present and no `'Sub-agent'` row appears.

Verify with `npm run verify -- -p agent-sdk,chat-streaming,chat` (use the Nx project names from
`project.json`).
