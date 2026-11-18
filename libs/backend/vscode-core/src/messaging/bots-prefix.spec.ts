import 'reflect-metadata';
import { container } from 'tsyringe';
import { TOKENS } from '../di/tokens';
import { RpcHandler } from './rpc-handler';

describe('RpcHandler bots prefix gate', () => {
  let handler: RpcHandler;

  beforeEach(() => {
    const testContainer = container.createChildContainer();
    testContainer.registerInstance(TOKENS.LOGGER, {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    });
    handler = testContainer.resolve(RpcHandler);
  });

  it('does not activate methods merely by permitting the prefix', () => {
    expect(handler.getRegisteredMethods()).toEqual([]);
  });

  it('registers and dispatches a bots method', async () => {
    const listBots = jest.fn().mockResolvedValue({ bots: [] });

    expect(() => handler.registerMethod('bots:list', listBots)).not.toThrow();
    expect(handler.getRegisteredMethods()).toEqual(['bots:list']);

    await expect(
      handler.handleMessage({
        method: 'bots:list',
        params: {},
        correlationId: 'bots-prefix-test',
      }),
    ).resolves.toMatchObject({ success: true, data: { bots: [] } });
    expect(listBots).toHaveBeenCalledTimes(1);
  });

  it.each(['bot:x', 'botsx:y', 'BOTS:list', 'malicious:hack'])(
    'rejects invalid prefix in %s without registering it',
    (method) => {
      expect(() => handler.registerMethod(method, async () => ({}))).toThrow(
        `Invalid method name "${method}" - must start with allowed prefix:`,
      );
      expect(handler.getRegisteredMethods()).toEqual([]);
    },
  );
});
