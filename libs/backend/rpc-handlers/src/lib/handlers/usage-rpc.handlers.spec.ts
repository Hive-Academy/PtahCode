import 'reflect-metadata';

import { container } from 'tsyringe';
import { SessionStatsRepository } from '@ptah-extension/persistence-sqlite';
import { RPC_METHOD_NAMES } from '@ptah-extension/shared';
import { Logger, RpcHandler, RpcUserError, TOKENS } from '@ptah-extension/vscode-core';
import { UsageRpcHandlers } from './usage-rpc.handlers';

const METHOD = 'usage:getDimensionTotals';

function setup(repository: { getUsageDimensionTotals: jest.Mock } | null) {
  const logger = { debug: jest.fn(), warn: jest.fn() };
  const registered = new Map<string, (params: unknown) => Promise<unknown>>();
  const rpcHandler = {
    registerMethod: jest.fn((method: string, handler: (params: unknown) => Promise<unknown>) => {
      registered.set(method, handler);
    }),
  };
  const child = container.createChildContainer();
  child.registerInstance(TOKENS.LOGGER, logger);
  child.registerInstance(TOKENS.RPC_HANDLER, rpcHandler);
  if (repository) {
    child.registerInstance(
      SessionStatsRepository,
      Object.assign(Object.create(SessionStatsRepository.prototype) as SessionStatsRepository, repository),
    );
    child.resolve(UsageRpcHandlers).register();
  } else {
    // A class token that is not registered would be constructed, so pass null directly.
    new UsageRpcHandlers(
      Object.assign(Object.create(Logger.prototype) as Logger, logger),
      Object.assign(Object.create(RpcHandler.prototype) as RpcHandler, rpcHandler),
      null,
    ).register();
  }
  const call = (params: unknown) => {
    const handler = registered.get(METHOD);
    if (!handler) throw new Error(`${METHOD} was not registered`);
    return handler(params);
  };
  return { call, logger };
}

describe('UsageRpcHandlers', () => {
  it('claims one method that is in the registry', () => {
    expect(UsageRpcHandlers.METHODS).toEqual([METHOD]);
    expect(RPC_METHOD_NAMES).toContain(METHOD);
  });

  it('returns the totals of the repository for valid params', async () => {
    const totals = {
      byPhaseKind: [{
        dimension: 'implement', input_tokens: 1, output_tokens: 2, cache_read_tokens: 3,
        cache_write_tokens: 4, known_cost_micro_usd: 5, has_unpriced: 0,
      }],
      byExecutorType: [],
    };
    const repository = { getUsageDimensionTotals: jest.fn(async () => totals) };
    const { call } = setup(repository);
    await expect(call({ sessionId: 'session-1' })).resolves.toEqual(totals);
    expect(repository.getUsageDimensionTotals).toHaveBeenCalledWith('session-1');
  });

  it('returns empty lists for a session with no usage rows', async () => {
    const empty = { byPhaseKind: [], byExecutorType: [] };
    const { call } = setup({ getUsageDimensionTotals: jest.fn(async () => empty) });
    await expect(call({ sessionId: 'session-2' })).resolves.toEqual(empty);
  });

  it.each([
    ['missing', undefined],
    ['empty object', {}],
    ['empty id', { sessionId: '' }],
    ['wrong type', { sessionId: 7 }],
    ['extra field', { sessionId: 'session-1', extra: true }],
  ])('refuses bad params: %s', async (_label, params) => {
    const repository = { getUsageDimensionTotals: jest.fn() };
    const { call } = setup(repository);
    await expect(call(params)).rejects.toMatchObject({ errorCode: 'INVALID_PARAMS' });
    await expect(call(params)).rejects.toBeInstanceOf(RpcUserError);
    expect(repository.getUsageDimensionTotals).not.toHaveBeenCalled();
  });

  it('answers PERSISTENCE_UNAVAILABLE without a repository', async () => {
    const { call } = setup(null);
    await expect(call({ sessionId: 'session-1' })).rejects.toMatchObject({
      errorCode: 'PERSISTENCE_UNAVAILABLE',
    });
  });

  it('answers PERSISTENCE_UNAVAILABLE and logs when the read fails', async () => {
    const { call, logger } = setup({
      getUsageDimensionTotals: jest.fn(async () => { throw new Error('db closed'); }),
    });
    await expect(call({ sessionId: 'session-1' })).rejects.toMatchObject({
      errorCode: 'PERSISTENCE_UNAVAILABLE',
    });
    expect(logger.warn).toHaveBeenCalledWith('[RPC] usage:getDimensionTotals failed', {
      errorName: 'Error',
    });
  });
});
