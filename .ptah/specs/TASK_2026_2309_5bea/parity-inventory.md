# Parity Inventory - TASK_2026_2309_5bea

Surface replaced/rebuilt: the session inspector stats sidebar in the Electron renderer, i.e.
`ptah-session-inspector`
(`libs/frontend/chat/src/lib/components/organisms/session-inspector/session-inspector.component.{ts,html}`):
mainly its SESSION stats grid (`ptah-inspector-session-stats`) and its AGENTS section
(`ptah-inspector-agents-section`). All paths are relative to the worktree root. Decisions say
what must survive; the presentation is the designer's choice.

Abbreviations:
- `SIC` = `libs/frontend/chat/src/lib/components/organisms/session-inspector/session-inspector.component`
- `ISS` = `libs/frontend/chat-ui/src/lib/molecules/session/inspector-stats/inspector-session-stats.component.ts`
- `IAS` = `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-agents-section.component.ts`
- `IAR` = `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-agent-row.component.ts`
- `IAL` = `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-agent-list.ts`
- `SSV` = `libs/frontend/chat-ui/src/lib/molecules/session/session-stats-view.ts`
- `SSS` = `libs/frontend/chat/src/lib/services/session-stats/session-stats-source.ts`
- `SessionStatsEntry` = `libs/shared/src/lib/types/rpc/rpc-session.types.ts:386-508` (session
  stats snapshot; its numeric usage fields include Claude SDK subagent usage and exclude CLI lanes)

Hosts of `<ptah-session-inspector` (verified in the Gate 1 review): `CanvasInspectorDockComponent`
renders it three times — `libs/frontend/canvas/src/lib/canvas-rail/canvas-inspector-dock.component.ts:125`
(rail), `:193` (expanded dock), `:239` (compact sheet). The dock is mounted by
`canvas-rail-board.component.ts:285`, the board by `orchestra-canvas.component.ts:98`. The only
other direct selector use is the test host `session-inspector.component.spec.ts:66`.

## Inspector frame (outside the redesign)

| Capability | Where today (file:line) | Backing RPC / API | Decision | New location | Test that proves it |
| --- | --- | --- | --- | --- | --- |
| Header: title, status, workflow, branch, session actions, close | `SIC.html:84-127` | session tab state; `ptah-inspector-session-actions` | keep, untouched | same | none today (not verified) |
| Orchestrator request lines above SESSION | `SIC.html:132-143` | session-inspector store | keep | same, or inside the Orchestrator entry if the design moves it | none today (not verified) |
| TASK section | `SIC.html:197-201` | task link state | keep, untouched | same | none today (not verified) |
| GIT section | `SIC.html:203-207` | git state | keep, untouched | same | none today (not verified) |
| Linked sessions section | `SIC.html:208-215`; `inspector-linked-sessions.component.ts` | linked sessions state | keep, untouched | same | none today (not verified) |
| Polite live region for announcements | `SIC.html:218` | none (UI) | keep | same | none today (not verified) |
| Presentations: rail, expanded dock, compact sheet | `SIC.html:1-76`; mounts `canvas-inspector-dock.component.ts:125,193,239` | none (UI) | keep | same | none today (not verified) |
| Rail metric buttons that open the SESSION view, with accessible labels and an attention indicator | `SIC.html:26-56`; `compactSessionMetrics` `SSV:167-186` | `SessionStatsEntry` | keep (session values follow the new R1/R2 rules) | rail | `session-inspector.component.spec.ts` (updated) |
| Rail context metric and its limit alert | `SIC.html:26-56`; `SSV:167-186` | live model stats (main request) | keep, relabelled as main-request scope; activating it gives access to the main-request context in the Orchestrator entry | rail | `session-inspector.component.spec.ts` (updated) |
| Session-switch leave/enter transition of SESSION stats | `SIC.ts:241-273`, `SIC.html:147-167` | none (UI) | keep | wraps the new session section | none today (not verified) |
| `sessionTokens` input/output split | `SIC.ts:201-209` | `SessionStatsEntry` | keep (may feed the session section) | same | none today (not verified) |

## SESSION stats grid (`ptah-inspector-session-stats`)

| Capability | Where today (file:line) | Backing RPC / API | Decision | New location | Test that proves it |
| --- | --- | --- | --- | --- | --- |
| Estimate legend for provisional snapshots | `ISS:53-59` | none (UI) | keep; extend to every accuracy state shown (estimate, lower bound, unknown) | session section | `inspector-session-stats.component.spec.ts` |
| Context: main-request context used and capacity | `ISS:63-111`; `sessionContextCue` `SSV:66-80` | live model stats (main request) | move | Orchestrator entry (rail keeps a labelled main-request metric) | `inspector-session-stats.component.spec.ts` (current); new spec at new location |
| Compaction count | `ISS:63-111` (display); stat input sourced through `SSS:189-194` | session stats source | move | Orchestrator entry | `inspector-session-stats.component.spec.ts` (current) |
| Context meter and limit cue | `ISS:63-111` | live model stats | move (the information and the limit cue; the meter form is design's choice) | Orchestrator entry | `inspector-session-stats.component.spec.ts` (current) |
| Tokens with estimate state | `ISS:113-167` | `SessionStatsEntry` | keep, redefined as whole-session total with accuracy state (task-description R1) | session section | `inspector-session-stats.component.spec.ts` |
| Token budget scope text ("of X budget" / scope) | `ISS:140-146` | `SessionBudgetState` | keep; scope equals the budget stage's measure (R7) | session section | `inspector-session-stats.component.spec.ts` |
| Token budget meter, tone by stage (limit -> error, tighten/handoff -> warning, else gold) | `ISS:140-166`; tones `ISS:501-506` | `SessionBudgetState`; `session-budget-stage.ts:69-113` | keep | session section | `inspector-session-stats.component.spec.ts` |
| Cost: amount, estimate, missing-price vs other unknown cost, known subtotal | `ISS:168-205`; `SSV:43-56,138-142` | `SessionStatsEntry` | keep, redefined as whole-session total with accuracy state (R1.3) | session section | `inspector-session-stats.component.spec.ts` |
| Cost budget meter | `ISS:206-225` | `SessionBudgetState` | keep | session section | `inspector-session-stats.component.spec.ts` |
| SESSION detail content: context used/capacity, token breakdown by uncached input / output / cache read / cache creation, coverage notes, estimate vs subscription cost explanation | `SSV:81-135` | `SessionStatsEntry` | keep (context detail moves with context to the Orchestrator entry; token, coverage and cost explanations stay with the session totals) | session section; Orchestrator entry for context | `session-stats-view.spec.ts` (not verified), `inspector-session-stats.component.spec.ts` |
| Details disclosure (exposes expanded state and controlled element; Escape closes) | `ISS:228-236,361-391,398-401` | none (UI) | keep (disclosure form is design's choice) | session section and Orchestrator entry for moved details | `inspector-session-stats.component.spec.ts` |
| Session-keyed detail expansion state | `ISS:469-496` (`StatsTileExpansionState`) | none (UI state) | keep | same | `inspector-session-stats.component.spec.ts` |
| Time and turn count, shown independently | `ISS:242-261`; `durationMsOf` `SSV:149-152`; `resolveTurns` `session-inspector.store.ts:103-114` | `SessionStatsEntry.durationMs`, host `turnCount` | keep; Time rendered by shared `ptah-timer`; unknown duration shows `--:--` with cause (R8) | session section | `inspector-session-stats.component.spec.ts` |
| Model disclosure with count of further models | `ISS:262-294` | `SessionStatsEntry.modelUsageList` | keep the session model list, labelled SDK scope; main-request model moves (or shows not attributed, R3.2) | session section (list), Orchestrator entry (main-request model) | `inspector-session-stats.component.spec.ts` |
| Per-model breakdown: token categories and cost per model, SDK snapshot cost total | `ISS:309-358` | `SessionStatsEntry.modelUsageList` | keep, labelled SDK scope (orchestrator + SDK subagents, no CLI lanes) | session section | `inspector-session-stats.component.spec.ts` |
| Cache TTL: countdown, idle and estimated states, expired/low states, title text, ticks only while active; unavailable state | `ISS:295-307`; `inspector-stats/inspector-cache-tile.component.ts:100-138` | `SessionStatsEntry.cache` (main request TTL estimate) | move | Orchestrator entry | `inspector-stats/inspector-cache-tile.component.spec.ts` |

## AGENTS section (`ptah-inspector-agents-section`)

| Capability | Where today (file:line) | Backing RPC / API | Decision | New location | Test that proves it |
| --- | --- | --- | --- | --- | --- |
| Caption: running count, agent count, CLI run count | `IAS:101-107` (expression line 105); CLI count bound `SIC.html:169-178` | `runningCount()`, `list()`, `laneRuns()` from `stats.limits.inspectorRuns` (`plan-limits/stats-limit-view-model.ts:70,145`; dropped before limits load, `SSS:196-204,258-273`) | keep; every count labelled; one CLI run source or an explained difference; no measured 0 before limits load (R5.3) | agents section | `inspector-agents-section.component.spec.ts` |
| Loading feedback | `IAS:109-126` | roster state | keep (form is design's choice) | agents section | `inspector-agents-section.component.spec.ts` |
| Empty feedback | `IAS:127-128` | roster state | keep (wording is design's choice) | agents section | `inspector-agents-section.component.spec.ts` |
| Column header (aria-hidden) | `IAS:130-141`; `AGENT_ROW_COLUMNS` `IAR:15-16` (consumers: `IAR:92`, `IAS:47,279` only) | none (UI) | keep or replace (layout free to change) | agents section | `inspector-agents-section.component.spec.ts` |
| Orchestrator row: snapshot-scoped tokens and cost; duration unconditionally null | `IAS:449-474`; card `session-inspector.store.ts:139-155` | `SessionStatsEntry` | keep; content redefined: no snapshot-scope repeat (R4), gains moved main-request values (R3), duration per R8 | Orchestrator entry | `inspector-agents-section.component.spec.ts` |
| Row ordering: live first, then Orchestrator, then rest | `orderAgentList` ~`IAL:253` | roster | keep | same | `inspector-agent-list.spec.ts` |
| Agent row: avatar with status, name, model line, tokens with input/output detail, cost, time, status | `IAR:30-84` | `subagentLaneStats` / `cliLaneStats` (`libs/frontend/chat/src/lib/utils/lane-stats.adapters.ts:44-178`) | keep | agents section | `inspector-agents-section.component.spec.ts` covers rendering |
| CLI run role label when available | `IAS:308-320` | monitor runs | keep | agents section | `inspector-agents-section.component.spec.ts` |
| Start-time tooltip on the row | `IAR:31-39` | roster | keep (access to the start time; tooltip form is design's choice) | agents section | `inspector-agents-section.component.spec.ts` |
| Live lane timing refresh | `IAS:502-519` | monitor runs | keep | agents section | `inspector-agents-section.component.spec.ts` |
| Row VM incl. estimate / lower-bound states | `agentListRow` `IAL:170-222`; lane usage `inspector-agent-usage.ts:34-79` | lane adapters | keep | same | `inspector-agent-list.spec.ts`, `inspector-agent-usage.spec.ts` |
| Row selection: selected state exposed as current, conditional thread opening | `IAS:142-162,368-393` | roster / selection state | keep (selection indicator is design's choice) | same | `inspector-agents-section.component.spec.ts` |
| Selected row kept visible when below the collapsed fold | `IAS:331-365`; `IAL:262-277` | none (UI) | keep | same | `inspector-agents-section.component.spec.ts` |
| Selection normalised across subagent/background transitions | `IAS:331-365`; `IAL:262-277` | roster / selection state | keep | same | `inspector-agents-section.component.spec.ts` |
| Focus returns to the row when its request control closes | `IAS:175-187,432-441` | none (UI) | keep | same | `inspector-agents-section.component.spec.ts` |
| Actions menu: steer / background / stop | `IAS:164-211,400-429` | agent control RPCs (existing) | keep | same | `inspector-agents-section.component.spec.ts` |
| Request lines per row and request outputs | `IAS:164-211,400-429` | roster | keep | same | `inspector-agents-section.component.spec.ts` |
| Two steering surfaces (steer input, lane composer) and steer error alert | `IAS:164-211,400-429` | steer RPC (existing) | keep | same | `inspector-agents-section.component.spec.ts` |
| List disclosure: expand/collapse beyond the collapsed count, exposes expanded state | `IAS:216-226,342-353` | none (UI) | keep (collapsed count is design's choice) | same | `inspector-agents-section.component.spec.ts` |
| Total row: row sum of every finite figure (possible SDK subagent overlap), lower bound when a row lacks data, estimate when a cost is estimated; accessible total text | `IAS:227-239`; `agentListTotal` `IAL:105-129` (consumers: `IAS:41,323`, spec) | UI-derived from rows | move, corrected: replaced by the whole-session total of R1 in the session section; the agents section shows no second total of the same scope | session section | `inspector-agent-list.spec.ts` (updated for R2) |

## PLAN LIMITS section

| Capability | Where today (file:line) | Backing RPC / API | Decision | New location | Test that proves it |
| --- | --- | --- | --- | --- | --- |
| "N providers" count, refresh notice (role=status), one tile per provider, session provider first, Codex/Kimi Code labels | `chat-ui/src/lib/molecules/session/inspector-stats/inspector-limits-lanes.component.ts:10-45`; `SIC.html:188-195` | `stats.limits` (`plan-limits/stats-limit-view-model.ts`) | keep, untouched | same | none today (not verified) |
| Provider lane limit tiles | `plan-limits/*` | `stats.limits` | keep, untouched | same | specs in `plan-limits/` (not verified) |

## Proposed Removals

- None. The main-request values that the session grid shows today (context, compactions, cache
  TTL, main-request model) MOVE to the Orchestrator entry; the rail keeps a labelled main-request
  context metric. The snapshot-scoped tokens and cost that the Orchestrator row repeats are
  replaced by orchestrator-scoped data or a "not available" state (the snapshot figure itself
  remains in the per-model SDK breakdown). The agents Total row is replaced by the corrected
  whole-session total in the session section. No capability is removed.

## Revision history

Revision 2, 2026-11-23 (Gate 1 review round 1):

- Finding 1: Total row described as a row sum with possible overlap, replaced by the R1 total.
- Finding 2: model list and per-model breakdown labelled SDK scope; Orchestrator snapshot repeat
  replaced by scoped data or "not available".
- Finding 3: presentation mechanics removed from decisions (skeleton, popover, left bar, six-row
  limit); rows added for SESSION detail content, selected row below the fold, selection
  normalisation, focus return, CLI run role, start-time tooltip, live lane timing, rail metric
  buttons, rail context metric and limit alert.
- Finding 4: Time row uses `ptah-timer` and the `--:--` rule; Orchestrator duration null noted.
- Finding 5: three verified mounts recorded; caption row notes limits-not-loaded state; budget row
  cites the stage measure and tone lines.
- Finding 6: no inventory change needed beyond component-neutral wording.
- Finding 7: caption line 105, compaction source `SSS:189-194`, Orchestrator card lines 139-155,
  citations aligned with the review's parity deltas.
