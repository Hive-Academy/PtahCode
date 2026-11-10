# Review resolution (TASK_2026_910_e8e2)

Source: `code-logic-review.md` (verdict APPROVE WITH FIXES, 10 findings). The reviewer was a
Claude subagent because no other lane family had room (see `context.md`, "Review executor").

| # | Severity | Finding | Resolution |
| - | -------- | ------- | ---------- |
| 1 | major | The grace turn did not occur when the 85% warning came first. | Fixed. `decideTurn` compares the pre-charge total with the stop limit (`policy-review-fix-report.md`). |
| 2 | major | A held budget warning reached nobody. | Fixed. The warning is held on `TrackedAgent`, prepended one time to the next parent message, and shown in the completion envelope (`held-warning-fix-report.md`). |
| 3 | minor | A duplicate turn suppressed the context-ceiling stop. | Fixed. Only the token stop is suppressed for a duplicate turn. |
| 4 | minor | The cache-read cap applied to the sum, not to each model. | Fixed. The cap applies per model before the sum. |
| 5 | minor | A rebind lost the unavailable-telemetry streak. | Fixed in `AgentBudgetCoordinator.rebindRecord`. |
| 6 | minor | The estimate for an unavailable turn is 0 when `largestTurnTokens` is undefined. A later report for the same turn ID is a duplicate. | Accepted, no change. The three-turn stop still limits a lane without telemetry. A change needs a second estimate source. |
| 7 | minor | Dead `unsupported` branch in `LaneBudgetTelemetry.dispatch`. | Fixed. The branch is removed. |
| 8 | minor | `attachToPending` changes `pendingMessages[0]`. The reviewer found no defect. | None. |
| 9 | minor | `loggedSkips` is not pruned per session. The reviewer found it bounded. | None. |
| 10 | minor | Missing spec cases. | Added in the policy, coordinator, telemetry, manager, notifier and envelope specs. |

## Decisions that the user must see (from `context.md`)

- D1: verified cached input reads count at 10% of their raw tokens. The 3,000,000 default stays.
- D2: the turn that crosses the token limit warns the lane. The next new turn stops it.
- D3: `sessionBudget.autoHandoffAtLimit` default changes to `true`. A saved `false` stays off.
- D4: a lane stopped by its budget does not resume.
- D5: a turn without telemetry charges the largest known turn. Three consecutive such turns stop
  the lane.
- D6: the budget warning never starts a turn.

## Final scoped verification

Command: `npm run verify -- -p @ptah-extension/shared,@ptah-extension/cli-agent-runtime,@ptah-extension/agent-sdk,@ptah-extension/chat,@ptah-extension/codex-runtime`

- Lint and typecheck: 10 tasks, 10 succeeded.
- Test: 5 tasks, 5 succeeded.

Scope decision: lane accounting (cache-read weight, grace turn, bounded
unavailable-telemetry turns) is opt-in through `AgentBudgetPolicyOptions.laneAccounting`.
Only the CLI lane coordinator and the lane resume gate opt in. The subagent budget
monitor and the Codex child budget tap keep the behaviour of `main`.
