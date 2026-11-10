# Code Logic Review - TASK_2026_910_e8e2

## Verdict

APPROVE WITH FIXES - the grace turn is skipped whenever the 80% warning fired earlier, and the held warning rarely reaches the lane.

## Findings

1. MAJOR - `libs/shared/src/lib/utils/agent-budget-policy.ts` `decideTurn` (`deferTokenStop = !duplicate && !snapshot.warned && ...`). The grace turn is only granted when `warned` is still false. `assess` sets `warning` at 80% of the limit, and also predictively when `total + largestTurnTokens >= stop`, and `warned` is persisted. In the normal progression (warn at 80%, then cross 100%) `warned` is already true, so the crossing stops the lane at once with no grace turn. D2 says the first token-limit crossing warns and does not stop. Fix: track the grace separately (for example `graceUsed` or `limitCrossedAt` in the snapshot), or defer when `total >= stop` and the snapshot was not already over the limit. The spec (`agent-budget-policy.spec.ts:107`, `:149`) only tests a jump from below the warn ratio straight over the limit, so it misses this case.
2. MAJOR - `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-budget-telemetry.ts` `deliverLaneBudgetWarning` and `agent-process-manager.service.ts` ~456-466. The warning fires from turn-completion telemetry. At that point `status === 'running' && !hasExited` is often false, or steer fails, and `pendingMessages[0]` is usually empty. The result is `{mode:'held'}`, which only logs "held". `warned` is already set, so the warning is never retried, and the lane and parent never see it. The lane then gets a grace turn without knowing it is the last one. Fix: persist a `pendingWarning` flag and attach it to the next message the router drains, or make `held` surface to the parent, or retry on the next turn boundary.
3. MINOR - `agent-budget-policy.ts` `decideTurn`, `duplicate && decision.stopReason === 'budget' ? undefined`. A duplicate turn on an already over-limit or over-context-ceiling ledger no longer returns `budget`. On `main` a duplicate still returned the stop. Impact is small because the next non-duplicate turn stops it (`warned` is true). Fix: suppress only token-total stops on duplicates, and keep the context-ceiling stop.
4. MINOR (borderline major) - `agent-budget-policy.ts` evaluate, the `cacheRead` calculation. The `usage.models` path takes `model.cacheReadTokens` as verified with no `cacheSemantics` check, and caps only against the aggregate `usage.inputTokens`. If an adapter reports cache reads outside input (the Anthropic shape), the floor becomes `raw - 0.9*min(input, cache)`. For input 100, output 50, cache 100 that is 60, against a true load of about 160. `priced` rescues it when pricing exists; with `priced === null` the floor is too low. Fix: cap per model against `model.inputTokens`, and require the verified semantics before applying the discount.
5. MINOR - `agent-budget-coordinator.ts:76`, `unavailableTurns: current.unavailableTurns ?? record.unavailableTurns`. When the new coordinator has already seen N>0 unavailable turns since resume, the earlier streak is dropped (not added). With a record streak of 2 and one new unavailable turn, the result is 1 and not 3. Fix: if the current ledger holds only unavailable turns, add `record + current`. Otherwise keep `current` as the reset. The `_turnCount` change itself is correct: the duplicate check uses the pre-evaluate snapshot and now counts unavailable turns once.
6. MINOR - `agent-budget-policy.ts` unavailable branch. The estimate is `largestTurnTokens ?? 0`, so three early unavailable turns charge 0. Growth is bounded by the 3-turn stop, so it is not unbounded. An unavailable turn ID is pushed into `turnIds`, so a later reported turn with the same ID is treated as a duplicate and never charged. Cheap fix: do not record unavailable IDs in `turnIds`, or namespace them.
7. MINOR - `lane-budget-telemetry.ts` dispatch. The `outcome.mode === 'unsupported'` branch is now dead code, because `deliverLaneBudgetWarning` returns only steer, queue-next-turn or held. Remove it, or narrow the type.
8. MINOR - `agent-process-manager.service.ts:~459`. `attachToPending` mutates `pendingMessages[0]` through `queueForNextTurn` or a text rewrite. The mutation is synchronous, so it cannot interleave with the router. If the router already shifted that message and is awaiting send, the warning rides a later message, or is queued for a turn that may never run. Low risk. Fix: when `queueForNextTurn` is used, make sure the pending message is actually still queued.
9. MINOR - `session-auto-handoff-coordinator.service.ts` `loggedSkips`. The set is keyed by session and reason, is never pruned per session, and is cleared only on destroy. It is bounded by sessions times reasons, which is fine for a page lifetime. It does not hide a fire, because the fire log is not deduped. A transient reason is never logged a second time after it clears.
10. MINOR - specs. Missing cases:
    - warned at 80%, then crossing 100%, expecting a grace turn (finding 1);
    - a duplicate turn at the context ceiling;
    - the `models` path with non-subset cache semantics;
    - a `rebindRecord` streak with `current.unavailableTurns > 0`;
    - a `held` warning reaching nobody.

## Answers A-G

- A. The lane is bounded. Duplicates charge 0 and cannot be repeated for gain. `warned` is set whenever `deferTokenStop` fires, so the grace turn cannot repeat more than once. The unavailable estimate of 0 is bounded by the 3-turn stop, but alternating reported and unavailable turns resets the streak (intended per D5). The real defect is the opposite: the grace turn can be skipped (finding 1).
- B. Yes, a mild regression (finding 3), self-healing on the next new turn.
- C. Yes, the floor can be too low when `priced` is null (finding 4).
- D. A streak carries through resume only when the current side is undefined. It is lost when the current side is greater than 0 (finding 5). It is not doubled. The `_turnCount` change is correct.
- E. There is no race in the JS single thread (finding 8). The `unsupported` branch is dead (finding 7). A `held` warning is only logged; it reaches neither the lane nor the parent, and it is not retried (finding 2).
- F. `loggedSkips` is bounded (finding 9). The reordering is behaviour-neutral: the stage, session-id and `autoHandoff` checks stay before the session dedupe, and the remaining gates keep their order. The fire log is emitted after `recordQueued`.
- G. The specs assert policy outputs and snapshots, not just mocks. The gaps are listed in finding 10.

## Not checked

- `agent-message-router.service.ts` drain logic.
- Adapter `cacheSemantics` and unavailable-turn ID generation.
- The settings components and the `session-budget.types` default flip beyond the diff stat.
- No tests were run (none permitted).
