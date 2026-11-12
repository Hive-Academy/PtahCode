# Measured result - tool list of a child session (open point 2)

- Date: 2026-11-12. Host: Electron desktop app (`Ptah.exe` is the parent process of the
  session runtime `claude.exe`).
- Method: the orchestrator started one child session with `ptah_session_start`
  (session `e4f74dbc-75c7-4455-9574-b9468a5d0cfa`, branch `chore/phase0-tool-probe`, base `main`,
  effort `low`, default model). The child recorded its own tool list and called
  `ptah_browser_status` one time. The text below the line is the file of the child.
- Result: the child has the 11 `ptah_browser_*` tools, and the call of `ptah_browser_status`
  was successful (no privilege refusal).
- Limits of this measurement: one sample; Claude SDK runtime branch only (model
  `claude-haiku-4-5`); a child on the Codex app-server branch was not measured; no page was
  opened (`ptah_browser_navigate` and `ptah_browser_screenshot` were not called).
- Correction (2026-11-12): the first file of the child gave 10 browser tools, 71 Ptah tools and 83 tools
  in total. The child corrected its file: 11 browser tools (`ptah_browser_type` was not in the first
  list), 72 Ptah tools, 166 tools at the start. The code has 11 `ptah_browser_*` tool names. The text
  below the line is the corrected file. The model statement of the child (Haiku 4.5 at the start,
  Fable 5.2 at the second turn) is a self-report and was not checked.
- Side note: the child lists `ptah_session_start`, but the host refuses a start from a child
  (depth limit one). Thus a tool in the list is not always an effective capability.

---

# Session Tool Probe

This file replaces a first version that had errors: it marked 9 deferred tools as `loaded`,
it did not list `ptah_browser_type` and `ptah_route_decide`, and its counts were wrong.

## Session

- Working directory: `D:\projects\ptah-extension\.claude-worktrees\chore-phase0-tool-probe-e105f0748523`
- Git branch: `chore/phase0-tool-probe`
- Model: the session started on Haiku 4.5 (`claude-haiku-4-5-20251001`). At the second turn the
  session reported Fable 5.2 (`claude-fable-5-2`).

## Ptah tools

All names have the prefix `mcp__ptah__`. `loaded` = the schema is in the tool list at session
start. `deferred` = the name is in the deferred list and ToolSearch must load the schema.

- mcp__ptah__ptah_agent_list - loaded
- mcp__ptah__ptah_agent_message - deferred
- mcp__ptah__ptah_agent_message_ack - deferred
- mcp__ptah__ptah_agent_message_control - deferred
- mcp__ptah__ptah_agent_message_status - deferred
- mcp__ptah__ptah_agent_read - deferred
- mcp__ptah__ptah_agent_report - deferred
- mcp__ptah__ptah_agent_spawn - loaded
- mcp__ptah__ptah_agent_status - deferred
- mcp__ptah__ptah_agent_stop - deferred
- mcp__ptah__ptah_agent_wait - deferred
- mcp__ptah__ptah_artifact_publish - deferred
- mcp__ptah__ptah_ast_analyze - loaded
- mcp__ptah__ptah_browser_click - deferred
- mcp__ptah__ptah_browser_close - deferred
- mcp__ptah__ptah_browser_content - deferred
- mcp__ptah__ptah_browser_evaluate - deferred
- mcp__ptah__ptah_browser_navigate - deferred
- mcp__ptah__ptah_browser_network - deferred
- mcp__ptah__ptah_browser_record_start - deferred
- mcp__ptah__ptah_browser_record_stop - deferred
- mcp__ptah__ptah_browser_screenshot - deferred
- mcp__ptah__ptah_browser_status - deferred (ToolSearch loaded it for the call below)
- mcp__ptah__ptah_browser_type - deferred
- mcp__ptah__ptah_code_reindex - deferred
- mcp__ptah__ptah_code_search_symbols - loaded
- mcp__ptah__ptah_context_enrich_file - loaded
- mcp__ptah__ptah_count_tokens - deferred
- mcp__ptah__ptah_get_dependencies - deferred
- mcp__ptah__ptah_get_dependents - deferred
- mcp__ptah__ptah_get_diagnostics - loaded
- mcp__ptah__ptah_get_dirty_files - loaded
- mcp__ptah__ptah_get_symbol_index - deferred
- mcp__ptah__ptah_git_worktree_add - deferred
- mcp__ptah__ptah_git_worktree_list - deferred
- mcp__ptah__ptah_git_worktree_remove - deferred
- mcp__ptah__ptah_harness_create_skill - deferred
- mcp__ptah__ptah_harness_install_mcp_server - deferred
- mcp__ptah__ptah_harness_list_installed_mcp - deferred
- mcp__ptah__ptah_harness_propose_config - deferred
- mcp__ptah__ptah_harness_search_mcp_registry - deferred
- mcp__ptah__ptah_harness_search_skills - deferred
- mcp__ptah__ptah_json_validate - deferred
- mcp__ptah__ptah_lsp_definitions - loaded
- mcp__ptah__ptah_lsp_references - loaded
- mcp__ptah__ptah_memory_search - loaded
- mcp__ptah__ptah_outcome_report - deferred
- mcp__ptah__ptah_project_detect_monorepo - deferred
- mcp__ptah__ptah_relevance_rank_files - deferred
- mcp__ptah__ptah_route_decide - deferred
- mcp__ptah__ptah_run_check - deferred
- mcp__ptah__ptah_run_check_wait - deferred
- mcp__ptah__ptah_search_files - loaded
- mcp__ptah__ptah_session_clear_finished - deferred
- mcp__ptah__ptah_session_handoff - deferred
- mcp__ptah__ptah_session_handoff_ack - deferred
- mcp__ptah__ptah_session_link_task - deferred
- mcp__ptah__ptah_session_read - deferred
- mcp__ptah__ptah_session_send - deferred
- mcp__ptah__ptah_session_start - deferred
- mcp__ptah__ptah_session_status - deferred
- mcp__ptah__ptah_session_stop - deferred
- mcp__ptah__ptah_task_check - deferred
- mcp__ptah__ptah_task_cleanup_completed - deferred
- mcp__ptah__ptah_task_close_out - deferred
- mcp__ptah__ptah_task_close_out_status - deferred
- mcp__ptah__ptah_task_create - deferred
- mcp__ptah__ptah_task_get - deferred
- mcp__ptah__ptah_task_list - deferred
- mcp__ptah__ptah_task_update - deferred
- mcp__ptah__ptah_web_search - deferred
- mcp__ptah__ptah_workspace_analyze - loaded

Two more tools are on the `ptah` server, but their tool names do not start with `ptah_`:

- mcp__ptah__approval_prompt - deferred
- mcp__ptah__execute_code - deferred

## Browser tools

All 11 are deferred.

- mcp__ptah__ptah_browser_click
- mcp__ptah__ptah_browser_close
- mcp__ptah__ptah_browser_content
- mcp__ptah__ptah_browser_evaluate
- mcp__ptah__ptah_browser_navigate
- mcp__ptah__ptah_browser_network
- mcp__ptah__ptah_browser_record_start
- mcp__ptah__ptah_browser_record_stop
- mcp__ptah__ptah_browser_screenshot
- mcp__ptah__ptah_browser_status
- mcp__ptah__ptah_browser_type

## Session and lane tools

- mcp__ptah__ptah_agent_list - loaded
- mcp__ptah__ptah_agent_message - deferred
- mcp__ptah__ptah_agent_message_ack - deferred
- mcp__ptah__ptah_agent_message_control - deferred
- mcp__ptah__ptah_agent_message_status - deferred
- mcp__ptah__ptah_agent_read - deferred
- mcp__ptah__ptah_agent_report - deferred
- mcp__ptah__ptah_agent_spawn - loaded
- mcp__ptah__ptah_agent_status - deferred
- mcp__ptah__ptah_agent_stop - deferred
- mcp__ptah__ptah_agent_wait - deferred
- mcp__ptah__ptah_session_clear_finished - deferred
- mcp__ptah__ptah_session_handoff - deferred
- mcp__ptah__ptah_session_handoff_ack - deferred
- mcp__ptah__ptah_session_link_task - deferred
- mcp__ptah__ptah_session_read - deferred
- mcp__ptah__ptah_session_send - deferred
- mcp__ptah__ptah_session_start - deferred
- mcp__ptah__ptah_session_status - deferred
- mcp__ptah__ptah_session_stop - deferred

## Other MCP servers

- claude_ai_Claude_Docs
- oauth-mcp_heygen_com-mcp-hyperframes (disconnected after the first turn)
- sonarqube (disconnected after the first turn)
- stitch
- sentry (listed as "requires authentication", no tool is visible)

## Browser call

`mcp__ptah__ptah_browser_status` was deferred. ToolSearch loaded its schema. One call, no arguments.
Result:

```
## Browser Status


**Connected:** No  

No active browser session. Use ptah_browser_navigate to start one.
```

No other browser tool was called.

## Counts

- Ptah tools: 72 with a `ptah_` tool name (12 loaded, 60 deferred). The `ptah` server has 74 tools
  when `approval_prompt` and `execute_code` are included.
- Browser tools: 11 (0 loaded, 11 deferred).
- All tools at session start: 166 (25 loaded, 141 deferred).
  - Loaded: 13 built-in tools (Agent, AskUserQuestion, Bash, Edit, Glob, Grep, ListAgents,
    PowerShell, Read, ScheduleWakeup, Skill, ToolSearch, Write) and 12 `ptah` tools.
  - Deferred: 21 built-in tools, 62 `ptah`, 8 Claude Docs, 13 hyperframes, 19 sonarqube, 18 stitch.
- All tools at the second turn: 129. The host removed 32 MCP tools (hyperframes 13, sonarqube 19)
  and 5 built-in deferred tools (TaskCreate, TaskGet, TaskList, TaskUpdate, WebFetch).
