import type { CliType } from '@ptah-extension/shared';

/**
 * Capability issued to a CLI lane when the host has an MCP port.
 *
 * Antigravity is `privileged` like the other lanes (TASK_2026_979 decision
 * row 36): the adapter runs over ACP only and carries the credential only in
 * `session/new`; it never writes the shared home `mcp_config.json` (row 13),
 * so no lane credential sits in a file.
 */
export function laneMcpTokenCapability(cli: CliType): 'privileged' | null {
  switch (cli) {
    case 'codex':
    case 'cursor':
    case 'copilot':
    case 'opencode':
    case 'grok':
    case 'antigravity':
      return 'privileged';
    default:
      return null;
  }
}
