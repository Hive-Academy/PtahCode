# HANDOFF — TASK_2026_858_f7b9 (Ptah remote workers), Phase F

Written 2026-11-08 (~01:05 local) on amun-PC. Supersedes every earlier HANDOFF.md.

## Goal

Control Ptah on LAN machines from an Electron "parent" desktop (workers expose WS `/rpc` on
loopback 41873, reached through `ssh -W`). Phase F = Machines view, draft **PR #982**
(https://github.com/Hive-Academy/PtahCode/pull/982), branch `feat/remote-workers-phase-f`,
worktree `/home/amun/ptah-extension/.claude-worktrees/remote-workers-phase-f`.
All user decisions: `decisions.md` rows 12–38. Do not ask again about anything recorded there.
amun-PC stays the parent; the abdallah-pc move (issue #988) comes later.

## Done this session (verified, scoped)

| Commit | Subject | Pushed |
| --- | --- | --- |
| `11262af8a` | docs: visual fix re-review and minor visual items | yes |
| `05a89c372` | docs: horus deploy and second visual review pass | yes |
| `99f9901c7` | fix(worker-host): open the main database so remote sessions start | yes |
| `ffbc0b745` | fix(worker-host,worker-runtime): report the main database in readiness | yes |
| `f31e1b9e7` | docs: approved worker database fix re-review | yes (PR head) |
| `42a2bd3f4` | docs: horus database fix deploy and third visual pass | **LOCAL, not pushed** |

- Root cause of "session account could not be verified": the worker booted with `thoth: 'off'`, so
  the main SQLite DB never opened and the chat:start account gate refused (`unavailable-storage`).
  Now `'oneshot'` + a "Main database" readiness check (worker refuses to start if it fails).
  codex REVISE 6/10 → APPROVED 8/10 (`worker-db-fix-review.md`, `worker-db-fix-rereview.md`).
- horus runs the deb built from `ffbc0b745` (sha256 `99f6722a…`), decision 37. Backups: amun-PC
  `/home/amun/.cache/ptah-phase-e-tmp/deb-backup/` (`…phase-e-c809.deb` original,
  `…phase-f-c2b2.deb` previous); horus `/opt/Ptah.bak-20261107-phase-f` (original install) and
  `~/ptah-state-backup-20261107-dbfix` (0700). horus readiness `ready: true`, 9/9.
  anubis, chappie, gatsby still on the original deb.
- Visual review third pass (`visual-review.md` top section, screenshots `visual-review/`, PNGs
  git-ignored): session start, stream render, replay work in dark + light; axe 0 violations;
  readiness shows 9 checks. First turn fails: **Claude CLI login on horus expired (401)**.
  New findings A–F listed there (A readiness "Provider ready" despite invalid login, B stuck
  "Running" + Stop disabled, C 401 shown as plain text, D title mismatch, E light user bubble,
  F driver chip shows host + PID).
- CI on `f31e1b9e7`: 18 pass, 4 skipping, 0 fail. CodeRabbit: no review yet (PR is draft).
- Electron + renderer typecheck pass with the uncommitted changes
  (`npm run verify -- -t typecheck -p ptah-electron,ptah-extension-webview`).

## In progress: finding B fix (decision 38), UNCOMMITTED in the worktree

Root cause: after a turn ends the engine keeps its idle session record and this process's drive
lock; `sessions.list` mapped any holder to `running`. Also `Transcript.attach()` released the
engine's own nonce from a re-entrant acquire. Files (all uncommitted):
- `libs/backend/worker-host/src/lib/commands/remote-sessions.ts` (+spec): `idleEngineSession()` =
  attributable + no turn may run + held drive lock + `session:status` not streaming, phase
  idle/failed, empty `backgroundTasks` and `sessionCrons`.
- `libs/backend/worker-runtime/src/lib/transcript.ts` (+spec): process-wide per-session refresh
  chain, borrowed drive lock, per-acquire `randomUUID` under symbol `REFRESH_TOKEN` as ownership
  proof (fail closed otherwise), `REFRESH_READ_TIMEOUT_MS` 20 s → `TranscriptUnavailableError`.
- `libs/backend/worker-runtime/src/lib/in-process-rpc.ts` (+spec): `session:status` spec.
- `libs/shared/src/lib/types/rpc/rpc-error-codes.types.ts`: new `MACHINE_TRANSCRIPT_UNAVAILABLE`.
- `libs/backend/remote-machines/src/lib/machines-rpc.handlers.ts` (+spec): maps
  `TRANSCRIPT_UNAVAILABLE` to it with fixed text.
- `libs/backend/worker-host/src/lib/commands/serve-sessions.spec.ts`: fake lock like the kernel.
- `decisions.md` row 38, `future-enhancements.md` new sections; review files
  `stuck-session-fix-review.md` (6/10), `-rereview.md` (7/10), `-rereview-2.md` (7/10) untracked.
- Last verify (subagent): `-p worker-host,worker-runtime,remote-machines` exit 0 (67, 164, 86
  tests); `-t lint,typecheck -p shared,machines-ui` exit 0. Degradation audit 216 exit 0.
- Codex reviews so far: REVISE 6 → 7 → 7. The fourth (final) review is running (below). This is
  the last fix round: any remaining non-blocking item → `future-enhancements.md`.

## Background work

- codex lane `4e8cf881-b37e-4811-916f-79a7abb8ae3b` (CLI session `01a1b83d-3a05-7163-a9ca-e4a6825b9d3d`):
  final review of the uncommitted finding-B fix → deliverable
  `.ptah/specs/TASK_2026_858_f7b9/stuck-session-fix-rereview-3.md`. State: running.
- No subagents or child sessions running.

## Open problems / waiting on the user

- **User action**: renew the Claude CLI login on horus (decision 38; never copy credentials).
  Until then approval / watch-only / real stream cannot be captured.
- One idle stuck session from the visual review still sits on horus (harmless).
- Known load flake: `session-log-writer.spec` 5 s timeout and `serve.spec` SIGTERM/SIGINT 60 s
  timeout under heavy load (deb build); pass on rerun. Mention in the PR test plan.

## Next steps

1. Read `stuck-session-fix-rereview-3.md`. If APPROVED (or only follow-ups): move follow-ups to
   `future-enhancements.md`; else fix only real BLOCKING items (small), re-verify.
2. Inspect `git diff`, then commit by explicit paths (commitlint: read `.commitlintrc.json`,
   subject ≤72, body ≤100; e.g. `fix(worker-host,worker-runtime,remote-machines): list an idle
   session as idle after its turn ends`), plus a `docs(docs):` commit for the review files and
   decision 38. Verify before commit if anything changed:
   `TMPDIR=/home/amun/.cache/ptah-phase-e-tmp npm run verify -- -p @ptah-extension/worker-host,@ptah-extension/worker-runtime,@ptah-extension/remote-machines`
   and `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`.
3. Push in the background (`git push`; pre-push hook takes the verify lock).
4. Rebuild the worker deb under the lock (≈25–30 min):
   `TMPDIR=/home/amun/.cache/ptah-phase-e-tmp node scripts/verify.mjs --exec --task phase-f-worker-deb -- bash /home/amun/.cache/ptah-phase-e-tmp/vr/build-worker-deb.sh`
   First copy the current deb to `deb-backup/…phase-f-99f6.deb`. Deploy to horus only (decisions
   35/37 pattern): backup `~/.ptah/state` on horus, scp, check sha, `sudo apt-get install -y
   --reinstall ./ptah-desktop_2.0.0_amd64.deb` (passwordless sudo works), `systemctl --user
   restart ptah-worker`, `ptah-worker status --json | grep -o '"ready":[a-z]*'`. Record a
   decisions.md row.
5. When the user confirms the horus login: re-run the visual-reviewer (Electron dev run from the
   worktree `NODE_ENV=development node_modules/.bin/electron dist/apps/ptah-electron/main.mjs
   --remote-debugging-port=9333`; dist is built by the deb script) for stream, approval (DENY,
   /tmp only), watch-only, list after a failed turn (finding B) in dark + light; update
   `visual-review.md`; show screenshots to the user.
6. Rewrite the PR #982 body (current one is stale: says REVISE 7/10 and "visual review not run").
   Include Summary of all fixes (rounds 1–3, tabId, main database, idle session), actual verify
   results, flake note, visual states covered / not covered (and why). No IPs/tokens/hostnames
   beyond horus/anubis. Then `gh pr ready 982`.
7. Watch CI (`gh pr checks 982 --json name,bucket --jq ...`; jq not installed) and CodeRabbit
   in a background loop; address findings. No merge, force-push or worktree removal.

## Rules

Scoped verify only (`TMPDIR=/home/amun/.cache/ptah-phase-e-tmp npm run verify -- -p ...`, long
timeout); heavy commands under `node scripts/verify.mjs --exec --task <name> -- ...`; degradation
audit must exit 0; commit in the foreground, push in the background; never copy credentials to
workers; back up before replacing on a machine; public repo — no IPs/tokens in issues/PR text;
no merge, force-push or worktree removal (keep the Phase E worktree too).
