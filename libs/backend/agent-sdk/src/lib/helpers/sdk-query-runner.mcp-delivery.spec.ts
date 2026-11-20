import 'reflect-metadata';
import { keepMcpServersOnArgv } from './sdk-query-runner.service';
import type { SdkQueryOptions } from './sdk-query-options-builder';

describe('keepMcpServersOnArgv', () => {
  it('keeps MCP configs on argv when the caller did not choose', () => {
    const options: SdkQueryOptions = { mcpServers: {} };

    keepMcpServersOnArgv(options);

    expect(options.mcpServersDelivery).toBe('argv');
  });

  it('leaves a caller choice alone', () => {
    const options: SdkQueryOptions = { mcpServersDelivery: 'initialize' };

    keepMcpServersOnArgv(options);

    expect(options.mcpServersDelivery).toBe('initialize');
  });
});
