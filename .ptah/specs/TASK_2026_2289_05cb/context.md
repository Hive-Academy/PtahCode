# TASK_2026_2289_05cb — context

Follow-up of TASK_2026_2288_5a47 (fix A, commit 7b196a56f, base of this branch).
Evidence: `investigation-report.md` of that task.

## Scope

- B: do not show the SDK synthetic "No response requested." as a model reply.
- C: one automatic retry of a handoff successor after a watchdog stop.
- D: log and label "Interrupt & send" (`send-now` stop cause).
- E: label budget-monitor stops.
- Attach: `ptah_session_start { attachToSessionId }` refused a valid finished worktree.

B-E come from an uncommitted draft in the old worktree (patch applied here, old
worktree untouched).

## Attach root cause

`SessionChildRegistry.findAttachTarget` required `record.taskId === request.taskId`.
The record taskId comes only from the start request. A child usually creates its
task folder (`ptah_task_create`) after the parent started it, so the record has no
taskId and no later attach can match. The single generic refusal text hid which
check failed. Fix: admit a record with no taskId when the task folder exists in the
worktree (new child records the id); a different taskId is still refused; the
refusal names the failed check.
Same-safety note: attach still needs the same parent, branch and canonical worktree.
The existing design already allows two sessions in one worktree (live attach test);
this change does not weaken or add to that.

## Delivery

One PR, one commit per fix.

## Scope change (2026-11-21)

Fixes B-E ship in PR #1446 (branch fix/handoff-successor-early-stop, other session). This
branch merged that branch and carries only the attach fix. This PR is stacked on #1446.

## Review (Codex, one round)

Findings applied: live-session check plus a per-worktree claim for the no-task-id fallback
(two concurrent attaches admit one); registry recheck after the file wait; the task folder must
resolve inside the worktree (realpath containment); clearer refusal text; stricter tests.
Not changed (known limits): the task id is not bound to an event of the child (the folder
proof is evidence, the parent is already the owner); the checkout is identified by path, as
the recorded-id path was before; the claim is released when `start` returns, so a
memory-queued admission can leave a short gap.

## Verification

- `--related`, `-t lint,typecheck`: pass for @ptah-extension/cli-agent-runtime.
- Full gate: 4424 passed, 1 failed: `agent-process-manager.account-binding.spec.ts`
  "stays ambient when the stored lane selection is the default route". Not related: the
  fixture ROOT `D:/lane-account-fixture` is a relative path on Linux, so it resolves under the
  linked worktree's `.git` file and `worktreeMainRoot` reads a second time. It fails in any
  linked worktree; CI runs in a normal checkout.
