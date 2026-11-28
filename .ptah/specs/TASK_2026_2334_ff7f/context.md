# Context — TASK_2026_2334_ff7f

Pull request 2 of the Ptah MCP adoption work. Pull request 1 is #1522 (TASK_2026_2332_5b4f,
branch `feat/ptah-mcp-adoption`): native key aliases, `ptah_inspect`, eager lifecycle tools,
guidance rows.

## Request

Measure, for every vendor and without vendor transcripts, how many tool calls of a lane or chat
session are Ptah MCP calls and how many are native calls that a Ptah tool could replace.

## Evidence from task 1

- A 4-hour audit needed three hand-written parsers (Codex rollouts, Grok stream events, Claude
  SDK transcripts) and found no data for antigravity and opencode lanes.
- The later probe count found that Ptah already saves lane output for every vendor:
  `%USERPROFILE%\.ptah\state\sessions\<sessionId>\agent-output.<agentId>.json`, with one
  `tool-call` segment per call. A scratch script (`count-lane-calls.mjs` in the task 1 folder,
  branch `feat/ptah-mcp-adoption`) computed share, errors and replaceable native calls from it and
  matched the completion-signal totals (codex 23, antigravity 49).
- Open points: the journal holds payload text (not metadata-only); the error outcome of a call was
  available for only part of the vendors; the journal has no build identity; the main chat agent
  (Claude Agent SDK) has no such journal and was counted from `~/.claude/projects` transcripts.

## Scope

1. Decide from the code if the existing lane output journal is the ledger source, or if a small
   metadata-only record must be written at the shared event boundary.
2. One record per tool call: timestamp, session id, lane/agent id, vendor, tool name, server
   (ptah / native / other MCP), outcome (success / error / cancelled), operation class, error class,
   build identity. No arguments, no result text, no paths.
3. A script under `scripts/agent-usage/` that prints per lane and per vendor: total, Ptah, native,
   Ptah share, Ptah errors, discovery calls, calls before the first Ptah success, replaceable native
   calls by class.
4. Cover the main chat agent too, or state exactly why not.

Out of scope: regeneration of `.claude/agents/*.md` (waits for the merge of #1522); the symlink
gap of `walkGlobMatches` in `libs/backend/platform-core` (separate security task).

## Gate 0.1

Lanes enabled. User pin: codex `gpt-6-luna`, antigravity `gemini-4-hydrogen-high`. Approval mode:
lane-review with the in-process orchestrator as cross-side reviewer. Cost mode: CLI lanes first,
CI runs the gates.
