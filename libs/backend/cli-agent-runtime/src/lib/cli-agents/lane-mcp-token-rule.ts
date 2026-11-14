import type { CliType } from '@ptah-extension/shared';

/** Capability issued to a CLI lane when the host has an MCP port. */
export function laneMcpTokenCapability(cli: CliType): 'privileged' | 'lane-report' | null {
  switch (cli) {
    case 'codex':
    case 'cursor':
    case 'copilot':
    case 'opencode':
    case 'grok':
      return 'privileged';
    case 'antigravity':
      return 'lane-report';
    default:
      return null;
  }
}
