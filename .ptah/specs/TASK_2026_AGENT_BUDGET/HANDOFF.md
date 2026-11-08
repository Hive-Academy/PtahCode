# HANDOFF — TASK_2026_AGENT_BUDGET (shared agent budget)

Written 2026-11-08 by session `ptah-ptah-extension-apply-session-limit-6bdf39…` (41.7M tokens used).

## Goal
One shared `agentBudget` settings group (warnRatio 0.85, stopWeightedTokens 3,000,000,
handoffContextTokens 150,000, maxDurationMin 90) that guards Claude Agent SDK subagents,
Codex-provider subagents and CLI agent lanes (`ptah_agent_spawn`). User decisions already made:
- The user approved full implementation in draft PR #986 (batches A–F).
- Every CLI adapter MUST report usage (at least input/output totals per turn). "No usage" is an
  adapter defect, never zero. maxDurationMin is an extra guard only.
- Cost order: provider-reported cost → Ptah pricing catalog (`ModelPricing` /
  `OpenRouterPricingProvider`, libs/shared/src/lib/utils/pricing.utils.ts) → explicit unavailable,
  log once. Weighted-token weights come from the same catalog, with a raw-token floor.
- Coordinator decision (fix round 1): an adapter emits telemetry-unavailable only after it has
  reconciled every vendor usage source through the completed-turn boundary.
- No branch stays local-only. #986 stays DRAFT until batch B and live tests are done.

## Done (branch feat/agent-budget, worktree D:\projects\ptah-extension\.claude-worktrees\agent-budget)
PR: https://github.com/Hive-Academy/PtahCode/pull/986 (draft). Pushed head: `c099d9469`.
CI on c099d9469: CI success, Electron E2E success, Webview E2E success, MCP Bench skipped.
- `ec0fcc73b`..`b41738c5b` plan docs (implementation-plan.md, telemetry-evidence.md, captures,
  isolation gate, batch F, SDK constraints from #989).
- `b8debc7c0` merge of main 807a6a93a (contains #978, #989).
- `6ef4451de` post-merge-recheck.md + batches.md; `19980e442` batch D exclusions.
- `64be9c6fd` batch A: agentBudget settings, migration (platform-core
  agent-budget-settings-migration.ts), Electron startup call, settings UI (branch
  feat/agent-budget-settings, merged in `12cb4d811`).
- `59177442b` batch C: shared AgentTurnTelemetry contract + AgentBudgetPolicy, adapter telemetry,
  CliOutputSegment.turnTelemetry. Verify passed.
- `ebf0d0a7a` coordinator fixes: shared advanced-settings spec (28 keys), Pi adapter
  degradation-audit marker (cli-agent-runtime ratchet back to 1).
- `ed8cf0196` batch D: AgentBudgetCoordinator, durable lane counters, resume gate, stop reasons
  budget/telemetry-unavailable/duration, LANE_STOP_REASONS, completion message. Verify 8/8 + 14/14.
- `664545811` batch F (branch feat/agent-budget-codex, merged `fe2d603d5`): Codex usage
  parentThreadId/model kept, CodexChildBudgetTap (decisions only).
- `c099d9469` batch E: host wiring of the tap (Electron + CLI), CLI migration call. Verify passed.

## In progress
- Fix round 1 (Codex lane, see Background work) is editing files in the agent-budget worktree for
  the findings in code-logic-review.md (REVISE 4/10: 3 HIGH, 3 MEDIUM) and code-style-review.md
  (NEEDS_REVISION 6/10: 1 blocking = Codex child observer applied twice on the Electron lane path,
  7 serious). Its deliverable: .ptah/specs/TASK_2026_AGENT_BUDGET/fix-round-1-report.md.
  Nothing from it is committed yet. Do NOT commit while that lane is running (lint-staged hides
  unstaged changes during the pre-commit hook).

## Open problems and decisions
- Batch B (agent-sdk: subagent-budget-monitor.ts onto AgentBudgetPolicy, real Codex child
  stop/resume refusal via SendMessage PreToolUse gate, key (parentSessionId, agentId=task id))
  is BLOCKED until PRs #1001 (task 2) and #1003 (task 4, stacked on #1001) merge. The follow-up
  session `ptah-ptah-extension-subagent-budget-foll-051f940000kg42rbxgbar0m` will message when.
- Claude adapter usage mapping (claude-cli.adapter.ts) waits for PR #1000 (task 1).
- Live tests in Ptah Dev on Electron wait for PR #999 (MCP 403 regression: Claude SDK chats on main
  had zero Ptah tools). Live-run isolation gate in implementation-plan.md §6: build must contain
  #978; record raw + canonical sha256 of ~/.ptah/settings.json before/after.
- Usage of Codex/Grok/Antigravity/OpenCode/Copilot is NOT proven live (only Claude CLI is);
  Cursor/Pi/GLM/Kimi not run. Do not mark them confirmed.
- Side finding (owned by follow-up session, do not fix here): claude CLI `--model haiku` reported
  claude-sonnet-5-5.
- Pre-existing on main (ignore): webview lint 26 module-boundary errors; platform-core
  session-driver-lock 2 tests.
- Open review notes for later: agentBudget counters type duplicated and turnIds unbounded in
  libs/shared/src/lib/types/agent-process.types.ts (included in fix round 1, item 8).

## Exclusions (other sessions' open PRs)
libs/backend/agent-sdk/** ; claude-cli.adapter.ts ; cli-adapter.interface.ts ; cli-usage.utils.ts ;
tool-description.builder.ts ; protocol-dispatcher.ts ; PtahCliStreamLoop.turnUsage() and its spec
lines ~703-724 ; resolveModel calls in agent-process-manager.service.ts (~812, ~925) and
agent-spawn-environment.service.ts resolveModel() (~181-186) ; SpawnAgentRequest.modelTier JSDoc
(~400-405) ; #1002 files (rpc-handlers session-rpc, messaging-gateway session-resumability,
jsonl-reader, session-importer, shared utils/claude-project-dir + utils/index.ts).

## Key files (in D:\projects\ptah-extension\.claude-worktrees\agent-budget)
- .ptah/specs/TASK_2026_AGENT_BUDGET/implementation-plan.md — approved design.
- .ptah/specs/TASK_2026_AGENT_BUDGET/batches.md — batch file ownership + exclusions.
- .ptah/specs/TASK_2026_AGENT_BUDGET/code-logic-review.md, code-style-review.md — findings.
- .ptah/specs/TASK_2026_AGENT_BUDGET/batch-{A,C,D,E,F}-report.md — batch reports.
- libs/shared/src/lib/utils/agent-budget-policy.ts — policy; libs/shared/src/lib/types/agent-turn-usage.types.ts — contract.
- libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-budget-coordinator.ts — lane budget.
- libs/backend/codex-runtime/src/lib/codex-child-budget-tap.ts — Codex child decisions.
- apps/ptah-electron/src/di/codex-runtime-composition.ts, codex-lane-composition.ts — double observer (blocking).
- Other worktrees (merged, keep until user cleanup): .claude-worktrees/agent-budget-settings,
  .claude-worktrees/agent-budget-codex. All three have a node_modules junction: remove it with
  `cmd /c rmdir <wt>\node_modules` before any `git worktree remove` (only when the user authorizes).

## Background work
- Codex lane `c1d492de-41e6-4aa2-aa6f-186b4015aac2` — FIX ROUND 1 — running (CLI Session ID
  01a1b8ba-e61b-7e53-ae05-51561603bd99). Its report and completion signal go to the new session.
- OpenCode style-review session to reuse for re-review: resume_session_id ses_e474b1ad8ffefj1QvecJM0Vqkb.
  Codex logic-review session: 01a1b8b4-cae3-7de1-8321-7920791922b7.

## Next steps
1. Wait for `<agent-lane-completed>` of c1d492de. Read fix-round-1-report.md. Check the diff:
   no edits in excluded files/lines, no any/@ts-ignore/as unknown as/console.*, net line change of
   agent-process-manager.service.ts, run
   `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` (no FAIL).
2. Verify: `npm run verify -- -p shared,cli-agent-runtime,codex-runtime,platform-core,ptah-electron,cli-engine,platform-cli`.
3. Commit in the foreground with explicit paths (commitlint scopes in .commitlintrc.json), then push
   in the background; watch CI with gh.
4. Re-review: resume the Codex logic reviewer and the OpenCode style reviewer with the new head.
   Fix any remaining findings.
5. When #1001 and #1003 merge: merge main into feat/agent-budget, run batch B (agent-sdk), apply the
   #989 constraints (PreToolUse gate; key by parent session + task id), add `parent-delta` to the
   telemetry source enum if needed. When #1000 merges: claude adapter usage mapping.
6. When #999 merges: live tests in Ptah Dev on Electron with the isolation gate (Haiku SDK subagent,
   cheap Codex lane, Codex-provider child with handoff 40000). Record evidence in the task folder.
7. Then take #986 out of draft, update the PR body (Summary + Test plan), and report to the user.
Report status to the follow-up session above when relevant (overlaps, batch B start).
