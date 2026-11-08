# HANDOFF — TASK_2026_AGENT_BUDGET (shared agent budget)

Updated 2026-11-08 ~05:00 UTC by session `ptah-ptah-extension-agent-budget-986-fix-…` (successor of
`apply-session-limit`). This session owns PR #986.

## Goal
One shared `agentBudget` settings group (warnRatio 0.85, stopWeightedTokens 3,000,000,
handoffContextTokens 150,000, maxDurationMin 90) that guards Claude Agent SDK subagents,
Codex-provider subagents and CLI agent lanes (`ptah_agent_spawn`). User decisions already made:
- Full implementation in draft PR #986 (batches A–G).
- Every CLI adapter MUST report usage (input/output totals per turn). "No usage" is an adapter
  defect, never zero. maxDurationMin is an extra guard only.
- Cost order: provider-reported cost → Ptah pricing catalog → explicit unavailable, log once.
  Weighted-token weights come from the same catalog, with a raw-token floor.
- An adapter emits telemetry-unavailable only after it has reconciled every vendor usage source
  through the completed-turn boundary (Codex/ACP: named 2 s usage drain, no vendor flush exists).
- #986 stays DRAFT until batch B and the live tests are done.

## Done (branch feat/agent-budget, worktree D:\projects\ptah-extension\.claude-worktrees\agent-budget)
PR: https://github.com/Hive-Academy/PtahCode/pull/986 (draft). Pushed head `5a8411a14`, CI green
(18 pass, 4 skipped). main merged up to ff5f40803 (#995–#1003 incl. #999, #1000, #1001, #1003).
- Batches A, C, D, E, F (see batch-*-report.md).
- `c37fe7013` fix round 1; `45bc31626` fix round 2; `41ede79ae` batch G (Claude lane telemetry in
  ptah-cli-stream-loop.service.ts, lane-budget-deadline.ts, provider cached per composition);
  `5a8411a14` fix round 3 (late-ID stop at once, per-model catalog weighting for mixed-model Claude
  turns, lane-session-binding.ts + lane-budget-telemetry.ts split, ACP drain abort-aware).
- Reviews: round 3 logic REVISE 5/10, style NEEDS_REVISION 7/10 — all serious findings addressed in
  `5a8411a14` (fix-round-3-report.md). A round 4 re-review has NOT run yet.
- Manager agent-process-manager.service.ts: 3849 physical / 3673 non-blank (main 3849 / 3675).
- Side fix done for the user: PR #1000 CodeRabbit comment (commit 9cef23bb9, merged).

## In progress
- LIVE TEST lane: Codex `078f8386-3449-47c6-becb-8a48f5454316` (CLI Session 01a1b982-7406-7491-8b12-96dd7f409d40),
  deliverable .ptah/specs/TASK_2026_AGENT_BUDGET/live-test.md. Checks: A CLI Codex lane budget
  (warning, stop reason budget, resume refused), B Codex-provider child (handoff 40000), C Claude
  lane telemetry. Port 9348, ~/.ptah-dev profile. Do NOT commit while it runs.
- AFTER it ends: message session `ptah-ptah-extension-subagent-stop-handof-80bbf70000jlo2rcqszxa00`
  that Ptah Dev is free and Dev settings restore is verified (it waits for that before its own test).

## Open problems
- Known gap: first Claude result after a resume has no restored cumulative cost base → its
  per-turn cost can be overstated (needs persisted session cost passed to PtahCliStreamLoop).
- Coordinator merge arithmetic still inline (style minor M10).
- Codex/Grok/Antigravity/OpenCode/Copilot usage not proven live; Cursor/Pi/GLM/Kimi not run.
- Pre-existing on main (ignore): platform-core session-driver-lock 2 tests; webview lint errors.
- Ptah lane deliverable check doubles the path when taskFolder + relative deliverable are given:
  use absolute deliverable paths and no taskFolder.

## Exclusions
libs/backend/agent-sdk/** until task 7 PR #1004 (draft, fix/subagent-stop-handoff) merges. Its files:
helpers/compaction/{subagent-budget-monitor, subagent-notes-gate, subagent-budget-hooks,
subagent-handoff-files, subagent-handoff-message}.ts, helpers/subagent-hook-handler.ts,
session-lifecycle/session-query-executor.service.spec.ts. The #1000 exclusions are released.

## Lane sessions to resume
- Implementation (fix round 3): Codex 01a1b955-ea30-7c62-9fce-e622b161374d
- Logic reviewer: Codex 01a1b94c-cf44-7183-942f-53d1a8480b26
- Style reviewer: OpenCode ses_e46b30deeffeSCW3w72dA29agj
(Codex sessions idle > 600 s start fresh with a handoff brief; give full instructions.)

## Next steps
1. Wait for `<agent-lane-completed>` of 078f8386. Read live-test.md; check the isolation gate rows.
   Commit live-test.md + evidence (docs scope) in the foreground; push in the background.
2. Message the task 7 session that Ptah Dev is free.
3. Round 4 re-review (logic + style) of `5a8411a14` and any fixes from the live test.
4. When #1004 merges: merge main, run batch B (agent-sdk: subagent-budget-monitor onto
   AgentBudgetPolicy, SendMessage PreToolUse gate, key parent session + task id; add `parent-delta`
   telemetry source if needed). Then live test of a Haiku SDK subagent.
5. Take #986 out of draft, update the PR body (Summary + Test plan with real results), report.
