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

## Step 0b: review fixes and follow-ups

- Reviews: `code-logic-review-0b-1-3.md` (codex) and `code-logic-review-0b-2-4.md` (Claude Api).
  Fix lanes: `fix-A-result.md`, `fix-B-result.md`, `fix-C-result.md`. Re-reviews:
  `code-logic-review-0b-fix.md`, `code-logic-review-0b-fix-c.md` (all prior findings closed).
- Host-source baseline exception: `usage:getDimensionTotals` was added to
  `libs/shared/src/lib/types/rpc/host-source-registry.baseline.ts`. The method is a read-only
  RPC that the approved Phase 4 plan names (`phase2-handover.md` §3.3, brief 0b-3). The diff
  adds only that one name. Precedent: commit a4524ce4a.
- Follow-ups, not in this pull request:
  - D2 host wiring: pass the clone-active predicate (effective `disabledSkillIds`) to
    `PhaseDefinitionFileReader` in Electron `phase-2-libraries.ts` and CLI `container.ts`.
    The browser gate stays safe without it (v1 fallback, v2 requires the field, the enhancer
    keeps the declared capabilities).
  - D7: a CLI container spec for the reader and writer tokens. The first try kept an async
    handle open after teardown.
  - C4: the phase history list must show revert only for snapshots that contain that file.
    The drawer must pass per-file availability.
  - H1 (`code-logic-review-0b-fix-c.md`, minor): when another process deletes a history
    snapshot folder after `listHistory`, `getHistoryBody` throws `INVALID_PARAMS` and not
    `{ body: null }`. Fix it with C4.
  - The local Windows run of `user-layer-reap.spec.ts` fails on `symlink` EPERM. This branch
    does not change that file.
