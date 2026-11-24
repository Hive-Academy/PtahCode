# Task Context - TASK_2026_2324_efc4

## User Request

2026-11-24, after PR #1501 (TASK_2026_2320_lnpar) was ready: "i think u can start the visual review now
so we can finish up all of those remaining batches and follow ups".

## Scope (follow-ups recorded in TASK_2026_2320_lnpar)

1. **Batch 30: Claude lane steer.** Flip the Claude and ptah-cli manifest `messaging.steer` to
   supported and pass `manifestSteer` into the runner context in `claude-cli.adapter.ts` and
   `ptah-cli-registry.ts`. Gated on live test L4: the Claude SDK result's `user_message_uuids`
   must list the steer. Binding notes for this batch are in
   `TASK_2026_2320_lnpar/executor-notes.md` (P6 review M6):
   - a missing `user_message_uuids` must not count every steer as missed;
   - clean up `pendingSteers` when `enqueue` throws;
   - place the placeholder resolver correctly.
2. **SDK sub-agent composer.** `subagent-lane-composer` adopts the unified lane composer look. The
   user answered "the subagent should follow same yes" at Gate 1 of TASK_2026_2320_lnpar.
3. **Superseded store methods.** `AgentMonitorStore.continueAgent` and `resumeAgentWithMessage` are
   superseded by `AgentDeliveryStore` → `agent:sendMessage`, where the backend coordinator continues
   or cold-resumes. They have no production callers and can be deleted.
   `interruptSession` (session-wide sub-agent interrupt) has no UI caller and no equivalent, and
   neither does its twin `ClaudeRpcService.interruptSubagentSession`. Whether to delete it or wire
   it to a button is for the user to decide.
4. **ACP live usage.** Grok and agy report usage at turn end today. Check whether they send
   `_meta.usage` mid-turn. If they do, stream it the way the other adapters do.
5. **Effort levels for stopped ACP and Codex lanes.** Today the UI shows "options appear when the
   lane is running". Persist the last known catalog, or derive efforts from the ACP profile and the
   Codex model catalog.

## Task Type
FEATURE

## Complexity
Medium

## Strategy
FEATURE, reduced depth, because the requirements are inherited from TASK_2026_2320_lnpar (task-description,
design-spec and implementation plan approved there): architecture (short plan) -> batch ->
implement -> review -> tests -> completion. Item 1 waits for the L4 result from the Electron live
run, which uses frozen worktree `.claude-worktrees/lane-parity-visual` at 2aba18e6e.

## CLI Lanes
No ptah_* lane tools in this host session; mode disabled. Approval: user (full-auto instruction
carried over: the orchestrator approves gates after an APPROVED review; merge when CI is green and
all review comments are addressed).

## Verification
The user said "let CI do the verification, don't run it locally": focused jest, eslint and the two
static audit scans locally; CI runs the full gate.
