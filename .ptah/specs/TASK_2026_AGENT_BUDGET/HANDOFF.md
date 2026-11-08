# HANDOFF — TASK_2026_AGENT_BUDGET (shared agent budget)

Written 2026-11-08 ~13:40 UTC by session `ptah-ptah-extension-agent-budget-986-fix-…` (owner of PR #986).
This file replaces all earlier handoff notes.

## Goal
One shared `agentBudget` settings group (warnRatio 0.85, stopWeightedTokens 3,000,000,
handoffContextTokens 150,000, maxDurationMin 90) that guards Claude Agent SDK subagents,
Codex-provider subagents and CLI agent lanes (`ptah_agent_spawn`).

## State: implementation complete, PR ready for review
- PR: https://github.com/Hive-Academy/PtahCode/pull/986 — READY FOR REVIEW (not draft).
- Branch `feat/agent-budget`, worktree `D:\projects\ptah-extension\.claude-worktrees\agent-budget`.
- Head `3fcf1911e` (plus this handoff commit). CI green on 3fcf1911e: 18 pass, 4 skipped (one
  flaky `vscode-lm-tools` protocol-dispatcher timing test passed on rerun; #986 does not touch it).
- GitHub: MERGEABLE, REVIEW_REQUIRED (needs a human approval). Never merge without the user.
- PR body = `pr-body.md` in this folder (Summary + Test plan + known gaps). Title:
  "feat: shared agent budget for SDK, Codex and CLI agent lanes".

## What is in the PR (batches)
- A settings + migration + UI + export/import; C shared contract `AgentTurnTelemetry` +
  `AgentBudgetPolicy`; D `AgentBudgetCoordinator`, stop reasons, resume gate; E/F Codex child
  observer wiring; G Claude lane telemetry, manager split (`lane-budget-deadline.ts`,
  `lane-session-binding.ts`, `lane-budget-telemetry.ts`); B SDK subagents on the policy
  (`subagent-budget-monitor.ts`, PreToolUse refusal keyed by parent session + Task id).
- Then: fix rounds 1–3, final logic/style review fixes (`5b2e23c64`), live-test fixes rounds 1–8,
  bounded 15 s stream wait (`13f02ffcc`), CodeRabbit pass 1 (`a34117e92`, 13 comments) and
  pass 2 (`3fcf1911e`, 3 fixed + 5 already fixed). All reports are in this folder.

## Verification evidence
- Scoped `npm run verify -- -p shared,agent-sdk,cli-agent-runtime,codex-runtime,platform-core,ptah-electron,cli-engine,platform-cli`:
  lint/typecheck pass; tests pass except 2 pre-existing Windows platform-core specs
  (control-endpoint.spec.ts, kernel-session-driver-lock.spec.ts) that also fail on main.
- Degradation audit exit 0, no baseline raised. Manager 3671 non-blank lines (main 3675).
- Live tests 1–8 in Ptah Dev on Electron (live-test*.md), every run with the isolation gate
  (production ~/.ptah/settings.json hashes unchanged, Dev settings restored byte for byte).
  Proven: Codex CLI lane end to end (per-turn records, predictive warning before stop via
  queue-next-turn visible in the Codex rollout, budget stop, progress pointer, resume refused);
  native Codex child linkage + real counters + relinks without extra charge; Haiku SDK subagent
  accounting, warning, Ptah-attributed stop with the handoff pushed before the parent reply,
  one .handoff.md, denial burst counted as one, fresh Task reads the handoff.

## Open items (not blockers; listed in the PR body)
- Fixes after live test 8 (`d96022bbf`, `a34117e92`, `3fcf1911e`) are spec-verified only.
- Codex child observer is advisory (no child stop).
- SDK subagent resume is not testable with the native Agent tool; Haiku may not update its notes
  after the notice (host merges the inferred snapshot).
- The parent UI can still show the SDK's own interruption string (Ptah's text paraphrases it).
- First Claude CLI result after a resume has no restored cumulative cost base (cost can be high).
- Grok/Antigravity/OpenCode/Copilot/Cursor/Pi/GLM/Kimi lane usage is fixture-tested, not live.
- CodeRabbit had not reviewed 3fcf1911e yet when this was written.

## Next steps for a new session
1. `gh pr view 986` and `gh pr checks 986`: confirm CI on the head; rerun a failed job only when
   the log shows an infra cause (Electron download 504, known flaky timing test).
2. Read new review comments (CodeRabbit and humans). For each: verify against the current code,
   fix with a spec or reply with a precise reason. Delegate fixes to a Codex CLI lane
   (OpenCode free usage was exhausted). Declare absolute deliverable paths and no taskFolder
   (taskFolder + relative path doubles the path in the deliverable check).
3. Verify, commit in the foreground with explicit paths, push in the background, watch CI.
4. Report PR URL, head, CI and review state. Do NOT merge, force-push or remove worktrees.
5. After the user merges #986 and authorizes cleanup: remove worktrees `agent-budget`,
   `agent-budget-sdk`, `agent-budget-settings`, `agent-budget-codex` (first `cmd /c rmdir
   <wt>\node_modules` for each junction, then `git worktree remove`).

## Rules that matter
- Work only in the worktree. Memory-safe verify only (`npm run verify -- -p A,B`), never
  workspace-wide, nx run-many, build/serve/e2e/package (live tests need explicit user approval).
- Commit in the foreground (lint-staged); never commit while a lane edits the same worktree.
- Untracked on purpose, never commit: `live-test-round-6/scratch-generated-ptah/` (raw handoffs).
- Coordination: session `ptah-ptah-extension-subagent-stop-handof-80bbf70000jlo2rcqszxa00` owns
  #1004 follow-ups on agent-sdk; it will tell #986 before it edits agent-sdk. Ptah Dev
  (~/.ptah-dev) is shared: ask before a live run, tell it when the run ends.
- Security note: in live test 2 an agent printed a local MCP endpoint token in the Dev chat UI
  (not in the repo or evidence). Rotate it if it is long-lived.

## Lane sessions (Codex; idle > 600 s starts fresh with a brief — give full instructions)
- Last implementation lane: 01a1bb2a-eaf4-7b00-b6dc-28d836bd9c57
- Logic reviewer: 01a1bab8-02f6-7de3-81ae-b4219a101b2a
- Live tester: 01a1bab2-5290-73e2-b104-9e9a5343c5bb
