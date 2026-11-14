/**
 * Ptah MCP tools that a CLI lane in Plan mode may call.
 *
 * Plan is read-only. This is an explicit allowlist, not a prefix match: the
 * `mcp__ptah__` namespace also holds tools that write or act (spawn lanes or
 * sessions, create worktrees or tasks, publish artifacts, drive a browser,
 * install MCP servers, run code, message agents). Those stay refused.
 *
 * The list holds the reporting tool plus tools that are read-only by design.
 * Network tools (web search) and tools that write an index or a state record
 * are not in the list.
 */
export const PLAN_LANE_PTAH_TOOLS: ReadonlySet<string> = new Set(
  [
    // Reporting: the only way a Plan lane can say "BLOCKED: plan mode".
    'ptah_agent_report',
    // Lane and session status (read-only).
    'ptah_agent_list',
    'ptah_agent_status',
    'ptah_agent_read',
    'ptah_agent_message_status',
    'ptah_session_status',
    'ptah_session_read',
    'ptah_task_get',
    'ptah_task_list',
    // Workspace search and code intelligence (read-only).
    'ptah_workspace_analyze',
    'ptah_search_files',
    'ptah_code_search_symbols',
    'ptah_get_symbol_index',
    'ptah_get_dependents',
    'ptah_get_dependencies',
    'ptah_relevance_rank_files',
    'ptah_project_detect_monorepo',
    'ptah_ast_analyze',
    'ptah_context_enrich_file',
    'ptah_lsp_definitions',
    'ptah_lsp_references',
    'ptah_get_diagnostics',
    'ptah_get_dirty_files',
    'ptah_count_tokens',
    // Memory recall (read-only).
    'ptah_memory_search',
  ].map((name) => `mcp__ptah__${name}`),
);

/** True when a Plan-mode CLI lane may call this tool without a prompt. */
export function isPlanLaneAllowedPtahTool(toolName: string): boolean {
  return PLAN_LANE_PTAH_TOOLS.has(toolName);
}
