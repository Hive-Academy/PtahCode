# Context — TASK_2026_2277_22ef

## User request (2026-11-18)

1. The main agent calls only the codex lane, because the limit state of grok and antigravity
   is `unknown`. Spawn a small child process that runs each CLI with its `/usage` command and
   read the usage from the output, so the limit state becomes known.
2. Add better support for Claude API pricing and usage.
3. Add the same usage support for the second (named) Claude account.

## Gate 0.1

- Preference source: workspace memory (`cli-lane-vendor-preference`,
  `orchestration-executor-preference`) and the user's global CLAUDE.md: CLI lanes first, codex
  first, non-Claude vendors preferred.
- Mode: `enabled`. Approval mode: `user` for the plan (Full workflow; the user approves the plan).
- `ptah_agent_list` at 2026-11-18 13:10 UTC:

| Lane | Status | Limit state |
| --- | --- | --- |
| codex | installed | confirmed room (Weekly 68%) |
| grok | installed | unknown (API key, no plan) |
| antigravity | installed | unknown (usage read paused after a failure) |
| claude | installed | unknown (limits not tracked) |
| Claude Api (ptah-cli) | available | unknown (limits not tracked) |
| Glm (ptah-cli) | available | AT LIMIT (Weekly, resets 2026-11-23) |
| kimi code (ptah-cli) | available | AT LIMIT (Monthly, resets 2026-11-25) |
| copilot, opencode | disabled | - |
| cursor, pi | not installed | - |

## Live probe results (coordinator, 2026-11-18, this machine)

| Command | Result |
| --- | --- |
| `grok usage --json` (grok 1.0.77) | Refused: "`grok usage` can't show your plan's usage here yet. Run /usage inside grok instead." |
| `grok -p /usage --output-format json` | Sent as a model prompt. Reply: `402 Payment Required: Grok Build usage balance exhausted`. |
| `agy -p /usage --output-format json` | Empty stdout, exit 0, no usage data. |
| `agy -p /usage --print-timeout 30s` | `DEADLINE_EXCEEDED`, "turn still in progress": handled as a model turn, not as a slash command. |

Conclusions: in non-interactive mode both CLIs send `/usage` to the model. `/usage` works
only in the interactive terminal UI. The existing antigravity CLI fallback
(`antigravity-cli-usage.adapter.ts:133`) can thus never succeed, which explains
"usage read paused after a failure". Grok is in fact exhausted (HTTP 402), not "unknown".

## Phases

| Phase | Executor | State |
| --- | --- | --- |
| analysis (`analysis.md`) | codex lane | done |
| plan (2 plans) | codex lanes | done |
| implement 1a + fix round | codex lanes | done |
| review + re-review | antigravity lanes | APPROVED |
