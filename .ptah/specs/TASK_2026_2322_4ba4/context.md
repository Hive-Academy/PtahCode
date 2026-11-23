# Task Context - TASK_2026_2322_4ba4

## User Request
"i'm planning to remove agy stream-json completely and rely only on acp" ... "lets start 2 workflow
in 2 different worktrees on parallel and u orchestrate other subagents for both of them and go into
full auto mode until you review/live test and address review comments for both and merge" ...
"just remove completely" (2026-11-23, during TASK_2026_2320_lnpar Gate 1.7).

## Task Type
REFACTORING

## Complexity
Medium-Complex

## Strategy
REFACTORING: architecture (with parity-inventory.md: every capability of the stream-json transport
and where ACP covers it) -> document-review -> Gate 2 (orchestrator, full auto) -> batch ->
implement -> review -> tests -> live test (Gemini 4 Hydrogen, see memory agy-live-test-model) ->
completion -> PR -> CI/reviews -> merge.

## Related
- relatesTo: TASK_2026_2320_lnpar (lane chat parity, worktree `.claude-worktrees/lane-chat-parity`).
  That task targets the agy ACP lane only. Coordinate on shared files: agy ACP lane
  (`antigravity-acp-lane.ts`), adapter registry, capability manifests.
- Evidence: TASK_2026_2320_lnpar research-report.md Q8 (agy stream-json continues over NDJSON stdin;
  model/effort only at spawn), and audit row `antigravity-cli.adapter.ts:674`.

## CLI Lanes
No ptah_* lane tools in this session; lanes disabled. Approval: user granted full auto; the
orchestrator approves Gate 2 on an APPROVED review. Removal of stream-json is user-approved.

## Conversation Summary
- Removal of the stream-json transport is approved by the user. Any other capability removal still
  goes to the user.

## Gate decisions
- 2026-11-23 Gate 2: implementation-plan.md + parity-inventory.md revision 1 APPROVED by same-side
  review after 1 revise round; approved by the orchestrator under the user's full-auto instruction.
  Non-blocking R1-R3 go into the Group B / Group C briefs.
