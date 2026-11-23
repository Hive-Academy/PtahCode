# Task Context - TASK_2026_2309_5bea

## User Request

> in our stats sidebar , i think we can enhance it and elevate its details and stats with proper
> rganization and for example rather showing duplicating informations we should focus on showing
> total for the whole agents and lanes and rather repeating the context /model tokens and others
> for the main agent in the first stats sections and also in agents informations we can fix those
> and utilize our new components for stats, numbers, charts, bars to intuitively show organized
> and clean details

The user attached one screenshot of the Electron stats sidebar (session "small tweaks", done):

- Header: session title, status, three icon buttons.
- Top grid, six tiles: Context 6.7% (1 compaction, meter), Tokens 25.9M of 30.0M budget (meter),
  Cost $17.54 this session, Time — (24 turns), Models Fable 5.2 +2 more, Cache 1h 58:38 (idle in
  52:38, meter).
- AGENTS section: caption "0 running · 15 · 7 CLI runs". Table columns Agent, Tokens, Cost, Time,
  Status. First row "Orchestrator / Fable 5.2 / 25.9M / $17.54 / — / done" repeats the top grid
  numbers. Other rows: subagents (code-logic-reviewer, Sonnet 5.5) and CLI lanes (Codex CLI,
  gpt-6.2-sol) with `~` estimated costs. "Show 9 more". Total row: 56.0M, `≥ ~$30.58` (wraps onto
  two lines).
- PLAN LIMITS section: "3 providers", one card per provider (Claude 41% used, Codex 6% used) with
  a bar, the window, the reset time, the account and a "Provider API" chip.

Observed problems in the screenshot:

1. The top grid shows main-agent numbers (25.9M, $17.54) and the Orchestrator row repeats them.
   The session total (56.0M, ≥ ~$30.58) is only at the bottom of the table.
2. The Time tile shows "—" for a session that ran 24 turns.
3. The caption "0 running · 15 · 7 CLI runs" has a number with no label.
4. The Total cost cell wraps.
5. The agents table is plain text. It does not use the shared stat, meter, ring or sparkline
   components.

## Task Type

FEATURE (redesign of an existing UI surface)

## Complexity

Medium

## Strategy

Full depth. Flow: `plan` (with `parity-inventory.md`) -> `document-review` -> `design` + prototype
-> `document-review` -> Gate 1.7 -> `architecture` -> `document-review` -> `batch` -> `implement`
-> `review` -> `tests` -> `visual-review` -> `completion`.

Electron first. The renderer is `apps/ptah-extension-webview`. No feature work for the TUI or the
VS Code host.

## Known code pointers (orchestrator survey, not complete)

- `libs/frontend/chat-ui/src/lib/molecules/session/` — `session-stats-summary.component.{ts,html,css}`
  (selector `ptah-session-stats-summary`), `session-stats-view.ts`, `session-stats-format.ts`,
  `session-budget-format.ts`, `session-model-breakdown.component.ts`,
  `inspector-stats/inspector-session-stats.component.ts`, `inspector-cache-tile.component.ts`,
  `inspector-limits-lanes.component.ts`, `inspector-linked-sessions.component.ts`, `plan-limits/*`.
- `libs/frontend/chat-ui/src/lib/molecules/agent-lane-stats/agent-lane-stats.component.ts`.
- `libs/frontend/chat/src/lib/services/session-agents/session-agent-roster{,.service}.ts`,
  `libs/frontend/chat/src/lib/services/session-stats/session-stats-source.ts`.
- Shared components: `libs/frontend/ui/src/lib/charts/` (`meter`, `ring`, `sparkline`, `stat`),
  `libs/frontend/ui/src/lib/surfaces/` (`stat-card`, `surface-tile`, `surface-section`),
  `libs/frontend/ui/src/lib/patterns/` (`instrument-band`, `table`, `description-list`, `disclosure`).
- The component that renders the AGENTS table in the sidebar is not located yet. The `plan` phase
  must find it.

## CLI Lanes

- Preference source: memory `cli-lane-context-handoffs` (use CLI implementation lanes proactively,
  Codex for implementation, cross-family review, Claude subagents as fallback).
- Mode: enabled
- Approval: lane-review
- `ptah_route_decide` gate-0.1: timed out. Rule tables of the skill apply.

`ptah_agent_list` rows (2026-11-23):

| Agent | Type | Family | Status | Limit state |
| --- | --- | --- | --- | --- |
| codex | cli | codex | installed | confirmed room (Weekly 6%) |
| copilot | cli | copilot | disabled | no usage source |
| cursor | cli | cursor | not installed | no usage source |
| antigravity | cli | antigravity | installed | unknown (reader failed) |
| opencode | cli | opencode | not installed | no usage source |
| pi | cli | pi | not installed | no usage source |
| grok | cli | grok | installed | no usage source |
| claude | cli | claude | installed | unknown (limits not tracked) |
| Ollama Code | ptah-cli | ollama-cloud | available (pc-f3384f72-a556-4ab4-b2b1-7e1e028f22cb) | confirmed room |
| kimi code | ptah-cli | kimi-code | available | AT LIMIT (monthly, resets 2026-11-25) |

## Conversation Summary

- The user wants session totals (all agents and lanes) at the top, no repeated main-agent numbers,
  and an agents section that uses the shared stat, number, chart and bar components.

## Gate decisions

| Gate | Artifact revision | Author | Reviewer | Rounds | Verdict | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| 1 Requirements | task-description.md rev 3, parity-inventory.md rev 2 | project-manager subagent (claude) | codex CLI lane | 3 (initial + 2 rechecks) | APPROVED | Passed in `lane-review` mode, 2026-11-23. Moderate finding 14 carried to architecture. |
| 1.7 Design | design-spec.md rev 1 + prototype rev 1 | ui-ux-designer subagents (claude) | codex lane (stopped) | 0 | — | REJECTED by the user, 2026-11-23: too much noise and text; worse than the current design. |
| 1.7 Design | design-spec-v3.md + prototype/v3 | ui-ux-designer subagent (fable) | codex CLI lane | 1 | REVISE (7 Serious, 2 Moderate; none changes the approved layout) | APPROVED by the user, 2026-11-23 (decisions rows 16, 18). Review findings are binding requirements for architecture. |
| 2 Architecture | implementation-plan.md (round 3) + implementation-plan-task-digest.md (round 2) | software-architect subagents (claude) | codex CLI lane | 3 / 2 | REVISE at the revise cap; exact corrections applied verbatim | Closed at the cap, reported to the user, 2026-11-23 (decisions rows 22, 24). |
