# Brief: shared agent budget for SDK subagents and CLI lanes (research + plan only)

Written 2026-11-07 by the session that owns PR #978 and the subagent stop-path fix
(messaging address: `\\.\pipe\LOCAL\cc-msg-784ff082cd6c8648314d0bcdeb360ede`; find it with
ListAgents if the address changed). Send it questions and your final plan path with SendMessage.

## Goal

Design one shared group of budget settings that guards both Claude Agent SDK subagents (the
Agent tool) and CLI agent lanes (`ptah_agent_spawn`: Codex, OpenCode, Antigravity, Grok, ptah-cli
providers). Today only SDK subagents have a budget:
- `compaction.subagentHandoffTokens` / `compaction.subagentStopWeightedTokens`, enforced by
  `SubagentBudgetMonitor` (`libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts`).
- CLI lanes have only `agentOrchestration.laneRepeatCallStopAt` (default 20, read in
  `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-spawn-environment.service.ts:236`) and
  an inactivity timeout. Evidence: two Codex lanes ran ~2 h with 20.0M and 29.8M tokens
  (~$5.03 and ~$7.64) and no Ptah guard stopped them.

## Proposed design (to validate, not to assume)

```json
"agentBudget": {
  "warnRatio": 0.85,
  "stopWeightedTokens": 3000000,
  "handoffContextTokens": 300000,
  "maxDurationMin": 90
}
```

| Setting | Applies to | Action |
|---|---|---|
| `warnRatio` | Both | At this share of any limit, tell the agent to write progress and report |
| `stopWeightedTokens` | Both | Cost safety stop (main shared limit) |
| `handoffContextTokens` | SDK subagents + CLI lanes whose adapter reports per-request context | Handoff stop; ignored (logged once) where context is unknown |
| `maxDurationMin` | Both | Wall-time stop for an always-active lane |

- Migrate `compaction.subagentHandoffTokens` / `compaction.subagentStopWeightedTokens` once into
  the new keys (same pattern as the `compaction.threshold` move in PR #978).
- CLI lane warning: `ptah_agent_message` "write your progress to the deliverable and call
  `ptah_agent_report`". Stop: completion signal with `stopReason: budget` and the CLI Session ID.
- Weighted tokens are vendor-specific (0.1 / 1.25 / 2 / 5 are Claude ratios). Each adapter must
  use its own vendor weights, or the stop uses estimated USD. Decide with evidence.

## Research questions (answer with file:line)

1. For each CLI adapter in `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/`:
   does it report per-request context size, cumulative tokens, cost, cache split? From which
   stream event?
2. Vendor weights (input / cache read / cache write / output) per adapter, and where the lane
   status cost estimate is computed today.
3. Where to hook the warning and the stop for lanes (lane lifecycle, stop API, completion
   signal `stopReason`), and how a lane resume (`resume_session_id`) re-arms the budget.
4. What of the subagent stop-path fix can be reused (warning re-arm, handoff record with
   progress, "stopped by Ptah, not the user" attribution, resume refusal at >= 85%).

## Constraints

- Research and plan only. Do NOT implement until PR #978 (`feat/compaction-dev-defaults`) and the
  subagent stop-path PR (`fix/subagent-budget-stop-path`) are merged into main. Both edit
  `subagent-budget-monitor.ts`, the handoff record and `file-settings-keys.ts`.
- Follow D:\projects\ptah-extension\CLAUDE.md: create a worktree before you write files
  (`git worktree add -b feat/agent-budget .claude-worktrees/agent-budget main`), Electron first,
  memory-safe verification only, delegate to CLI lanes first (only Codex had room on 2026-11-07).
- Deliverable: `.ptah/specs/TASK_2026_AGENT_BUDGET/implementation-plan.md` in that worktree, with
  a research section, the settings design, the migration, batches, test plan (unit + a live
  Ptah Dev Haiku / cheap-model run), decisions and clarifications for the user.
