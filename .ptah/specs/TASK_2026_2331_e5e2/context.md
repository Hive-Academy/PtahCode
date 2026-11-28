# Context — TASK_2026_2331_e5e2

## Source
Follow-up to TASK_2026_2329_7f4a (PR #1527, branch `fix/full-auto-yolo-providers`).
Evidence: `.ptah/specs/TASK_2026_2329_7f4a/live-test-results.md` on that branch (fetched via
`git show origin/fix/full-auto-yolo-providers:...`), "Follow-up defects (separate PR)" section.

## Gate 0.1 — CLI lanes
- `ptah_memory_search` for a lane-execution preference returned no hits.
- No current explicit user instruction about lane usage for this task.
- `ptah_agent_list` shows kimi code (ptahCliId pc-7594dcab-a859-41a0-8e8b-e8df5dba7d25) and
  Ollama Code as spawnable, capable, with confirmed room.
- Decision: no-preference default -> lanes `enabled`. Approval mode = `lane-review`.
- Review lane per task brief: kimi code primary, Ollama Code fallback if rate-limited.

## Task type / depth
- Type: BUGFIX (two defects, clear repro evidence, file hints given).
- Depth: Partial (requirements known from live-test evidence; two independent root causes to find).
- Pack: software. Flow: [research] -> batch -> implement -> review -> tests -> completion.

## Defect 1 — Antigravity drops large Ptah MCP tool declarations
agy (Antigravity CLI, ACP) silently drops every Ptah MCP tool whose declaration
(name + description + parameters JSON) is larger than ~2.1 KB.
- Dropped (>2150 B): ptah_agent_spawn (8679 B), ptah_session_start (4981 B), ptah_route_decide
  (3473 B), ptah_harness_search_skills, ptah_harness_search_mcp_registry,
  ptah_harness_propose_config, ptah_grep (2290 B), ptah_harness_create_skill (2154 B).
- Present (<=2124 B): ptah_task_create and others.
- Schema shape (empty object / anyOf / const) is NOT the cause — ptah_json_validate and
  ptah_outcome_report (odd schema shapes) are present.
- Likely cause: Antigravity/Gemini ACP client-side MCP tool size limit, enforced when it
  downloads tool declarations to `~/.gemini/antigravity-cli/mcp/ptah_lane/*.json`.
- Code to check: `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/` —
  tool-description.builder.ts, session-tools.ts — where tool descriptions are assembled.
- Fix direction: compact declaration variant for Antigravity (or a global size budget +
  guard test), keeping full descriptions for other providers if possible. Confirm the exact
  limit if possible. Also ensure Antigravity child sessions inherit the parent's permission
  level (depends on f963b775a from #1527, already on this branch's base once merged — not yet
  on main as of task start).

## Defect 2 — Codex Manual: Ptah MCP tool approval not shown inline, times out
- With Codex in Manual, a Ptah MCP tool call (e.g. ptah_session_start) creates an approval
  ("Allow the ptah MCP server to run tool ..."), logged as `mcp__ptah__elicitation`.
  It appears only in the notifications list, not inline in the chat, and times out (~1 min).
  Allow from notifications did not reach the live request.
- Related log line: `[CodexChatApprovalSink] read-only command not accepted ... reason
  not-command`.
- Target behavior: Claude in Manual shows the same approval inline with "No timeout".
- Code to check: Codex app-server elicitation / MCP approval routing to the chat approval
  card — likely a `CodexChatApprovalSink` class and whatever classifies approval requests as
  "command" vs other kinds (MCP tool calls are not shell commands).

## Base branch note
PR #1527 is not merged into main yet. This task's worktree base is origin/main (without
f963b775a). Defect-1 live verification of "child sessions get parent permission level" needs
both #1527's fix and this task's defect-1 fix — flagged to the user, do not block the code fix
on it.
