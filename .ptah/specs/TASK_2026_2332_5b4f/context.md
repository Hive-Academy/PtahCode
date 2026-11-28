# Context — TASK_2026_2332_5b4f

## Request (user, 2026-11-26)

Implement the fixes from the Ptah MCP adoption audit, measure them live with CLI lanes
(codex "luna" or antigravity "hydrogen"), and add a new intuitive tool if it fixes a
problem with the native tools.

## Evidence

- `D:\projects\PtahCode\.ptah\tmp\mcp-usage-lanes.md` (codex audit of CLI lanes)
- `D:\projects\PtahCode\.ptah\tmp\mcp-usage-main-agent.md` (antigravity audit of chat agents)

Baseline, 4-hour window on 2026-11-26: main chat 28.6% Ptah share (62/217), lanes 57.0%
(2,020/3,541; Codex 56.1%, Grok 70.3%, Kimi 39.0%).

## Scope (the seven fixes plus one tool)

1. `ptah_grep` accepts native Grep keys (`head_limit`, `output_mode`, `type`) or names the right key.
2. Lane lifecycle tools become eager (`ptah_agent_read`, `ptah_agent_wait`, `ptah_agent_status`,
   `ptah_session_handoff_ack`) within the eager-definition token budget.
3. Worktree guidance (`workspaceRoot`) in tool substitutions and `PTAH_LANE_POLICY`; typed scope error
   that names the registered root.
4. Substitution rows: `tsc --noEmit` -> `ptah_get_diagnostics`, log reads -> `ptah_grep`
   (`includeIgnored`), `ptah_run_check`.
5. `ptah_read_symbol`: higher limit or a continuation hint.
6. Regenerate `.claude/agents/*.md` tooling rules from `renderAgentToolingRules`.
7. Tool-call ledger (server, tool, outcome, operation class; no payload content).
8. New tool: one call that runs several bounded reads/searches/listings (replaces chained Bash
   `cd <worktree> && cat ...; grep ...; git status`). Name and shape decided in the plan.

## Gate 0.1

- Lanes: enabled. User pin: codex (luna) and antigravity (hydrogen). Approval mode: lane-review,
  cross-side review by the in-process orchestrator.
- Lane rows at start: codex confirmed room; antigravity unknown; grok and Kimi Code at limit.
- Cost mode (user global rule, until 2026-11-27 18:00): CLI lanes first, CI runs the gates.
