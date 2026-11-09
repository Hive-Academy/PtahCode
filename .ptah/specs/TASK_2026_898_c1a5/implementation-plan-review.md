# implementation-plan.md — Gate 2 review (round 1)

- Author: software-architect on Codex CLI lane (family codex)
- Reviewer: orchestrator, in-process (family claude), opposite execution side
- Verdict: **REVISE** (revise cap: 2 rounds; this is round 1)

## Findings

1. **Scope creep: automatic memory curation removed** (Phase B item 5, file table row
   `memory-trigger.service.ts`). The user asked to make skill-trajectory learning manual. The
   requirements (task-description.md In scope Phase B, AC 8) name only skill-trajectory
   synthesis and spec harvest. Turn-complete and boot memory curation serve every chat session,
   including sessions with no task. Removing them is lane-introduced and loses memory for
   non-task work. Fix: keep `MemoryTriggerService` Stop/boot curation unchanged. Close-out
   additionally calls task-scoped `curateSessionForTaskEnd`. Drop `memory-trigger.service.ts`
   from the change list and from the AC 8 test row.
2. **Close-out is not triggered in the background after merge** (Phase B items 1, 2, 4). The
   user asked that after the merge "our agent should invoke that clean up workflow in the
   background based on hooks". In the plan, the PR reconciler runs only at startup and on
   task-index changes, and close-out runs only from an explicit `/close-task` or MCP call.
   Fix: the reconciler is the hook. While a task is `in_review`, it checks its PR on a
   bounded interval (and on git-watcher fetch/HEAD events if available). When it confirms a
   merge, it sets `done` and starts the close-out run automatically in the background. The
   explicit MCP tool and `/close-task` stay as manual entry/retry. State the interval, the
   backoff, and that only `in_review` tasks are checked (cost bound on `gh` calls).
3. **Row exclusion conflicts with user decision 9** (Phase A file table row
   `previous-sessions-modal.component.ts`, Decisions row 2 "narrow row exclusion if needed").
   The user said: close it as if they closed it by hand, no special list handling. Fix:
   remove the row exclusion. AC 3's "no ordinary Done-session row" is satisfied only by what a
   manual close already does. State what a manual close does to the list today (file:line). If
   a manually closed session still shows in Done, record that as accepted behaviour per
   decision 9, not as a new filter.
4. **`closed-unmerged` returns the carrier to `in_progress`** (Phase B item 1). A PR closed on
   purpose without merge (abandoned) would reopen the task. Fix: on `closed-unmerged`, leave
   the status unchanged and report the outcome. The orchestrator or the user picks
   `in_progress` / `cancelled`.
5. **Phase B batch sizing** (file table, Projects line). Name the batches explicitly with their
   file lists (≤ 6 files each) and the `npm run verify -- -p ...` projects for each. Include
   the VS Code host composition files by path, not "affected VS Code host".

## Accepted as is

- Phase A durable pair record, the server-derived caller identity, `armCallerStop` moved behind
  the ack, and the idempotent close state.
- Opt-in setting `taskCloseOut.autoRemoveMergedWorktreeAndBranch` (default `false`), with the
  clean + merged + recheck-before-remove checks and no force flags.
- Removal of the `SkillTriggerService` Stop → harvest chain, with telemetry retained.

# Round 2 re-review

- Verdict: **APPROVED**
- Finding 1: fixed. memory-curator is out of the change list, and Stop/boot curation is kept.
- Finding 2: fixed. The reconciler checks `in_review` tasks every 5 min, from one host timer,
  with backoff to a 1 h ceiling. On merge it sets `done` and starts the background close-out.
- Finding 3: fixed. The row exclusion is removed.
- Finding 4: fixed. `closed-unmerged` leaves the status unchanged.
- Finding 5: fixed. Batches B1-B8 have their files and verify projects.
  `apps/ptah-extension-vscode` and `libs/backend/platform-vscode` are absent from the
  repository (verified with `ls`), so no VS Code composition files apply.
