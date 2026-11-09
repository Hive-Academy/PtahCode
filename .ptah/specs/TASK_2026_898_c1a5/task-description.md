# Task lifecycle close-out

## Summary

After a new session acknowledges a handoff, close its predecessor and remove the confusing ordinary Done-session entry. Then keep task status aligned with PR review and merge, and provide an explicit background close-out for task cleanup, skill learning, and memory extraction. Phase A precedes Phase B. Type: FEATURE.

## Current state

- `/session-handoff` writes `HANDOFF.md`, starts the successor, and says the predecessor was stopped while its history was kept; it requires the successor to read the file but defines no acknowledgement (`.claude/skills/session-handoff/SKILL.md:34-57,63-84`).
- Successful handoff arms predecessor stop immediately; the caller-turn flush calls `endSession` and forces idle, without successor acknowledgement (`libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts:294-315,568-616`). The UI source-tab closer applies only to configured automatic handoffs (`libs/frontend/chat/src/lib/services/auto-handoff-source-closer.service.ts:90-115,141-172`).
- Previous Sessions renders grouped rows, and labels `done` as “Done” (`libs/frontend/chat/src/lib/components/organisms/previous-sessions/previous-sessions-modal.component.ts:213-227`; `libs/frontend/chat/src/lib/components/organisms/previous-sessions/previous-sessions-modal.component.html:104-162`; `libs/frontend/chat/src/lib/components/atoms/session-organization-chips/session-organization-labels.ts:29`).
- `task.md` supports `in_review`; status changes must edit only its `status:` line (`.claude/skills/orchestration/references/task-tracking.md:65,79-80`). The Git workflow opens a PR but states no linked status update (`CLAUDE.md:65-73`; `.claude/skills/orchestration/references/git-standards.md:35`). `ptah_task_update` exists (`libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.ts:2902`).
- A task-end hook already observes carrier transitions and startup, without writing status (`libs/backend/task-end-hook/src/lib/trigger/task-end-transition-detector.ts:1-28,418-448`). Electron already wires task-specific memory curation and spec harvest (`apps/ptah-electron/src/di/task-end-hook-composition.ts:225-250`). Disposal only evaluates candidates; it deletes nothing (`libs/backend/task-end-hook/src/lib/steps/dispose-evaluate.step.ts:30-36`).
- Skill-trigger service registers a Stop callback that schedules automatic spec harvest (`libs/backend/skill-synthesis/src/lib/triggers/skill-trigger.service.ts:55-72,91-97,143-161`). Task-scoped harvest exists and declines incomplete tasks (`libs/backend/skill-synthesis/src/lib/spec-harvester.service.ts:195-225`). The Git watcher prunes records for already vanished worktrees, not live worktrees (`apps/ptah-electron/src/services/git-watcher.service.ts:984-1044`).

## In scope

### Phase A — handoff close

- Provide a successor acknowledgement action tied to the exact predecessor/successor pair and `HANDOFF.md`. Acknowledgement means the successor read the file and accepted continuation and adopted work; handoff creation alone does not count.
- On acknowledgement, close the predecessor's execution, tab, and ordinary Done-list presence, preserving successor and adopted work. Make failure recoverable and repetition safe.
- Update the handoff instructions and visible session behavior for manual and automatic handoffs.

### Phase B — task lifecycle

- Set the associated carrier to `in_review` once its PR is confirmed open, and keep status aligned with later review/merge outcomes, including restart reconciliation.
- After confirmed review and merge, let the agent invoke a task-specific background close-out. Expose an explicit manual hook point such as “agent cleaned up a task”; close-out is one caller. Report cleanup, learning, and memory outcomes separately and support safe retry.
- Use existing task-end capabilities where applicable. Stop automatic skill-trajectory synthesis/spec harvest on turn completion and boot; invoke learning explicitly from close-out or another manual action. Preserve telemetry used by later learning.
- Evaluate worktree/branch cleanup, performing removal only under the authorization policy below.

## Out of scope

- Reworking general session search/grouping or unrelated Done sessions.
- Changing PR creation, CI, merge authority, or review policy beyond task lifecycle integration.
- New learning or memory algorithms, a new carrier format, or broad workspace cleanup.
- Automatic deletion of unrelated branches, worktrees, transcripts, task folders, or user files.

## Acceptance criteria

### Phase A

1. After successful handoff but before acknowledgement, the successor can identify and read the exact handoff file and retains adopted lanes/children; the predecessor remains identifiable for close-out.
2. The successor can acknowledge the handoff. Mismatched, failed, or nonexistent handoffs cannot close an unrelated session.
3. After acknowledgement, the predecessor has no active execution or open tab and no ordinary Done-session row; the successor and adopted work remain usable. A repeated acknowledgement has the same final result.
4. If acknowledgement or predecessor close fails, the successor receives a clear result and can retry without losing the handoff record or adopted work. The handoff skill documents the step and fallback.

### Phase B

5. A confirmed open PR puts the task carrier at `status: in_review`; a failed PR attempt does not. Restart reconciliation handles an already-open PR without rewriting other carrier fields.
6. Neither a push nor CI completion alone marks the task `done`. Final status follows confirmed review/merge; a PR closed without merge has an explicit outcome.
7. After confirmed review and merge, the agent can start background close-out for the identified task. Results distinguish memory extraction, learning, and cleanup evaluation, including skips/failures. Repeated calls do not duplicate completed learning or delete unrelated work.
8. Turn completion and boot do not start skill-trajectory synthesis or spec harvest. Explicit manual invocation and close-out can start learning for the intended task; incomplete tasks remain ineligible for task-specific harvest.
9. Without authorization or an approved opt-in policy, close-out never removes a live worktree or branch. It records cleanup as pending/blocked while permitted learning and memory work can finish.
10. A manual task-cleanup action exposes the same explicit hook point used by close-out and its result. Failures are reported and retriable.

## Non-functional constraints

- Electron first; keep shared-host and CLI/cli-engine behavior working.
- Preserve session identity and handoff routing across retries/restarts.
- Respect `CLAUDE.md:62-63,97`: merge alone does not authorize worktree or branch removal.
- Keep `task.md` as status source of truth; edit exactly the `status:` line. Make background outcomes observable.

## Risks

- Existing stop-on-flush can race acknowledgement; the predecessor must remain identifiable until acknowledgement resolves.
- Hiding a predecessor row can conceal useful history; retention and ordinary-list visibility are separate decisions.
- The current task-end hook begins at terminal carrier status, while requested close-out follows reviewed merge. Running both paths may duplicate learning or run it too early.
- Worktree deletion can lose uncommitted work. Git watcher's pruning of already vanished entries grants no authority to remove a live worktree.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| One feature in ordered phases. | One task in two phases; separate tasks. | User explicitly says handoff first; `context.md` and `decisions.md` record this split. | Yes. |
| Successor acknowledgement is the handoff completion boundary. | Explicit successor action; automatic acknowledgement on read; immediate close. | User's trigger is acknowledgement; current stop runs on old turn flush. | Yes. |
| Carrier status remains task truth; PR evidence drives its transition. | Carrier update; UI-only derived status. | `task-tracking.md:65,79-80`; existing hook observes rather than writes. | Yes. |
| Extend existing task-end operations through explicit close-out. | Extend existing workflow; parallel workflow. | Electron composition already has curation/harvest and disposal evaluation. | Yes. |
| Gate live worktree/branch removal. | Per-task authorization; opt-in automatic removal. | `CLAUDE.md:62-63,97`. | Yes, before removal. |

## Open questions for the user

1. **May close-out automatically remove a merged task's live worktree and branch?** Options: **(Recommended)** require per-task authorization and leave cleanup pending; allow an explicit opt-in setting with conservative checks; always remove after merge. `CLAUDE.md` currently requires authorization.
2. **Should predecessor history remain accessible after acknowledgement?** Options: **(Recommended)** retain transcript/history in a handoff archive while removing it from ordinary Done sessions; permanently delete it; keep it in Done with a “handed off” label. The current skill promises retained history, while the request asks to eliminate the confusing Done row.
