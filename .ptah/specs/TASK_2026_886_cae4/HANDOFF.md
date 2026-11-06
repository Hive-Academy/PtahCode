# HANDOFF — PR #957 (TASK_2026_878_5513) + TASK_2026_886_cae4 (session 6 end, 2026-11-06 ~19:40 UTC)

Two worktrees. Never merge, force-push, rewrite history, delete branches or remove worktrees
without the user's go-ahead. Commit in the foreground, push in the background. Read
.commitlintrc.json before each commit.

- W878 = /home/amun/ptah-extension/.claude-worktrees/memory-skills-dead-actions
  (branch fix/memory-skills-dead-actions, PR https://github.com/Hive-Academy/PtahCode/pull/957)
- W886 = /home/amun/ptah-extension/.claude-worktrees/task-end-hook (branch feat/task-end-hook)

## Goal
1. Finish PR #957 (Memory & Skills actions report honestly) through CI and review.
2. TASK_2026_886_cae4: a "task termination and worktree disposal" hook. When a task ends, it
   closes the task, evaluates worktree disposal, and in the background runs curation of linked
   sessions, a task-filtered skill/spec harvest and an index refresh. Predictable, light on
   resources, closed reason codes. Follow /orchestrate.

## User decisions already made (this session)
- PR #957: fix both Moderate open items in this PR (done, a4ae02795). Keep `parseReviewVerdict`
  STRICT (bare bold `**APPROVED — 8/10**` is not a verdict). User marks GitGuardian incident
  39753787 false positive in the dashboard (no code change).
- 886 C1: REPORT-ONLY in this task. The hook deletes NOTHING; `auto` is unreachable
  (`effectiveMode` literal `'off'`). Removal executor, archive writer, activity lease = follow-up.
- 886 C2: never dispose a cancelled task's worktree. C3: local ancestor check against origin/main
  as last fetched; `gh` only for the open-PR read; no `git fetch`. C4: untracked files block;
  ignored files archived except the regenerable allow-list (evaluated only in this task).
- 886 Gate 1 passed (user, after the revise cap; review items 19-21 carried into the plan).
- 886 Gate 2 passed (user): the 7 read-only commands in implementation-plan.md
  `## Disposal policy as implemented in this task` are the complete set (incl. `gh pr list`);
  work that overlaps #957 waits for its merge; new codes `skipped/main-root-unresolved` and
  `skipped/main-root-not-open` approved.
- Real verification authorized (Electron run, haiku for real LLM calls).

## Done
- W878 commit a4ae02795 `fix(memory-curator): guard the last-run write against a shared database`
  (compare-and-set lastRun write, 3 attempts; failed read never writes). Pushed. Review kimi
  APPROVED 9/10 (code-logic-review-moderate-fix.md). PR body updated (/var/tmp/b878/pr-body.md).
- CI on a4ae02795: 19 pass, 4 skipping, 0 fail (GitGuardian now shows pass in `gh pr checks`).
- W886: task folder TASK_2026_886_cae4 with task-description.md (Rev 3), task-description-review.md
  (kimi, 3 rounds), implementation-plan.md (Rev 2, codex APPROVED round 1, 1 Minor folded into
  Batch 1), batches.md (19 batches, 3 phases), decisions.md rows 1-14, context.md (lane state).
  The team-leader fast-forwarded feat/task-end-hook from e9ca7046c to origin/main fe414de03 (no task
  commits yet). The task folder is untracked in W886 (not committed yet).

## In progress (uncommitted, W878)
CodeRabbit fix round for 12 unresolved PR #957 review threads (triage: coderabbit-triage.md;
9 fixed, 3 disputed: threads 3, 10, 12), plus two codex fix rounds:
- Round 0 codex REVISE 5/10 → fixed: INDEXING_COMPLETE now workspace-filtered in
  libs/frontend/core back-office-activity.service.ts; persistLastRun returns
  'written'|'stale-skipped'|'failed'.
- Round 1 codex REVISE 6/10 (stale skip left the panel "indexing") → fix round 2 (LAST, cap):
  a stale skip sends INDEXING_COMPLETE with `refreshOnly: true`; workspace-indexing re-reads status
  and clears progress; back-office ignores refreshOnly. Implementer reports verify
  (memory-curator, core, workspace-indexing, shared), Electron + renderer typecheck and the
  degradation audit exit 0. NOT yet re-reviewed. Thread 12 dispute was rejected by codex; the
  refreshOnly fix is the answer to it.
- New migration 0071_skill_inv_events_task_unreconciled (thread 8) + 24 migration specs bumped
  70 → 71 + migrations/index.ts.
- 44 modified tracked files + 2 untracked migration files. Also modified: HANDOFF.md of 878
  (stale; this file replaces it).

## Open problems
- Revise cap: the CodeRabbit fix code has used both revise rounds. If the codex re-review of fix
  round 2 finds a defect, REPORT it to the user; do not start a third round (agent-lanes §6).
- Flaky under low memory (<5 GB free): memory-curator real-SQLite tests
  (memory-retention.integration.spec.ts, boot-scan-runner.spec.ts) time out at 5 s; they pass
  when run alone. Re-run alone before the commit and report honestly.
- persistence-sqlite lint: 10 pre-existing errors in 0057/0058 migration files (also on main).
- Lanes: grok quota (resets 2026-11-12), antigravity quota (~2026-11-11), Ollama weekly
  (2026-11-09), kimi 5-hour window (resets 2026-11-06 21:43 UTC; monthly 93%). codex is the only
  different-family reviewer (weekly ~93%, resets 2026-11-08 19:45 UTC). Codex cannot run Nx or git.
- 886 migration is 0072 (#957 owns 0070 and 0071). Re-check main before Batch 1 lands.
- Pre-existing UI follow-ups from 878 visual review (not this PR): stat-card icon overlap,
  idle-timer input clipping, curator picker truncation, sidebar fact count.

## Key files
- W878/.ptah/specs/TASK_2026_878_5513/coderabbit-triage.md — per-thread verdicts + both fix rounds.
- W878/.ptah/specs/TASK_2026_878_5513/code-logic-review-coderabbit-fix.md — codex rounds 0 and 1.
- W878/.ptah/specs/TASK_2026_878_5513/review-input/coderabbit-threads.md — thread ids + commentIds
  (needed to reply and resolve on GitHub).
- W878/.ptah/specs/TASK_2026_878_5513/decisions.md — rows 26-31 this session.
- /var/tmp/b878/pr-body.md — PR #957 body source (`gh pr edit 957 --body-file`).
- W886/.ptah/specs/TASK_2026_886_cae4/batches.md — batches, executor prompts, "Rules every
  executor must follow" block; Batches 11-19 BLOCKED-ON-957.
- W886/.ptah/specs/TASK_2026_886_cae4/implementation-plan.md — Rev 2, approved.

## Background work
None. No CLI lanes, subagents, child sessions or CI watchers are running.

## Next steps
1. W878: independent re-review of fix round 2 (codex; resume_session_id
   01a1b245-4927-70c3-b483-1415db0b82d2 or a fresh codex lane with a full brief). Diff:
   `git diff -- libs/` in W878. Ask it to update code-logic-review-coderabbit-fix.md with
   `## Round 2` (APPROVED/REVISE). If REVISE: report to the user (cap reached).
2. W878: verify. `export TMPDIR=/var/tmp/b878 PTAH_VERIFY_LOCK_DIR=/tmp/ptah-verify-lock`, then
   `npm run verify -- -p memory-curator,core,workspace-indexing,shared,skill-synthesis,persistence-sqlite`
   and `npm run verify -- -t typecheck -p ptah-electron,ptah-extension-webview`; re-run the
   flaky real-SQLite files alone if they time out; run
   `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` (exit 0).
   Check dependents: `npx nx show projects --affected --base=main` (stub breaks in other libs).
3. W878: inspect `git status` + full diff, stage task files by explicit path (code, specs,
   migration 0071 + spec, coderabbit-triage.md, code-logic-review-coderabbit-fix.md,
   decisions.md, this handoff pointer), commit in the foreground (scopes from .commitlintrc.json,
   e.g. `fix(memory-curator,core,workspace-indexing,skill-synthesis,persistence-sqlite): ...`),
   push in the background, update the PR body, then reply to each CodeRabbit thread (fixed → the
   commit; disputed 3 and 10 → the evidence in coderabbit-triage.md; 12 → the refreshOnly fix)
   and resolve the fixed ones. Watch CI with a background `gh pr checks 957 --watch`.
4. W886: run Batch 1 per batches.md (backend-developer subagent, executor prompt + "Rules every
   executor must follow" verbatim), then team-leader MODE 2 with the report path; continue
   Batches 2-10. Phase reviews by codex after Batch 10. Do not start Batches 11-19 until #957 merges
   and the branch is rebased onto main. Commit the task folder with Batch 1 or as a docs commit.
5. When the context budget runs low, run /session-handoff.
