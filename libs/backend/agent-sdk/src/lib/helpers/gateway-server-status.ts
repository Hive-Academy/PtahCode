/**
 * Gateway servers in a session's init MCP status (TASK_2026_979).
 *
 * The CLI's `system`/`init` message lists only the servers the CLI itself
 * loaded. Servers that Ptah's MCP gateway serves through `ptah` are appended,
 * so a session that loses one of them shows it.
 */
import {
  sessionGatewayScope,
  type IMcpGateway,
} from '@ptah-extension/platform-core';
import {
  PTAH_MCP_SERVER_NAME,
  type SessionMcpServerEntry,
} from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';

/**
 * Gateway servers to append to a session's init MCP status, each with
 * `name = serverKey` and `source: 'ptah-gateway'`.
 *
 * Empty when no gateway is bound, when the session has no `ptah` server
 * (gateway tools only reach a session through it) or when the init message
 * names no workspace. The scope mirrors the interactive credential the
 * options builder mints when a gateway is bound (`sessionGatewayScope`).
 * `status` reads the gateway's cache only.
 */
function readGatewayServers(
  gateway: Pick<IMcpGateway, 'status'> | undefined,
  cliServers: readonly SessionMcpServerEntry[],
  cwd: unknown,
  logger: Pick<Logger, 'warn'>,
  sessionId: string,
): SessionMcpServerEntry[] {
  if (!gateway || typeof cwd !== 'string' || cwd.length === 0) return [];
  if (!cliServers.some((server) => server.name === PTAH_MCP_SERVER_NAME)) {
    return [];
  }
  try {
    return gateway.status(sessionGatewayScope(cwd)).map((server) => ({
      name: server.key,
      status: server.status,
      source: 'ptah-gateway' as const,
    }));
  } catch (error: unknown) {
    // degradation-audit: reported - gateway status is advisory; the CLI's own entries still publish and the failure is logged.
    logger.warn('[StreamTransformer] Gateway server status unavailable', {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/** The CLI's own init entries followed by the gateway's servers. */
export function withGatewayServers(
  gateway: Pick<IMcpGateway, 'status'> | undefined,
  cliServers: readonly SessionMcpServerEntry[],
  cwd: unknown,
  logger: Pick<Logger, 'warn'>,
  sessionId: string,
): SessionMcpServerEntry[] {
  return [
    ...cliServers,
    ...readGatewayServers(gateway, cliServers, cwd, logger, sessionId),
  ];
}
