import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { container as rootContainer } from 'tsyringe';
import { BOTS_TOKENS, BotApplicationService } from '@ptah-extension/bots';
import { AUTH_PROVIDERS_TOKENS } from '@ptah-extension/auth-providers';
import { HARNESS_SYNC_TOKENS } from '@ptah-extension/harness-sync';
import { HARNESS_TOKENS, BotsRpcHandlers } from '@ptah-extension/rpc-handlers';
import { PLATFORM_TOKENS } from '@ptah-extension/platform-core';
import {
  PERSISTENCE_TOKENS,
  SqliteBotRepository,
  registerPersistenceSqliteServices,
} from '@ptah-extension/persistence-sqlite';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import { createMockLogger } from '@ptah-extension/shared/testing';
import { registerBotsComposition } from './register-bots-composition';

function host(repository = true) {
  const container = rootContainer.createChildContainer();
  const methods = new Map<string, (params: unknown) => Promise<unknown>>();
  container.registerInstance(TOKENS.LOGGER, createMockLogger());
  const logger = container.resolve<Logger>(TOKENS.LOGGER);
  container.registerInstance(TOKENS.RPC_HANDLER, {
    registerMethod: (
      name: string,
      handler: (params: unknown) => Promise<unknown>,
    ) => {
      methods.set(name, handler);
    },
  });
  container.registerInstance(PLATFORM_TOKENS.WORKSPACE_PROVIDER, {
    getWorkspaceFolders: () => [],
    getWorkspaceRoot: () => undefined,
  });
  container.registerInstance(PLATFORM_TOKENS.DI_CONTAINER, container);
  container.registerInstance(AUTH_PROVIDERS_TOKENS.SDK_PROVIDER_MODELS, {
    fetchModels: jest.fn(),
  });
  container.registerInstance(HARNESS_SYNC_TOKENS.SOURCE_RESOLVER, {
    resolve: jest.fn(),
  });
  container.registerInstance(TOKENS.CONFIG_MANAGER, {
    getWithDefault: jest.fn(),
  });
  container.registerInstance(TOKENS.AUTH_SECRETS_SERVICE, {
    getProviderKey: jest.fn(),
  });
  if (repository) {
    container.registerInstance(PERSISTENCE_TOKENS.SQLITE_DB_PATH, ':memory:');
    registerPersistenceSqliteServices(container, logger);
    // The real persistence helper binds the repository; opening the connection is lazy.
    container.registerInstance(PERSISTENCE_TOKENS.SQLITE_CONNECTION, {
      db: null,
    });
  }
  return { container, logger, methods };
}

describe('CLI bots composition', () => {
  it('resolves all bot tokens and catalog prerequisites with RPC disabled', () => {
    const { container, logger, methods } = host();
    registerBotsComposition(container, logger, false);
    for (const token of [
      AUTH_PROVIDERS_TOKENS.SDK_PROVIDER_MODELS,
      HARNESS_SYNC_TOKENS.SOURCE_RESOLVER,
      PLATFORM_TOKENS.WORKSPACE_PROVIDER,
      TOKENS.CONFIG_MANAGER,
      TOKENS.AUTH_SECRETS_SERVICE,
      ...Object.values(BOTS_TOKENS),
    ]) {
      expect(container.resolve(token)).toBeDefined();
    }
    expect(container.resolve(BOTS_TOKENS.APPLICATION)).toBeInstanceOf(
      BotApplicationService,
    );
    expect(container.resolve(PERSISTENCE_TOKENS.BOT_REPOSITORY)).toBeInstanceOf(
      SqliteBotRepository,
    );
    expect(methods.size).toBe(0);
    expect(container.isRegistered(BotsRpcHandlers)).toBe(false);
  });

  it.each(['repository', 'application'] as const)(
    'starts and registers methods with an unbound %s; resolution fails only on invocation',
    async (missing) => {
      const { container, logger, methods } = host(false);
      expect(() =>
        registerBotsComposition(container, logger, true),
      ).not.toThrow();
      const handler = container.resolve(BotsRpcHandlers);
      if (missing === 'application') {
        // reset removes every binding, then restore the host ports used by the handler.
        container.reset();
        container.registerInstance(PLATFORM_TOKENS.WORKSPACE_PROVIDER, {
          getWorkspaceFolders: () => [],
        });
      }
      expect(() => handler.register()).not.toThrow();
      expect([...methods.keys()]).toEqual([...BotsRpcHandlers.METHODS]);
      const list = methods.get('bots:list');
      if (!list) throw new Error('bots:list was not registered');
      await expect(
        list({ workspaceRoot: process.cwd(), scopeFilter: 'all' }),
      ).rejects.toMatchObject({ errorCode: 'PERSISTENCE_UNAVAILABLE' });
    },
  );

  it.each([false, true])(
    'keeps one harness health subscription and one owner disposal (RPC=%s)',
    async (enableRpc) => {
      const { container, logger } = host();
      const dispose = jest.fn();
      const onHealth = jest.fn();
      class ReconcilerOwner {
        onHealth = onHealth;
        dispose = dispose;
      }
      container.registerSingleton(
        HARNESS_SYNC_TOKENS.RECONCILER,
        ReconcilerOwner,
      );
      container.registerInstance(HARNESS_SYNC_TOKENS.PROPAGATION, {});
      container.registerInstance(HARNESS_SYNC_TOKENS.BLOCKED_REPAIR, {});
      registerBotsComposition(container, logger, enableRpc);
      const first = container.resolve(HARNESS_TOKENS.HEALTH);
      expect(container.resolve(HARNESS_TOKENS.HEALTH)).toBe(first);
      expect(onHealth).toHaveBeenCalledTimes(1);
      await container.dispose();
      expect(dispose).toHaveBeenCalledTimes(1);
    },
  );

  it('resolves the application at request time and forwards failures to the host logger', async () => {
    const { container, logger, methods } = host(false);
    const error = jest.spyOn(logger, 'error');
    registerBotsComposition(container, logger, true);
    container.resolve(BotsRpcHandlers).register();
    const failure = new Error('test application failure');
    container.registerInstance(BOTS_TOKENS.APPLICATION, {
      list: async () => {
        throw failure;
      },
    });
    const list = methods.get('bots:list');
    if (!list) throw new Error('bots:list was not registered');
    await expect(list({ workspaceRoot: process.cwd() })).rejects.toThrow(
      'Bot request failed.',
    );
    expect(error).toHaveBeenCalledWith('Bot RPC request failed', failure);
  });

  it('calls domain composition once after Thoth, outside the optional RPC branch', () => {
    const source = readFileSync(join(__dirname, 'container.ts'), 'utf8');
    const call = source.indexOf(
      'registerBotsComposition(container, logger, bootstrapMode',
    );
    expect(call).toBeGreaterThan(
      source.indexOf('registerThothLibraries(container, logger)'),
    );
    expect(call).toBeLessThan(source.indexOf("if (bootstrapMode === 'full')"));
    expect(source.match(/registerBotsComposition\(container/g)).toHaveLength(1);
    expect(source).not.toContain('registerHarnessServices');
  });
});
