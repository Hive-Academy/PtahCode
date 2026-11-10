# Task Context - TASK_2026_894_0e20

## User Request
Fix the design issues in Settings. The functionality works but the design is broken after new
features landed. Screenshots show:
1. Ptah CLI shared defaults card ("Shared by all Ptah CLI providers", Permission/Network pills)
   renders as a squeezed narrow column.
2. CLI Agents & Custom Instances Matrix: capability chips in the Agent/Instance column wrap and
   overflow ("Messagin g:"), the Lane Defaults column is squeezed and carries the Codex sandbox
   note text ("This is the same setting as Codex sandbox in Orchestration.").
3. Orchestration routing: the "Rotate close executors" last-pick list is raw text; the
   Capability matrix is a plain flat table (family/model/task rows) that does not follow the
   design language or show the value of the feature.
4. Context management tab still shows a Codex-only "CODEX AGENTS" group (auto-compact size,
   tool output limit, web search) although context management was meant to be global.
5. The Codex sandbox section shows in Context management instead of the Codex provider settings.

User decision (2026-11-08): "just remove those old keys and make sure they are replaced
everywhere with the new global values" — remove `agentOrchestration.codexAutoCompactTokens`
and `agentOrchestration.codexToolOutputTokenLimit`; every reader uses the global values.

## Task Type
BUGFIX (UI redesign of existing surfaces + Codex setting consolidation)

## Complexity
Medium

## Strategy
BUGFIX with redesigned surfaces: [research] + parity inventory → designer → prototype →
cross-side review → Gate 1.7 → team-leader decomposition → implementation lanes → QA
(code-logic review by another family, visual review in Electron dark + light).

## CLI Lanes
- Preference source: memory `orchestration-executor-preference` (lanes-first, review by another
  family). Mode: enabled. Approval mode: lane-review.
- ptah_agent_list (2026-11-08 18:35 UTC): codex installed, confirmed room (weekly 46%);
  opencode, grok, antigravity, claude installed (limits unknown); copilot disabled; cursor, pi
  not installed; Glm (ollama-cloud) AT LIMIT until 2026-11-09 00:00 UTC; kimi code AT LIMIT
  until 2026-11-25 00:00 UTC.

- Exhausted: opencode (family opencode) — "Free usage limit reached" at 18:37 UTC, reset unknown;
  skipped for the rest of this run. Research moved to grok.
- Exhausted: grok (family grok) — HTTP 402 "Grok Build usage balance exhausted" at 18:38 UTC,
  reset unknown; skipped for the rest of this run. Research moved to antigravity.
- Exhausted: antigravity (family antigravity) — 429 RESOURCE_EXHAUSTED "Individual quota
  reached", resets in 128h39m (about 2026-11-14 03:18 UTC). Research moved to codex.
- 2026-11-08 ~18:50 UTC: the user fixed the antigravity model setting (the old model had an
  expired quota). Antigravity is eligible again and is the preferred cross-family reviewer for
  codex-written code and documents (family antigravity).
- Superseded: codex is the only non-Claude lane with room. Cross-family code review must use
  the Claude family (claude CLI lane or in-process subagent) — recorded as Review family.

- 2026-11-08 19:28 UTC: design revision lane 7ca1a709 (codex, session 01a1bc73-...) delivered
  all five files and reported done, then Ptah stopped it at the 3M weighted-token agent budget.
  Resume of that CLI session is refused; any further design revision needs a fresh codex lane
  briefed from design-spec-revision-1.md. Re-review round 2: antigravity lane 2a2f7812.

## Worktree
D:\projects\ptah-extension\.claude-worktrees\settings-design (branch fix/settings-design from
origin/main c30174fca). node_modules is a junction to the main checkout.

## Conversation Summary
- Agent-budget work (TASK_2026_AGENT_BUDGET) made only budget limits global (agentBudget.*);
  it did not touch the Codex-only keys.
- Codex sandbox was placed in the orchestration settings deferred chunk by TASK_2026_885.

## Batch 1 commit (2026-11-08)
- Committed 183079e0a. Lint/typecheck 14/14 pass; tests 16/17 pass.
- platform-core:test fails 2 tests in src/session-driver-lock (control-endpoint.spec.ts:68
  acquire returns ok=false; kernel-session-driver-lock.spec.ts:152 "This handle type cannot be
  sent" from resetAndDestroy on a Windows named pipe). Those files are identical to main, so the
  failure is environmental / pre-existing, not caused by this task.
- Batch 5 spawned on codex lane 1d02852e (deliverable batch-5-report.md).

- Batch 2 committed 492cc9e08; Batch 3 committed 6218807f6 (both lanes budget-stopped after delivery).
- Batch 4a spawned on codex lane 9649121f (deliverable batch-4a-report.md).
- Batch 5 committed f91548e4e (with docs move to providers/codex.md).
- 4a delivered (unverified, lane budget-stopped). 4b lane 6f52ccde, 4c lane 073cbdb3 spawned.
- 4b delivered with coverage gap (63 -> 12 tests, Jest unverified). 4c done. Parity lanes R1 4d1acff9, R2 28e37148 spawned.

## Lane limits (2026-11-08 22:19 UTC)
- antigravity (family antigravity): RESOURCE_EXHAUSTED 429 "Individual quota reached", resets ~23:46 UTC. Review lane 250f86fa failed after 8s, 0 tool calls.
- grok: AT LIMIT, resets 2026-11-12 20:04 UTC. Glm (ollama-cloud): weekly AT LIMIT, resets 2026-11-09 00:00 UTC. kimi code: AT LIMIT, resets 2026-11-25.
- Only codex has confirmed room; codex is the implementer family, so it cannot give the cross-family review.
