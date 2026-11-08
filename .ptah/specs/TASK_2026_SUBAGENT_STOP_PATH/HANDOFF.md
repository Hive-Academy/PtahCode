# HANDOFF — subagent budget work (written 2026-11-07 ~18:40 UTC)

## Goal

The user audited why recent Claude sessions used ~5% of the weekly limit (finding: subagents ~58% of
usage, cache reads ~65%; budget limits were set too high to ever trigger). Then asked to:
1. Reset compaction budgets to sane defaults and make them the code defaults (done, PR #978).
2. Prove in a real Ptah Dev (Electron) instance what happens when a subagent hits the threshold,
   using cheap models, without touching production settings (done, evidence in PR #978).
3. Fix the defects that the live test and a real production incident exposed (in progress, branch
   `fix/subagent-budget-stop-path`).
4. Separately plan a shared budget for SDK subagents AND CLI lanes (done as a plan in draft PR #986,
   owned by another session).

**User instruction for all remaining work (from /session-handoff):** every change must be properly
reviewed AND tested live in the Ptah Dev app, even when that costs paid models. Use cheap models for
testing: **Haiku** for Claude, and **"luna"** for the other provider (the user's cheap test model;
confirm the exact model id from the lane/provider model list before use). Set them in the dev app
settings (`~/.ptah-dev/settings.json`), never in production `~/.ptah/settings.json`.

User decisions already made:
- Production `~/.ptah/settings.json` compaction: `threshold: 200000`, `subagentHandoffTokens: 300000`
  (temporary, until the stop-path fix ships; code default stays 150000), `subagentStopWeightedTokens: 3000000`.
  Backups in `~/.ptah/backups/`.
- Dev isolation: Electron dev mode reads `~/.ptah-dev/settings.json` (PR #978).
- Reviewer when non-Claude lanes are at limit: Claude **Sonnet** subagent (approved).
- Resume of a subagent at >= 85% of handoff limit (or a stopped one): **refuse with guidance**.
  Coordinator refinement: a steering SendMessage to a RUNNING agent is allowed (not a resume).
- Agent-budget plan: (a) every adapter must report usage (missing usage = adapter defect);
  (b) cost = provider-reported, else Ptah pricing catalog, never a silent zero.
- Stop-path fix ships as its own PR, separate from #978.

## Done

- **PR #978** https://github.com/Hive-Academy/PtahCode/pull/978 — branch `feat/compaction-dev-defaults`,
  worktree `D:\projects\ptah-extension\.claude-worktrees\compaction-dev-defaults`.
  - `28f5c97ac feat(electron,platform-core,agent-sdk): isolate dev settings, 200k compact`
  - `e9f1ebaee docs(agent-sdk): record live subagent budget test and prod incident`
  - CI at e9f1ebaee: 17 pass, 4 skipped, 0 fail. CodeRabbit: no inline findings (only a docstring-coverage
    warning). reviewDecision REVIEW_REQUIRED, merge BLOCKED on human approval. Do not merge (not authorized).
  - Review: Sonnet subagent APPROVED 8/10 after 2 rounds; open minor follow-ups E (`cli-workspace-provider.ts:51-62`
    warns each start / parses global-state.json each start) and F (`file-settings-manager.ts:108-109` copy fallback
    not atomic) are listed in the PR.
  - Live Ptah Dev test (Haiku): handoff stop at 31,079 ctx (`reason=handoff`), safety stop at 63,828 weighted
    (`reason=safety`); chat stayed usable; production settings hash unchanged; 85% warning NOT observed; no progress
    notes; first main-thread reply said handoff-file reads were "declined". Report:
    `.claude-worktrees/compaction-dev-defaults/.ptah/specs/TASK_2026_COMPACTION_DEV/live-test-report.md`.
  - Known failures on main (not caused by this work): platform-core `session-driver-lock/*` (2), agent-sdk
    `plugin-loader.service.capabilities|session-notice`, `sdk-query-options-builder.auto-compact-argv` (SDK 0.3.278 vs
    0.3.318), 13 rpc-handlers Windows path/symlink suites, ptah-electron `worker-host-packaging`, `config-home`.
    Another session (fix/main-green-followups) fixes these; it was told our branch edits `auto-compact-argv.spec.ts`.

## In progress — `fix/subagent-budget-stop-path` (NOT committed, NOT pushed)

Worktree `D:\projects\ptah-extension\.claude-worktrees\subagent-budget-stop-path` (from main 406c27f28,
node_modules junction). Task folder `.ptah/specs/TASK_2026_SUBAGENT_STOP_PATH/` holds: incident file, live-test
report, `implementation-plan.md` (approved), `batch-AB-notes.md`, `batch-AB-fix-1.md`, `batch-C-notes.md`,
`batch-D-notes.md`, `fix-round-1.md`, `code-logic-review.md` (review + re-review round 1).

Implemented (Codex lanes): A/B monitor (warning >=85% before stop incl. jumps, per-invocation re-arm, typed stop
reason, "stopped by Ptah, not the user" texts, bounded redacted progress in handoff record, `getAgentBudgetState`),
C (no "cache warm" advice for stopped agents; RPC resume refusal >=85%), D (shared `buildBudgetResumeRefusal`,
guard on SDK built-in `SendMessage` tool in `sdk-permission-handler.ts` with `interrupt:false`, permission-decision
logs for defect 6, `captureProgress` error guard), fix round 1 (9 review defects), `libs/shared` permission.types.ts
gained 2 OPTIONAL methods.

Verified after fix round 1 (coordinator runs): agent-sdk + rpc-handlers tests fail ONLY on the known main suites;
lint/typecheck shared, agent-sdk, rpc-handlers 6/6 pass. A TTL regression from batch A was caught and fixed.

Re-review round 1: REVISE 7/10 with R1 (major, redaction regression for snake_case secrets / Authorization Bearer),
R2 (major, name lookup crosses sessions / picks oldest / stale stop refuses new agent), R3 (minor, need
none|pending|stopped state), R4 (minor, hook transcript path rejected), R5 (no change). **Fix round 2 (the LAST
allowed revise round) is running** — see Background work.

## Open problems and decisions

- Defect 6 (parent Read/Bash "declined"/"The user doesn't want to take this action" after a stop) is NOT fixed:
  only instrumentation was added. The live re-test must capture the new permission-decision logs (log names in
  `batch-D-notes.md` "## Log fields") to find the trigger.
- Revise cap: after round 2, a new defect from the final re-review goes to the user, not to a round 3.
- Side finding (other session): claude CLI lane started with `--model haiku` reported `claude-sonnet-5-5` usage
  ($0.14). Not yet investigated — proposed as a separate small task (check the claude adapter `--model` argv and
  `~/.ptah/settings.json` `claude-cli.cliAgent.modelTier`).
- Lane availability on 2026-11-07: only Codex had confirmed room. OpenCode (free limit), Antigravity (quota, ~155 h),
  Grok/GLM/Kimi at limit, Copilot disabled.
- `.claude-worktrees/compaction-dev-defaults` has an unstaged `.gitignore` change (`.opencode/agent/`) written by the
  dev app's harness block during the live test; not task work, left unstaged.

## Key files

- `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts` — core of the stop path.
- `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-resume-advice.ts` — >=85% refusal + shared text.
- `libs/backend/agent-sdk/src/lib/sdk-permission-handler.ts` — SDK SendMessage guard + decision logs.
- `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-query-executor.service.ts` — stop/turn correlation.
- `libs/backend/rpc-handlers/src/lib/chat/session/chat-subagent-context-injector.service.ts` — INTERRUPTED AGENTS advice.
- `libs/backend/rpc-handlers/src/lib/handlers/subagent-rpc.handlers.ts` — RPC resume refusal.
- `C:\Users\abdal\.ptah\settings.json` (production, do not edit for tests) / `C:\Users\abdal\.ptah-dev\settings.json` (dev).
- `C:\Users\abdal\.ptah\handoffs\agent-budget-research-brief.md` — brief for the agent-budget session.

## Background work

- CLI lane **891389a1-5ed9-48da-986f-5026ce5e0e01** (codex, backend-developer) — fix round 2 (R1-R4) of the stop-path
  fix; state `running` at handoff; CLI Session ID `01a1b715-2b9a-7da0-83aa-96355871c4b8`; deliverable
  `.ptah/specs/TASK_2026_SUBAGENT_STOP_PATH/fix-round-2.md`.
- Reviewer: the Sonnet review subagent ends with this session. For the final re-review, start a NEW Sonnet
  `code-logic-reviewer` subagent with the brief: re-review only R1-R4 changes, append `## Re-review (round 2)` to
  `code-logic-review.md`.
- **Other session (not a child): `ptah-ptah-extension-apply-session-limit-6bdf390000kg42rbxgbar0g`**, messaging
  address `uds:\\.\pipe\LOCAL\cc-msg-8db99b83f1d8889693d637b74b212172`. It owns the agent-budget plan, draft
  **PR #986** https://github.com/Hive-Academy/PtahCode/pull/986 (branch `feat/agent-budget`, head ec0fcc73b,
  worktree `.claude-worktrees/agent-budget`, "plan only, do not merge before #978 and the stop-path PR"). It reports
  to this session's successor; tell it the new session's name with SendMessage. Its "no UNCONFIRMED items" claim is
  too strong: only the claude adapter proved usage from real output; codex(exit 1)/grok/antigravity/opencode/copilot
  did not; cursor/pi not installed. Live per-adapter runs are planned after the merges.
- Other peer sessions seen: `fix/main-green-followups` (fixes main test failures), "agent-messaging phase 3"
  (reported the prod incident).

## Next steps

1. Wait for the `<agent-lane-completed>` of lane 891389a1. Read `fix-round-2.md`. Verify yourself:
   - `cd D:\projects\ptah-extension\.claude-worktrees\subagent-budget-stop-path`
   - `npm run verify -- -t test -p agent-sdk,rpc-handlers` → failed suites must equal the known main list
     (agent-sdk 3, rpc-handlers 13). Read failed suite names from the Nx terminalOutputs files named in the log.
   - `npm run verify -- -t lint,typecheck -p shared,agent-sdk,rpc-handlers` (never add --testPathPatterns here).
2. Final re-review (new Sonnet subagent, see Background work). New defects after round 2 → show to the user.
3. Live Ptah Dev test (user requirement, cheap models: Haiku; "luna" for the non-Claude provider — confirm id):
   check for a running Ptah Dev instance first (single-instance lock); build with
   `node scripts/verify.mjs --exec --task build-dev -- npx nx build-dev ptah-electron`, then copy-wasm and
   copy-renderer-dev (see `live-test-report.md` Setup); launch `node apps/ptah-electron/scripts/launch.js
   --remote-debugging-port=<free port>` with `CLAUDE_CODE_SUBAGENT_MODEL=haiku`; set small budgets ONLY in
   `~/.ptah-dev/settings.json` (handoff 25000; safety scenario stop 60000). Prove: 85% notice before the stop,
   progress in the handoff record, "stopped by Ptah, not the user" text, no "cache warm" advice for a stopped agent,
   refused resume >=85%, allowed steer to a running agent, and grep the new permission-decision logs if a
   "declined" call appears. Record sha256 of `~/.ptah/settings.json` before/after (must match). Restore dev budgets.
4. Commit on `fix/subagent-budget-stop-path` (stage by explicit path, incl. the task folder; scopes from
   `.commitlintrc.json`, e.g. `fix(agent-sdk,rpc-handlers,shared): ...`), push in background, open PR against main
   with Summary + Test plan (actual results, known main failures, review family = Sonnet, implementer = Codex).
   Watch CI and CodeRabbit with `gh pr checks <n> --watch`; address findings.
5. Ask the user whether to start the claude-CLI "haiku reports sonnet" investigation as a separate task.
6. After #978 and the stop-path PR merge: production `subagentHandoffTokens` can return to the default 150000
   (user decision), and the agent-budget session may start implementation.
