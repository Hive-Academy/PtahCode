# Review — TASK_2026_935_5a17 (background shell → phantom "Sub-agent" card)

Scope: uncommitted `git diff` (15 files), read only. No tests were run (verify already active).

## Verdict: APPROVE — no blocking findings

The fix is correct for the reported paths. Backend: compaction no longer drops the shell mark,
a shared `BackgroundShellLedger` keeps shell tool_use ids across isolated streams, and the
turn-state snapshot (read in `buildAgentCompleted` BEFORE `transformTaskNotification` removes
the task) gives a third positive signal. Frontend: `onAgentCompleted` refuses to CREATE a record
under a Bash/PowerShell tool node and still merges into an existing record.

## Correctness checklist
- Shell after compaction / new stream: covered (ledger + unclear `nonAgentTaskIds`). PASS.
- Real fg/bg subagent keeps `agent_completed` with name/type/tokens/time: only positive shell
  evidence suppresses (`system-message.transformer.ts:725-728`). `local_agent` snapshot type
  and `undefined` type stay agents (`isAgentTaskType`). PASS.
- Real bg subagent with known agent_start is not suppressed: its tool_use id never enters the
  ledger, and the frontend guard skips only when no record exists. PASS.
- Bash node `tool_result` still emits (`system-message.transformer.ts:765-777`). PASS.
- Session ids match at write (`assistant-message.transformer.ts:164`, `sessionId || sdk
  session_id`) and read (`taskSessionId`, `:715`). PASS.

## Findings
1. LOW — Deviation from investigation §4 step 3. Unknown tasks (no mark, no ledger hit, no
   snapshot) still take the agent path. This is the safer choice (no hidden real subagent),
   but a shell notification after a host-process restart (ledger is in memory) can still
   produce a phantom card if the frontend has no Bash tool node in its streaming state
   (`accumulator-core.service.ts:912-920` returns `undefined`). Accept, and record as a
   known residual in the task notes. No code change needed now.
2. LOW — Memory: `nonAgentTaskIds` is no longer cleared on compaction
   (`sdk-message-transformer.ts:581`). It is per isolated stream, removed per task by
   `clearTaskParent` (`:751`), and FIFO-bounded at 1000 (`:780-783`). The shared ledger is also
   bounded at 1000 (`:91-95`) but is NOT cleared by `clearBackgroundTaskSession` (`:871`) or
   session close. Growth is bounded, so this is acceptable. Optional: drop a session's ledger
   keys on session/tab close if a session-end hook exists.
3. LOW — `MAX_BACKGROUND_SHELL_MARKS` bounds two different structures (ledger and
   `nonAgentTaskIds`). Optional: a separate named constant for clarity.
4. LOW — Shell tool list duplicated in 3 places (`assistant-message.transformer.ts:36`,
   `agent-monitor.store.ts:154`, `helpers/compaction/tool-output-capper.ts:61`). Optional:
   one `isBackgroundShellTool()` guard in `@ptah-extension/shared` (`guards/exec.ts`).
5. LOW (test quality) — `session-agent-roster.spec.ts` (d) is tautological: it feeds the
   roster hand-built records without a shell, so it passes on the old code. It documents
   intent only. Real (d) protection comes from the store/accumulator tests.
6. LOW (test quality) — No frontend test for the reload case (agent_completed with no tool
   node in `state` → guard inactive). Add one if finding 1 is ever fixed.
7. INFO (test quality) — These tests fail on the old code: backend compaction Bash and
   PowerShell, isolated-stream `worker_restart`, snapshot-only shell
   (`system-message.transformer.spec.ts`), and frontend `it.each(['Bash','PowerShell'])` in
   `accumulator-core.service.spec.ts` and `agent-monitor.store.spec.ts`. The (b) and (c)
   tests pass on both old and new code. That is correct: they are regression guards.
   Kinds a-d are all present.

## Repo rules
- No `any`, `@ts-ignore` or `console.*` added. No swallowed errors. No new cross-lib imports.
- The 1-line edits in `assistant-message`, `stream-event`, `stream-event.synthesized-start`,
  `user-message` and `system-message` specs add `isBackgroundShellToolUse` to their
  `jest.Mocked<TransformerState>` literals. These edits are REQUIRED: the interface got a
  new member (`transformer-state.ts:119`), so typecheck fails without them.
- The `toHaveBeenCalledWith(event, undefined)` change in `accumulator-core.service.spec.ts`
  is required by the new `onAgentCompleted` parameter.
- Optional investigation step 4 (Monitor task type) and the "could not be linked" reason
  were not done. They are out of scope.
