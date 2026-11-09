# HANDOFF — TASK_2026_898_c1a5 (task lifecycle close-out)

Worktree: `D:\projects\ptah-extension\.claude-worktrees\task-lifecycle-closeout`, branch `feat/task-lifecycle-closeout` (local only, no PR yet).

## Goal
User request (/orchestration):
1. **Priority:** when a new session acknowledges a handoff, close the old session as if the user closed it. Don't delete or archive it; it stays visible on the stats sidebar.
2. Make skill-trajectory learning (harvest) manual, not automatic on Stop.
3. Add hooks for manual work, e.g. an agent cleaning up a task.
4. When a PR is opened, set the task.md status to `in_review`. After review and merge, run the close-out workflow (memory, learning, worktree/branch cleanup) in the background, driven by hooks.

User decisions (Gate 1):
- Worktree/branch removal is an opt-in setting `taskCloseOut.autoRemoveMergedWorktreeAndBranch`, default false. It removes only when the worktree is clean and the branch is merged; otherwise it reports `pending-user-approval`.
- Old session: close only, no delete or archive.

## Done (commits on branch, oldest → newest)
- Phase A (handoff-ack closes the predecessor):
  - 6fb263df8, 7683b0a13, 43e4fe4b8, ce2077a01, e8b9321e6, 2536baae4
  - beaa59b07 `fix(cli-agent-runtime): keep invalid handoff ack records on write`
  - 26c058aa2 `fix(cli-agent-runtime): append handoff ack quarantine entries`
  - Phase A post-cap review: APPROVED (`phase-A-postcap-review.md`).
- B1 da094a578 `feat(platform-electron,platform-cli): add task cleanup git adapters`
- B2 172d73043 `feat(task-end-hook,persistence-sqlite): add task close-out journal` (migration 0073)
- B3/B5 71490df2b `feat(task-end-hook): reconcile task PR state into close-out`
- B4 e026c10f0 `feat(task-end-hook,shared): make task learning harvest manual`
- B6 65a015435 `feat(task-end-hook,ptah-electron): wire task close-out into Electron host`
  - Verified with `npm run verify -- -p @ptah-extension/task-end-hook,ptah-electron`:
    - lint and typecheck pass
    - ptah-electron: 107 suites pass
    - task-end-hook: 7 suites / 41 tests fail. This is the Windows symlink EPERM baseline from main (8/42 on main), not a regression.

## In progress
Nothing is half-edited. The worktree's only uncommitted entries are pre-existing ` D .claude/skills/**` deletions that are NOT this task's; leave them alone and never stage them.

## Open problems and decisions
- **Blocker last session:** the `ptah` MCP server rejected its Authorization header, so lanes were unavailable. Check that `ptah_agent_list` works before spawning.
- Lane limits at last check:
  - Codex has room. Use it for implementation.
  - Antigravity works (its limit is unknown). It is the reviewer.
  - Grok is at its limit until 2026-11-12, GLM is at its limit (reset unknown) and Kimi is at its limit until 2026-11-25.
- B6 limitation: the workspace root is used as the main root. A workspace opened at a secondary worktree needs main-root resolution later.
- Deferred follow-ups (report to the user at the end, see `decisions.md` rows 17–19):
  - N1: tri-state close reply (closed/absent/blocked)
  - N2: a null predecessorSdkId never converges
  - N4: a CAS on stale state drops a late SDK id
  - N6: latency up to about 60 s
  - Dedupe the platform-electron and platform-cli cleanup adapters
  - The detector's status write bypasses TaskWriterService (possible race)
  - No logging in one close-out tool catch
- Proposed removal awaiting user approval: the unused setting `sessionBudget.closeSourceAfterAutoHandoff`.

## Key files
- `.ptah/specs/TASK_2026_898_c1a5/implementation-plan.md` — the approved plan. Section 2 covers the MCP tools, 3 the manual cleanup hook and 5 the Stop harvest removal.
- `.ptah/specs/TASK_2026_898_c1a5/batches.md` — batch table. B1–B6 COMPLETE; B7, B8, B9 PENDING, with files and verify commands.
- `.ptah/specs/TASK_2026_898_c1a5/decisions.md` — decision log (rows 1–19).
- `libs/backend/task-end-hook/src/lib/close-out/` — TaskCloseOutService and TaskPrReconcilerService.
- `libs/backend/task-end-hook/src/lib/di/tokens.ts` — TASK_END_TOKENS, including CLOSE_OUT_PR_STATUS_PORT and GIT_CLEANUP_PORT.
- `apps/ptah-electron/src/di/task-end-hook-composition.ts` and `apps/ptah-electron/src/activation/task-end-hook.activation.ts` — Electron wiring.

## Background work
None. All lanes have ended. The B6 codex lane d843480a stopped on its budget after delivering; its work is in 65a015435.

## Next steps
1. Run `ptah_agent_list`. Then spawn **B7** and **B8** in parallel on codex lanes, with `workingDirectory` set to the worktree and the deliverables `batch-B7-report.md` and `batch-B8-report.md`. Repeat the CLAUDE.md verify rules in each brief.
   - B7: remove the Stop→harvest chain in `libs/backend/skill-synthesis/src/lib/triggers/skill-trigger.service.ts` (`start` Stop registration, `onStop`, `scheduleHarvest`/`fireHarvest`). Keep the SubagentStop/PostToolUse/prompt telemetry and the explicit `harvestTask`/`skillSynthesis:harvestSpecs` path. Update the spec and the cli-engine `container.ts`, `rpc-surface.spec.ts` and `surface-composition.spec.ts` if affected.
     - Verify: `npm run verify -- -p @ptah-extension/skill-synthesis,@ptah-extension/cli-engine`
   - B8: add new `ptah_task_close_out {taskId, workspaceRoot}`, `ptah_task_close_out_status {runId}` and `ptah_task_cleanup_completed` tools in `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/{task-close-out.tools.ts,task-cleanup-completed.tool.ts}` plus specs.
     - Use the existing lifecycleTools seam (A3) and validate input with Zod.
     - Include an explicit manual harvest-request path.
     - Verify: `npm run verify -- -p @ptah-extension/vscode-lm-tools`
2. Verify each batch yourself, update its row in batches.md, and commit in the foreground with explicit paths. Follow `.commitlintrc.json` and add the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
3. B9 (docs): `.claude/skills/orchestration/SKILL.md`, `.claude/skills/orchestration/references/{task-tracking.md,git-standards.md}` and `CLAUDE.md`. Cover the PR → `in_review` → merge → close-out flow, the manual cleanup hook, and the opt-in removal and pending result.
4. Phase B review (B1–B9 diff) by antigravity, then one fix round and a re-review.
5. Final review of `git diff main...HEAD` by a family that wrote no code in it (codex wrote code, so use antigravity or another non-codex family).
6. Set `task.md` `status:` to `in_review`, commit, then push in the background with `gh pr create` against main (title under 70 chars, `## Summary` and `## Test plan`, ending with the Claude Code footer).
7. Watch CI and reviews, fix confirmed findings, and report the PR URL plus the deferred items above to the user.
