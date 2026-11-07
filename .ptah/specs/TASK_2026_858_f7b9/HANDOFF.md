# HANDOFF — TASK_2026_858_f7b9 (Ptah remote workers), Phase F

Written 2026-11-07 (~22:20 local) on amun-PC. Supersedes every earlier HANDOFF.md.

## Goal

Control Ptah on LAN machines from an Electron "parent" desktop (workers expose WS `/rpc` on
loopback 41873, reached through `ssh -W`). Phase F = Machines view, draft **PR #982**
(https://github.com/Hive-Academy/PtahCode/pull/982), branch `feat/remote-workers-phase-f`,
worktree `/home/amun/ptah-extension/.claude-worktrees/remote-workers-phase-f`.
All user decisions: `decisions.md` rows 12–35. Do not ask again about anything recorded there.
amun-PC stays the parent; the abdallah-pc move (issue #988) comes later.

## Done this session (all verified, scoped)

| Commit | Subject | Review |
| --- | --- | --- |
| `60e57ea8a` | fix(machines-ui): check every stream event field, extract session pane | codex REVISE 5/10 |
| `73dca4808` | fix(machines-ui): validate the sanitized event, guard late answers | codex REVISE 6/10 |
| `3aa1996e9` | fix(machines-ui): reject colliding event keys, hide raw answer errors | codex **APPROVED 8/10** |
| `674e7053f` | docs: approved fix round 3 re-review | — |
| `14f991a8a` | fix(worker-host): start remote sessions on a plain UUID tab id | codex REVISE 6/10 |
| `ccd125a94` | fix(machines-ui): outline the selected machine row | (same review) |
| `cd3688599` | docs: phase f electron visual review | — |
| `0604520e8` | fix(machines-ui,worker-host): raise selected row contrast, pin continue | codex **APPROVED 8/10** |
| `11262af8a` | docs: visual fix re-review and minor visual items | **LOCAL ONLY, not pushed** |

- Fix round 3 (decision 34): `parseFlatStreamEvent` now rejects colliding keys
  (`hasCollidingKeys`, `utils/display-text.ts`), sanitizes, then validates per variant via a typed
  table (`services/transcript-event-validators.ts`). `tool_result.output` absent is accepted on
  purpose (type `unknown`, JSON drops undefined; codex accepted). Pane extracted to
  `components/remote-session-view/remote-session-pane.component.ts` (per-session token guards late
  answers; rejected answer shows a fixed sentence).
- Verify: `npm run verify -- -p @ptah-extension/worker-host,@ptah-extension/machines-ui` →
  machines-ui 24 suites / 439 tests, worker-host 7 suites / 55 tests, lint + typecheck pass;
  degradation audit `TOTAL 216` exit 0; no bidi chars. One combined run once showed 2 failing
  worker-host tests that passed on the separate rerun (55/55); output not kept — likely load flake,
  mention in the PR test plan.
- CI on PR head `0604520e8`: 18 pass, 4 skipping, 0 failed (checked at handoff). CodeRabbit not
  checked yet on this head.
- Electron visual review (`visual-review.md`, screenshots in `visual-review/`, PNGs are git-ignored):
  PASS WITH NOTES. Blocking finding = every remote `session.start` failed ("The machine is
  unreachable.") because the worker sent `tabId: worker-<uuid>`, and `chat:start` requires a UUID v4
  (worker journal on anubis: "tabId must be a UUID v4"). Fixed in `14f991a8a`. Light-theme
  selected row fixed. axe 0 violations, contrast ok, focus ok, narrow ok. Minor items moved to
  `future-enhancements.md` ("Phase F Electron visual review" section).
- Not captured (blocked by the tabId bug on the old worker deb): stream, approval, replay/reconnect,
  watch-only, nofolders.
- Ptah Dev profile (`~/.config/Ptah Dev`) has horus and anubis paired.

## Decision 35 (user): build worker deb, deploy to horus only, capture session states

- **New deb built** from head `0604520e8`: `dist/release/ptah-desktop_2.0.0_amd64.deb` in the worktree,
  sha256 `c2b253889cf0f4f1bd4d431d93c31d616eb67d1b8dd946c480196e390b78c98e`, all packed
  verifications passed (log `/home/amun/.cache/ptah-phase-e-tmp/phase-f-deb.log`, build script
  `/home/amun/.cache/ptah-phase-e-tmp/vr/build-worker-deb.sh`).
- **Old deb backup** (currently installed on all 4 workers, sha `c809ca69…`):
  `/home/amun/.cache/ptah-phase-e-tmp/deb-backup/ptah-desktop_2.0.0_amd64.phase-e-c809.deb`.
- NOT yet deployed. anubis, chappie, gatsby stay on the old deb.

## Background work

None. No lanes, subagents or child sessions running. Verify lock empty.

## Next steps

1. Push `11262af8a` in the background (`git push` from the worktree).
2. Deploy to horus (decision 35): back up first on horus, e.g.
   `ssh horus 'sudo cp -a /opt/Ptah /opt/Ptah.bak-20261107-phase-f'` (or tar to `~`, mode 0700),
   then `scp` the new deb, `sudo apt install ./ptah-desktop_2.0.0_amd64.deb` (needs sudo — if it
   prompts for a password, ask the user), restart `systemctl --user restart ptah-worker`, check
   `ssh horus /opt/Ptah/resources/bin/ptah-worker status --json` → `ready: true`. horus is
   glibc ≥ 2.38 (only gatsby needed the source-built sqlite). Rollback = install the backup deb.
   Record the result as a decisions.md row.
3. Re-run the Electron visual review for the session half (visual-reviewer subagent; brief in
   this file's predecessor flow): launch dev build
   `NODE_ENV=development node_modules/.bin/electron dist/apps/ptah-electron/main.mjs --remote-debugging-port=9333`
   from the worktree (rebuild first under the lock if the source changed:
   `TMPDIR=/home/amun/.cache/ptah-phase-e-tmp node scripts/verify.mjs --exec --task phase-f-electron-build-dev -- bash -c 'npx nx build-dev ptah-electron && npx nx copy-renderer-dev ptah-electron'`).
   Capture stream, approval, replay/reconnect, watch-only (and selected-row light recapture) on horus,
   dark + light vs `prototype/`. Update `visual-review.md`; show screenshots to the user. No IPs,
   tokens or pairing codes in text.
4. Update the PR #982 body test plan (actual results above, the flake note, what visual states were
   covered), push, then `gh pr ready 982`. Watch CI with `gh pr checks 982 --json name,bucket --jq ...`
   (jq is NOT installed) in a background loop, and CodeRabbit comments. Address findings. No merge.
5. Later (user's call): abdallah-pc parent per issue #988; amun-PC as a worker; deploy the new deb
   to the other workers.

## Rules

Scoped verify only (`TMPDIR=/home/amun/.cache/ptah-phase-e-tmp npm run verify -- -p ...`, long
timeout); heavy commands under `node scripts/verify.mjs --exec --task <name> -- ...`; degradation
audit `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`; commit in the
foreground, push in the background; `.commitlintrc.json` (subject ≤72, body ≤100); never copy
credentials to workers; back up before replacing on a machine; public repo — no IPs/tokens in
issues/PR text; no merge, force-push or worktree removal (keep the Phase E worktree too).
