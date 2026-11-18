import { container, type DependencyContainer } from 'tsyringe';
import {
  BotRepositoryError,
  PERSISTENCE_TOKENS,
  type BotRepository,
} from '@ptah-extension/persistence-sqlite';
import { type BotScope, type BotDefinition } from '@ptah-extension/shared';
import { BotApplicationService } from './bot-application.service';
import {
  BOTS_TOKENS,
  type BotCatalogPort,
  type BotSourceReaderPort,
  type BotWorkspaceAuthorizationPort,
} from './bot-ports';
import { registerBotsServices } from './register-bots-services';

const ROOT = 'C:\\Project';
const OTHER_ROOT = 'C:\\Other';
const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const catalog: BotCatalogPort = {
  read: async () => ({
    status: 'available',
    mainProviders: [],
    lanes: [],
    skills: [],
    toolIds: [],
    diagnostics: [],
  }),
};
const sourceReader: BotSourceReaderPort = {
  read: async () => ({ items: [], diagnostics: [] }),
};
const workspaceAuthorization: BotWorkspaceAuthorizationPort = {
  authorize: async (root) => {
    if (root.toLowerCase() === ROOT.toLowerCase()) return ROOT;
    if (root.toLowerCase() === OTHER_ROOT.toLowerCase()) return OTHER_ROOT;
    throw new Error('Not open.');
  },
};
function fakeRepository(): BotRepository {
  return {
    list: () => [],
    get: () => null,
    revisions: () => [],
    save: (definition: BotDefinition) => ({ changed: true, definition }),
    delete: () => ({ revisionsRemoved: 0, imagesRemoved: 0 }),
    stageAvatar: () => {
      throw new Error('Unexpected avatar staging.');
    },
    readAvatar: () => null,
  };
}
function bindPorts(
  child: DependencyContainer,
  repository: BotRepository,
): void {
  child.registerInstance(PERSISTENCE_TOKENS.BOT_REPOSITORY, repository);
  child.registerInstance(BOTS_TOKENS.SOURCE_READER, sourceReader);
  child.registerInstance(BOTS_TOKENS.CATALOG, catalog);
  child.registerInstance(
    BOTS_TOKENS.WORKSPACE_AUTHORIZATION,
    workspaceAuthorization,
  );
}

describe('registerBotsServices', () => {
  it('does not resolve any dependency while registering, including throwing factories', () => {
    const child = container.createChildContainer();
    const resolve = jest.fn(() => {
      throw new Error('Resolved too early.');
    });
    for (const token of [
      PERSISTENCE_TOKENS.BOT_REPOSITORY,
      BOTS_TOKENS.SOURCE_READER,
      BOTS_TOKENS.CATALOG,
      BOTS_TOKENS.WORKSPACE_AUTHORIZATION,
    ])
      child.register(token, { useFactory: resolve });
    expect(() => registerBotsServices(child)).not.toThrow();
    expect(resolve).not.toHaveBeenCalled();
    expect(child.isRegistered(BOTS_TOKENS.APPLICATION)).toBe(true);
  });
  it('resolves one cached application from typed port fakes', () => {
    const child = container.createChildContainer();
    const repository = fakeRepository();
    const save = jest.spyOn(repository, 'save');
    bindPorts(child, repository);
    registerBotsServices(child);
    const first = child.resolve<BotApplicationService>(BOTS_TOKENS.APPLICATION);
    expect(first).toBeInstanceOf(BotApplicationService);
    expect(child.resolve<BotApplicationService>(BOTS_TOKENS.APPLICATION)).toBe(
      first,
    );
    expect(save).not.toHaveBeenCalled();
  });
  it('defers an unbound repository failure until application resolution', () => {
    const child = container.createChildContainer();
    expect(child.isRegistered(PERSISTENCE_TOKENS.BOT_REPOSITORY, true)).toBe(
      false,
    );
    expect(() =>
      registerBotsServices(child, {
        catalog,
        sourceReader,
        workspaceAuthorization,
      }),
    ).not.toThrow();
    expect(() => child.resolve(BOTS_TOKENS.APPLICATION)).toThrow();
  });
  it('defaults omitted create scope to authorized spelling and preserves explicit scopes', async () => {
    const child = container.createChildContainer();
    const repository = fakeRepository();
    const save = jest.spyOn(repository, 'save');
    bindPorts(child, repository);
    registerBotsServices(child, { newId: () => ID });
    const service = child.resolve<BotApplicationService>(
      BOTS_TOKENS.APPLICATION,
    );
    const definition = { name: 'Scope test', instructions: 'Text' };
    const implicit = await service.create({ definition }, ROOT.toLowerCase());
    expect(implicit.record.scope).toEqual({
      kind: 'workspace',
      workspaceRoot: ROOT,
    });
    const userScope: BotScope = { kind: 'user' };
    expect(
      (
        await service.create(
          { definition: { ...definition, scope: userScope } },
          ROOT,
        )
      ).record.scope,
    ).toEqual(userScope);
    const explicitScope: BotScope = {
      kind: 'workspace',
      workspaceRoot: OTHER_ROOT.toLowerCase(),
    };
    expect(
      (
        await service.create(
          { definition: { ...definition, scope: explicitScope } },
          ROOT,
        )
      ).record.scope,
    ).toEqual({ kind: 'workspace', workspaceRoot: OTHER_ROOT });
    expect(save.mock.calls.map(([record]) => record.scope)).toEqual([
      { kind: 'workspace', workspaceRoot: ROOT },
      userScope,
      { kind: 'workspace', workspaceRoot: OTHER_ROOT },
    ]);
  });
  it.each([
    ['conflict', 'BOT_REVISION_CONFLICT'],
    ['scope-denied', 'UNAUTHORIZED_WORKSPACE'],
    ['not-found', 'BOT_NOT_FOUND'],
    ['invalid', 'INVALID_PARAMS'],
    ['quota', 'INVALID_PARAMS'],
  ] as const)(
    'maps repository %s to %s without retry',
    async (code, expectedCode) => {
      const repository = fakeRepository();
      const save = jest.spyOn(repository, 'save').mockImplementation(() => {
        throw new BotRepositoryError(code, 'private storage failure');
      });
      const child = container.createChildContainer();
      registerBotsServices(child, {
        repository,
        catalog,
        sourceReader,
        workspaceAuthorization,
      });
      const service = child.resolve<BotApplicationService>(
        BOTS_TOKENS.APPLICATION,
      );
      await expect(
        service.create({
          definition: {
            name: 'Refusal',
            instructions: 'Text',
            scope: { kind: 'user' },
          },
        }),
      ).rejects.toMatchObject({
        code: expectedCode,
        message: 'Bot storage refused the operation.',
      });
      expect(save).toHaveBeenCalledTimes(1);
    },
  );
  it('maps unknown repository failures to dependency unavailability', async () => {
    const repository = fakeRepository();
    jest.spyOn(repository, 'save').mockImplementation(() => {
      throw new Error('private details');
    });
    const child = container.createChildContainer();
    registerBotsServices(child, {
      repository,
      catalog,
      sourceReader,
      workspaceAuthorization,
    });
    await expect(
      child.resolve<BotApplicationService>(BOTS_TOKENS.APPLICATION).create({
        definition: {
          name: 'Refusal',
          instructions: 'Text',
          scope: { kind: 'user' },
        },
      }),
    ).rejects.toMatchObject({
      code: 'PERSISTENCE_UNAVAILABLE',
      message: 'Bot storage is unavailable.',
    });
  });
});
