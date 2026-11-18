import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { container as rootContainer, type InjectionToken } from 'tsyringe';
import { BOTS_TOKENS, BotApplicationService } from '@ptah-extension/bots';
import { AUTH_PROVIDERS_TOKENS } from '@ptah-extension/auth-providers-tokens';
import { SDK_TOKENS } from '@ptah-extension/agent-sdk';
import { LANE_ROUTING_TOKENS } from '@ptah-extension/lane-routing';
import { registerOutputStyleServices } from '@ptah-extension/output-styles';
import { HARNESS_SYNC_TOKENS } from '@ptah-extension/harness-sync';
import { PLATFORM_TOKENS } from '@ptah-extension/platform-core';
import {
  PERSISTENCE_TOKENS,
  registerPersistenceSqliteServices,
  SqliteBotRepository,
  SqliteConnectionService,
} from '@ptah-extension/persistence-sqlite';
import {
  BotsRpcHandlers,
  registerHarnessServices,
} from '@ptah-extension/rpc-handlers';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import { EXPECTED_RESOLVABLE_TOKENS } from './expected-resolvable';
import { registerBotsComposition } from './register-bots-composition';
import { registerPhase4Handlers } from './phase-4-handlers';

type Method = (params: unknown) => Promise<unknown>;
const collaborators = [
  AUTH_PROVIDERS_TOKENS.SDK_PROVIDER_MODELS,
  HARNESS_SYNC_TOKENS.SOURCE_RESOLVER,
  PLATFORM_TOKENS.WORKSPACE_PROVIDER,
  TOKENS.CONFIG_MANAGER,
  TOKENS.AUTH_SECRETS_SERVICE,
];

// Like container.smoke.spec.ts, register host port fixtures while exercising
// the production persistence, harness, bot adapter and application factories.
function setup(persistence = true) {
  const c = rootContainer.createChildContainer();
  const methods = new Map<string, Method>();
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
  };
  c.registerInstance(TOKENS.LOGGER, logger);
  c.registerInstance(TOKENS.RPC_HANDLER, {
    registerMethod: (name: string, handler: Method) => {
      if (methods.has(name)) throw new Error(`Duplicate method: ${name}`);
      methods.set(name, handler);
    },
  });
  c.registerInstance(PLATFORM_TOKENS.WORKSPACE_PROVIDER, {
    getWorkspaceFolders: () => [],
  });
  c.registerInstance(AUTH_PROVIDERS_TOKENS.SDK_PROVIDER_MODELS, {
    fetchModels: jest.fn(),
  });
  c.registerInstance(HARNESS_SYNC_TOKENS.SOURCE_RESOLVER, {
    resolve: jest.fn(),
  });
  c.registerInstance(TOKENS.CONFIG_MANAGER, { getWithDefault: jest.fn() });
  c.registerInstance(TOKENS.AUTH_SECRETS_SERVICE, {
    getProviderKey: jest.fn(),
  });
  if (persistence) {
    c.registerInstance(PERSISTENCE_TOKENS.SQLITE_DB_PATH, ':memory:');
    registerPersistenceSqliteServices(c, c.resolve<Logger>(TOKENS.LOGGER));
  }
  registerHarnessServices(c);
  return { c, methods, logger, hostLogger: c.resolve<Logger>(TOKENS.LOGGER) };
}

function method(methods: Map<string, Method>, name: string): Method {
  const handler = methods.get(name);
  if (!handler) throw new Error(`Missing method: ${name}`);
  return handler;
}

describe('Electron bots composition (B10)', () => {
  it('boots the real phase 4 registrations and resolves the bots graph', () => {
    const { c, methods, hostLogger } = setup();
    registerOutputStyleServices(c, hostLogger);
    for (const token of [
      LANE_ROUTING_TOKENS.HOST_ROUTING_SETTING,
      LANE_ROUTING_TOKENS.SCOPE_CHECK_SERVICE,
      LANE_ROUTING_TOKENS.ROUTE_DECIDE_SERVICE,
      LANE_ROUTING_TOKENS.DECISION_MODEL_CONFIG,
      SDK_TOKENS.SDK_NEXT_TURN_REMINDER_QUEUE,
      TOKENS.PTAH_API_BUILDER,
    ])
      c.registerInstance(token, {});
    registerPhase4Handlers(c, hostLogger);
    for (const token of [...collaborators, ...Object.values(BOTS_TOKENS)]) {
      expect(c.resolve(token)).toBeDefined();
    }
    expect(c.resolve(PERSISTENCE_TOKENS.BOT_REPOSITORY)).toBeInstanceOf(
      SqliteBotRepository,
    );
    expect(c.resolve(BotsRpcHandlers)).toBeInstanceOf(BotsRpcHandlers);
    expect([...methods.keys()]).toEqual([...BotsRpcHandlers.METHODS]);
  });

  it('resolves all B05 collaborators and every bot service through production factories', () => {
    const { c, hostLogger } = setup();
    registerBotsComposition(c, hostLogger);
    for (const token of collaborators) expect(c.resolve(token)).toBeDefined();
    for (const token of Object.values(BOTS_TOKENS)) {
      const service = c.resolve(token);
      expect(service).toBeDefined();
      expect(c.resolve(token)).toBe(service);
    }
    expect(c.resolve(BOTS_TOKENS.APPLICATION)).toBeInstanceOf(
      BotApplicationService,
    );
    expect(c.resolve(BotsRpcHandlers)).toBeInstanceOf(BotsRpcHandlers);
  });

  it('shares the existing connection and repository singleton, without configuring a clock or opening a DB', () => {
    const { c, hostLogger } = setup();
    const configure = jest.spyOn(SqliteBotRepository.prototype, 'configure');
    const open = jest.spyOn(
      SqliteConnectionService.prototype,
      'openAndMigrate',
    );
    registerBotsComposition(c, hostLogger);
    const connection = c.resolve(PERSISTENCE_TOKENS.SQLITE_CONNECTION);
    const repository = c.resolve(PERSISTENCE_TOKENS.BOT_REPOSITORY);
    expect(repository).toBeInstanceOf(SqliteBotRepository);
    expect(repository).toHaveProperty('connection', connection);
    expect(c.resolve(PERSISTENCE_TOKENS.SQLITE_CONNECTION)).toBe(connection);
    expect(c.resolve(BOTS_TOKENS.APPLICATION)).toHaveProperty(
      'deps.repository',
      repository,
    );
    expect(configure).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    configure.mockRestore();
    open.mockRestore();
  });

  it('serves exactly eleven configuration methods without resolving application or persistence at startup', () => {
    const { c, methods, hostLogger } = setup();
    const resolve = jest.spyOn(c, 'resolve');
    const register = jest.spyOn(c, 'register');
    registerBotsComposition(c, hostLogger);
    expect(register.mock.calls.map(([token]) => token)).toEqual([
      BOTS_TOKENS.WORKSPACE_AUTHORIZATION,
      BOTS_TOKENS.SOURCE_READER,
      BOTS_TOKENS.CATALOG,
      BOTS_TOKENS.APPLICATION,
      BotsRpcHandlers,
    ]);
    expect([...methods.keys()]).toEqual([...BotsRpcHandlers.METHODS]);
    expect(methods.size).toBe(11);
    for (const token of [
      BOTS_TOKENS.APPLICATION,
      PERSISTENCE_TOKENS.BOT_REPOSITORY,
      PERSISTENCE_TOKENS.SQLITE_CONNECTION,
    ]) {
      expect(resolve).not.toHaveBeenCalledWith(token);
    }
    expect(
      [...methods.keys()].some((name) =>
        /execute|run|schedule|trigger/.test(name),
      ),
    ).toBe(false);
  });

  it('registers every method without persistence and resolves storage only on a request', async () => {
    const { c, methods, hostLogger } = setup(false);
    registerBotsComposition(c, hostLogger);
    expect(methods.size).toBe(11);
    await expect(
      method(methods, 'bots:list')({ workspaceRoot: 'D:/work' }),
    ).rejects.toMatchObject({ errorCode: 'PERSISTENCE_UNAVAILABLE' });
    c.registerInstance(BOTS_TOKENS.APPLICATION, {
      list: async () => {
        throw new Error('late application');
      },
    });
    await expect(
      method(methods, 'bots:list')({ workspaceRoot: 'D:/work' }),
    ).rejects.toThrow('Bot request failed.');
    expect(hostLogger.error).toHaveBeenCalled();
  });

  it('supplies the host logger and resolves a replacement application lazily', async () => {
    const { c, methods, logger, hostLogger } = setup();
    registerBotsComposition(c, hostLogger);
    const failure = new Error('host-private detail');
    c.registerInstance(BOTS_TOKENS.APPLICATION, {
      list: async () => {
        throw failure;
      },
    });
    await expect(
      method(methods, 'bots:list')({ workspaceRoot: 'D:/work' }),
    ).rejects.toThrow('Bot request failed.');
    expect(logger.error).toHaveBeenCalledWith(
      'Bot RPC request failed',
      failure,
    );
  });

  it('covers the five bot service tokens and handler in expected-resolvable', () => {
    const { c, hostLogger } = setup();
    registerBotsComposition(c, hostLogger);
    for (const token of [
      ...Object.values(BOTS_TOKENS),
      PERSISTENCE_TOKENS.BOT_REPOSITORY,
      BotsRpcHandlers,
    ]) {
      expect(
        EXPECTED_RESOLVABLE_TOKENS.some(([, value]) => value === token),
      ).toBe(true);
      expect(c.resolve(token as InjectionToken<unknown>)).toBeDefined();
    }
  });

  it('keeps persistence in phase 2 and harness, adapters, services, handler in phase 4 order', () => {
    const phase2 = readFileSync(
      join(__dirname, 'phase-2-libraries.ts'),
      'utf8',
    );
    const phase4 = readFileSync(join(__dirname, 'phase-4-handlers.ts'), 'utf8');
    const helper = readFileSync(
      join(__dirname, 'register-bots-composition.ts'),
      'utf8',
    );
    expect(phase2).toContain(
      'registerPersistenceSqliteServices(container, logger)',
    );
    expect(phase4.indexOf('registerHarnessServices(container)')).toBeLessThan(
      phase4.indexOf('registerBotsComposition(container, logger)'),
    );
    expect(helper.indexOf('registerBotAdapters(container)')).toBeLessThan(
      helper.indexOf('registerBotsServices(container)'),
    );
    expect(helper.indexOf('registerBotsServices(container)')).toBeLessThan(
      helper.indexOf('new BotsRpcHandlers('),
    );
  });
});
