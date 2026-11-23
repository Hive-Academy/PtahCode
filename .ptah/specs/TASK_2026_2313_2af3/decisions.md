# Decisions

| # | Decision | Evidence |
|---|----------|----------|
| 1 | BUGFIX, Partial depth, no architecture phase. Part 2 investigation ran in a read-only subagent. | Task text names the root cause. |
| 2 | A kill with no billing evidence backs off 30 s, then 120 s. 3 kills in a row disable the source. A completed run resets the count. | Normal run: 3-4 s. A slow start (WorkspaceFileIndex 18 s, loop lag) can exceed any fixed window. Each kill risks at most one model turn, so 3 bounds the risk to 3 spawns per process unless the user refreshes. |
| 3 | Billing evidence (`num_turns > 0` or a non-zero counter), also in the partial stdout of a killed run, disables the source for the process. A refresh does not override it. | Keeps the original safety rule of TASK_2026_2302. |
| 4 | A manual refresh (`refresh: true`) may pass a kill backoff and a kill-disable, but only 10 s after the last run ended. A good answer re-enables the source. | Requirement 3; the gap stops a refresh loop from spawning agy at will. |
| 5 | Kill window = agy `--print-timeout` 10 s + 3 s grace = 13 s. Chain budget 11 s -> 22 s (3 s token file + 3 s IDE server + 1 s sign-in check + 13 s CLI + 250 ms margin = 20.25 s). | The old 7 s kill was shorter than agy own 10 s timeout, so agy never ended a slow run by itself. |
| 6 | No deferral of the CLI stage to "boot readiness". The larger window and the retry cover the start. | No boot-ready signal exists in this lib. Adding one would couple the reader to the host. |
| 7 | The runner does not cache agy failures (`cacheFailures: false`). The source keeps its own backoff map. | The runner cache (5 min for `cli-timeout`) would block a retry that the source approves, including a refresh. |
| 8 | Grok: no backend change. | Grok is signed out here (`~/.grok/auth.json` is `{}`, RefreshTokenRejected in the grok log). Detection and tests are correct. The UI wording problem is in `libs/frontend` (out of scope); reported to the parent. |
| 9 | Kimi: a window at 100% with a known reset now carries `exhaustion`. No clamp change for ratio > 1, no 99.8% rule. | Keeps AT LIMIT after a failed read or restart (same as Codex). The other two are unverified risks; the existing spec rejects ratio 1.2 on purpose. |
