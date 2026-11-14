# Plan review - Phase 2 "Executor neutrality"

Verdict: REVISE

Scope of review: `implementation-plan.md` against the Phase 2 scope and acceptance in
`.ptah/specs/TASK_2026_977_0876/task-description.md:127-167`. Format follows the Phase 1 review
(`TASK_2026_1009_f898/implementation-plan-review.md`). No source file was edited and no command
other than read-only inspection ran.

## Findings

| ID | Finding | Severity | Context |
| --- | --- | --- | --- |
| F1 | B8 is not a 20-minute batch. It asks for one run of every phase kind on every capable executor, with screenshots, reduced lists, shared-worktree sessions and usage totals. This is a manual Electron matrix with an unknown cell count. A lane cannot drive it alone. Split B8 into (a) a fixed matrix list written before the run, (b) the `visual-review` screenshot run, (c) the tool-reduction and worktree evidence, (d) the usage totals check. Name which part needs a human or an Electron session. | Blocking | B8; acceptance at `task-description.md:160-167` |
| F2 | B4 is too large. It edits the phase definition markdown (plugin and `.claude` mirror), the old deny list, the caller policy, and "SDK, session and lane adapter files" without a named file list. The plan itself says B4 must find the effective-tool-list boundary first (Clarifications). A batch with an unknown write set cannot be sized or checked for file overlap. Add a discovery sub-step (B4a) that outputs the exact adapter files, then split B4 into SDK, session and lane adapters. | Blocking | B4; "Clarifications Needed" |
| F3 | B3 has the same problem. The SDK subagent call boundary is "identified in the branch" during the batch. The write set is `agent-sdk/src/lib/helpers/` by directory, not by file. `sdk-query-options-builder.ts` exists, but the plan does not say if it is the boundary. Move the boundary discovery into B1 (read-only output in the plan notes), so B3 and B4 start with a fixed file list. | Serious | B3; `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts` |
| F4 | The census gate is under-specified for B5. B5 removes `DEFAULT_ROLE` (`phase-plan.ts:43-58`). `BUILTIN_SUBAGENT_ROLES` is derived from it (`phase-plan.ts:57`), and `hard-constraints.ts:327` iterates `NEVER_ON_A_LANE_PHASE_KINDS`. The plan must say what replaces `BUILTIN_SUBAGENT_ROLES` (the SDK candidate needs a role name or a phase-based identity) and that the replacement adds no retired role title (Phase 1 review F1 found this exact failure). B5 should also list `phase-plan.spec` and `hard-constraints.spec` in the write set. | Serious | B5; `phase-plan.ts:43-58,315`; `hard-constraints.ts:47-50,157,327` |
| F5 | The B1 write set contains `task-spec.contract.ts` but no finding, design line or acceptance text explains why. The B1 acceptance also does not say where the host resolves skill names to a path or text. The task description (`task-description.md:380-385` area, research point 10) requires a measured probe for each CLI before the plan relies on a delivery channel. The plan has no probe step. Add a probe task (codex, copilot, cursor, other installed lanes) as a B1 or B3 output, and state the fallback when a CLI has no skill channel. | Serious | B1, B3; `context.md` research point 10 |
| F6 | The B1 verify command covers only `shared` and `lane-routing`. B1 also reads (and the plan says "validated") the `session-spawner.port.ts` and the agent schemas. If B1 changes the port type that B2 and B3 consume, the type check of `cli-agent-runtime` and `vscode-lm-tools` is not run until B2 and B3. Either keep the port change out of B1 or add those two projects to B1 verify. | Serious | B1 |
| F7 | B7 depends on B2-B3 and B6, but its write set includes `agent-sdk/src/lib/session-stats/session-usage-ledger.ts`. B3, B4 and B6 also write in `agent-sdk`. Parallel runs B5/B6 are safe on files, but B6 and B7 serialize on `agent-sdk`. The plan states "B5 and B6 parallel" but does not give the full overlap table. Add a file-disjointness table. B7 can start in parallel with B5, not only after B6, if the completion adapter does not own the usage attribution. | Minor | B6, B7; dependency text in Design |
| F8 | The B7 migration does not name the migration slot or its test. Current S0002 is at `session-store-migrations.ts:44-69` (columns confirmed: no phase or executor column). The plan must say that the new migration is additive (nullable `phase_kind`, `executor_type`), that it adds an index if grouping needs one, and that a spec opens an old database and keeps old rows readable. The acceptance says "migration preserves old rows" but no spec is named. | Serious | B7; `session-store-migrations.ts:44-69` |
| F9 | B2 attach mode: the design says to compare task ID, canonical path and branch against a "registry". The plan does not name the registry file or its read API in the B2 read set (it says "session registry and host port"). The attach path also needs a rule for the two-session case (second session on the same worktree, same branch). The provisioner refusal for branch exists is at `child-worktree.provisioner.ts:103-132` (confirmed). The risk "attached worktree is never removed by spawn failure" has an acceptance line but no named spec case for rollback. | Serious | B2; `child-worktree.provisioner.ts:103-132,170-175` |
| F10 | The B5 acceptance covers the capability rule but not the stop path. Task scope says: when no candidate has the capability, the phase stops with a clear reason (`task-description.md:141-142`). B5 states "missing capability reason is visible" only. Add an explicit case: no candidate has `browser`, phase result is unavailable with a reason, and no silent fallback to a candidate without the capability. | Serious | B5; `task-description.md:138-142,161-163` |
| F11 | The B6 classification order is stated in Findings (explicit task kind, then phase kind, then role alias) but `task-kind-mapping.ts:50-72` takes only `role` today (`taskKindForRole(role)` at line 51). The function signature must change to accept a phase kind. The plan does not name the caller sites. Add a reverse-dependency check (`ptah_get_dependents` on `task-kind-mapping.ts`) as a B6 first step. | Minor | B6; `task-kind-mapping.ts:51-72` |
| F12 | The verification budget says "Every batch runs the census command". The Phase 1 review F3 found that a space-separated `-p` list fails. The plan uses commas (correct). The plan also names the `validate-skill` command through `scripts/verify.mjs --exec` (correct per CLAUDE.md and context.md). No fault here. Noted only to record that the Phase 1 command errors do not repeat. | Minor | Census and verification budget |
| F13 | The plan has no stop condition for the unfiltered adapter case in B4 (`task-description.md:147-148`). The acceptance says "unsupported adapter is named as unfiltered". The test must assert the field name in the result, not only a log line. State the result field. | Minor | B4 |
| F14 | Risks table has no risk for the SDK candidate identity after `DEFAULT_ROLE` removal (F4), for CLI skill delivery with no channel (F5), or for the Electron matrix being too large (F1). | Serious | Risks |
| F15 | No Phase 2 batch states which user-visible or MCP schema change needs a doc or tool-description update. `session-tool-args.schema.ts` and `agent-spawn-args.schema.ts` are strict (`.strict()` at `session-tool-args.schema.ts:62`). New keys change the MCP tool description, which agents read. | Minor | B2, B3 |

## Answers to the six questions

1. **Sizing.** B1, B2, B3, B5, B6 and B7 fit about 20 minutes if their write sets are fixed. B4 and B8 do not (F1, F2). B3 is at risk (F3).
2. **Dependency order.** The order is correct: B1 first, B2 and B3 in parallel (their write sets are file-disjoint: session files against agent-spawn and SDK files), B5 and B6 in parallel. Add an explicit overlap table (F7). B7 may start earlier.
3. **Acceptance gates.** Each Phase 2 acceptance line maps to a batch: executor matrix to B8, `visual-review` to B5 and B8, reduced tool list to B4, shared worktree to B2, usage totals to B7. Gaps: the stop path (F10) and the unfiltered result field (F13).
4. **Citations.** I checked these and they are correct: `phase-contract.types.ts:20-29` (`PhaseDefinitionV1`, `toolProfile` at 28), `session-tool-args.schema.ts:38-62`, `phase-plan.ts:43-58` and `:315`, `hard-constraints.ts:47-50` and `:157`, `child-worktree.provisioner.ts:103-110`, `session-store-migrations.ts:45-69`, `task-kind-mapping.ts:51-53`, and `task-description.md:127-167,301`. The citation `task-description.md:380-385` falls in the research table near rows 8-10. The paragraph about point 10 follows it, so the range is about 3 lines early. The plan names `task-description.md` without the folder. The file is in `TASK_2026_977_0876`, not in the Phase 2 task folder (`TASK_2026_1161_9efb`). Write the full path once. I did not read the lines for `phase-definition-resolver.ts:82-108`, `agent-namespace.builder.ts:390-510,570`, `session-stats-repository.ts` or `session-spawner.port.ts:134-146,344-415` in full. Treat these as unverified.
5. **Risks.** Seven risks exist. They control the stale path risk, the browser tool callable risk, attach safety and policy order. They do not control F4, F5 and F1 (F14).
6. **Decisions to question.**
   - Host-side skill resolution is correct, but it needs the per-CLI probe (F5).
   - "Keep `role` for user-written agents only" conflicts with the scope line "`role` on a lane stays as a compatibility input" (`task-description.md:132-133`). The plan should state that a lane keeps `role` as input in Phase 2 and does not narrow it to user-written agents until Phase 4.
   - "Record unfiltered adapters explicitly" is correct and matches `task-description.md:147-148`.
   - Deriving capability from the effective tool list is correct (`task-description.md:140-141`). The plan must say how the router reads the list at run time for a child session that is not yet started (F2).

## Corrections

| ID | Correction | Fixes |
| --- | --- | --- |
| C1 | Split B8 into a written matrix, a Electron `visual-review` run, a tool-reduction and worktree evidence run, and a usage totals check. Mark the human or Electron steps. | F1 |
| C2 | Add a discovery step before B3 and B4 (in B1 or as B4a) that lists the SDK call boundary and the effective tool list boundary by file. Split B4 into SDK, session and lane adapter batches. | F2, F3 |
| C3 | In B5, state the replacement of `BUILTIN_SUBAGENT_ROLES` and the `DEFAULT_ROLE` lines with no new retired role title. Add `phase-plan.spec` and `hard-constraints.spec` to the write set. Run the role census before and after. | F4 |
| C4 | Add a per-CLI skill delivery probe and a fallback rule. Explain or remove `task-spec.contract.ts` in B1. | F5 |
| C5 | Add `cli-agent-runtime` and `vscode-lm-tools` to B1 verify, or keep the port change out of B1. | F6 |
| C6 | Add a file-disjointness table for B2-B7. Allow B7 to start after B3 if usage attribution does not use the B6 files. | F7 |
| C7 | In B7, state an additive nullable migration and a spec that opens an old database. | F8 |
| C8 | In B2, name the registry file and add a rollback spec case for an attached worktree and a two-session case. | F9 |
| C9 | In B5, add a "no candidate has the capability" case with a clear stop reason and no silent fallback. | F10 |
| C10 | In B6, run `ptah_get_dependents` on `task-kind-mapping.ts` first and name the changed signature. In B4, name the result field for the unfiltered adapter. | F11, F13 |
| C11 | Add risks for SDK candidate identity, missing CLI skill channel and matrix size. | F14 |
| C12 | State that `role` on a lane stays a compatibility input in Phase 2. Use the full path of the task description. List the MCP tool description update for the new keys. | F15, Q6 |

After C1 to C12, the plan can move to APPROVED-WITH-NOTES. The two Blocking findings (F1, F2) must close first.
