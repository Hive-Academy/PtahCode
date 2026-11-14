# TASK_2026_1168_7335 — agent permissions program (context)

Brief: `D:/projects/nx-video/.ptah/specs/TASK_2026_015_1698/PTAH_PERMISSIONS_FIX_PROMPT.md`
(read only; never edit nx-video).

Scope: permission persistence (settings revert to Plan), requested vs effective lane
permissions, caller attribution (`unattributed-caller`), Codex lane MCP handshake, lane reports
reaching the parent, approval routing, explicit Plan blocked state, native Codex subagent
visibility, completion-notice dedup. Regression tests plus real Electron UI evidence.

> This file was rebuilt on 2026-11-14. The first program worktree
> (`.claude-worktrees/agent-permissions-program`, branch `fix/agent-permissions-program`) and its
> uncommitted `context.md` were removed by an unknown actor between 14:45Z and 14:50Z. The
> decisions below come from the predecessor HANDOFF.md. The full text of D1-D24 is lost.

## Program table

| Phase | Task ID | Pull request | State |
| --- | --- | --- | --- |
| A permissions | TASK_2026_1172_fd37 | https://github.com/Hive-Academy/PtahCode/pull/1266 | ready, in_review; head a37e74065 (persisted policy, fail-closed restore); re-review approved; evidence items 2-4 passed (.ptah/tmp/electron-evidence in worktree fix-lane-permission-routing-v5); CI pending; coordinator e48a105f |
| B attribution | TASK_2026_1171_7664 | https://github.com/Hive-Academy/PtahCode/pull/1265 | ready; head 9aa561471 (rail-link rework, gate passed, review High fixed); evidence (a) passed (caller-item-a-child.png); CI pending; coordinator: old session ee2801 (e919afa2 stopped by user) |
| C native subagents | TASK_2026_1173_c17f | https://github.com/Hive-Academy/PtahCode/pull/1263 | ready, in_review; head de562341c; CI green except the main axe failure (shard 2: 1 failed, 54 passed); 0 threads without reply; needs one approving review; child 1b50b412 done |
| Side: axe contrast on main | TASK_2026_1178_9339 | https://github.com/Hive-Academy/PtahCode/pull/1273 | ready; all picker themes fixed; CI pending on head 4cd5de7de (first commit green) |

## Decisions (recovered summary)

- D5: user chose "Remove merged worktrees" (done).
- D7: user chose "Keep full access" for an explicit yolo Codex lane.
- D10: user chose "Resume both" A and B after the stop button.
- D11 / D24: no-row lane built-in yolo default is pre-existing on main. Kept. Follow-up.
- D12: after a child handoff times out, never start a replacement. Check `ptah_session_status`.
- D13: `ptah_session_stop` marked a session stopped, but it kept running. Needs its own task.
- D25 (new): Phase A option A. Fix `agent-process-manager.service.ts:989` so requested equals
  effective for Claude and Codex lanes on spawn and resume, plus a manager spec. Rerun items 2-4.
- D26 (new): Phase B option A. Fix the Codex child rail link (session-spawner
  `recordOrganization` / `sdkIdOf`) in #1265. Rerun item (a).
- D27 (new): Phase C. Address the 9 unresolved threads on #1263. The native-child approval after
  the root turn (D17) stays deferred if it needs child-owned approval lifetime.
- D28 (new): handoff ack to parent 3540da80 was refused ("handoff record missing"). The user
  stopped the old children (9571d963, f739c75a, 2634cddc). New children started from the old
  branch heads; they push fast-forward to the existing PR branches.

- D29 (new): the user stopped e919afa2 at 15:04Z and asked the old Phase B session (ee2801,
  worktree `fix-caller-attribution-reports-v2-e06f9653385a`) to coordinate. It is the Phase B
  coordinator again. e919afa2 had already pushed 5d3be6ea9, so the old session fast-forwards and
  reworks the sdkIdOf change.
- D30 (new): #1265 and #1266 conflicted with main (no CI ran). The user authorized a merge
  commit of origin/main into both PR branches (no rebase, no force push).

## Open problems

1. Pre-existing CI failure on main: `conflict-and-history-axe.spec.ts:55` contrast 3.87:1.
   Side task fixed it in PR #1273 (branch `fix/conflict-history-axe-contrast`; CI green on
   22a5d7bde, including electron-e2e shard 2). Needs review and merge.
2. D13 stop-but-alive session defect.
3. First chat session after Electron start can show "MCP 0".
4. Child `ptah_session_handoff` times out, or is refused after max successions.
5. Child reports fail with `parent-session-not-active` after the parent hands off.
6. Program worktree and branch removed without a record (see the note above).
7. `message-router.service.spec.ts` timing flake (`DRAIN_BUDGET_MS`, `performance.now`).
8. `subagent-budget-monitor.spec.ts:3087` fails under load in local gates (A and C); passes
   alone and in CI.
9. After a handoff, the host routes messages for the old session ID to the successor. A
   "stay idle" message for the old Phase C session stopped the successor's PR watcher.
10. Follow-up: remove the `getAttempt` cast in `agent-process-manager.service.ts` timeoutDetail
    (listed in the #1265 body).
