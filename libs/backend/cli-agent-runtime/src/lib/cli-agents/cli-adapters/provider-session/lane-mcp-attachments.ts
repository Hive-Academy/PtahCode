/**
 * The Ptah MCP server a provider-session lane attaches: the workspace- and
 * agent-scoped URL (`ptahMcpServerUrl`) plus the lane's bearer token. A lane
 * without a port or a token attaches nothing.
 *
 * The attachment carries the token, so it is never logged (the ACP runtime
 * logs only each server's name and transport).
 */
import type { ProviderMcpAttachment } from '@ptah-extension/provider-session-contracts';
import type { CliCommandOptions } from '../cli-adapter.interface';
import { ptahMcpServerUrl } from '../ptah-mcp-url';

export function buildLaneMcpAttachments(
  options: Pick<
    CliCommandOptions,
    'mcpPort' | 'mcpToken' | 'workingDirectory' | 'agentId'
  >,
): readonly ProviderMcpAttachment[] {
  if (!options.mcpPort || !options.mcpToken) return [];
  return [
    {
      name: 'ptah',
      url: ptahMcpServerUrl(
        options.mcpPort,
        options.workingDirectory,
        options.agentId,
      ),
      headers: [{ name: 'Authorization', value: `Bearer ${options.mcpToken}` }],
    },
  ];
}
