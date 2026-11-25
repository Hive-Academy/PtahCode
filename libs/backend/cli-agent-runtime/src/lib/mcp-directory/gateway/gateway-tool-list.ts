/**
 * Builds one root's served tool list and its reverse routes from the servers'
 * last good lists. Pure: the gateway supplies the lists and records the
 * servers that had none. Split out of `mcp-gateway.service.ts` to keep that
 * file within the repository's size limit.
 */

import type { McpGatewayTool } from '@ptah-extension/platform-core';
import { buildGatewayToolName } from './gateway-tool-naming';
import type { GatewayEndpoint, GatewaySourcesLogger } from './server-sources';
import type { UpstreamTool } from './upstream-client';

/** Where a served tool name goes: the server key and the upstream name. */
export interface GatewayToolRoute {
  readonly key: string;
  readonly upstreamName: string;
}

export interface GatewayToolListInput {
  readonly endpoints: readonly GatewayEndpoint[];
  readonly aliases: ReadonlyMap<string, string>;
  /** A server's last good list; null before its first, undefined with no state. */
  readonly toolsOf: (key: string) => readonly UpstreamTool[] | null | undefined;
  readonly hostToolNames: ReadonlySet<string>;
  /** Called for a served server that has no list yet. */
  readonly onMissing: (key: string) => void;
  readonly logger?: GatewaySourcesLogger;
}

export function buildGatewayToolList(input: GatewayToolListInput): {
  tools: McpGatewayTool[];
  routes: Map<string, GatewayToolRoute>;
} {
  const routes = new Map<string, GatewayToolRoute>();
  const tools: McpGatewayTool[] = [];
  for (const endpoint of input.endpoints) {
    const alias = input.aliases.get(endpoint.key);
    const listed = input.toolsOf(endpoint.key);
    if (listed === undefined || alias === undefined) continue;
    if (listed === null) {
      input.onMissing(endpoint.key);
      continue;
    }
    const display = endpoint.serverName;
    for (const tool of listed) {
      const name = buildGatewayToolName(alias, tool.name, input.hostToolNames);
      if (name === null || routes.has(name)) {
        input.logger?.debug('MCP gateway skipped a tool name', {
          server: display,
          tool: tool.name,
        });
        continue;
      }
      routes.set(name, { key: endpoint.key, upstreamName: tool.name });
      const text = tool.description ?? tool.title ?? '';
      tools.push({
        name,
        description: `[${display} via Ptah] ${text}`.trimEnd(),
        inputSchema: tool.inputSchema,
        ...(tool.annotations === undefined
          ? {}
          : { annotations: tool.annotations }),
        ...(tool.outputSchema === undefined
          ? {}
          : { outputSchema: tool.outputSchema }),
      });
    }
  }
  return { tools, routes };
}
