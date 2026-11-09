# Task Context - TASK_2026_895_d988

## User Request

Turn 1: "i think one big factor that would help with our new context management and token
optimized work, is in how we split the tasks and batches and how the main orchestrator assign
tasks to the subagents and cli lanes, what you think of that ?"

Turn 2: "lets do so also i think we should integrate with decision models and specify lanes, and
model tiers meaning rather we hardcode the model list in subagents and for cli lanes we set
default models is there away to make these dynamics whats our options there and what you think
research that with our setup and latest info you find online as well"

## Agreed scope (from turn 1 proposal, accepted by the user)

Part A — batch splitting and assignment (skill/agent docs):
1. Size batches by context weight (ptah_count_tokens over read+write set) with a min and max band;
   keep <=6 files / <=2 libs as secondary limits.
2. Each batch entry carries a write set and a read set (with line ranges) so lanes do not explore.
3. Contract excerpts (interfaces, types, RPC signatures) inline in the batch entry, not "read the plan".
4. Contracts-first ordering (batch 1 lands shared types/ports).
5. Split heavy files first (behavior-preserving split batch, then rewiring batch).
6. Match executor/model tier to batch shape (mechanical vs reasoning-heavy vs review).
7. Align batches with Nx projects for narrow verify and cache hits.
8. Record estimated weight vs actual lane tokens in batches.md to calibrate.
Orchestrator builds each lane prompt only from its batches.md entry.

Part B — dynamic model selection (research first, then design):
- Integrate batch/phase assignment with the routing decision model (ptah_route_decide).
- Replace hardcoded model names in subagent definitions with tiers.
- Make CLI lane default models dynamic instead of fixed defaults.

## Task Type

REFACTORING (with a research phase). Router pre-flight timed out; skill table used.

## Complexity

Complex

## Strategy

Partial: research (2 parallel lanes) -> architect plan (Part A + Part B) -> cross-side plan review
-> Gate 2 (lane-review) -> implement batches -> code-logic review -> final PR review -> PR.

Worktree: D:\projects\ptah-extension\.claude-worktrees\lane-batching-model-routing
Branch: refactor/lane-batching-model-routing

## CLI Lanes

Preference source: user global CLAUDE.md (delegate heavily to CLI lanes, prefer non-Claude vendors).
Mode: enabled. Approval: lane-review.

ptah_agent_list rows (2026-11-09):
- codex | cli | installed | confirmed room (Weekly 59%)
- copilot | disabled (installed)
- cursor | not installed
- antigravity | installed | unknown (reader failed)
- opencode | disabled (installed)
- pi | not installed
- grok | installed | AT LIMIT (Weekly 100%, resets 2026-11-12)
- claude | installed | unknown (same Claude usage — avoid per user preference)
- Glm (ptah-cli, ollama-cloud) | AT LIMIT
- kimi code (ptah-cli) | AT LIMIT

## Conversation Summary

See decisions.md for routing decisions and overrides.
