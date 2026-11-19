import 'reflect-metadata';
import fs, { mkdtempSync, rmSync, type WriteStream } from 'node:fs';
import { finished } from 'node:stream/promises';
import os from 'os';
import { join } from 'node:path';
import { container as rootContainer } from 'tsyringe';
import { BOTS_TOKENS, BotApplicationService } from '@ptah-extension/bots';
import {
  AUTH_PROVIDERS_TOKENS,
  OpenRouterPricingService,
} from '@ptah-extension/auth-providers';
import { HARNESS_SYNC_TOKENS } from '@ptah-extension/harness-sync';
import { HARNESS_TOKENS, BotsRpcHandlers } from '@ptah-extension/rpc-handlers';
import {
  ContentDownloadService,
  PLATFORM_TOKENS,
  type IWorkspaceProvider,
} from '@ptah-extension/platform-core';
import { RepositoryIdentityBackfillService } from '@ptah-extension/usage-analytics';
import {
  PERSISTENCE_TOKENS,
  SqliteBotRepository,
  SqliteSessionUsageSink,
  type SqliteConnectionService,
  registerSessionStoreServices,
  registerPersistenceSqliteServices,
} from '@ptah-extension/persistence-sqlite';
import {
  TOKENS,
  type Logger,
  type RpcHandler,
} from '@ptah-extension/vscode-core';
import { createMockLogger } from '@ptah-extension/shared/testing';
import { registerBotsComposition } from './register-bots-composition';
import { CliDIContainer } from './container';
import { PromptCacheService } from '@ptah-extension/agent-generation';
import { ProcessStartTimeProbe } from '@ptah-extension/agent-sdk';
import type { CliWorkspaceProvider } from '@ptah-extension/platform-cli';
// eslint-disable-next-line @nx/enforce-module-boundaries -- Test-only access to an unexported constructor; production exports are outside this batch.
import { SkillsShSourceRootService } from '../../../rpc-handlers/src/lib/skills-sh/skills-sh-source-root.service';

// Keep real service registration, but do not start unrelated background jobs.
jest.mock('@ptah-extension/persistence-sqlite', () => {
  const actual = jest.requireActual<
    typeof import('@ptah-extension/persistence-sqlite')
  >('@ptah-extension/persistence-sqlite');
  return {
    ...actual,
    registerSessionStoreServices: jest.fn(actual.registerSessionStoreServices),
  };
});
jest.mock('@ptah-extension/task-specs', () => ({
  ...jest.requireActual<typeof import('@ptah-extension/task-specs')>(
    '@ptah-extension/task-specs',
  ),
  startTaskSpecsIndex: jest.fn<
    ReturnType<typeof import('@ptah-extension/task-specs').startTaskSpecsIndex>,
    Parameters<typeof import('@ptah-extension/task-specs').startTaskSpecsIndex>
  >(() => ({ dispose: (): void => undefined })),
}));
jest.mock('@ptah-extension/session-organization', () => ({
  ...jest.requireActual<typeof import('@ptah-extension/session-organization')>(
    '@ptah-extension/session-organization',
  ),
  startSessionOrganization: jest.fn<
    ReturnType<
      typeof import('@ptah-extension/session-organization').startSessionOrganization
    >,
    Parameters<
      typeof import('@ptah-extension/session-organization').startSessionOrganization
    >
  >(() => ({ dispose: (): void => undefined })),
}));
jest.mock('@ptah-extension/lane-outcomes', () => ({
  ...jest.requireActual<typeof import('@ptah-extension/lane-outcomes')>(
    '@ptah-extension/lane-outcomes',
  ),
  startAndRegisterLaneOutcomes: jest.fn<
    ReturnType<
      typeof import('@ptah-extension/lane-outcomes').startAndRegisterLaneOutcomes
    >,
    Parameters<
      typeof import('@ptah-extension/lane-outcomes').startAndRegisterLaneOutcomes
    >
  >(() => undefined),
}));
jest.mock('./bootstrap/session-store-migration', () => ({
  runCliSessionStoreMigration: jest.fn(async (): Promise<void> => undefined),
}));

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
      // A sibling of the composed host has no application registration and
      // cannot inherit it. The handler still resolves lazily on invocation.
      const unbound = rootContainer.createChildContainer();
      const handler =
        missing === 'application'
          ? new BotsRpcHandlers(
              container.resolve<RpcHandler>(TOKENS.RPC_HANDLER),
              () =>
                unbound.resolve<BotApplicationService>(BOTS_TOKENS.APPLICATION),
              container.resolve<IWorkspaceProvider>(
                PLATFORM_TOKENS.WORKSPACE_PROVIDER,
              ),
              logger,
            )
          : container.resolve(BotsRpcHandlers);
      if (missing === 'application') {
        expect(unbound.isRegistered(BOTS_TOKENS.APPLICATION, true)).toBe(false);
        expect(container.isRegistered(BOTS_TOKENS.APPLICATION)).toBe(true);
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

  describe('real CLI container bootstrap', () => {
    let temporaryDirectory: string;
    let outputStreams: WriteStream[];
    let previousDbPath: string | undefined;
    let previousSessionsDbPath: string | undefined;
    let previousSettingsDirectory: string | undefined;

    beforeEach(() => {
      // Pricing warmup is unrelated to composition and would fetch a live catalog.
      jest
        .spyOn(OpenRouterPricingService.prototype, 'fetchAndRegister')
        .mockResolvedValue([]);
      // Fail the case if another startup path attempts a fetch, without networking.
      jest
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(
          new Error('Network requests are disabled in composition tests'),
        );
      outputStreams = [];
      const createWriteStream = fs.createWriteStream;
      jest.spyOn(fs, 'createWriteStream').mockImplementation((...args) => {
        const stream = createWriteStream(...args);
        outputStreams.push(stream);
        return stream;
      });
      temporaryDirectory = mkdtempSync(
        join(os.tmpdir(), 'ptah-bots-composition-'),
      );
      previousDbPath = process.env['PTAH_DB_PATH'];
      previousSessionsDbPath = process.env['PTAH_SESSIONS_DB_PATH'];
      previousSettingsDirectory = process.env['PTAH_SETTINGS_DIR'];
      process.env['PTAH_SETTINGS_DIR'] = temporaryDirectory;
      jest.mocked(registerSessionStoreServices).mockClear();
      jest
        .spyOn(SqliteSessionUsageSink.prototype, 'startFinalizer')
        .mockImplementation(() => undefined);
      process.env['PTAH_DB_PATH'] = join(temporaryDirectory, 'ptah.sqlite');
      process.env['PTAH_SESSIONS_DB_PATH'] = join(
        temporaryDirectory,
        'sessions.sqlite',
      );
      // Some host adapters derive cache and content paths from the home directory.
      jest.spyOn(os, 'homedir').mockReturnValue(temporaryDirectory);
      // CLI's real file-manager adapter lacks disposeWatcher. This test never
      // starts prompt-cache watchers; isolate its unrelated shutdown defect.
      jest
        .spyOn(PromptCacheService.prototype, 'dispose')
        .mockImplementation(() => undefined);
      jest
        .spyOn(ContentDownloadService.prototype, 'ensureContent')
        .mockRejectedValue(
          new Error('Content downloads are disabled in composition tests'),
        );
      jest
        .spyOn(RepositoryIdentityBackfillService.prototype, 'start')
        .mockImplementation(() => undefined);
    });

    afterEach(async () => {
      const container = CliDIContainer.activeContainer;
      try {
        if (container?.isRegistered(PLATFORM_TOKENS.WORKSPACE_PROVIDER)) {
          container
            .resolve<CliWorkspaceProvider>(PLATFORM_TOKENS.WORKSPACE_PROVIDER)
            .fileSettings.disposeCrossProcessWatch();
        }
        CliDIContainer.flushSync();
        CliDIContainer.disposeDiagnostics();
        await CliDIContainer.disposeHostRuntime();
        if (container?.isRegistered(PERSISTENCE_TOKENS.SQLITE_CONNECTION)) {
          container
            .resolve<SqliteConnectionService>(
              PERSISTENCE_TOKENS.SQLITE_CONNECTION,
            )
            .close();
        }
        for (const result of jest.mocked(registerSessionStoreServices).mock
          .results) {
          if (result.type === 'return') result.value.database.close();
        }
        await container?.dispose();
        for (const stream of outputStreams) {
          if (!stream.writableEnded) stream.end();
          await finished(stream);
        }
        expect(globalThis.fetch).not.toHaveBeenCalled();
      } finally {
        jest.restoreAllMocks();
        if (previousDbPath === undefined) delete process.env['PTAH_DB_PATH'];
        else process.env['PTAH_DB_PATH'] = previousDbPath;
        if (previousSessionsDbPath === undefined)
          delete process.env['PTAH_SESSIONS_DB_PATH'];
        else process.env['PTAH_SESSIONS_DB_PATH'] = previousSessionsDbPath;
        if (previousSettingsDirectory === undefined)
          delete process.env['PTAH_SETTINGS_DIR'];
        else process.env['PTAH_SETTINGS_DIR'] = previousSettingsDirectory;
        rmSync(temporaryDirectory, { recursive: true, force: true });
      }
    });

    it.each(['minimal', 'full'] as const)(
      'resolves bots and harness services from the %s CLI container',
      async (bootstrapMode) => {
        const child = rootContainer.createChildContainer();
        // Prebind metadata-sensitive constructors before full-mode RPC setup.
        child.register(SkillsShSourceRootService, {
          useFactory: (c) =>
            new SkillsShSourceRootService(
              c.resolve<Logger>(TOKENS.LOGGER),
              temporaryDirectory,
            ),
        });
        child.registerInstance(
          ProcessStartTimeProbe,
          new ProcessStartTimeProbe(),
        );
        jest
          .spyOn(rootContainer, 'createChildContainer')
          .mockReturnValueOnce(child);
        const result = CliDIContainer.setup({
          bootstrapMode,
          userDataPath: temporaryDirectory,
          workspacePath: temporaryDirectory,
          logsPath: join(temporaryDirectory, 'logs'),
        });
        await result.workspaceReady;
        for (const token of [
          ...Object.values(BOTS_TOKENS),
          ...Object.values(HARNESS_TOKENS),
        ]) {
          expect(result.container.isRegistered(token)).toBe(true);
          expect(result.container.resolve(token)).toBeInstanceOf(Object);
        }
        expect(
          result.container.resolve(BOTS_TOKENS.APPLICATION),
        ).toBeInstanceOf(BotApplicationService);
        expect(
          result.container.resolve(PERSISTENCE_TOKENS.BOT_REPOSITORY),
        ).toBeInstanceOf(SqliteBotRepository);
        expect(result.container.isRegistered(BotsRpcHandlers)).toBe(
          bootstrapMode === 'full',
        );
      },
    );
  });
});
