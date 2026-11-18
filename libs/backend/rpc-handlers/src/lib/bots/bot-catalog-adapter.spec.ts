import 'reflect-metadata';
import { resolveCliPath } from '@ptah-extension/cli-agent-runtime';
import {
  BotCatalogAdapter,
  type BotCatalogDependencies,
} from './bot-catalog-adapter';
import {
  getAllAnthropicProviders,
  type BotEditable,
} from '@ptah-extension/shared';
import { readSkillCandidates } from '../harness/selection/skill-catalog';

jest.mock('../harness/selection/skill-catalog', () => ({
  readSkillCandidates: jest.fn(() => [
    { slug: 'user-skill' },
    { slug: 'overlay-skill' },
  ]),
}));
jest.mock('@ptah-extension/cli-agent-runtime', () => ({
  resolveCliPath: jest.fn(async () => null),
  PTAH_CLI_AGENTS_CONFIG_KEY: 'ptahCliAgents',
}));
jest.mock('@ptah-extension/agent-sdk', () => ({
  CLAUDE_BUILTIN_TOOL_IDS: ['Read'],
}));
jest.mock('@ptah-extension/shared', () => ({
  ...jest.requireActual('@ptah-extension/shared'),
  getAllAnthropicProviders: jest.fn(() => [
    { id: 'provider', name: 'Provider' },
  ]),
  SYSTEM_CLI_TYPES: ['claude', 'codex', 'antigravity', 'cursor'],
}));

const providerTemplate = jest
  .requireActual<typeof import('@ptah-extension/shared')>(
    '@ptah-extension/shared',
  )
  .getAllAnthropicProviders()[0];
if (!providerTemplate) throw new Error('Provider fixture missing');

function setup() {
  const deps: BotCatalogDependencies = {
    models: {
      fetchModels: jest.fn(async () => ({
        models: [
          {
            id: 'model',
            name: 'Model',
            description: '',
            contextLength: 1000,
            supportsToolUse: true,
          },
        ],
        totalCount: 1,
        isStatic: true,
      })),
    },
    secrets: { getProviderKey: jest.fn(async () => 'private-key') },
    sources: { resolve: jest.fn() },
    config: { getWithDefault: jest.fn() },
    logger: { debug: jest.fn() },
    executable: jest.fn((cli: string) => cli === 'claude'),
  };
  jest.mocked(deps.sources.resolve).mockResolvedValue({
    layout: {
      skillsRoot: '/user/skills',
      commandsRoot: '/user/commands',
      agentsRoot: '/user/agents',
    },
    overlayPluginPaths: ['/plugins/overlay'],
    disabledSkillIds: [],
    disabledPluginIds: [],
  });
  jest
    .mocked(deps.config.getWithDefault)
    .mockReturnValue([
      { id: 'lane', name: 'Lane', enabled: true, apiKey: 'must-not-leak' },
    ]);
  return { deps, adapter: new BotCatalogAdapter(deps) };
}
const selection: Pick<BotEditable, 'runtime' | 'skills' | 'toolRequirements'> =
  {
    runtime: { kind: 'main', providerId: 'provider', model: 'missing' },
    skills: [{ id: 'unknown' }],
    toolRequirements: { allow: ['unknown'], deny: [] },
  };

describe('BotCatalogAdapter', () => {
  it('keeps the first duplicate lane ID and reports the ignored entry', async () => {
    const { deps, adapter } = setup();
    jest.mocked(deps.config.getWithDefault).mockReturnValue([
      { id: 'lane', name: 'First', enabled: true },
      { id: 'lane', name: 'Second', enabled: false },
    ]);
    const result = await adapter.read({ kind: 'user' });
    expect(
      result.lanes.filter((lane) => lane.target.kind === 'ptah-cli'),
    ).toEqual([expect.objectContaining({ label: 'First', available: true })]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'LANE_ENTRY_DUPLICATE' }),
    );
  });
  beforeEach(() => jest.mocked(getAllAnthropicProviders).mockReset());
  beforeEach(() =>
    jest
      .mocked(getAllAnthropicProviders)
      .mockReturnValue([
        { ...providerTemplate, id: 'provider', name: 'Provider' },
      ]),
  );
  it('bounds slow model calls, limits concurrency to four and identifies each failed provider', async () => {
    jest.useFakeTimers();
    try {
      const { deps, adapter } = setup();
      const template = getAllAnthropicProviders()[0];
      if (!template) throw new Error('Provider fixture missing');
      jest.mocked(getAllAnthropicProviders).mockReturnValue(
        Array.from({ length: 6 }, (_, index) => ({
          ...template,
          id: `slow-${index}`,
        })),
      );
      jest
        .mocked(deps.models.fetchModels)
        .mockImplementation(() => new Promise(() => undefined));
      const pending = adapter.read({ kind: 'user' });
      await jest.advanceTimersByTimeAsync(0);
      expect(deps.models.fetchModels).toHaveBeenCalledTimes(4);
      await jest.advanceTimersByTimeAsync(15000);
      expect(deps.models.fetchModels).toHaveBeenCalledTimes(6);
      await jest.advanceTimersByTimeAsync(15000);
      const result = await pending;
      expect(result.status).toBe('partial');
      expect(
        result.mainProviders.map((provider) => provider.providerId),
      ).toEqual(Array.from({ length: 6 }, (_, index) => `slow-${index}`));
      for (let index = 0; index < 6; index++)
        expect(result.diagnostics).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code: 'MODELS_UNAVAILABLE',
              message: expect.stringContaining(`slow-${index}`),
            }),
          ]),
        );
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
  it('keeps valid registry entries when neighboring entries are malformed', async () => {
    const { deps, adapter } = setup();
    jest
      .mocked(deps.config.getWithDefault)
      .mockReturnValue([
        { id: 'good', name: 'Good', enabled: true },
        { apiKey: 'secret' },
        null,
      ]);
    const result = await adapter.read({ kind: 'user' });
    expect(result.status).toBe('partial');
    expect(result.lanes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: { kind: 'ptah-cli', ptahCliId: 'good' },
        }),
      ]),
    );
    expect(
      result.diagnostics.filter(
        (diagnostic) => diagnostic.code === 'LANE_ENTRY_INVALID',
      ),
    ).toHaveLength(2);
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('uses executable lookup without probing and treats the bundled Cursor SDK as installed', async () => {
    const { deps, adapter } = setup();
    delete deps.executable;
    const result = await adapter.read({ kind: 'user' });
    expect(resolveCliPath).toHaveBeenCalledWith('agy');
    expect(resolveCliPath).not.toHaveBeenCalledWith('cursor');
    expect(result.lanes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: { kind: 'system', cli: 'cursor' },
          available: true,
        }),
      ]),
    );
  });
  it('reports unavailable when every dynamic catalog fails', async () => {
    const { deps, adapter } = setup();
    jest
      .mocked(deps.models.fetchModels)
      .mockRejectedValue(new Error('failure'));
    jest.mocked(deps.sources.resolve).mockRejectedValue(new Error('failure'));
    jest.mocked(deps.config.getWithDefault).mockImplementation(() => {
      throw new Error('failure');
    });
    deps.executable = () => {
      throw new Error('failure');
    };
    expect((await adapter.read({ kind: 'user' })).status).toBe('unavailable');
  });
  it('projects models, system installations, registry identities and all skill candidates without secrets', async () => {
    const { deps, adapter } = setup();
    const result = await adapter.read({
      kind: 'workspace',
      workspaceRoot: '/open',
    });
    expect(result.status).toBe('available');
    expect(result.mainProviders[0]?.capabilities.models).toEqual(['model']);
    expect(deps.models.fetchModels).toHaveBeenCalledWith(
      'provider',
      'private-key',
      false,
    );
    expect(deps.sources.resolve).toHaveBeenCalledWith('/open');
    expect(readSkillCandidates).toHaveBeenCalled();
    expect(result.skills).toEqual([
      { id: 'user-skill' },
      { id: 'overlay-skill' },
    ]);
    expect(result.lanes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: { kind: 'system', cli: 'claude' },
          available: true,
        }),
        expect.objectContaining({
          target: { kind: 'system', cli: 'codex' },
          available: false,
        }),
        expect.objectContaining({
          target: { kind: 'ptah-cli', ptahCliId: 'lane' },
        }),
      ]),
    );
    expect(JSON.stringify(result)).not.toMatch(
      /private-key|must-not-leak|apiKey/,
    );
  });
  it('retains unknown selections with diagnostics', async () => {
    const { adapter } = setup();
    const result = await adapter.read({ kind: 'user' }, selection);
    expect(result.diagnostics.map((entry) => entry.code)).toEqual(
      expect.arrayContaining([
        'MODEL_UNRESOLVED',
        'SKILL_UNRESOLVED',
        'TOOL_UNRESOLVED',
      ]),
    );
    expect(selection.runtime).toEqual({
      kind: 'main',
      providerId: 'provider',
      model: 'missing',
    });
    expect(
      (
        await adapter.read(
          { kind: 'user' },
          {
            ...selection,
            runtime: {
              kind: 'lane',
              target: { kind: 'ptah-cli', ptahCliId: 'missing' },
            },
          },
        )
      ).diagnostics,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'RUNTIME_UNRESOLVED' }),
      ]),
    );
  });
  it('keeps partial data and maps failures without raw exception details', async () => {
    const { deps, adapter } = setup();
    jest
      .mocked(deps.models.fetchModels)
      .mockRejectedValue(new Error('private-key'));
    jest
      .mocked(deps.sources.resolve)
      .mockRejectedValue(new Error('private-key'));
    jest.mocked(deps.config.getWithDefault).mockReturnValue('invalid');
    const result = await adapter.read({ kind: 'user' });
    expect(result.status).toBe('partial');
    expect(result.diagnostics.map((entry) => entry.code)).toEqual(
      expect.arrayContaining([
        'MODELS_UNAVAILABLE',
        'SKILLS_UNAVAILABLE',
        'LANE_CATALOG_UNAVAILABLE',
      ]),
    );
    expect(JSON.stringify(result)).not.toContain('private-key');
  });
  it('bounds new asynchronous dependency calls and releases timers', async () => {
    jest.useFakeTimers();
    try {
      const { deps, adapter } = setup();
      jest
        .mocked(deps.secrets.getProviderKey)
        .mockReturnValue(new Promise(() => undefined));
      const pending = adapter.read({ kind: 'user' });
      await jest.advanceTimersByTimeAsync(15000);
      expect((await pending).diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'MODELS_UNAVAILABLE' }),
        ]),
      );
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});
