# Context — do not auto hand off a reopened idle session

## Report

When the user opens an old session whose usage is above the hand-off limit (30M tokens in the
user's settings) and `sessionBudget.autoHandoffAtLimit` is on, the automatic hand-off fires
immediately. The session did not run a turn. The user expects the hand-off only for a session
that is active (streaming) in this page lifetime.

## Base

The branch starts from the head of pull request 1422 (`fix/handoff-single-send`, `7b1ef1585`),
which changed `awaitingSettlement` in the same service. The pull request of this task targets
that branch. Line numbers below are from `main` and are 5 lines lower than in this branch.

## Cause

`libs/frontend/chat/src/lib/services/session-auto-handoff-coordinator.service.ts`:

- `candidates()` (line 151) accepts each mounted tab whose `sessionBudget.stage === 'limit'` and
  `budget.autoHandoff === true`. The only status gate is `tab.status === 'resuming'`.
- `stillQualifies()` (line 280) has the same gate.
- A reopened session receives its budget state at load, so it is a candidate with no turn.

## Decision

A session is a candidate only after the coordinator saw it "active" in this page lifetime:
a mounted tab with that `claudeSessionId` had `status === 'streaming'` at least one time.

- Keep a private `Set<string>` of active session ids in the coordinator. Fill it from the tabs
  that `budgetTabs()` returns, inside the tracked evaluation (the effect already re-runs on each
  tab change in both partitions).
- `candidates()` skips a session that is not in the set, with `logSkip(..., 'no turn in this
  page lifetime', ...)`.
- `stillQualifies()` returns `null` for a session that is not in the set.
- The set is not cleared when the turn ends: a budget update that arrives after the turn must
  still fire. A hand-off for a streaming session still goes through the queued send path.
- No backend change. No setting change.

## Revision after review

`code-logic-review.md` showed that a set filled by sampling in the coordinator effect misses real
turns. The final design replaces the private set:

- `SessionTurnActivityStore` (`libs/frontend/chat-state`) holds the session ids that had a turn in
  this page lifetime. `TabManagerService.updateTabInternal` writes it when a tab write results in
  `status === 'streaming'` with a session id.
- The coordinator reads `hasTurnActivity(sessionId)` in `candidates()` and `stillQualifies()`.
- Findings 1 and 2 are closed. Finding 3 stays open: for a hidden tab the backend sends only the
  terminal turn state, and a plain open or resume can receive the same state, so the renderer
  cannot use it as proof of a turn. A correction needs a backend change in a separate task.

## Acceptance

1. A tab loaded at stage `limit`, auto hand-off on, status never `streaming`: no skill probe, no
   claim, no send.
2. The same tab, after its status becomes `streaming`: the hand-off fires one time (queued or sent).
3. A session that streams and then reaches `limit` after the turn ends: the hand-off fires.
4. The existing specs stay green (adjust fixtures that rely on the old behavior so that they mark
   the session active first).
