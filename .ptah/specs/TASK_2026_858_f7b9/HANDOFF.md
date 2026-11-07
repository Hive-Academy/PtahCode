# HANDOFF — TASK_2026_858_f7b9 (Ptah remote workers)

Written 2026-11-07, after Phase E merged and during fleet setup before Phase F. Supersedes every
earlier HANDOFF.md.

## Goal

Control Ptah on the LAN machines from the Electron desktop (amun-PC). Workers expose WS `/rpc` on
loopback 41873, reached through `ssh -W`. Libs: worker-protocol, worker-runtime, remote-machines,
machines-ui, worker-host. User decisions: `decisions.md` rows 12–28.

User decisions in this session (rows 27–28, UNCOMMITTED in this worktree's decisions.md):
- Consent to fleet ops O1–O4. Gatsby becomes the 4th worker (with Horus, Anubis, Chappie).
- Remote permission requests: deny after 60 s (supersedes plan 6.3 `timeoutAt: 0` for remote
  sessions; implement worker-side in Phase F).
- G-M: later, before G-R.
- Build: local deb from main (package target authorized by the user). Nothing published.
- CLIs: install the current CLI lanes on every worker (claude 2.1.318, codex 0.164.0,
  grok 1.0.77, agy 1.5.2). The user logs in later.
- O1: copy all of ~/.ptah and ~/.claude except credentials and /home/amun-bound data.
  Never copy .credentials.json, secrets.json/enc, provider-accounts, gateway-vault.salt,
  session-driver keys, .claude.json backups. Back up before replacing.
- Decision model on workers: SSH tunnel to Chappie Ollama (worker 127.0.0.1:11435 →
  chappie 127.0.0.1:11434). On Chappie itself, settings point at 127.0.0.1:11434.
- Phase E worktree cleanup: NOT answered — keep `.claude-worktrees/remote-workers-phase-e` and
  branch `feat/remote-workers-phase-e`. Do not merge, force-push or remove worktrees.

## Done

- Phase E: PR #962 merged as be25eb1d1 on main.
- Phase F worktree: `/home/amun/ptah-extension/.claude-worktrees/remote-workers-phase-f`, branch
  `feat/remote-workers-phase-f` from be25eb1d1, `node_modules` symlinked to the main checkout.
- O2 done: Ollama on Horus, Anubis, Chappie bound to 127.0.0.1:11434 (backups
  `override.conf.bak-20261106-o2`). Chappie has KEEP_ALIVE=-1 and model `d3:4b` (decision-only
  capability; /api/generate 400 is expected).
- Tunnels (fleet-tunnel.sh): Horus OK, Anubis OK (linger=yes, unit active, tunnel answers
  0.40.13). amun-PC unit `ptah-chappie-ollama.service` active.

## In progress / incomplete (checked 2026-11-07)

Both background tasks of the previous session were STOPPED before finishing:
- Deb build (`node scripts/verify.mjs --exec --task package-deb -- npx nx run ptah-electron:package`
  in the Phase F worktree): log `/home/amun/.cache/ptah-phase-e-tmp/package-deb.log` ends at
  `[copy-renderer] Done`. `dist/release/` exists but NO `.deb` was found. Rerun it.
- O1/CLI copy (`fleet-o1-cli.sh` on all 4 hosts), logs `/home/amun/.cache/ptah-phase-e-tmp/o1-<host>.log`:
  - horus, anubis, chappie: backups, O1 copy, path fix done (Chappie decision model URL set);
    stopped at the "CLI lanes" step. Rerun the script (idempotent: rsync + `ln -sfn`, backups only
    once).
  - gatsby: backups done, stopped during "O1 copy". Rerun.
- Gatsby tunnel: unit active but curl 127.0.0.1:11435 refused; a diagnostic SSH to Gatsby then timed
  out (probably Wi-Fi saturated by the rsync). Not resolved.

## Open problems

- Gatsby: Mint 21.3, glibc 2.35 (amun-PC builds with 2.39) — test native modules
  (better-sqlite3) after install. Only 6.5 GB free disk; check before the CLI copy (~1 GB).
- Horus has a broken claude link to /home/khufu/... (fixed by the CLI step's `ln -sfn`).
- Non-login SSH shells lack ~/.local/bin in PATH; use `bash -lc` for version checks.
- No release has worker mode (latest v0.1.70); rollback = older GitHub release debs.

## Key files

- `/home/amun/.cache/ptah-phase-e-tmp/fleet-o1-cli.sh` — O1 config copy + CLI lane install, per host.
- `/home/amun/.cache/ptah-phase-e-tmp/fleet-tunnel.sh` — decision-model tunnel per host.
- `/home/amun/.cache/ptah-phase-e-tmp/*.log` — logs of the above and of the deb build.
- `.ptah/specs/TASK_2026_858_f7b9/decisions.md` (this worktree) — rows 27–28 uncommitted.
- `.ptah/specs/TASK_2026_858_f7b9/batches.md` — Phase F = Batches 23–26 (Machines view).
- `.ptah/specs/TASK_2026_858_f7b9/future-enhancements.md` — Phase E follow-ups owned by Phase F.

## Background work

None running. (bp0roj2j0 deb build and bftchlw3g O1/CLI copy were stopped; see above.)

## Next steps

1. Commit decisions.md rows 27–28 in the Phase F worktree (read `.commitlintrc.json` first;
   e.g. `docs(...)` with an allowed scope).
2. Rerun the deb build in the background:
   `cd /home/amun/ptah-extension/.claude-worktrees/remote-workers-phase-f && node scripts/verify.mjs --exec --task package-deb -- npx nx run ptah-electron:package > /home/amun/.cache/ptah-phase-e-tmp/package-deb.log 2>&1`
   then `find dist -name '*.deb'`.
3. Rerun `bash /home/amun/.cache/ptah-phase-e-tmp/fleet-o1-cli.sh <host>` for horus, anubis,
   chappie (parallel OK), and gatsby alone afterwards (Wi-Fi). Check versions + disk lines.
4. Diagnose Gatsby tunnel: `journalctl --user -u ptah-chappie-ollama -n 20`, `ss -ltn | grep 11435`,
   `ssh -v ptah-chappie-tunnel true` on Gatsby; fix; confirm `curl 127.0.0.1:11435/api/version`.
5. Install the deb on all 4 workers: confirm Ptah is not running, `sudo apt install ./ptah*.deb`,
   install + enable the ptah-worker systemd user unit (enable linger on Chappie too), then
   `/opt/Ptah/resources/bin/ptah-worker status --json` and `locks --self-test`; test better-sqlite3
   on Gatsby.
6. Tell the user to log in to claude/codex/grok/agy on each worker.
7. Phase F (Batches 23–26) from batches.md, plus worker-side deny-after-60 s and the
   future-enhancements follow-ups (machines:state reason field, rebind flow, payload sanitizing).
   Verify with `npm run verify -- -p <projects>` (grep "Failed tasks"); Electron checks with
   `TMPDIR=/home/amun/.cache/ptah-phase-e-tmp`. Different-model-family review, max 2 revise rounds,
   PR with ## Summary / ## Test plan, watch CI + CodeRabbit, do not merge.
