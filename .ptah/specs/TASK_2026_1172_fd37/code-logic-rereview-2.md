# Code Logic Re-review 2 — TASK_2026_1172_fd37 (commit 6d0b8b9b8)

Read-only review. No tests, tsc or lint run.

**Verdict: APPROVED.** No blocking or serious findings. O1 is closed. Two optional Minor items follow.

## How I checked the list

`mcp-core/mcp-caller-policy.ts` already classifies every Ptah tool, so I compared the allowlist against that table (`READ_TOOLS` at `:~30-66`, `AGENT_CONTROL_TOOLS` at `:~68-85`). I also confirmed that the tools I sampled have dispatcher handlers: `ptah_agent_read`, `ptah_agent_status`, `ptah_agent_list`, `ptah_memory_search`, `ptah_workspace_analyze`, `ptah_get_dirty_files`, `ptah_get_symbol_index`, `ptah_task_get` and `ptah_count_tokens`. I did not trace the handler bodies for write side effects. The read-only claim rests on the table's own classification.

1. **Allowlist vs the caller-policy table.** `plan-lane-tool-policy.ts` lists 25 tools, and 24 of them are in `READ_TOOLS`. That covers the status, session, task, search, LSP, diagnostics, token-count and memory tools. None of them is in the agent-control, task/git-mutation, harness, browser, execute-code, approval or network classes. No tool has to leave the list.
2. **The one exception is `ptah_agent_report`.** The table classes it `agent-control`. It is the lane's own channel for saying "BLOCKED: plan mode", and `mcp-caller-policy.ts:~126` and the dispatcher at `protocol-dispatcher.ts:~975` treat it specially, together with `ptah_agent_message_status`. Allowing it is intended.
3. **Excluded on purpose, and correct:**
   - `ptah_agent_message`, `ptah_agent_spawn`, `ptah_agent_message_ack`: agent control.
   - `ptah_session_send` and the other session-control tools: agent control.
   - `execute_code`: execute-code class.
   - `ptah_browser_*`: browser control.
   - `ptah_web_search`: network class.
   - `ptah_code_reindex` and the harness mutation tools: harness mutation.
   - `ptah_git_worktree_add` and the task mutation tools: task/git mutation.
4. **Unknown or new tools stay denied.** A tool not named in the set is refused by `decidePlanLaneToolCall`. This is the right default. A new tool also lands in the `agent-control` class in the caller policy until someone adds it.
5. **Specs.** The new rows in `sdk-permission-handler.spec.ts` (`:~1998-2006`) assert:
   - deny: `ptah_agent_spawn`, `execute_code`, `ptah_git_worktree_add`, `ptah_web_search`.
   - allow: `ptah_agent_report`, `ptah_search_files`.
   - The same `it.each` asserts for every row that no permission-request message was sent. Deny rows also assert the message contains "BLOCKED: plan mode". That is the right assertion.

## Open findings (both Minor, optional)

- **m1. Read-only tools missing from the list.** `ptah_json_validate`, `ptah_task_check`, `ptah_task_close_out_status`, `ptah_git_worktree_list`, `ptah_harness_list_installed_mcp` and `ptah_surface_get_state` are all `READ_TOOLS`. Add the ones a planning lane would use: `ptah_task_check`, `ptah_git_worktree_list`, `ptah_json_validate`. Leave out `ptah_harness_search_mcp_registry`, because it may use the network.
- **m2. The two lists can drift.** The allowlist is a hand-copied subset of `READ_TOOLS`. A spec that asserts every allowlist entry (except `ptah_agent_report`) is class `'read'` in `toolClass` would keep them aligned. A new tool reclassified as non-read would then fail the spec instead of staying allowed in plan lanes. `toolClass` lives in the vscode-lm-tools lib, so check the dependency direction before adding that spec to agent-sdk.
