/**
 * Name prefix Claude gives every tool of Ptah's `ptah` MCP server:
 * `mcp__ptah__<name>`. Host tools (`mcp__ptah__ptah_agent_spawn`) and gateway
 * tools (`mcp__ptah__<alias>__<tool>`) share it, so permission gates, hook
 * matchers and the gateway must all agree on this one value.
 */
export const PTAH_MCP_TOOL_PREFIX = 'mcp__ptah__';

/** `true` when `name` carries the {@link PTAH_MCP_TOOL_PREFIX}. */
export function hasPtahMcpToolPrefix(name: string): boolean {
  return name.startsWith(PTAH_MCP_TOOL_PREFIX);
}

/** `name` without a leading {@link PTAH_MCP_TOOL_PREFIX}; other names unchanged. */
export function stripPtahMcpToolPrefix(name: string): string {
  return hasPtahMcpToolPrefix(name)
    ? name.slice(PTAH_MCP_TOOL_PREFIX.length)
    : name;
}

/** `name` with the {@link PTAH_MCP_TOOL_PREFIX}; an already prefixed name is unchanged. */
export function withPtahMcpToolPrefix(name: string): string {
  return hasPtahMcpToolPrefix(name) ? name : `${PTAH_MCP_TOOL_PREFIX}${name}`;
}
