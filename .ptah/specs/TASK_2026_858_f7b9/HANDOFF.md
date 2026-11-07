# HANDOFF — TASK_2026_858_f7b9 (Ptah remote workers)

Written 2026-11-07 (evening), during Phase F revise round 1. Supersedes every earlier HANDOFF.md.

## Goal

Control Ptah on LAN machines from an Electron "parent" desktop. Workers expose WS `/rpc` on
loopback 41873, reached through `ssh -W`. Libs: worker-protocol, worker-runtime, remote-machines,
machines-ui, worker-host. All user decisions: `decisions.md` rows 12–31 (rows 27–31 are this
phase's fleet decisions). Do not ask again about anything recorded there.

## NEW user request (raised with /session-handoff — discuss first, nothing done yet)

The user wants to discuss (answer before building anything):
- A Windows laptop **abdallah-pc** (more capable than amun-PC) should become the **parent/master**
  instead of amun-PC. Question: how much configuration is needed?
- Machine roles: **horus, anubis** → connected to the review pipelines, they run the review
  workflows; **amun-PC, gatsby** → workers; **chappie** → decision-model router (Ollama `d3:4b`);
  **abdallah-pc** → parent.
Facts relevant to the answer (checked this session):
- Worker install path is Linux deb only (`libs/backend/worker-host/docs/worker.md:5`: AppImage,
  Windows, macOS are not supported worker installs). A Windows *parent* is the controller side
  (remote-machines in Electron main, `ssh -W` transport) — Windows needs an OpenSSH client and
  `~/.ssh/config` aliases (today on amun-PC: gatsby/ptah-w1 .19, horus/ptah-w2 .13,
  anubis/ptah-w3 .14, chappie/ptah-w4 .43); the controller's `~/.ptah/remote-machines.json`
  registry + paired tokens (in secret storage) live on amun-PC and do not move; re-pair from
  abdallah-pc. Phase F code has not been tested on a Windows controller.
- amun-PC as a worker = install the deb + `ptah-worker` unit there (as on the others).
- Decision-model tunnels today: workers 127.0.0.1:11435 → chappie 127.0.0.1:11434
  (`fleet-tunnel.sh`); amun-PC unit `ptah-chappie-ollama.service`. abdallah-pc would need its
  own tunnel (Windows: ssh -L service or similar).
- "Review pipelines" on horus/anubis is not a feature that exists in this task's plan; scope it
  with the user (it may mean CLI review lanes running on those machines via remote sessions).

## Done (branch `feat/remote-workers-phase-f`, worktree below, NOT pushed, no PR yet)

Commits on top of main be25eb1d1 (all scoped verify passed before commit):
- 51e1b822d docs(docs): record fleet setup decisions for remote workers
- 95cd1740a feat(worker-runtime,remote-machines,shared): deny remote prompts at 60 s (Batch 22.5)
- fcdeb4a61 feat(machines-ui): add machines api, feed and signal store (Batch 23)
- c4634be9c feat(machines-ui): add machine list, pairing and readiness views (Batch 24)
- fbbffbbc8 feat(machines-ui): add remote session list, approval and view (Batch 25)
- 8a9aa92e8 fix(setup-wizard): drop lint errors hidden by the lint cache (pre-existing main defects)
- 110b4edff feat(webview,chat,shared,machines-ui): add the Machines surface (Batch 26)
- cefe53acb docs(docs): record fleet setup results and findings
Batch 26 verify: `-p shared,machines-ui,chat,core,onboarding,ptah-extension-webview,ptah-electron,
mcp-bench,ptah-landing-page` → lint/typecheck 18/18, test 16/16.

Fleet (decisions rows 29–31):
- Local deb `dist/release/ptah-desktop_2.0.0_amd64.deb` in the worktree (sha256 c809ca69…be027,
  built from the worktree BEFORE Phase F code) installed on horus, anubis, chappie, gatsby;
  `ptah-worker` user unit enabled, linger on everywhere. `locks --self-test` ok on all.
- O1 config + CLI lanes (claude 2.1.318, codex 0.164.0, grok 1.0.77, agy 1.5.3) on all four.
- Workers: `autopilot.enabled=false` (backup `settings.json.bak-20261107-autopilot`), global
  `authMethod: "claudeCli"` (backup `settings.json.bak-20261107-auth`; the copied value was the
  spec fixture `"some-value"`, also present on amun-PC — amun-PC NOT changed).
- Workspaces: `~/projects` registered on horus, anubis, chappie. Readiness `ready: true` on all three.
- Gatsby: better-sqlite3 rebuilt from source on Gatsby (glibc 2.35; packaged one needs 2.38),
  replaced under /opt/Ptah (backup `~/ptah-sqlite-backup-20261107`; apt reinstall overwrites it);
  g++ installed. Gatsby tunnel 11435 OK. Gatsby was OFFLINE at last check: workspace not registered.
- User: signed in on most machines; Horus sign-in still pending; Anubis `claude auth status`
  showed `loggedIn: false` (readiness passes, but a real session may fail).

## In progress — Phase F revise round 1 of 2 (UNCOMMITTED, state unknown)

Codex reviews (different family from the Claude implementers):
- `phase-f-code-logic-review.md` REVISE 5/10: L1 new-epoch cursor drops events
  (machine-connection.ts:469-473), L2 held permissions bypass 60 s deny (remote-sessions.ts:485-517),
  L3 remote transcript strings bypass S6 (session-event-reducer.ts, remote-transcript.component.ts),
  L4 failed attach rolls back newer cursor (machine-connection.ts:460-480).
- `phase-f-code-style-review.md` REVISE 6/10: S1 permission event under-validated
  (session-event-reducer.ts:400-411), S2 one interval per approval block, S3 oversized
  remote-session-view (761 lines) / machines-view (609 lines) → extract composer.
Two fix subagents (backend: L1, L2, L4; frontend: L3, S1–S3) were STOPPED when the previous
process exited, before writing their reports. Their partial edits are in the working tree (23
modified files + new: `remote-composer/`, `countdown-clock.ts`, `machines-intro.component.ts`,
`machine-banners.ts`). Not verified, not reviewed. The two review .md files are untracked.
Uncommitted doc rows: decisions.md row 31, future-enhancements.md fleet findings.

## Open problems

- Visual review in Electron (dark + light, vs prototype) requires running an Electron
  build/dev target — NOT authorized yet (only `package` was). Ask the user once, or list as
  not run in the PR.
- P1 product defects (future-enhancements.md): deb needs build-host glibc via
  `apps/ptah-electron/scripts/rebuild-native.js`; a spec wrote `authMethod: "some-value"` into the
  real `~/.ptah/settings.json`; worker journal hides readiness details; codex-only workers cannot serve.
- Lane limits: antigravity quota until ~2026-11-13, grok weekly until 2026-11-12 20:04 UTC,
  Ollama/kimi AT LIMIT. codex had room (6%) at 17:08 UTC.

## Key files

- Worktree: `/home/amun/ptah-extension/.claude-worktrees/remote-workers-phase-f` (branch feat/remote-workers-phase-f).
- `.ptah/specs/TASK_2026_858_f7b9/decisions.md` — rows 27–31 fleet decisions.
- `.ptah/specs/TASK_2026_858_f7b9/context.md` — lane limit log and fallback reasons.
- `.ptah/specs/TASK_2026_858_f7b9/phase-f-code-{logic,style}-review.md` — round-1 findings.
- `.ptah/specs/TASK_2026_858_f7b9/batch-22.5-report.md`, `batch-23..26-report.md` — batch reports.
- `/home/amun/.cache/ptah-phase-e-tmp/{fleet-o1-cli.sh,fleet-tunnel.sh,fleet-deb-install.sh,worker-autopilot-off.sh}` — fleet scripts; `*.log` there.
- `libs/backend/worker-host/docs/worker.md` — worker operator guide.

## Background work

None running. Codex review lanes finished (resume IDs: logic `01a1b6fb-c3b1-7ff2-9eb5-d9c5446d845f`,
style `01a1b6fb-d758-7e11-9bf7-93dcbd3cbde6`). Fix subagents a105da068ef5a8156 (backend) and
a6f90a2eb429c9c2c (frontend) were stopped; their work is the uncommitted diff.

## Next steps

1. Discuss the NEW user request above with the user (parent move to abdallah-pc, machine roles).
   Give an honest configuration estimate; do not build it until they agree on scope.
2. Finish revise round 1: review the uncommitted diff against the 7 findings (read both review
   files), complete missing pieces (a frontend-developer and a backend-developer subagent, or
   codex lane for implementation if a different family reviews), then verify:
   `npm run verify -- -p @ptah-extension/remote-machines,@ptah-extension/worker-host,@ptah-extension/worker-runtime`
   `npm run verify -- -p @ptah-extension/machines-ui` (grep "NX\|Failed"). Grep new files for literal bidi characters.
3. Commit (foreground; scopes from `.commitlintrc.json`: remote-machines, worker-host,
   worker-runtime, machines-ui; `docs` for .ptah files). Include decisions row 31 and the review files.
4. Re-review on the codex lanes (resume the session IDs above). Max 2 revise rounds total.
5. Push in the background and open the PR against main (title < 70 chars, `## Summary`,
   `## Test plan` with actual results and the not-run visual review). Watch CI + CodeRabbit. No merge.
6. When Gatsby is online: `/opt/Ptah/resources/bin/ptah-worker workspace add ~/projects`, apply
   `authMethod: "claudeCli"` with backup (see decisions row 31), `systemctl --user restart ptah-worker`,
   check `ptah-worker status --json` readiness.
