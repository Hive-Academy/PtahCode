# Task Description Review - TASK_2026_886_cae4

- Author: project-manager subagent, claude
- Reviewer: code-logic-reviewer, kimi
- Revision: 1
- Round: 0

## Verdict

REVISE

## Findings

1. **Blocking — P10 is neither fully checkable nor atomic.**
   - Location: `task-description.md:175` (P10), `task-description.md:123-124`.
   - Finding: The document gives no authoritative data source for every CLI lane, terminal, and other app process. A session or lane can also start after the check and before removal. Git state checks do not close this race.
   - Required change: Define a cross-process activity source and an exclusion lock or lease. Define fail-closed behavior when activity is unknown. Add a test where work starts between eligibility evaluation and removal. If the repository cannot provide this guarantee, keep automatic disposal unreachable.

2. **Blocking — The policy contradicts itself about task spec deletion.**
   - Location: `task-description.md:70`, `task-description.md:160`, `task-description.md:184`.
   - Finding: The document forbids deletion of the task spec folder in any root. `git worktree remove` deletes that folder when it belongs to the worktree. P7 also archives ignored files inside that folder despite the scope exclusion for spec archiving.
   - Required change: State the exact exception for files removed as part of an approved worktree removal. Distinguish that exception from separate spec deletion or separate spec archiving. Keep the revised wording subject to user approval.

3. **Serious — The dedupe key rejects a required later run.**
   - Location: `task-description.md:88-89`.
   - Finding: “Task id plus transition” is unchanged when a task repeats the same transition. For example, `in_progress -> done` can occur twice with a reopen between the occurrences. The key also lacks repository identity, so equal task ids in unrelated workspaces can collide.
   - Required change: Add a terminal-episode sequence or transition identifier. Include stable repository identity while still allowing main and linked worktree copies to coalesce. Test repeated identical transitions and equal task ids in two repositories.

4. **Serious — A failed harvest still permits disposal.**
   - Location: `task-description.md:112-113`, `task-description.md:150`, `task-description.md:176` (P11).
   - Finding: `failed` and `no-carrier` are terminal harvest outcomes. P11 therefore permits disposal after failed extraction. This contradicts the requirement to capture learning before removal.
   - Required change: Permit disposal only after an explicitly approved successful harvest outcome. Define whether `already-harvested` qualifies. Record `harvest-failed` or `no-carrier` as disposal blocks, and add tests for both.

5. **Serious — Report-only mode cannot report `eligible`.**
   - Location: `task-description.md:122`, `task-description.md:166` (P1), `task-description.md:190`.
   - Finding: In `off` mode, P1 fails because the mode is not `auto`. The first recorded result is therefore always `disposal-disabled`, not `eligible`.
   - Required change: Exclude the `auto` portion of P1 from report-only evaluation. Require `off` mode to evaluate P2 through P11 and report the first applicable result.

6. **Serious — Prune can change other worktrees.**
   - Location: `task-description.md:123`, `task-description.md:126`, `task-description.md:160`; `libs/backend/vscode-core/src/services/git/agent-worktree-admin.ts:65-66,199-210`.
   - Finding: `git worktree prune` processes every prunable administrative entry. It is not limited to the linked task worktree. This conflicts with the policy that permits changes to one linked worktree only.
   - Required change: Remove the prune step after successful removal, or define a target-only mechanism. For a missing directory, prevent changes to other entries and test that constraint.

7. **Serious — Archive overwrite behavior is undefined.**
   - Location: `task-description.md:172` (P7), `task-description.md:199`.
   - Finding: A task can have several worktrees or several terminal episodes. The `<taskId>/<utc-stamp>` destination can collide without a defined timestamp precision or collision rule. An overwrite can destroy earlier evidence despite the promise that the archive is never deleted.
   - Required change: Include a unique run id and worktree identifier in the destination. Require exclusive creation without overwrite. Add same-task, same-time, restart, and multi-worktree tests.

8. **Serious — Crash recovery starts too late in the data flow.**
   - Location: `task-description.md:90-92`, `task-description.md:149`, `task-description.md:199`.
   - Finding: Restart handling covers an existing unfinished run. It does not cover a crash after the carrier write but before durable run creation. The startup baseline can then treat the terminal task as historical and miss the hook.
   - Required change: Define durable recovery of a committed transition before any step starts. Add a crash test between carrier commit and run-record creation. Preserve the rule that the status write does not wait for hook work.

9. **Serious — Resource limits do not bound the full workload.**
   - Location: `task-description.md:136-140`, `task-description.md:172`, `task-description.md:196`, `task-description.md:211`.
   - Finding: The durable FIFO has no depth limit. Archive size and file count have no limit. A task that ends after a census completes can start another full census immediately, so coalescing does not prevent near-continuous multi-hour runs.
   - Required change: Define queue backpressure, archive byte and file limits, and a census cooldown or minimum interval. Define the recorded reason for each limit. Include a test with sequential task ends after separate census completions.

10. **Moderate — The existing harvest API is root-wide, not task-specific.**
    - Location: `task-description.md:44`, `task-description.md:112`; `libs/backend/skill-synthesis/src/lib/spec-harvester.service.ts:104-112`.
    - Finding: `harvest(workspaceRoot?)` scans every completed spec under the root. The acceptance criterion requires one task folder. A direct call can harvest unrelated historical tasks and exceed the expected cost.
    - Required change: Require a task-filtered public API or an equivalent adapter. State which owned file may provide it. Test that unrelated terminal specs remain untouched.

11. **Moderate — The outcome schema does not define all required outcomes.**
    - Location: `task-description.md:87`, `task-description.md:122-126`, `task-description.md:148`.
    - Finding: The run must become `cancelled`, but no run-state set is defined. Values such as `eligible`, `removed`, and `harvested` also lack an explicit mapping to step state versus reason code.
    - Required change: Define the run-state set and the state and reason pair for every named outcome. Keep the sets closed and add an exhaustive type test.

12. **Moderate — The determinism criterion omits decision inputs.**
    - Location: `task-description.md:152`.
    - Finding: Git state, settings, and carrier do not determine every result. Session activity, PR state, harvest markers, indexer state, archive failures, and subprocess errors also affect outcomes.
    - Required change: Define the complete input record for a pure decision function, or narrow the criterion to that function. Build the table-driven test from the defined input record.

13. **Moderate — Untracked evidence handling conflicts with the scope.**
    - Location: `task-description.md:58`, `task-description.md:172` (P7).
    - Finding: The scope says to archive ignored or untracked evidence before removal. P7 instead blocks removal for every untracked non-ignored file. Both behaviors are safe only if the document selects one explicitly.
    - Required change: State whether untracked non-ignored files block removal or enter the archive. Put the selected policy under user approval and add the matching test.

14. **Minor — One git-ignore citation is incorrect.**
    - Location: `task-description.md:29-30`; `.gitignore:132-146,233`.
    - Finding: The cited range does not contain the log pattern. `.gitignore:233` contains `.ptah/specs/**/*.log`, not a general `*.log` pattern.
    - Required change: Correct the line reference and quote the exact pattern.

## Five logic questions

1. **How does this fail silently?** A crash before run creation can lose the trigger (finding 8). Report-only mode can also hide an otherwise eligible result behind `disposal-disabled` (finding 5).
2. **What user action produces unexpected behavior?** Reopening and completing a task again can suppress the second run (finding 3). Selecting `off` prevents an `eligible` result (finding 5).
3. **What input data produces a wrong answer?** Repeated task ids, repeated transitions, several worktrees, and archive timestamp collisions are not handled by the stated keys (findings 3 and 7).
4. **What happens when a dependency fails?** Git unknowns generally fail closed. Harvest failure does not block disposal, and unknown process activity has no defined fail-closed source (findings 1 and 4).
5. **What is missing that the requirements never mentioned?** Atomic use exclusion, archive overwrite protection, trigger recovery, and effective workload limits are missing (findings 1 and 7-9).

## Evidence checked

- The cited status types, writer delegation, RPC handler, watcher event, worktree guards, forced SDK removal, session link, curator queue, indexer gate, harvest guard, and job outcome claims matched the source.
- `MemoryCuratorService.curate` is public at `libs/backend/memory-curator/src/lib/memory-curator.service.ts:472-508`.
- The peer TASK_2026_879_9809 files are explicitly excluded at `task-description.md:75`. No requirement names an edit to those files.
- This was a read-only review. No build, test, Nx, npm, or diagnostics command ran.

## Notes for the user

- This review does not approve any removal. C1 through C4 remain user decisions.
- Decide whether untracked non-ignored evidence blocks disposal or enters the archive.
- Define the regenerable paths in C4 exactly. A broad directory name such as `tmp` can contain user evidence.
- Automatic disposal must remain unreachable until the revised policy receives explicit user approval at Gate 2.

## Round 1 (Revision 2)

### Verdict

REVISE

### Round 0 findings

| # | Status | Evidence or remaining change |
| --- | --- | --- |
| 1 | Resolved | P10 now defines in-process evidence, a lease for reachable `auto`, and fail-closed unknowns. C1 reserves the external-activity choice for the user. |
| 2 | Resolved | The policy now states the exact spec-folder exception for an approved worktree removal. Separate spec deletion and archiving remain excluded. |
| 3 | Resolved | Repository identity and terminal episodes now form the dedupe key. Criteria 1.4 and 1.5 cover repeated transitions and equal task ids. |
| 4 | Resolved | P11 permits only `harvested` or `already-harvested`. Criterion 3.3 covers each blocking harvest result. |
| 5 | Resolved | Report-only mode skips P1 and evaluates P2 through P11. It can record `eligible-report-only`. |
| 6 | Resolved | The document prohibits repository-wide prune. Criterion 4.8 requires target-only removal and protects a second prunable entry. |
| 7 | Resolved | P7 uses a run id and a worktree-specific slug. Exclusive creation and `archive-exists` prevent overwrite. |
| 8 | **Open — Serious** | Criteria 1.8 and 1.9 still lose a run when the process stops after the terminal journal write but before run creation. See finding 8 below. |
| 9 | Resolved | The queue cap, archive caps, and census cooldown now have reason codes and tests. |
| 10 | Resolved | Criterion 3.1 requires a task-filtered harvest entry point. Criterion 3.2 protects unrelated specs. |
| 11 | **Open — Moderate** | The `auto-unavailable` result still has no unambiguous representation in the one-reason step schema. See finding 11 below. |
| 12 | **Open — Moderate** | The pure disposal input record omits the archive cap values or an explicit precomputed cap result. See finding 12 below. |
| 13 | Resolved | D11 and C4 select one policy: untracked non-ignored files block removal and do not enter the archive. |
| 14 | Resolved | The document quotes the exact image, marker, and log patterns. The cited `.gitignore` lines match the source. |

### Unresolved round 0 findings

8. **Serious — A terminal journal entry can suppress recovery of a missing run.**
   - Location: `task-description.md:117-120` (criteria 1.8 to 1.10), `task-description.md:278`.
   - Finding: The journal write and run creation are separate unless the architect adds an unstated transaction. A stop after the terminal journal write leaves no run. Startup reconciliation then sees terminal in both the journal and the carrier, so it creates no run. Criterion 1.10 also excludes an existing terminal journal entry. The new kill test covers only the earlier window before the journal write.
   - Required change: Make the terminal journal write and run creation atomic, or reconcile terminal journal entries that have no run. Add a kill test after the journal write and before run creation.

11. **Moderate — One dispose step cannot represent the required pair of report-only outcomes.**
   - Location: `task-description.md:152`, `task-description.md:205`, `task-description.md:222`.
   - Finding: Criterion 4.2 requires `auto-unavailable` alongside the report-only result. The outcome table repeats that requirement. Criterion 6.1 gives each step one state and one reason code. An eligible worktree therefore needs both `auto-unavailable` and `eligible-report-only`, but the schema has no defined place for both.
   - Required change: Define a second outcome field or a reason-code list, or define one precedence rule. Add tests for eligible and failing worktrees when the setting holds unreachable `auto`.

12. **Moderate — The disposal determinism input does not fully determine the archive-cap result.**
   - Location: `task-description.md:227` (criterion 6.6), `task-description.md:249` (P7).
   - Finding: P7 compares the archive size and file count with configurable caps. Criterion 6.6 includes file sizes and the allow-list, but it includes neither cap value. The generic `archive result` does not state whether it contains a precomputed cap decision.
   - Required change: Add both cap values to the input record, or define `archive result` as including the cap decision. Add two cases that differ only by each cap.

### New findings

15. **Serious — `session-active` has two conflicting owners for later curation.**
   - Location: `task-description.md:129` (criterion 2.2), `task-description.md:184-195`, `task-description.md:223`.
   - Finding: Criterion 2.2 assigns later curation to the session's own session-end trigger. The outcome schema makes `session-active` non-terminal and says the same run resumes it. No criterion defines when that run resumes or how it avoids a second curation request. The run can also remain unfinished after the other trigger completes the work.
   - Required change: Choose a terminal handoff to the session-end trigger, or define the same-run resume event and its ownership. Add a test where the linked session ends after the task run.

16. **Serious — A coalesced index run cannot reliably receive the final census result after restart.**
   - Location: `task-description.md:171`, `task-description.md:175`, `task-description.md:184`, `task-description.md:214`, `task-description.md:223`.
   - Finding: Criterion 5.2 records `coalesced` as terminal `succeeded`. Criterion 5.6 later requires `census-completed` or `census-failed`. After a restart, criterion 6.2 finds no non-terminal index step to resume. No other durable subscription or reconciliation rule updates the completed run when the joined census ends.
   - Required change: Keep a coalesced step non-terminal until the census result arrives, or define durable result reconciliation for completed runs. Add a restart test while the joined census is still running.

17. **Serious — A task can reopen after eligibility evaluation and still lose its worktree.**
   - Location: `task-description.md:111` (criterion 1.2), `task-description.md:158` (criterion 4.5), `task-description.md:244` (P2).
   - Finding: Status reversion cancels a run only during the settle window. The final removal re-check omits P2. A reopen after the settle window or after disposal evaluation can therefore leave the carrier non-terminal while the run removes the worktree.
   - Required change: Cancel on status reversion until disposal finishes, and re-check P2 immediately before removal. Add a reopen test after eligibility evaluation and before removal.

18. **Moderate — The missing-directory rule requires an undefined real-path check.**
   - Location: `task-description.md:161` (criterion 4.8), `task-description.md:247` (P5).
   - Finding: Criterion 4.8 requires P5 when the worktree directory is already gone. P5 requires a symlink-resolved real path, which a missing directory does not have. The acceptance criterion does not define how P5 can hold.
   - Required change: Define parent-based or lexical path resolution for a missing directory. Preserve symlink protection and add a test with a missing directory below an allowed real parent.

### Round 1 evidence

- I checked every response against the requirements, disposal policy, outcome table, and non-functional requirements. The `## Review response` section alone did not count as resolution.
- The `.gitignore` citations at lines 132-136, 145, and 233 match the quoted patterns.
- `spec-harvester.service.ts:104-157` still scans every completed spec under the root. The proposed task-filtered entry point is necessary.
- `worktree-hook-handler.ts:440-505` still force-removes and prunes. Revision 2 correctly prohibits both behaviors in the new hook.
- No requirement adds an edit to the peer TASK_2026_879_9809 files.
- This was a read-only review except for this report. No build, test, Nx, npm, diagnostics, or state-changing git command ran.

### Round 1 notes for the user

- This verdict does not approve or reject a disposal mode. C1 through C4 remain user decisions.
- The recommended C1 answer keeps `auto` unreachable. Revision 2 states that limitation consistently.
- Any reachable `auto` option needs explicit acceptance of its documented external-activity limitation.

## Round 2 (Revision 3)

### Verdict

REVISE

### Round 1 findings

| # | Status | Evidence |
| --- | --- | --- |
| 8 | Resolved | Criterion 1.12 requires one SQLite transaction for the terminal journal entry and its run or `noRunReason`. It also tests rollback and orphan reconciliation. |
| 11 | Resolved | Criterion 4.2 and the closed sets define `requestedMode`, `effectiveMode`, and `modeReason`. Each dispose entry keeps one state and one reason code. |
| 12 | Resolved | Criterion 6.6 adds both archive caps to the pure input record. It requires a contrasting test pair for each cap. |
| 15 | Resolved | Criterion 2.2 makes `session-active` a terminal handoff. The session-end trigger is the sole owner of later curation. |
| 16 | Resolved | Criteria 5.2 and 5.6 to 5.8 give `coalesced` no result promise. Only the requesting step reconciles the census result. |
| 17 | Resolved | Criterion 1.2 cancels on reversion until disposal finishes. Criterion 4.5 re-reads P2 before removal and requires the reopen tests. |
| 18 | Resolved | Criterion 4.10 and P5 define nearest-parent resolution and lexical checks for a missing directory. Three tests cover the rule. |

### New findings

19. **Moderate — A census from another source has no `joinedRunId`.**
   - Location: `task-description.md:173` (criterion 5.2), `task-description.md:190`.
   - Finding: Criterion 5.2 applies when any census is already running. It requires `joinedRunId` to identify the hook run that requested the census. A boot scan, a manual index request, or another non-hook caller has no such run. The required `coalesced` entry cannot satisfy the closed schema for that case.
   - Required change: Define a separate outcome for a census without a requesting hook run, or make the join reference support an external source. Add a test with a non-hook census already running.

20. **Moderate — The final P2 check conflicts with C2 and the `status-reverted` mapping.**
   - Location: `task-description.md:159` (criterion 4.5), `task-description.md:196`, `task-description.md:249`, `task-description.md:315-317`.
   - Finding: The final check requires the carrier to remain `done`. C2 also allows a policy where a `cancelled` task can pass P2. That option can never remove an eligible worktree. Criterion 4.5 also maps every final P2 failure to `status-reverted`, but an unparseable carrier or a change from `done` to `cancelled` did not leave the terminal set as the outcome table requires.
   - Required change: Make the final check use the selected C2 eligibility rule. Reserve `status-reverted` for a transition to non-terminal, and define the blocked or unverifiable outcomes for other P2 failures. Add cancelled-task and unparseable-carrier tests.

21. **Minor — `confirm` mode still names an outcome outside the closed schema.**
   - Location: `task-description.md:153` (criterion 4.2), `task-description.md:192`, `task-description.md:276`, `task-description.md:297`.
   - Finding: Criterion 4.2 and D6 make `confirm` unavailable and apply report-only behavior. The disposal-mode list instead says the hook records `awaiting-confirmation`. That reason is absent from the closed mapping table.
   - Required change: Change the mode description to `effectiveMode: off` with `modeReason: confirm-unavailable`, or label `awaiting-confirmation` explicitly as future behavior outside this task. Add a `confirm`-setting test.

### Round 2 evidence

- I checked all seven fixes in the requirements, outcome schema, disposal policy, non-functional requirements, decisions, and test criteria.
- `indexing-control.service.ts:321-410` returns `Promise<void>` and ignores a second start while active. The document's current-code claim matches the source.
- `memory-trigger.service.ts:519-546` contains the session-end curation path cited by D13.
- No requirement adds an edit to the peer TASK_2026_879_9809 files.
- This was a read-only review except for this report. No build, test, Nx, npm, diagnostics, or state-changing git command ran.

### Round 2 notes for the user

- This verdict does not approve or reject a disposal mode. C1 through C4 remain user decisions.
- The new findings concern internal consistency and checkability. They do not change the recommended report-only choice.
