# Measured result - tool list of a child session (open point 2)

- Date: 2026-11-12. Host: Electron desktop app (`Ptah.exe` is the parent process of the
  session runtime `claude.exe`).
- Method: the orchestrator started one child session with `ptah_session_start`
  (session `e4f74dbc-75c7-4455-9574-b9468a5d0cfa`, branch `chore/phase0-tool-probe`, base `main`,
  effort `low`, default model). The child recorded its own tool list and called
  `ptah_browser_status` one time. The text below the line is the unchanged file of the child.
- Result: the child has the 10 `ptah_browser_*` tools, and the call of `ptah_browser_status`
  was successful (no privilege refusal).
- Limits of this measurement: one sample; Claude SDK runtime branch only (model
  `claude-haiku-4-5`); a child on the Codex app-server branch was not measured; no page was
  opened (`ptah_browser_navigate` and `ptah_browser_screenshot` were not called).
- Side note: the child lists `ptah_session_start`, but the host refuses a start from a child
  (depth limit one). Thus a tool in the list is not always an effective capability.

---

# Session Tool Probe

## Session

- **Working directory:** `/d/projects/ptah-extension/.claude-worktrees/chore-phase0-tool-probe-e105f0748523`
- **Git branch:** `chore/phase0-tool-probe`
- **Model:** claude-haiku-4-5-20251001

## Ptah tools

### Loaded
- mcp__ptah__ptah_agent_list
- mcp__ptah__ptah_agent_spawn
- mcp__ptah__ptah_ast_analyze
- mcp__ptah__ptah_code_search_symbols
- mcp__ptah__ptah_context_enrich_file
- mcp__ptah__ptah_count_tokens
- mcp__ptah__ptah_get_dependencies
- mcp__ptah__ptah_get_dependents
- mcp__ptah__ptah_get_diagnostics
- mcp__ptah__ptah_get_dirty_files
- mcp__ptah__ptah_get_symbol_index
- mcp__ptah__ptah_git_worktree_add
- mcp__ptah__ptah_git_worktree_list
- mcp__ptah__ptah_git_worktree_remove
- mcp__ptah__ptah_lsp_definitions
- mcp__ptah__ptah_lsp_references
- mcp__ptah__ptah_memory_search
- mcp__ptah__ptah_project_detect_monorepo
- mcp__ptah__ptah_relevance_rank_files
- mcp__ptah__ptah_search_files
- mcp__ptah__ptah_workspace_analyze

### Deferred
- mcp__ptah__approval_prompt
- mcp__ptah__execute_code
- mcp__ptah__ptah_agent_message
- mcp__ptah__ptah_agent_message_ack
- mcp__ptah__ptah_agent_message_control
- mcp__ptah__ptah_agent_message_status
- mcp__ptah__ptah_agent_read
- mcp__ptah__ptah_agent_report
- mcp__ptah__ptah_agent_status
- mcp__ptah__ptah_agent_stop
- mcp__ptah__ptah_agent_wait
- mcp__ptah__ptah_artifact_publish
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
- mcp__ptah__ptah_code_reindex
- mcp__ptah__ptah_harness_create_skill
- mcp__ptah__ptah_harness_install_mcp_server
- mcp__ptah__ptah_harness_list_installed_mcp
- mcp__ptah__ptah_harness_propose_config
- mcp__ptah__ptah_harness_search_mcp_registry
- mcp__ptah__ptah_harness_search_skills
- mcp__ptah__ptah_json_validate
- mcp__ptah__ptah_outcome_report
- mcp__ptah__ptah_run_check
- mcp__ptah__ptah_run_check_wait
- mcp__ptah__ptah_session_clear_finished
- mcp__ptah__ptah_session_handoff
- mcp__ptah__ptah_session_handoff_ack
- mcp__ptah__ptah_session_link_task
- mcp__ptah__ptah_session_read
- mcp__ptah__ptah_session_send
- mcp__ptah__ptah_session_start
- mcp__ptah__ptah_session_status
- mcp__ptah__ptah_session_stop
- mcp__ptah__ptah_task_check
- mcp__ptah__ptah_task_cleanup_completed
- mcp__ptah__ptah_task_close_out
- mcp__ptah__ptah_task_close_out_status
- mcp__ptah__ptah_task_create
- mcp__ptah__ptah_task_get
- mcp__ptah__ptah_task_list
- mcp__ptah__ptah_task_update
- mcp__ptah__ptah_web_search

## Browser tools

Browser tools are available (all deferred):
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

## Session and lane tools

Available (all deferred):
- mcp__ptah__ptah_agent_message
- mcp__ptah__ptah_agent_message_ack
- mcp__ptah__ptah_agent_message_control
- mcp__ptah__ptah_agent_message_status
- mcp__ptah__ptah_agent_read
- mcp__ptah__ptah_agent_report
- mcp__ptah__ptah_agent_status
- mcp__ptah__ptah_agent_stop
- mcp__ptah__ptah_agent_wait
- mcp__ptah__ptah_session_clear_finished
- mcp__ptah__ptah_session_handoff
- mcp__ptah__ptah_session_handoff_ack
- mcp__ptah__ptah_session_link_task
- mcp__ptah__ptah_session_read
- mcp__ptah__ptah_session_send
- mcp__ptah__ptah_session_start
- mcp__ptah__ptah_session_status
- mcp__ptah__ptah_session_stop

## Other MCP servers

- claude (Claude Docs)
- oauth-mcp.heygen.com-mcp-hyperframes (HeyGen)
- sonarqube
- stitch

## Browser call

**Status result:**

```
## Browser Status

**Connected:** No

No active browser session. Use ptah_browser_navigate to start one.
```

## Counts

- **Ptah tools:** 71 total (21 loaded, 50 deferred)
- **Browser tools:** 10 (all deferred)
- **All tools:** 71 ptah tools + 12 non-MCP tools (Agent, Bash, Edit, Glob, Grep, Skill, ToolSearch, Read, Write, ListAgents, ScheduleWakeup, PowerShell) = 83 total
