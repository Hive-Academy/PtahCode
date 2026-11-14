# Runtime evidence (orchestrator, sanitized)

Source: the nx-video parent Codex thread rollout
`%USERPROFILE%/.codex/sessions/2026/11/13/rollout-2026-11-13T13-46-33-01a1d4bb-142d-7aa1-aedc-199cd321dbae.jsonl`
(read-only, only record types / ids / kinds extracted, no prompt text) and the Electron log
`%APPDATA%/Ptah/logs/Ptah Electron-2026-11-13.log`.

## Facts

- `session_meta`: `originator: "ptah"`, `cli_version: "0.166.0"`, `source: "vscode"`.
  `turn_context.multi_agent_version: "v2"`.
- Collaboration tools are namespaced **function calls**, not `collabAgentToolCall` items:
  `collaboration.spawn_agent` 6, `collaboration.followup_task` 11, `collaboration.send_message` 47,
  `collaboration.wait_agent` 62, `collaboration.list_agents` 3.
- Thread items in the parent rollout: `SubAgentActivity` 76, `CollabAgentToolCall` 62. Every
  `CollabAgentToolCall` has `tool: "wait"`, empty `receiver_thread_ids`, empty `agents_states`.
  **No `CollabAgentToolCall` with `tool: spawnAgent` exists.**
- `SubAgentActivity` sample (spawn):
  `{"type":"SubAgentActivity","model":"gpt-6-astra","reasoning_effort":"high","id":"call_0cd3…(= spawn_agent call_id)","kind":"started","agent_thread_id":"01a1d4c3-9ec1-…","agent_path":"/root/native_permission_probe"}`
  on the parent thread, in the parent turn that made the call.
- Lifecycle per agent path (timestamps UTC): `started` once, then repeated
  `interacted` (follow-up / message from parent) and `completed` (child turn done) many times.
  Example `/root/workspace_review`: started 11:57:46, interacted 12:05:05, completed 12:07:00,
  interacted 12:07:52, … completed 14:41:59. `/root/native_vortex` started 11:57:31 only.
  `kind` enum in the pinned schema: `started | interacted | interrupted | completed`.
- Activities are reported inside whichever parent turn is active when the event occurs. Example:
  one parent turn holds `started`, `completed`, `interacted` and `started` records for several
  agents, including completions of children started in earlier turns. Every parent
  `task_started.turn_trigger` is null.
- Electron log: `Codex child linked {parentThreadId: 01a1d4bb…, childThreadId: 01a1d4c3…}` at
  11:55:53.412 (20 ms after the activity), and the same for each child. Child notifications did
  reach the backend.

## Consequence in code (verified by reading)

1. `codex-event-translator.ts` has no `case 'subAgentActivity'`; it falls to `default` ->
   `{ type: 'error', error: safeError('unsupportedItem') }` (~line 728).
   `codex-chat-events.ts` `case 'error'` returns `[]` (~426-428). The activity is dropped.
2. `codex-context.ts:509-516` links a `subAgentActivity` child only when exactly one pending
   `spawnAgent` tool exists for the parent thread. With v2 there is none.
3. `codex-context.ts:468-476`: an unlinked child thread notification calls
   `linkChild(threadId, threadId)`. Child events then carry `parentToolUseId = <child thread id>`.
   No `tool_start`/`agent_start` with that `toolCallId` exists, so the frontend has no Task node to
   attach them to.
4. Only the v1 `collabAgentToolCall(spawnAgent)` path produces Task `tool_start` + `agent_start`
   (`codex-event-translator.ts:685-707`, `codex-chat-events.ts:349-370,483-510`). Existing tests
   cover only v1.
