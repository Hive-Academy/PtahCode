import 'reflect-metadata';
import { container as rootContainer } from 'tsyringe';
import { PLATFORM_TOKENS } from '@ptah-extension/platform-core';
import type { IMcpGateway } from '@ptah-extension/platform-core';
import { refreshBoundMcpGateway } from './refresh-bound-gateway';

describe('refreshBoundMcpGateway (TASK_2026_979 B23)', () => {
  it('refreshes the bound gateway', () => {
    const child = rootContainer.createChildContainer();
    const refresh = jest.fn(async () => undefined);
    child.registerInstance(PLATFORM_TOKENS.MCP_GATEWAY, {
      refresh,
    } as unknown as IMcpGateway);

    refreshBoundMcpGateway(child);

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when no gateway is bound', () => {
    const child = rootContainer.createChildContainer();
    const resolve = jest.spyOn(child, 'resolve');

    expect(() => refreshBoundMcpGateway(child)).not.toThrow();
    expect(resolve).not.toHaveBeenCalled();
  });
});
