import 'reflect-metadata';
import {
  BotCatalogAdapter,
  BOT_CATALOG_DEADLINE_MS,
} from '../bots/bot-catalog-adapter';
import { container } from 'tsyringe';
import {
  BotApplicationService,
  BotDomainError,
  BOTS_TOKENS,
  registerBotsServices,
  type BotApplicationDependencies,
} from '@ptah-extension/bots';
import {
  BotRepositoryError,
  type BotRepository,
  type StoredBot,
} from '@ptah-extension/persistence-sqlite';
import {
  BotEditableSchema,
  BotsRpcSchemas,
  RPC_METHOD_NAMES,
  type BotDefinition,
  type BotScope,
} from '@ptah-extension/shared';
import { RpcUserError } from '@ptah-extension/vscode-core';
import {
  BotsRpcHandlers,
  type BotApplicationResolver,
} from './bots-rpc.handlers';

jest.mock('@ptah-extension/cli-agent-runtime', () => ({
  resolveCliPath: jest.fn(async () => null),
  PTAH_CLI_AGENTS_CONFIG_KEY: 'ptahCliAgents',
}));
jest.mock('@ptah-extension/agent-sdk', () => ({
  CLAUDE_BUILTIN_TOOL_IDS: ['Read'],
}));

const ROOT = 'C:\\Project';
const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const scope: BotScope = { kind: 'workspace', workspaceRoot: ROOT };
const create = {
  definition: { name: 'Review', instructions: 'Review carefully.', scope },
};

function setup(
  overrides: Partial<BotApplicationDependencies> = {},
  resolver?: BotApplicationResolver,
  roots: readonly string[] = [ROOT],
) {
  const rows = new Map<string, StoredBot>();
  const repository: jest.Mocked<BotRepository> = {
    list: jest.fn<
      ReturnType<BotRepository['list']>,
      Parameters<BotRepository['list']>
    >((requested) =>
      [...rows.values()].filter(
        (row) =>
          !row.definition ||
          JSON.stringify(row.definition.scope) === JSON.stringify(requested),
      ),
    ),
    get: jest.fn<
      ReturnType<BotRepository['get']>,
      Parameters<BotRepository['get']>
    >((id, requested) => {
      const row = rows.get(id);
      return row?.definition &&
        JSON.stringify(row.definition.scope) === JSON.stringify(requested)
        ? row
        : null;
    }),
    revisions: jest.fn<
      ReturnType<BotRepository['revisions']>,
      Parameters<BotRepository['revisions']>
    >(() => []),
    save: jest.fn<
      ReturnType<BotRepository['save']>,
      Parameters<BotRepository['save']>
    >((definition) => {
      rows.set(definition.id, { raw: definition, definition, diagnostics: [] });
      return { changed: true, definition };
    }),
    delete: jest.fn<
      ReturnType<BotRepository['delete']>,
      Parameters<BotRepository['delete']>
    >((id) => {
      rows.delete(id);
      return { revisionsRemoved: 1, imagesRemoved: 0 };
    }),
    stageAvatar: jest.fn<
      ReturnType<BotRepository['stageAvatar']>,
      Parameters<BotRepository['stageAvatar']>
    >((imageId, _scope, mediaType, bytes) => ({
      imageId,
      mediaType,
      bytes,
      ownerBotId: null,
      expiresAt: 10,
    })),
    readAvatar: jest.fn<
      ReturnType<BotRepository['readAvatar']>,
      Parameters<BotRepository['readAvatar']>
    >(() => null),
  };
  const authorize = jest.fn(async (root: string) => {
    const open = roots.find(
      (folder) => folder.toLowerCase() === root.toLowerCase(),
    );
    if (!open) throw new Error('Closed workspace');
    return open;
  });
  const app = new BotApplicationService({
    repository,
    catalog: {
      read: async () => ({
        status: 'available',
        mainProviders: [],
        lanes: [],
        skills: [],
        toolIds: [],
        diagnostics: [],
      }),
    },
    sourceReader: { read: async () => ({ items: [], diagnostics: [] }) },
    workspaceAuthorization: { authorize },
    retentionParticipants: [],
    now: () => 10,
    newId: () => ID,
    ...overrides,
  });
  const methods = new Map<string, (params: unknown) => Promise<unknown>>();
  const resolve = jest.fn(resolver ?? (() => app));
  const logger = { error: jest.fn() };
  const handler = new BotsRpcHandlers(
    {
      registerMethod: (name, callback) => {
        methods.set(name, callback);
      },
    },
    resolve,
    { getWorkspaceFolders: () => [...roots] },
    logger,
  );
  handler.register();
  const call = async (name: string, params: unknown): Promise<unknown> => {
    const callback = methods.get(name);
    if (!callback) throw new Error('Missing handler');
    return callback(params);
  };
  return { app, repository, rows, resolve, methods, call, authorize, logger };
}

describe('BotsRpcHandlers', () => {
  it('creates and updates with unverified selected skills when discovery exceeds the deadline', async () => {
    jest.useFakeTimers();
    try {
      const catalog = new BotCatalogAdapter({
        models: { fetchModels: jest.fn() },
        secrets: { getProviderKey: jest.fn() },
        sources: { resolve: () => new Promise(() => undefined) },
        config: { getWithDefault: jest.fn() },
        logger: { debug: jest.fn() },
      });
      const { call, repository } = setup({ catalog });
      const definition = {
        ...create.definition,
        skills: [{ id: 'unverified' }],
      };
      const pending = call('bots:create', { definition });
      await jest.advanceTimersByTimeAsync(BOT_CATALOG_DEADLINE_MS);
      const created = BotsRpcSchemas['bots:create'].result.parse(await pending);
      expect(created.record.skills).toEqual(definition.skills);
      expect(created.diagnostics.map(({ code }) => code)).toEqual(
        expect.arrayContaining(['SKILLS_UNAVAILABLE', 'SKILL_UNRESOLVED']),
      );
      const update = call('bots:update', {
        id: ID,
        expectedRevision: 1,
        schemaVersion: 2,
        definition: {
          ...BotEditableSchema.strip().parse(created.record),
          skills: [{ id: 'another-unverified' }],
        },
      });
      await jest.advanceTimersByTimeAsync(BOT_CATALOG_DEADLINE_MS);
      expect(
        BotsRpcSchemas['bots:update'].result.parse(await update).record
          .revision,
      ).toBe(2);
      expect(repository.save).toHaveBeenCalledTimes(2);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('registers each method once across composition and runtime surface wiring', () => {
    const registerMethod = jest.fn();
    const handler = new BotsRpcHandlers(
      { registerMethod },
      () => {
        throw new Error('Must stay lazy');
      },
      { getWorkspaceFolders: () => [] },
      { error: jest.fn() },
    );
    handler.register();
    handler.register();
    expect(registerMethod).toHaveBeenCalledTimes(
      BotsRpcHandlers.METHODS.length,
    );
  });

  it('gets, updates and deletes user bots without an open workspace', async () => {
    const { call, authorize } = setup({}, undefined, []);
    const created = BotsRpcSchemas['bots:create'].result.parse(
      await call('bots:create', {
        definition: { ...create.definition, scope: { kind: 'user' } },
      }),
    );
    await expect(call('bots:get', { id: ID })).resolves.toMatchObject({
      record: { scope: { kind: 'user' } },
    });
    const definition = {
      ...BotEditableSchema.strip().parse(created.record),
      name: 'Renamed',
    };
    await expect(
      call('bots:update', {
        id: ID,
        expectedRevision: 1,
        schemaVersion: 2,
        definition,
      }),
    ).resolves.toMatchObject({ record: { name: 'Renamed', revision: 2 } });
    await expect(
      call('bots:delete', {
        id: ID,
        expectedRevision: 2,
        retention: { memory: 'keep', history: 'keep' },
      }),
    ).resolves.toMatchObject({ tombstoned: true });
    expect(authorize).not.toHaveBeenCalled();
  });

  it('cannot find a workspace bot when no folders are open', async () => {
    const { call, rows } = setup({}, undefined, []);
    const record = BotsRpcSchemas['bots:create'].result.parse(
      await setup().call('bots:create', create),
    ).record;
    rows.set(ID, { raw: record, definition: record, diagnostics: [] });
    await expect(call('bots:get', { id: ID })).rejects.toMatchObject({
      errorCode: 'BOT_NOT_FOUND',
    });
  });

  it.each([ROOT, 'C:\\Second'])(
    'gets and updates a bot in open root %s and authorizes every root',
    async (target) => {
      const { call, authorize, repository } = setup({}, undefined, [
        ROOT,
        'C:\\Second',
      ]);
      const created = BotsRpcSchemas['bots:create'].result.parse(
        await call('bots:create', {
          definition: {
            ...create.definition,
            scope: { kind: 'workspace', workspaceRoot: target },
          },
        }),
      );
      authorize.mockClear();
      await expect(call('bots:get', { id: ID })).resolves.toMatchObject({
        record: { scope: { workspaceRoot: target } },
      });
      expect(authorize.mock.calls).toEqual([[ROOT], ['C:\\Second']]);
      const definition = {
        ...BotEditableSchema.strip().parse(created.record),
        name: 'Renamed',
      };
      await expect(
        call('bots:update', {
          id: ID,
          expectedRevision: 1,
          schemaVersion: 2,
          definition,
        }),
      ).resolves.toMatchObject({
        record: { scope: { workspaceRoot: target }, name: 'Renamed' },
      });
      expect(repository.get).toHaveBeenCalledWith(ID, {
        kind: 'workspace',
        workspaceRoot: target,
      });
    },
  );

  it('uses authorizer spelling and deduplicates authorized roots', async () => {
    const { call, repository } = setup(
      { workspaceAuthorization: { authorize: async () => ROOT } },
      undefined,
      [ROOT.toLowerCase(), ROOT],
    );
    await call('bots:create', create);
    repository.get.mockClear();
    await expect(call('bots:get', { id: ID })).resolves.toMatchObject({
      record: { id: ID },
    });
    expect(repository.get.mock.calls).toEqual([
      [ID, { kind: 'user' }],
      [ID, scope],
    ]);
  });

  it('refuses an ID present in multiple scopes instead of choosing or mutating one', async () => {
    const { call, repository } = setup({}, undefined, [ROOT, 'C:\\Second']);
    const record = BotsRpcSchemas['bots:create'].result.parse(
      await call('bots:create', create),
    ).record;
    repository.get.mockImplementation((_id, requested) => {
      const definition = { ...record, scope: requested };
      return { raw: definition, definition, diagnostics: [] };
    });
    await expect(call('bots:get', { id: ID })).rejects.toMatchObject({
      errorCode: 'BOT_REVISION_CONFLICT',
    });
    repository.save.mockClear();
    await expect(
      call('bots:set-enabled', { id: ID, expectedRevision: 1, enabled: false }),
    ).rejects.toMatchObject({ errorCode: 'BOT_REVISION_CONFLICT' });
    expect(repository.save).not.toHaveBeenCalled();
  });

  it.each([
    'BOT_ARCHIVED',
    'BOT_ACTIVE_WORK',
    'BOT_SCHEMA_UNSUPPORTED',
    'UNAUTHORIZED_WORKSPACE',
  ] as const)('preserves %s while withholding domain paths', async (code) => {
    const { call, app, logger } = setup();
    jest
      .spyOn(app, 'get')
      .mockRejectedValue(
        new BotDomainError(code, 'private C:\\Users\\secret /home/secret'),
      );
    await expect(call('bots:get', { id: ID })).rejects.toMatchObject({
      errorCode: code,
      message: 'Bot request was refused.',
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it.each([
    new Error('private C:\\secret stack'),
    new RpcUserError('private /secret', 'INVALID_PARAMS'),
    'private /secret',
  ])(
    'logs unexpected errors and emits a generic internal failure: %p',
    async (error) => {
      const { call, app, logger } = setup();
      jest.spyOn(app, 'get').mockRejectedValue(error);
      const response = call('bots:get', { id: ID });
      await expect(response).rejects.toThrow('Bot request failed.');
      await expect(response).rejects.not.toBeInstanceOf(RpcUserError);
      expect(logger.error).toHaveBeenCalledWith(
        'Bot RPC request failed',
        error instanceof Error ? error : { error },
      );
    },
  );

  it('logs an invalid application reply as an internal failure', async () => {
    const { call, app, logger } = setup();
    const created = BotsRpcSchemas['bots:create'].result.parse(
      await call('bots:create', create),
    );
    jest.spyOn(app, 'get').mockResolvedValue({
      executionAvailable: false,
      record: { ...created.record, name: '' },
      diagnostics: [],
    });
    await expect(call('bots:get', { id: ID })).rejects.toThrow(
      'Bot request failed.',
    );
    expect(logger.error).toHaveBeenCalledWith(
      'Bot RPC request failed',
      expect.any(Error),
    );
  });
  it('delegates preview and avatar methods with validated replies and host context', async () => {
    const { call, app } = setup();
    const preview = jest.spyOn(app, 'previewImport').mockResolvedValue({
      executionAvailable: false,
      items: [],
      diagnostics: [],
    });
    const upload = jest
      .spyOn(app, 'uploadAvatar')
      .mockResolvedValue({ imageId: ID });
    const get = jest
      .spyOn(app, 'getAvatar')
      .mockResolvedValue({ mediaType: 'image/png', dataBase64: 'AAAA' });
    const input = {
      source: { kind: 'preset', presetId: 'preset' },
      targetScope: scope,
    };
    await expect(call('bots:preview-import', input)).resolves.toMatchObject({
      executionAvailable: false,
      items: [],
    });
    expect(preview).toHaveBeenCalledWith(input);
    const avatar = { scope, mediaType: 'image/png', dataBase64: 'AAAA' };
    await expect(call('bots:upload-avatar', avatar)).resolves.toEqual({
      imageId: ID,
    });
    expect(upload).toHaveBeenCalledWith(avatar);
    await expect(
      call('bots:get-avatar', { botId: ID, imageId: ID }),
    ).resolves.toEqual({ mediaType: 'image/png', dataBase64: 'AAAA' });
    expect(get).toHaveBeenCalledWith({ botId: ID, imageId: ID }, [ROOT]);
  });

  it('serves update, archive and restore through the application', async () => {
    const { call } = setup();
    const created = BotsRpcSchemas['bots:create'].result.parse(
      await call('bots:create', create),
    );
    const definition = {
      ...BotEditableSchema.strip().parse(created.record),
      name: 'Updated',
    };
    await expect(
      call('bots:update', {
        id: ID,
        expectedRevision: 1,
        schemaVersion: 2,
        definition,
      }),
    ).resolves.toMatchObject({ record: { id: ID } });
    await expect(
      call('bots:archive', { id: ID, expectedRevision: 2 }),
    ).resolves.toMatchObject({ record: { enabled: false, archivedAt: 10 } });
    await expect(
      call('bots:restore', { id: ID, expectedRevision: 3 }),
    ).resolves.toMatchObject({ record: { enabled: false, archivedAt: null } });
  });
  it('registers all eleven methods once without resolving storage', () => {
    const { methods, resolve } = setup();
    expect([...methods.keys()]).toEqual(BotsRpcHandlers.METHODS);
    expect(BotsRpcHandlers.METHODS).toHaveLength(11);
    expect(Object.keys(BotsRpcSchemas)).toEqual(BotsRpcHandlers.METHODS);
    for (const method of BotsRpcHandlers.METHODS)
      expect(RPC_METHOD_NAMES.filter((name) => name === method)).toHaveLength(
        1,
      );
    expect(resolve).not.toHaveBeenCalled();
  });

  it.each(['repository', 'application'])(
    'sanitizes an unbound %s resolver failure',
    async (kind) => {
      const child = container.createChildContainer();
      if (kind === 'repository') registerBotsServices(child);
      const resolver: BotApplicationResolver = () =>
        child.resolve<BotApplicationService>(BOTS_TOKENS.APPLICATION);
      const { call } = setup({}, resolver);
      await expect(call('bots:get', { id: ID })).rejects.toMatchObject({
        errorCode: 'PERSISTENCE_UNAVAILABLE',
        message: 'Bot storage is unavailable.',
      });
      await expect(call('bots:get', { id: ID })).rejects.toBeInstanceOf(
        RpcUserError,
      );
    },
  );

  it('rejects renderer workspace paths on ID-based operations and uses host context', async () => {
    const { call, authorize, resolve } = setup();
    await expect(
      call('bots:get', { id: ID, workspaceRoot: 'C:\\Other' }),
    ).rejects.toMatchObject({ errorCode: 'INVALID_PARAMS' });
    expect(resolve).not.toHaveBeenCalled();
    await expect(call('bots:get', { id: ID })).rejects.toMatchObject({
      errorCode: 'BOT_NOT_FOUND',
    });
    expect(authorize).toHaveBeenCalledWith(ROOT);
  });

  it('upgrades a V1 stored snapshot and historical revision to a V2 get reply', async () => {
    const { call, rows, repository } = setup();
    const created = BotsRpcSchemas['bots:create'].result.parse(
      await call('bots:create', create),
    );
    const { origin, ...fields } = created.record;
    void origin;
    const legacy: BotDefinition = {
      ...fields,
      schemaVersion: 1,
      runtime: { providerId: 'old', modelId: 'explicit' },
    };
    rows.set(ID, { raw: legacy, definition: legacy, diagnostics: [] });
    expect(await call('bots:get', { id: ID })).toMatchObject({
      record: {
        schemaVersion: 2,
        runtime: { kind: 'main', model: 'explicit' },
      },
    });
    rows.set(ID, {
      raw: created.record,
      definition: { ...created.record, revision: 2 },
      diagnostics: [],
    });
    repository.revisions.mockReturnValue([
      {
        botId: ID,
        revision: 1,
        schemaVersion: 1,
        definitionJson: JSON.stringify(legacy),
        createdAt: 10,
      },
    ]);
    expect(await call('bots:get', { id: ID, revision: 1 })).toMatchObject({
      record: { schemaVersion: 2, revision: 1 },
    });
  });

  it('hides tombstones even when get requests an old revision', async () => {
    const { call } = setup();
    await call('bots:create', create);
    await expect(
      call('bots:delete', {
        id: ID,
        expectedRevision: 1,
        retention: { memory: 'keep', history: 'keep' },
      }),
    ).resolves.toMatchObject({ tombstoned: true });
    for (const params of [{ id: ID }, { id: ID, revision: 1 }])
      await expect(call('bots:get', params)).rejects.toMatchObject({
        errorCode: 'BOT_NOT_FOUND',
      });
  });

  it('preserves unreadable items and unidentified row count in list replies', async () => {
    const { call, repository } = setup();
    repository.list
      .mockReturnValueOnce([
        {
          raw: { id: ID, schemaVersion: 99 },
          definition: null,
          diagnostics: ['unsupported-schema-version'],
        },
        { raw: {}, definition: null, diagnostics: ['invalid-row'] },
      ])
      .mockReturnValueOnce([]);
    await expect(
      call('bots:list', { workspaceRoot: ROOT }),
    ).resolves.toMatchObject({
      summaries: [],
      unidentifiedRowCount: 1,
      unreadable: [{ id: ID, schemaVersion: 99 }],
    });
  });

  it('maps optimistic concurrency conflicts to the typed refusal', async () => {
    const { call, repository } = setup();
    await call('bots:create', create);
    repository.save.mockImplementation(() => {
      throw new BotRepositoryError('conflict', 'private database path');
    });
    await expect(
      call('bots:set-enabled', { id: ID, expectedRevision: 1, enabled: false }),
    ).rejects.toMatchObject({ errorCode: 'BOT_REVISION_CONFLICT' });
    await expect(
      call('bots:archive', { id: ID, expectedRevision: 2 }),
    ).rejects.toMatchObject({ errorCode: 'BOT_REVISION_CONFLICT' });
  });

  it('refuses retention deletion when external ownership cannot be removed', async () => {
    const { call, repository } = setup({
      retentionParticipants: [
        {
          inspect: () => ({
            memory: 1,
            history: 0,
            activeWork: false,
            supported: true,
          }),
        },
      ],
    });
    await call('bots:create', create);
    await expect(
      call('bots:delete', {
        id: ID,
        expectedRevision: 1,
        retention: { memory: 'purge', history: 'purge' },
      }),
    ).rejects.toMatchObject({ errorCode: 'BOT_RETENTION_UNAVAILABLE' });
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it('rejects unknown fields, malformed data and newer write schemas before resolving', async () => {
    const { call, resolve } = setup();
    for (const params of [
      { ...create, extra: true },
      { ...create, schemaVersion: 3 },
      { definition: { name: '' } },
    ])
      await expect(call('bots:create', params)).rejects.toMatchObject({
        errorCode: 'INVALID_PARAMS',
      });
    await expect(
      call('bots:update', {
        id: ID,
        expectedRevision: 1,
        schemaVersion: 3,
        definition: BotEditableSchema.parse({
          ...create.definition,
          description: '',
          runtime: { kind: 'default' },
          skills: [],
          memoryScope: { kind: 'private' },
          toolRequirements: { allow: [], deny: [] },
          triggers: [],
          approvalRules: { mode: 'ask' },
        }),
      }),
    ).rejects.toMatchObject({ errorCode: 'INVALID_PARAMS' });
    expect(resolve).not.toHaveBeenCalled();
  });
});
