## How a queued message starts a turn

- agent-process-manager.service.ts:2434-2474 routes `sendToAgent(..., 'queue')` through AgentMessageRouter.
- agent-message-router.service.ts:215-219 parks a message during a running turn, but calls `startNewTurn` after a turn has ended; line 326 calls `continueConversation`.
- agent-message-router.service.ts:351-397 drains one pending message at settle and calls `continueConversation`; this already starts its own next turn.
- codex-app-server-lane.adapter.ts:859-862 stores a warning, and line 740 prepends it only when another prompt starts. CLI/SDK lanes without that mailbox use the router pending queue; plain CLI processes without continuation return unsupported at router line 221.

## Changes

- lane-budget-telemetry.ts:7-29 steers an active turn, attaches only to existing pending work, otherwise returns `held` without sending to the lane.
- lane-budget-telemetry.ts:84-88 logs the held outcome once as `Budget warning held` with agentId and mode.
- agent-process-manager.service.ts:454-466 rechecks the first pending message after any asynchronous steer; Codex uses its next-turn mailbox and other adapters prepend the warning to that message.
- lane-budget-telemetry.spec.ts:15-92 covers completed/idle, active steer, pending message, Codex mailbox, rejected steer, and held logging.

## Tests

- Tests were not run, as directed. Scoped ptah_get_diagnostics was attempted but timed out after 45 seconds with no result; coordinator verification remains pending.
- Read the edited code again for type errors. No shared message schema change was needed because `held` is an internal warning outcome.

## Decisions

- Used the existing pending-message queue as proof of a scheduled next turn; reversible. A lane status of `running` permits a steer attempt, and a rejected steer holds the warning if no message is pending.
- Kept the held mode local to lane budget telemetry because the result is not returned through host RPC; reversible.

## Not done

- Did not add a later-parent-message replay hook: it needs lifecycle storage and cleanup beyond the requested small queue-path hunk. The budget-stop completion envelope already carries warning text (lane-completion-envelope.ts:34).
- Did not change budget thresholds, stop behavior, the budget policy/coordinator, or run tests/builds.