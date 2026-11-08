# HANDOFF — TASK_2026_858_f7b9 (Ptah remote workers), Phase F

Written 2026-11-08 (~06:30 local) on amun-PC. Supersedes every earlier HANDOFF.md.

## Goal

Control Ptah on LAN machines from an Electron "parent" desktop (workers expose WS `/rpc` on
loopback 41873, reached through `ssh -W`). Phase F = Machines view, **PR #982**
(https://github.com/Hive-Academy/PtahCode/pull/982), branch `feat/remote-workers-phase-f`,
worktree `/home/amun/ptah-extension/.claude-worktrees/remote-workers-phase-f`.
PR #982 is **ready for review** (no longer draft). Phase F is the last phase of this task.
All user decisions: `decisions.md` rows 12–41. Do not ask again about anything recorded there.
amun-PC stays the parent; the abdallah-pc move (issue #988) comes later.

## Done this session (all verified, scoped)

| Commit | Subject |
| --- | --- |
| `c5cfd277f` | fix(worker-host,worker-runtime,remote-machines): list idle sessions as idle (finding B; codex 6→7→7→8→APPROVED 9/10) |
| `022f77005` | Merge origin/main (conflict `rpc-error-codes.types.ts`: codes are now the `RPC_USER_ERROR_CODES` array) |
| `a027acb99` | fix(worker-host,worker-runtime): end a denied turn and name new sessions (findings K, D) |
| `fb9216a94` | fix(machines-ui): mark a denied tool failed and number ordered lists (findings H, G; codex REVISE 7 → APPROVED 9/10) |
| `7f8012fc7` | Merge origin/main (conflict `pending-permissions.ts`+spec: `handleResponse` now returns boolean) |
| `f227b4c45` | fix(remote-machines): stop a failed replay from forcing more replays (CodeRabbit) |
| `d16efc4c5` | fix(machines-ui): match marked fences in remote markdown, keep forms (CodeRabbit; codex APPROVED 8/10) |
| `95c32c582` | docs: CodeRabbit round 1 and review |
| docs commits | decisions 38–41, visual passes 4–5, reviews, follow-ups |

- horus runs the deb built from `dfae60162` (sha256 `e70834ae…`), decision 41, `ready: true` 8/8.
  Backups: amun-PC `/home/amun/.cache/ptah-phase-e-tmp/deb-backup/` (`…phase-e-c809.deb` original
  that anubis/chappie/gatsby run, `…phase-f-99f6.deb`, `…phase-f-dde1.deb`); horus
  `/opt/Ptah.bak-20261107-phase-f`, `~/ptah-state-backup-2026110{7-dbfix,8-idlefix,8-v4fix}`,
  `~/claude-cli-backup-20261108` (Claude CLI 2.1.318 before the update to 2.1.319).
- The CodeRabbit fixes (`f227b4c45`, `d16efc4c5`) are parent-side only (remote-machines runs in
  the Electron main process, machines-ui in the renderer): no worker redeploy needed.
- Claude login on horus renewed by the user and verified (`claude -p` answers "ok").
- Visual review fifth pass PASS (`visual-review.md` top): K, H, G, D fixed in dark + light. K/H
  seen on the 60 s auto-deny path (manual Deny click not captured). Not reachable: watch-only,
  reconnecting, no-folder (reasons in the PR test plan).
- PR body rewritten (Summary + Test plan with actual results). CI on `7f8012fc7`: 18 pass,
  4 skipping, 0 fail. CodeRabbit round 1: 6 findings, all fixed, replies posted on each thread.
- Disk cleanup (user-authorized): amun-PC deleted Docker Desktop `Docker.raw` (34 GB, user chose)
  and main checkout `dist/release/linux-unpacked`; Docker build cache pruned on anubis + horus;
  apt cache on gatsby. amun-PC ~39 GB free; gatsby 12 GB free (Timeshift kept, user's choice).

## In progress / background

- Pushed `95c32c582`; replies posted on all 6 CodeRabbit threads. This HANDOFF commit was pushed
  last. Check: `git status -sb` (no ahead count) and
  `gh api repos/Hive-Academy/PtahCode/pulls/982/comments --jq '[.[]|select(.in_reply_to_id)]|length'`.
- No subagents, CLI lanes or child sessions running. Electron instances are closed.

## Next steps

1. Confirm the push and replies landed. Watch CI on the new head and CodeRabbit's re-review:
   `gh pr checks 982 --json name,bucket --jq 'group_by(.bucket)|map("\(.[0].bucket): \(length)")|.[]'`
   (jq is not installed; use `--jq`). If the PR shows CONFLICTING again (`gh pr view 982 --json
   mergeable`), merge `origin/main` (no rebase, no force push), resolve, scoped verify, commit, push.
2. Read new CodeRabbit comments (`gh api repos/Hive-Academy/PtahCode/pulls/982/comments`; the
   finding text is after the last `\n---\n` in each body; strip the `<details>` analysis blocks).
   Fix confirmed task defects (backend-developer / frontend-developer subagents on disjoint libs,
   then a codex review lane), verify, commit, push, reply on each thread. Explain disputed ones.
3. Repeat until CI is green and no actionable review remains. Report PR URL, head, CI, review state.
4. Do not merge, force-push, delete branches or remove worktrees (keep the Phase E worktree too).
   Cleanup of worktrees/branches only after the user authorizes it post-merge.
5. Later (not this PR): user asked about "reviewer machines" (CLI review lanes on workers). It is
   out of scope of this task (task-description "Remote CLI lanes"; decision 10 U1 option 1).
   Offer a follow-up task via `ptah_task_create` after PR #982 merges.

## Rules

Scoped verify only (`TMPDIR=/home/amun/.cache/ptah-phase-e-tmp npm run verify -- -p ...`, long
timeout); heavy commands under `node scripts/verify.mjs --exec --task <name> -- ...`; degradation
audit `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` must exit 0
(baseline 216); commit in the foreground, push in the background; read `.commitlintrc.json`
(subject ≤72, body ≤100); never copy credentials to workers; back up before replacing on a
machine; public repo — no IPs/tokens/host names beyond horus/anubis in issues/PR text; no merge,
force-push or worktree removal.
