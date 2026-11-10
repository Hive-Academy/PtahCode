# Context — TASK_2026_910_e8e2

## User report

1. The lane agent budget force-closes CLI agent lanes after a few minutes and refuses resume.
   "cli agent shouldn't have to be forced to be closed our context management should be handled
   better than this".
2. The automatic session handoff "that should be fired when we reach 100% of our 30M session
   limit is not working".

## Evidence

Full findings with `file:line`: `investigation.md` (codex research lane, read-only).

| Defect | Root cause | Evidence |
| --- | --- | --- |
| Short lanes reach 3M | `raw = inputTokens + outputTokens` counts cached input reads at full weight, and `total = max(raw, weighted)` makes that raw figure the floor even when the catalog weighting is valid | `libs/shared/src/lib/utils/agent-budget-policy.ts:97,117,130`; Glm lane 780e65f6: 4,034,723 input of which 3,900,160 cached |
| Stop with no earlier warning | A turn that crosses the warning and the stop threshold together gets the stop only; the warning text is appended to the stop message | `lane-budget-telemetry.ts:84-94`, `agent-budget-policy.ts:99-105` |
| Resume starts a fresh lane | `LaneResumeGate.evaluate` returns `fresh` after a budget stop or at the warning threshold. Policy, not a vendor limit | `lane-resume-gate.ts:117-133` |
| No automatic handoff at 100% | `sessionBudget.autoHandoffAtLimit` defaults to `false`. The user's `~/.ptah/settings.json` has `sessionBudget.tokens: 30000000` and no `autoHandoffAtLimit` key, so the renderer coordinator never fires | `session-budget.types.ts:228-232`, `session-auto-handoff-coordinator.service.ts:305-319` |
| No log why the coordinator skips | The coordinator does not log a skip reason | `session-auto-handoff-coordinator.service.ts:108-203` |

## Decisions (coordinator, from the user's statements)

- D1. Cached input reads count at 10% in the raw floor when the cache classes are verified.
  The 3M default stays. Reversible: yes.
- D2. A lane gets one grace turn: the first budget crossing delivers the warning, the stop
  comes at the next accounted turn. Duration and context-ceiling stops stay immediate.
- D3. `sessionBudget.autoHandoffAtLimit` default becomes `true` (the user expects the handoff
  to fire at 100%). The settings toggle stays. Reversible: one line.
- D4. The resume gate policy stays (fresh lane with a handoff brief at the warning threshold).

## Lanes

| Lane | Family | Scope | Deliverable |
| --- | --- | --- | --- |
| L1 | codex | Lane budget policy: D1, D2, help text, agent-lanes skill text | `lane-budget-fix-report.md` |
| L2 | codex | Session handoff: D3, skip-reason logs | `auto-handoff-fix-report.md` |

Review: cross-family (a non-codex lane), recorded in `code-logic-review.md`.

## Workflow

BUGFIX, Partial depth: investigate → implement → scoped verify → independent review → PR.

## Addendum 2026-11-09 23:15 UTC — third forced stop: `telemetry-unavailable`

Evidence (`%APPDATA%/Ptah/logs/Ptah Electron-2026-11-10.log`):

| Line | Event |
| --- | --- |
| 5254 | Glm lane `6c9974f7` turn `:0` accepted: 2,286,673 input, 2,234,048 cache read, ratio 0.78 |
| 5258 | `Budget warning delivered` with mode `queue-next-turn` |
| 5486 | Turn `:1` (the queued warning turn): `Lane turn telemetry unavailable`, reason `no-usage-event` |
| 5488 | `Agent budget tripped; stopping`, `stopReason: telemetry-unavailable`, `toolCalls: 0` |
| 5004-5006 | Same sequence on lane `6431e91c` at 22:57:46 |

Code: `AgentBudgetPolicy.evaluate` (`libs/shared/src/lib/utils/agent-budget-policy.ts:110-114`)
stops the lane on the first turn whose telemetry is `unavailable`.

Findings:

1. One turn with no usage event stops the lane at once (fail closed), with no warning.
2. The queued budget warning starts a new turn on a lane whose work turn already completed.
   That turn does no tool call, reports no usage, and triggers finding 1. The completion
   signal then arrives two times (`completed`, then `stopped`).

Planned lane L3 (after L1, same write set): D5 tolerate a turn with unavailable telemetry
(charge an estimate, stop only after consecutive unavailable turns), D6 do not start a new
turn only to deliver a budget warning when the lane has no pending work.

## Review executor (2026-11-09 23:40 UTC)

The code came from codex lanes, so the review needs a different family.

| Lane | Family | Result |
| --- | --- | --- |
| antigravity | antigravity | Failed in 13 s: `RESOURCE_EXHAUSTED (429)`, quota resets in about 139 h |
| grok | grok | Failed in 7 s: `402 Payment Required`, usage balance exhausted |
| Glm | ollama-cloud | AT LIMIT, session window resets 2026-11-10 02:00 UTC |
| kimi code | kimi-code | AT LIMIT, monthly total 100%, resets 2026-11-25 |
| copilot, opencode | - | Disabled |
| cursor, pi | - | Not installed |

Subagent reason: no non-codex CLI lane is eligible, so a `code-logic-reviewer` subagent
(Claude family) writes `code-logic-review.md`.

The coordinator runs the scoped verify (`verify-1.log`, not committed), because the lanes
could not wait for the machine lock.
