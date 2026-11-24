# Context — TASK_2026_2320_15a6

Rerun of the live navigation benchmark of TASK_2026_2299_d6f5 (round 6 = "before") on main
cd25c1cac (PR #1487 nav-tools follow-ups and PR #1491 code-index scope/reuse merged; PR #1489 not
in this head). Paid runs approved for `haiku` (Claude arms) and `gpt-6-luna` (Codex arms) only.

## Harness

Copy of `~/ptah-archive/2026-11-22-merged-worktrees/nav-tools/live-test` in
`.ptah/tmp/bench/live-test` (archive not edited). Copy of the committed parts in `harness/`.

## Arms

| arm | agent | how |
|---|---|---|
| native-haiku | `claude -p --model haiku` | no MCP, tools Bash/Read/Grep/Glob, `--max-turns 30` |
| ptah-haiku | Ptah main chat, model haiku | `chat:start` RPC on the isolated instance |
| code-mode | Ptah main chat, model haiku | as ptah-haiku, plus a deny list in the workspace `.claude/settings.local.json` (Read, Grep, Glob, Bash, Task, Agent, WebFetch, WebSearch and every `mcp__ptah__*` tool except `execute_code`), plus a one-line prompt prefix that says to use `execute_code` and the `ptah` global. The file exists only while the arm runs. |
| native-codex | `codex exec -m gpt-6-luna -s read-only` | own CODEX_HOME, auth symlink |
| ptah-codex | haiku chat spawns one codex lane (gpt-6-luna) | the lane is measured |
