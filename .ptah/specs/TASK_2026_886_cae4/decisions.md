# Decisions - TASK_2026_886_cae4

| # | Decision | Evidence | Source |
|---|----------|----------|--------|
| 1 | New FEATURE task, not an 881 milestone; relates to 881 and 878 | 881 is the Memory & Skills redesign program (UI + loop); this hook is a separate automation entry point that later 881 milestones can reuse | orchestrator |
| 2 | Depth Full; flow PM -> Gate 1 -> architect -> Gate 2 -> team-leader -> QA | Cross-library backend change; irreversible disposal semantics | skill rules |
| 3 | Branch from main (e9ca7046c), not stacked on 878 | User rule: new task gets its own worktree from main | user |
| 4 | Gate 1 lane-review; Gate 2 user approval | User asked to validate the plan; disposal is irreversible (user-reserved) | user + skill rules |
| 5 | Task folder moved from main checkout into the worktree (ptah_task_create wrote it at the workspace root) | diff -r identical before removal | orchestrator |
| 6 | Gate 1 round 0: kimi lane REVISE (2 Blocking: P10 activity race, spec-folder deletion contradiction; 7 Serious; 4 Moderate; 1 Minor). Fresh PM revises (round 1 of 2) | task-description-review.md | cross-side review |
| 7 | Gate 1 round 1: kimi REVISE (11/14 resolved; open 8 Serious, 11, 12 Moderate; new 15-17 Serious, 18 Moderate). Fresh PM revises (round 2 of 2, last); REVISE after this goes to the user | task-description-review.md | cross-side review |
| 8 | User: C1 report-only (auto unreachable; executor, archive writer, lease -> follow-up); C2 never dispose cancelled; C3 local ancestor check, gh only for open PR, no fetch; C4 block untracked, archive ignored except allow-list | AskUserQuestion 2026-11-06 | user |
| 9 | Gate 1 round 2: kimi REVISE; all 7 earlier items resolved; 3 new (19, 20 Moderate; 21 Minor). Revise cap reached -> escalated to the user with proposed resolutions carried into the plan | task-description-review.md | cross-side review + cap rule |
| 10 | Gate 1 PASSED by the user (escalation after cap); items 19-21 carried into implementation-plan.md; next: software-architect | AskUserQuestion 2026-11-06 | user |
| 11 | PR #957 now adds migration 0071 (skill-event index, CodeRabbit thread 8). This task's migration moves to 0072; re-check main before B1 | coderabbit-triage.md | orchestrator |
| 12 | Gate 2 round 0: codex lane REVISE (3 Serious: write/journal ordering, main-root derivation, curator failure mapping; 3 Moderate: pending step rows, #957 migration sequencing, host verification). Fresh architect revises (round 1 of 2) | implementation-plan-review.md | cross-side review |
| 13 | Gate 2 round 1: codex APPROVED Revision 2 (1 Minor: retryable curator reason count). Gate 2 goes to the user (approval mode user) | implementation-plan-review.md | cross-side review |
| 14 | Gate 2 PASSED by the user: 7 read-only commands approved as listed (incl. gh pr list); overlaps with #957 wait for its merge (Part B registry line + B8 engine entry points); new codes skipped/main-root-unresolved and skipped/main-root-not-open approved | AskUserQuestion 2026-11-06 | user |
