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
