# Decisions - TASK_2026_977_0876

Audit log of orchestrator decisions. The user can overturn each one. User decisions are in
`task-description.md` § 7.

| ID | Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- | --- |
| O-1 | Type FEATURE, depth Full | FEATURE, REFACTORING | The end state adds user-visible functions (phase delivery to sessions, skill setup) and removes others. Scope is large and crosses more than 5 libs | Yes |
| O-2 | This task is the program carrier and holds no code change. Each program phase is a child task with its own worktree and PR | One long branch; one task per phase with a parent | Project rule: each task starts in its own worktree. The user said "retire subagent one by one" | Yes |
| O-3 | Child tasks are created when a phase starts, not now | Create all now; create at start | The task folder must be created inside the worktree of that task | Yes |
| O-4 | The workspace analysis stays | Remove with the generation; keep | It feeds the skill selection and the project guidance. The user said the analysis idea "is quiet good but it needs some adaptation" | Yes |
| O-5 | The SDK subagent stays as a runtime function. User-written agent files continue to work | Remove all subagent support; keep the runtime | The SDK supplies the function. Removal of user files or of their effect is a breaking change for users | Yes (open decision U2) |
| O-6 | Bots are a separate later task (Phase 7) | Part of the program; later | Phases 1 to 6 do not need an identity. The workflow needs phases and skills | Yes (open decision U3) |
| O-7 | Gate 1 goes to the user | Lane review only; user | The definition proposes removals. A reviewer cannot approve a removal | No |
| O-8 | Document reviewer: `codex` lane | codex; Claude Api; subagent | The only lane with confirmed room. Other family than the author | Yes |
| O-9 | The lane report `executor-economics.md` is not copied into `evidence/` | Copy; omit | Its control table and budget row are wrong. The corrected facts are in `task-description.md` § 8 | Yes |
| O-10 | All 8 findings of review round 1 accepted. Revision 2 of `task-description.md` | Accept; dispute | The orchestrator read the cited code for findings 1, 2, 4, 5, 6 and 8 and it agrees. Findings 3 and 7 are requirements for a runtime check, which costs little | Yes |
| O-11 | The custom subagent designer of the harness wizard goes to the user as U4, with the recommendation to make it the base of Phase 7 | Remove in Phase 5; keep as is; convert to bots | Its output has execution modes and triggers (`harness-subagent-design.service.ts:25-34`). That is the bot pattern, not a workflow role | Yes |
