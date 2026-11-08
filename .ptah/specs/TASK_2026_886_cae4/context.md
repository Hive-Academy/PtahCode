# Task Context - TASK_2026_886_cae4

## User Request
Start a "task termination and worktree disposal" workflow hook. When a task ends, the hook
closes the task and disposes of its worktree. In the background it then runs the curator and the
indexer, so the index is rebuilt and skills and memory are extracted from the task files and the
conversations. The hook must be predictable and light on resources, and its outcomes must be
predictable. It is the first step toward automating curation and indexing with hooks and
background workers.

Rules from the user: validate the plan with the user before implementation. Worktree or file
disposal is irreversible: define exactly what it may delete and get the user's approval.
Electron first. Real verification authorized; real LLM calls use haiku.

## Task Type
FEATURE

## Complexity
Complex (cross-library: tasks, git worktrees, memory-curator, skill-synthesis, indexing, Electron
activation)

## Strategy
FEATURE, Full depth: PM -> Gate 1 -> architect -> Gate 2 (user) -> team-leader -> QA.
No new UI surface planned in this first step (backend hook + background worker; outcomes surface
through existing Memory & Skills / task surfaces). If the PM finds a needed UI surface, add
designer -> prototype -> Gate 1.7.

## Related work
- TASK_2026_881_5b75 (closed learning loop + Memory & Skills redesign) — research-learning-loop.md,
  research-index-efficiency.md, decisions.md. Folder lives (untracked) in
  /home/amun/ptah-extension/.claude-worktrees/memory-skills-dead-actions/.ptah/specs/TASK_2026_881_5b75
- TASK_2026_878_5513 (PR #957, not merged yet) — honest curator/indexer/harvest results and reason
  codes. This task branches from main per user rule; any dependency on 878 contracts is noted in the
  plan.
- Peer TASK_2026_879_9809 owns lane-routing, lane-outcomes, subagent outcome recording,
  platform-core file-settings-manager.ts, outcome-report.tool.ts — do not edit those files.

## Worktree
/home/amun/ptah-extension/.claude-worktrees/task-end-hook (branch feat/task-end-hook from main e9ca7046c)

## CLI Lanes
Gate 0.1 (2026-11-06): preference source = memory (project used lanes in prior sessions; codex
cannot run Nx or git). Mode: enabled.
Rows: codex installed (Weekly 91%, near limit); grok installed (unknown); antigravity installed
(unknown); kimi code ptah-cli available (confirmed room, 87% monthly); Ollama Code AT LIMIT
(resets 2026-11-09); copilot/claude disabled; cursor/opencode/pi not installed.
Approval mode: Gate 1 = lane-review; Gate 2 = user (the user asked to validate the plan, and the
disposal rules are an irreversible, user-reserved decision).

## Lane limits seen this run
- grok (family grok): confirmed limit, HTTP 402 "Grok Build usage balance exhausted"; list row
  Weekly 100%, resets 2026-11-12 20:04 UTC. Skip until reset. Fallback: kimi code.
- kimi code (family kimi-code): HTTP 429 rate limit during the Gate 2 review; list row 5-hour
  window 100%, resets 2026-11-06 21:43 UTC (monthly 93%). Skip until reset. Gate 2 review moved to
  codex (Weekly 92%, near limit).
- antigravity (family antigravity): HTTP 429 RESOURCE_EXHAUSTED "Individual quota reached",
  resets in ~116 h (about 2026-11-11 15:00 UTC). Skip. Code reviews fall back to codex.
