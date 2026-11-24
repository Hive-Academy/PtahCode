/**
 * `gateway-tool-bridge`: the debug line a gateway denial leaves
 * (TASK_2026_979 decision row 36). The list and call paths themselves are
 * covered through the dispatcher in `protocol-dispatcher.spec.ts`.
 */
// The bridge's tool-list imports reach tsyringe-decorated classes.
import 'reflect-metadata';
import type {
  IMcpGateway,
  McpCallerBinding,
} from '@ptah-extension/platform-core';
import type { MCPRequest } from '../types';
import {
  listGatewayToolsForList,
  type GatewayBridgeContext,
} from './gateway-tool-bridge';

const SECRET = 's'.repeat(43);

function makeGateway(): { gateway: IMcpGateway; listTools: jest.Mock } {
  const listTools = jest.fn().mockResolvedValue([]);
  return {
    gateway: { listTools } as unknown as IMcpGateway,
    listTools,
  };
}

function makeContext(
  gateway: IMcpGateway | undefined,
  capability: GatewayBridgeContext['capability'],
): GatewayBridgeContext & { debug: jest.Mock; warn: jest.Mock } {
  return { gateway, capability, debug: jest.fn(), warn: jest.fn() };
}

function listRequest(binding?: McpCallerBinding): MCPRequest {
  return {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
    ...(binding ? { _callerBinding: binding } : {}),
  } as MCPRequest;
}

describe('gateway-tool-bridge denial debug line', () => {
  it('logs the caller kind, lane id and capability when a lane-report caller is denied', async () => {
    const { gateway, listTools } = makeGateway();
    const context = makeContext(gateway, 'lane-report');
    const tools = await listGatewayToolsForList(
      listRequest({ kind: 'agent', agentId: 'agy-1', capability: 'lane-report' }),
      context,
    );
    expect(tools).toEqual([]);
    expect(listTools).not.toHaveBeenCalled();
    expect(context.debug).toHaveBeenCalledTimes(1);
    expect(context.debug).toHaveBeenCalledWith(
      '[MCP] gateway tools withheld from caller',
      {
        reason: 'caller-not-permitted',
        callerKind: 'agent',
        agentId: 'agy-1',
        bindingCapability: 'lane-report',
        capability: 'lane-report',
      },
    );
  });

  it('logs a missing binding and never a credential', async () => {
    const { gateway } = makeGateway();
    const context = makeContext(gateway, 'privileged');
    const request = {
      ...listRequest(),
      params: { token: SECRET },
    } as MCPRequest;
    await listGatewayToolsForList(request, context);
    expect(context.debug).toHaveBeenCalledWith(
      '[MCP] gateway tools withheld from caller',
      expect.objectContaining({ reason: 'no-caller-binding' }),
    );
    expect(JSON.stringify(context.debug.mock.calls)).not.toContain(SECRET);
  });

  it('logs nothing for a privileged lane, which gets the gateway list', async () => {
    const { gateway, listTools } = makeGateway();
    const context = makeContext(gateway, 'privileged');
    await listGatewayToolsForList(
      listRequest({ kind: 'agent', agentId: 'agy-1', capability: 'privileged' }),
      context,
    );
    expect(listTools).toHaveBeenCalledTimes(1);
    expect(context.debug).not.toHaveBeenCalled();
  });

  it('logs nothing on a host without a gateway', async () => {
    const context = makeContext(undefined, 'lane-report');
    await listGatewayToolsForList(
      listRequest({ kind: 'agent', agentId: 'agy-1', capability: 'lane-report' }),
      context,
    );
    expect(context.debug).not.toHaveBeenCalled();
  });
});
