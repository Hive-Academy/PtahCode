/**
 * How a Claude query consumes Ptah's MCP gateway (TASK_2026_979): whether the
 * gateway serves the session through `ptah` (strict MCP, C11), and the
 * approval gate an interactive session puts in front of every gateway tool.
 */
import type { IMcpGateway } from '@ptah-extension/platform-core';
import { PTAH_MCP_SERVER_NAME } from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';
import { isCronMutatingTool } from '../permission/cron-tool-policy';
import {
  createGatewayApprovalGate,
  type GatewayApprovalGate,
} from '../permission/gateway-approval-gate';
import type { CanUseTool } from '../types/sdk-types/claude-sdk.types';

/**
 * Whether the MCP gateway serves the servers of a session built with
 * `mcpServers`: a gateway is bound on this host and `ptah` is in the map the
 * session will load. The caller then runs strict MCP (C11), so `ptah` is the
 * only MCP source and the CLI loads no copy of a server the gateway serves.
 * No gateway, or no `ptah` in the map (server not running, or the policy
 * turned it OFF), is `false`: the CLI keeps its own MCP sources as before.
 */
export function gatewayServesPtah(
  gateway: IMcpGateway | null | undefined,
  mcpServers: Readonly<Record<string, unknown>>,
): boolean {
  return (
    gateway != null &&
    Object.prototype.hasOwnProperty.call(mcpServers, PTAH_MCP_SERVER_NAME)
  );
}

/**
 * The gateway approval gate around `next` (the cron gate's `canUseTool`), or
 * `undefined` on a host with no gateway, which serves no gateway tool. Cron
 * write tools stay with the cron gate whatever the gateway answers, so a cron
 * call is asked once, by the cron gate, even before the gateway has
 * registered the host tool names.
 */
export function createSessionGatewayGate(
  gateway: Pick<IMcpGateway, 'isGatewayTool'> | undefined,
  permissionCallback: CanUseTool,
  next: CanUseTool,
  logger: Pick<Logger, 'warn'>,
): GatewayApprovalGate | undefined {
  if (!gateway) return undefined;
  return createGatewayApprovalGate(permissionCallback, {
    next,
    isGatewayTool: (toolName) =>
      !isCronMutatingTool(toolName) && gateway.isGatewayTool(toolName),
    onError: (error, toolName) =>
      logger.warn(
        '[SdkQueryOptionsBuilder] Gateway approval prompt failed; denying the call',
        {
          toolName,
          error: error instanceof Error ? error.message : String(error),
        },
      ),
  });
}
