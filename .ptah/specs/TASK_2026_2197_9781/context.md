# Context — TASK_2026_2197_9781

## Request (user, 2026-11-16)

The user saw an Electron chat session with context at 3.3% after 7 compactions, a session
budget at 115.9% (34.8M of 30.0M tokens), a "Wrap-up requested" banner, and an "Interrupted"
row after "Continued from previous conversation (compacted)". The user asked for all of the
recommended changes, and also: the "Interrupted" row is confusing; remove it and stop
interrupting the session.

## Scope (user-approved: "i would like to have them all")

1. Change the session budget measure so raw cache-read traffic does not dominate (cost or
   weighted unit already exist in `measureSessionBudget`).
2. Remove the rule that raises the budget stage after N compactions, or apply it only when
   the context stays high after a compaction.
3. Mark an automatic handoff complete only when the handoff record exists; re-send otherwise.
4. Defer a new wrap-up request while a compaction is in progress.
5. Separate the idle compaction minimum from the SDK auto-compact window.
6. Find what aborts the turn after a compaction / wrap-up request. Stop host-initiated
   interrupts of a running turn. Do not show the "Interrupted" row for an abort the user did
   not start. Orchestrator interpretation (not confirmed by the user): a manual stop by the
   user still stops the turn; only its confusing "Interrupted" presentation is in question.

## Evidence

- Investigation report (Codex lane, read-only):
  `D:\projects\ptah-extension\.ptah\tmp\compaction-vs-handoff-investigation.md`
- Orchestrator verified: `session-stats-owner.service.ts:1443` (tokenCount sums input,
  output, cacheRead, cacheCreation); `session-budget-stage.ts:152-160` (stage only rises;
  compactions >= handoffAfterCompactions raises to `handoff`).

## Routing

- Pre-flight: taskType REFACTORING (source model, confidence 0.62); depth from skill table:
  Partial (requirements known).
- Flow: architecture -> document-review -> batch -> implement -> review -> tests -> completion.
- Gate 0.1: lanes enabled (user global preference: delegate to non-Claude CLI lanes).
  Approval: lane-review. Spawnable with confirmed room at start: codex. Glm near limit
  (session 97%, resets 08:00 UTC). kimi code at limit.

## Memory constraints that apply

- Automatic handoff fires only on the authoritative budget stage, not the live estimate.
- `sessionBudget.autoHandoffAtLimit` is opt-in; the 100% behaviour stays advisory.
