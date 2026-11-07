# Implementation Plan Review

Author: software-architect subagent, claude  
Reviewer: codex  
Revision: 1  
Round: 0

## Verdict

APPROVED

## Findings

1. **Serious — status-write ordering is not guaranteed (plan §4, lines 208–212; §10, lines 565–578).** `TaskWriterService.notify()` awaits `TaskIndexService.applyFolderChange()` before `updateMetadata()` returns (`task-writer.service.ts:802–818`), while the index event fires synchronously. The proposed 250 ms timer may flush and commit the journal before the writer's promise resolves if the caller is delayed after the event. AC 1.8 explicitly requires the journal write *after* the status write returns. The detector test proposes a stub that fires synchronously, but checking a usual fast call does not prove that ordering. Define a post-write scheduling/acknowledgement boundary that applies to all write sources, or revise the requirement with user approval; add a test that deliberately holds the writer after event emission and asserts no journal commit until its return.

2. **Serious — the main worktree root has no derivation (plan §2, lines 155–164; §4, lines 218–229; §6.3, lines 354–357; §6.4, lines 430–452).** A run stores `main_root` and disposal/indexing operate from it, but the detector defines only `seenRoot` and repository identity via `git rev-parse --git-common-dir`. The latter yields the common Git directory, not the main worktree path. A task first seen from a linked worktree therefore has no specified way to find the root for `git worktree list`, `origin/main`, `.claude-worktrees` containment, session links, and the main-root census. Derive the main path from a read-only `git worktree list --porcelain -z` run from the seen root, validate it, persist it with the run, and test a worktree-only startup where the main checkout is not registered as a workspace.

3. **Serious — failed curation can look successful or lose its reason (plan §6.1, lines 318–330; §7b, lines 495–510).** The proposed public method obtains `CuratorRunStats` by changing `invokeCurate()` from `Promise<void>`, but the current implementation catches transcript and curator exceptions, logs them, and then resolves without stats (`memory-trigger.service.ts:955–967, 1025–1039`). The plan does not say how the new method turns that path into the closed `failed/curator-failed` outcome; it also collapses all stalled deferrals except queue wait into `curator-deferred`, whereas AC 2.4 requests the curator's own reason code after #957 merges. Define a total result for every engine exit, including caught exceptions and the post-#957 reason codes, and test those paths without exposing raw errors in the run record.

4. **Moderate — run creation does not initialize the required step records (plan §2, lines 155–165; §3, lines 176–187).** AC 6.1 requires the created run record to hold each step and its state. The transaction description inserts a transition and a run, while `task_end_steps` are written later by `upsertStep`; there is no specified insertion of pending close-curate, harvest, dispose and index entries. A read during the settle window would return an empty `steps` array and could appear complete to a consumer. Insert the pending step records in the same transaction, define the dispose subject before candidate discovery or a placeholder convention, and test a read immediately after run creation.

5. **Moderate — #957 sequencing is inconsistent for migration B1 (plan §2, lines 169–171; handoff lines 804–822).** The plan defers B8's engine edits until #957 merges but B1 edits `persistence-sqlite/src/lib/migrations/index.ts`, another #957 file, and calls for a migration 0071 test after 0069 while #957's 0070 is absent. Rebase B1 on #957 before editing the registry, or split its isolated SQL/spec work from the registry edit and verify the resulting 69→70→71 order. Make B1's verification point depend on that sequence. The remaining named batches are file-disjoint as written.

6. **Moderate — required host verification is incomplete (plan test matrix lines 721–740; handoff lines 826–833).** `libs/shared` types, `task-specs` integration and the optional `vscode-lm-tools` read path are shared dependencies, yet the plan's scoped verification list omits `task-specs`, `cli-engine`, and the Electron renderer host specified by the repository's `CLAUDE.md` for shared-library changes. The plan asserts `cli-engine` is unaffected because it has no import edit, which is not proof that its transitive shared contracts still compile. Add scoped `npm run verify -- -p <project>` checks for dependent hosts and affected libraries, with each batch's checks stated after its file edits. No checks were run in this read-only review.

## Acceptance and contract audit

ACs 1.1–1.12, 2.1–2.5, 3.1–3.4, 4.1–4.4 and 4.10, 5.1–5.8, and 6.1–6.6 have named components and specs in the plan's matrix. ACs 4.5–4.9 are explicitly deferred under C1. Findings 1 and 4 identify acceptance criteria whose named tests would not establish the stated behavior. Gate 1 findings 19, 20 and 21 each have a closed-schema outcome and a named test (`census-coordinator.spec.ts`, `decide-disposal.spec.ts` plus worker spec, and `decide-disposal.spec.ts`, respectively). The cited `TaskIndexService` event/list, `IndexingControlService.start/getStatus`, `SpecHarvesterService.harvest` and `parseWorktreeList` APIs exist in the worktree; `harvestTask` and `curateSessionForTaskEnd` are correctly described as planned additions. No invented existing API was confirmed in the spot checks.

The disposal command table contains only local Git reads and a `gh pr list` read. The additional `git rev-parse` and `git remote -v` invoked by `GitInfoService.readPrStatus` are also reads. The plan forbids fetch, archive writes and removal, and does not plan peer TASK_2026_879_9809 edits. Its library/host dependency direction and optional reader avoid an evident deep import or cycle.

## Five logic questions

1. **Silent success:** caught curator exceptions can resolve without a result (finding 3); an empty step list immediately after run creation can masquerade as a valid record (finding 4).
2. **Unexpected user action:** ending a task in a linked worktree when the main checkout is not registered leaves main-root-dependent probes undefined (finding 2).
3. **Wrong-answer input:** the same terminal task reached through a linked worktree can acquire an incorrect or absent `mainRoot`, affecting containment and indexing (finding 2).
4. **Dependency failure:** the plan maps most probe failures to blocked/unverifiable and store failures to retry, but the curator's swallowed exception path needs an explicit result (finding 3).
5. **Missing from requirements:** the plan must define how a main checkout is discovered and validated from a worktree-only observation (finding 2).

## Notes for the user

C1–C4 remain binding. The plan asks again for approval of the read-only command list and #957-overlapping edits. This review finds no new user-reserved decision needed to resolve the findings: the command list matches C3, and the overlapping edits can be sequenced after #957 as the plan proposes. The author can revise the implementation detail and verification matrix without changing the approved disposal policy.

## Round 1 (Revision 2)

### Verdict

APPROVED

| Round 0 finding | Status | Evidence in Revision 2 body |
| --- | --- | --- |
| 1. Status-write ordering | Resolved | Components 4 and 4a, lines 254–258 and 335–349: the writer counts in-flight calls per root, signals after awaited notification, and the detector commits only after the settle signal and timer. The held-writer and overlapping-write specs at lines 303–306 exercise the boundary. |
| 2. Main-root derivation | Resolved | Component 4, lines 266–277: parse `git worktree list --porcelain -z` from the seen root, validate the main entry and repository identity, and persist a nullable root. The worktree-only startup spec is at line 319. The existing parser marks its first entry `isMain` (`libs/shared/src/lib/utils/git.utils.ts:76–82`). |
| 3. Curator failure mapping | Resolved | Components 6.1 and 7b, lines 412–457 and 619–649: a closed pass result covers gates, stalls, failures, caught exceptions and unexpected rejection; the step maps post-#957 reason codes and tests secret-shaped errors. The #957 worktree has the stated `CuratorRunStats.reason`, `refundUndispatched`, and `MAX_FAILED_PASS_RETRIES` contracts. |
| 4. Pending step rows | Resolved | Components 2 and 3, lines 187–225: run creation inserts all four pending placeholders in the same transaction; `expandStep` replaces subject placeholders atomically. The immediate-read and rollback specs are named at lines 239–246. |
| 5. #957 migration sequencing | Resolved | Component 2, lines 174–208, and B1a/B1b in the handoff: isolated 0072 SQL/spec precede the merge; registry and pin edits follow the #957 merge and rebase. The #957 worktree contains migrations 0070 and 0071 and registers version 71 in `migrations/index.ts:489–495`. |
| 6. Scoped host verification | Resolved | Handoff verification table, lines 998–1010: affected projects and dependent hosts, including task-specs, cli-engine, Electron and the webview, have scoped `npm run verify -- -p` commands after the corresponding batch. |

### New findings

1. **Minor — retryable reason count is misstated (Component 1, lines 127–128).** The plan lists eight retryable curator codes, then says `failed/<same code>` covers “nine reasons.” The ninth deferred case is `hourly-limit`, which is a trigger gate, not a curator code. State explicitly whether `failed/hourly-limit` is the ninth member (the mapping in Component 6.1 says it is), and align the count and type-test cases. This does not change the intended outcome schema.

### Audit

All six round 0 issues are addressed in the plan body. The two proposed index skips are `skipped` pairs with named tests and a closed-schema fallback if user approval is declined; their approval remains a user decision. The disposal command table at lines 784–798 remains read-only: local `git` probes and one `gh pr list` read, with no fetch, removal or archive write. Batch file ownership remains disjoint, and the #957-overlapping edits are sequenced after its merge. No source edits, builds, tests, Nx, npm or git commands were run. Ptah tools and a skill-loading tool were not exposed in this lane; source claims were checked by native file reads.
