/**
 * How a Claude query consumes Ptah's MCP gateway (TASK_2026_979): the file
 * servers the gateway already serves through `ptah`, and the approval gate
 * an interactive session puts in front of every gateway tool.
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
 * File-declared MCP server names the gateway serves through `ptah` under
 * `root` (C4). The caller adds them to the flag-tier denied list, so the CLI
 * does not also load its own copy of a server that `ptah` already serves.
 * Empty when no gateway or no root is given. Fail-open to the old behaviour:
 * on an error the list is empty and a warning is logged, so the CLI loads its
 * copies as before.
 */
export async function readServedFileServerNames(
  gateway: Pick<IMcpGateway, 'servedFileServerNames'> | undefined,
  root: string | undefined,
  logger: Pick<Logger, 'warn'>,
  serviceTag: string,
): Promise<string[]> {
  if (!gateway || !root) return [];
  try {
    const names = await gateway.servedFileServerNames(root);
    return names.filter((name) => name !== PTAH_MCP_SERVER_NAME);
  } catch (error: unknown) {
    // degradation-audit: reported - logged below; without the list the CLI
    // loads its own copies of those servers, as it did before the gateway.
    logger.warn(
      `${serviceTag} Could not read the MCP servers the gateway serves; the CLI keeps its own copies`,
      { root, error: error instanceof Error ? error.message : String(error) },
    );
    return [];
  }
}

/**
 * `readServedFileServerNames` for a one-shot run. Only a run that opted in to
 * connectors, with tools and a reachable `ptah` server, gets the file servers
 * through `ptah`; every other run gets an empty list.
 */
export function readOneShotServedFileServerNames(
  gateway: Pick<IMcpGateway, 'servedFileServerNames'> | undefined,
  run: {
    readonly cwd: string;
    readonly mcpServerRunning: boolean;
    readonly includeConnectors?: boolean;
    readonly toolAccess?: string;
  },
  ptahEnabled: boolean,
  logger: Pick<Logger, 'warn'>,
  serviceTag: string,
): Promise<string[]> {
  const eligible =
    run.includeConnectors === true &&
    run.mcpServerRunning &&
    (run.toolAccess ?? 'claude-code') !== 'none' &&
    ptahEnabled;
  return readServedFileServerNames(
    eligible ? gateway : undefined,
    run.cwd,
    logger,
    serviceTag,
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
