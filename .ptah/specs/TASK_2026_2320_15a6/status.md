# Status — TASK_2026_2320_15a6 (nav benchmark rerun)

- 2026-11-23 18:21Z — Build done at cd25c1cac (main with PR #1487 and #1491).
  `electron:build` under the verify lock, then `copy-renderer.js`. The first build failed because
  the worktree had no `node_modules`; fixed with the usual symlink to the main checkout.
  Harness copied to `.ptah/tmp/bench/` (paths fixed to 4 levels up).
  Two task keys are stale on current main (code moved); the harness adapts them (see report).
- 18:22Z — Isolated instance up: driver PID 1479103, app PID 1479118, MCP port 51821. User files
  unchanged (`hashes-r7-before` vs `-after-launch`).
- 18:40Z — Smoke OK: native-haiku, native-codex, ptah-haiku, code-mode. Harness fix: fresh
  instance had autopilot `ask`; set `yolo` in the isolated instance. Native arms running; Ptah
  arms wait for the cold code index (about 3 files/s).
- 18:45Z — Harness fix 2: the test workspace sat in a path that the worktree `.gitignore` ignores,
  so `rg` and `git grep` (the `ptah_grep` engine) found 0 files. Made the workspace its own git
  repo (one snapshot commit). native-haiku 8/8 done (unaffected). native-codex rerun on the fixed
  workspace: 6/8. The 4 rows from the broken layout are in `stage2-r7-invalid-layout.jsonl`.
- 19:48Z — Successor coordinator. Instance restarted with the same drive.mjs: driver PID 1512078,
  app PID 1512091 (`pids-r7b.txt`). User files unchanged (`hashes-r7b-after-launch`), user app
  1387772 alive. Autopilot set to `yolo` again. Warm index run started at restart.
- 19:49Z — Warm-restart index: ready 22.8 s after launch (run 17.5 s, 4,745 of 4,775 files
  skipped unchanged). PR #1491 reuse works on a real restart.
- 19:58Z — ptah-codex tasks 4-8 done on the restarted instance: 4/5 (concept-clamp-read-tail
  wrong: invented name). Arm total 7/8. Code-mode retry of files-session-handoff: correct.
- 20:00Z — Instance stopped by POST /stop. Recorded PIDs 1512078 and 1512091 gone, ports free.
  User files unchanged (`hashes-r7-final`), user app alive. `benchmark-report.md` written.
- 20:05Z — Commit 5e361761f pushed; PR #1493 open against main
  (https://github.com/Hive-Academy/PtahCode/pull/1493). task.md set to `in_review`. CI and review
  watch started. Not merged.
- 20:40Z — CI on 5e361761f: all checks pass. `git-real-git (macos-latest)` first ended
  `cancelled` with no step run (runner problem); one job rerun passed. CodeRabbit skipped
  (`.ptah/specs/**` path filter). Waiting for human review; not merged.
- 2026-11-24 — Second successor. Fixed the 3 PtahCode threads on the harness: per-run control
  token and RPC allowlist (`drive.mjs`), abort of a timed-out Ptah chat, spawn ENOENT recorded
  as a failed task (`stage2.mjs`). `node --check` passes. No paid runs. Report corrected: turn 1
  prompt about 45k (r6) vs 56k (r7), suspected cause PR #1475, unproven. The report also now
  records that the timed-out code-mode chat overlapped task 8 for about 13 s.
- 2026-11-24 — Third successor. Review round 2 (4 PtahCode threads): a failed chat abort now
  stops the run with exit 1; Codex auth link from `BENCH_CODEX_AUTH_HOME` or `os.homedir()`;
  `hashes.sh` paths from env, so no personal path stays in a committed file; `drive.mjs`
  checks the token before it reads the body and caps the body at 1 MB (413); both scripts read
  the port from `--control-port=` or `BENCH_CONTROL_PORT`. `node --check` and `bash -n` pass.
  No paid runs.
