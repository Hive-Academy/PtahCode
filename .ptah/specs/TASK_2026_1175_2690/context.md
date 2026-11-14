# Task Context - TASK_2026_1175_2690

## User Request

Phase 4 "Retire the role subagents, one by one" of program `TASK_2026_977_0876`. The parent
session (program coordinator) started this child session on 2026-11-14 with this brief:

- Write `implementation-plan.md` before step 1. It must specify the five U-D13 points of skills
  learning and locate their code.
- Sequence: step 1 implementation roles (`backend-developer`, `frontend-developer`,
  `devops-engineer`), step 2 verification roles, step 3 definition and knowledge roles, step 4
  `team-leader` last. Each step is one pull request.
- Close the open items of the Phase 2 hand-over note (`phase2-handover.md`, a copy of
  `TASK_2026_1161_9efb/phase4-handover.md`).
- Report the plan to the parent before step 1.

## Task Type

FEATURE (program phase; child of `TASK_2026_977_0876`)

## Complexity

Complex

## Strategy

- Depth: Full. Plan → report to parent → step 1 → step 2 → step 3 → step 4.
- One pull request per step, all from this worktree branch line (`feat/phase4-retire-roles`
  for step 1; later steps get their own branch from `main` after the earlier step merges, or
  stack on this branch if the parent agrees).
- Research and implementation run on non-Claude CLI lanes. The coordinator verifies, reviews,
  commits and pushes.

## Inputs

- Program definition: `../TASK_2026_977_0876/task-description.md` § Phase 4, § 7 (U-D13).
- Program decisions: `../TASK_2026_977_0876/decisions.md` (O-24).
- Parity inventory: `../TASK_2026_977_0876/parity-inventory.md` § 6, § 9.
- Phase 2 decisions O-18..O-41: on the Phase 2 branch (`TASK_2026_1161_9efb/decisions.md`),
  not on `main`. The items that affect Phase 4 are in `phase2-handover.md` and in
  `implementation-plan.md` § Inputs.
