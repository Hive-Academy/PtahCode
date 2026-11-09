# task-description.md — Gate 1 review

- Author: project-manager on Codex CLI lane (family codex)
- Reviewer: orchestrator, in-process (family claude), opposite execution side
- Verdict: **APPROVED** (round 0)

## Checks

- Every user ask maps to scope: handoff ack/close (Phase A, AC 1-4), `in_review` on PR (AC 5),
  background close-out after merge (AC 7, 10), manual skill learning (AC 8), cleanup gate (AC 9).
- Evidence spot-checked: `session-handoff.service.ts` arms the stop on caller-turn flush, with
  no ack. This confirms that the close happens today without acknowledgement.
- No removal of an existing capability is proposed without a user question (history
  retention is raised as open question 2).

## Notes for the architect (not blocking)

1. Decide the `in_review` trigger: an agent step after `gh pr create` (orchestration skill +
   `ptah_task_update`), a host-side PR detector, or both with reconciliation.
2. Decide the merge-detection source for the background close-out (git watcher / `gh` poll /
   orchestration watch) and reconcile it with the existing task-end hook (risk 3: duplicate or
   early learning).
3. AC 8 changes the default trigger of skill synthesis. List every current automatic caller
   (Stop callback, boot) in the plan so that none is missed.

## Lane-introduced constraints

- "Repeated acknowledgement has the same final result" (AC 3) and "safe retry" (AC 7, 10):
  lane-proposed, reasonable, kept.
