import 'reflect-metadata';
import * as fs from 'node:fs/promises';
import * as os from 'os';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import type { IWorkspaceProvider } from '@ptah-extension/platform-core';
import type { HarnessConfig } from '@ptah-extension/shared';
import { HarnessConfigStore } from '../harness/config/harness-config-store.service';
import { HarnessProposalStore } from '../harness/config/harness-proposal-store.service';
import { HarnessPromptBuilderService } from '../harness/config/harness-prompt-builder.service';
import * as path from 'node:path';
import { BotSourceReader, type BotSourceFiles } from './bot-source-reader';
import { BotWorkspaceAuthorizer } from './bot-workspace-authorizer';
import { sameWorkspaceRoot } from '../utils/workspace-authorization';
import { container } from 'tsyringe';
import { registerBotAdapters } from './register-bot-adapters';
import { BOTS_TOKENS } from '@ptah-extension/bots';

jest.mock('@ptah-extension/cli-agent-runtime', () => ({
  resolveCliPath: jest.fn(async () => null),
  PTAH_CLI_AGENTS_CONFIG_KEY: 'ptahCliAgents',
}));

jest.mock('os', () => ({
  ...jest.requireActual<typeof import('os')>('os'),
  homedir: jest.fn(jest.requireActual<typeof import('os')>('os').homedir),
}));

const item = {
  id: 'worker',
  name: 'Worker',
  role: 'Review',
  instructions: 'Read',
  tools: [],
  executionMode: 'on-demand',
  description: '',
};
const authorization = { authorize: jest.fn(async (root: string) => root) };
const logger = { debug: jest.fn() };
function reader(raw: unknown, stamps = ['same', 'same']) {
  let index = 0;
  const files: BotSourceFiles = {
    readFile: jest.fn(async () => JSON.stringify(raw)),
    stamp: jest.fn(async () => stamps[index++] ?? 'same'),
  };
  return { instance: new BotSourceReader(authorization, logger, files), files };
}

describe('BotSourceReader', () => {
  beforeEach(() => jest.clearAllMocks());
  it('preserves duplicates, full identities, malformed items and fingerprints', async () => {
    const { instance } = reader({
      id: 'preset',
      config: { agents: { harnessSubagents: [item, item, { broken: true }] } },
    });
    const result = await instance.read({ kind: 'preset', presetId: 'preset' });
    expect(result.items).toHaveLength(3);
    expect(result.items[0]?.source).toEqual({
      kind: 'preset',
      presetId: 'preset',
      sourceLocationId: 'harnesses/preset.json',
      itemId: 'worker',
    });
    expect(result.items[0]?.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(result.items[0]?.fingerprint).toBe(result.items[1]?.fingerprint);
  });
  it('does not accept arbitrary preset paths', async () => {
    const { instance, files } = reader({});
    expect(
      (await instance.read({ kind: 'preset', presetId: '../secret' }))
        .diagnostics[0]?.code,
    ).toBe('SOURCE_UNSUPPORTED');
    expect(files.readFile).not.toHaveBeenCalled();
  });
  it.each([
    [{}, 'SOURCE_MALFORMED'],
    [{ id: 'other', config: {} }, 'SOURCE_CHANGED'],
    [{ id: 'preset', config: {} }, 'SOURCE_UNSUPPORTED'],
  ])('diagnoses invalid preset %j', async (raw, code) => {
    expect(
      (await reader(raw).instance.read({ kind: 'preset', presetId: 'preset' }))
        .diagnostics[0]?.code,
    ).toBe(code);
  });
  it('detects changed content during read', async () => {
    expect(
      (
        await reader({}, ['before', 'after']).instance.read({
          kind: 'preset',
          presetId: 'preset',
        })
      ).diagnostics[0]?.code,
    ).toBe('SOURCE_CHANGED');
  });
  it('distinguishes missing from corrupt JSON', async () => {
    const files: BotSourceFiles = {
      stamp: async () => 'same',
      readFile: async () => {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      },
    };
    const instance = new BotSourceReader(authorization, logger, files);
    expect(
      (await instance.read({ kind: 'preset', presetId: 'preset' }))
        .diagnostics[0]?.code,
    ).toBe('SOURCE_MISSING');
    files.readFile = async () => '{';
    expect(
      (await instance.read({ kind: 'preset', presetId: 'preset' }))
        .diagnostics[0]?.code,
    ).toBe('SOURCE_MALFORMED');
  });
  it('authorizes proposals before reading and uses the authorized spelling', async () => {
    const root = path.resolve('workspace');
    authorization.authorize.mockResolvedValueOnce(root);
    const { instance, files } = reader({
      version: 1,
      workspaceRoot: root,
      sessionId: 'session',
      configUpdates: { agents: { harnessSubagents: [item] } },
      isConfigComplete: false,
      updatedAt: new Date().toISOString(),
    });
    const result = await instance.read({
      kind: 'proposal',
      workspaceRoot: root,
      sessionId: '  session  ',
    });
    expect(authorization.authorize).toHaveBeenCalledWith(root);
    expect(files.readFile).toHaveBeenCalledWith(
      expect.stringContaining(path.join(root, '.ptah', 'harness', 'proposals')),
    );
    expect(result.items[0]?.source).toEqual({
      kind: 'proposal',
      workspaceRoot: root,
      sessionId: 'session',
      itemId: 'worker',
    });
  });
  it('refuses unauthorized proposals without accessing storage', async () => {
    authorization.authorize.mockRejectedValueOnce(new Error('closed'));
    const { instance, files } = reader({});
    await expect(
      instance.read({
        kind: 'proposal',
        workspaceRoot: '/closed',
        sessionId: 's',
      }),
    ).rejects.toThrow('closed');
    expect(files.stamp).not.toHaveBeenCalled();
  });
  it('reports unsupported proposal versions', async () => {
    const result = await reader({ version: 2 }).instance.read({
      kind: 'proposal',
      workspaceRoot: path.resolve('workspace'),
      sessionId: 's',
    });
    expect(result.diagnostics[0]?.code).toBe('SOURCE_UNSUPPORTED');
  });
});

describe('BotWorkspaceAuthorizer', () => {
  it('returns exact open spelling and rejects descendants, traversal and closed roots', async () => {
    const root = path.resolve('Workspace');
    const authorizer = new BotWorkspaceAuthorizer({
      getWorkspaceFolders: () => [root],
    });
    await expect(authorizer.authorize(root + path.sep)).resolves.toBe(root);
    for (const requested of [
      path.join(root, 'child'),
      root + '/child/..',
      path.resolve('closed'),
      'relative',
    ])
      await expect(authorizer.authorize(requested)).rejects.toThrow();
  });
  it.each(['c:/work/project/', 'C:\\WORK\\PROJECT', 'c:\\Work\\Project\\'])(
    'uses Windows equality for %s',
    (root) => {
      expect(sameWorkspaceRoot(root, 'C:\\Work\\Project', 'win32')).toBe(true);
      expect(
        sameWorkspaceRoot(root + '\\child', 'C:\\Work\\Project', 'win32'),
      ).toBe(false);
    },
  );
  (process.platform === 'win32' ? it : it.skip)(
    'preserves stored Windows spelling for case and slash variations',
    async () => {
      const authorizer = new BotWorkspaceAuthorizer({
        getWorkspaceFolders: () => ['C:\\Work\\Project'],
      });
      await expect(authorizer.authorize('c:/work/project/')).resolves.toBe(
        'C:\\Work\\Project',
      );
    },
  );
  it('registers all three bindings without resolving collaborators', () => {
    const child = container.createChildContainer();
    const resolve = jest.spyOn(child, 'resolve');
    registerBotAdapters(child);
    expect(resolve).not.toHaveBeenCalled();
    for (const token of [
      BOTS_TOKENS.SOURCE_READER,
      BOTS_TOKENS.CATALOG,
      BOTS_TOKENS.WORKSPACE_AUTHORIZATION,
    ])
      expect(child.isRegistered(token)).toBe(true);
  });
});

async function removeStoreFixture(root: string): Promise<void> {
  // Resolve and verify the generated target before recursive cleanup.
  const resolved = path.resolve(root);
  if (
    path.dirname(resolved) !== path.resolve(os.tmpdir()) ||
    !path.basename(resolved).startsWith('bot-store-compat-')
  )
    throw new Error('Unexpected test cleanup target');
  await fs.rm(resolved, { recursive: true, force: true });
}

describe('real harness store compatibility', () => {
  it('reads both real writers and refuses expired proposals without changing bytes', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bot-store-compat-'));
    try {
      jest.mocked(os.homedir).mockReturnValue(root);
      const workspace: IWorkspaceProvider = {
        getWorkspaceFolders: () => [root],
        getWorkspaceRoot: () => root,
        getConfiguration: <T>(_section: string, _key: string, fallback?: T) =>
          fallback,
        setConfiguration: async () => undefined,
        onDidChangeConfiguration: () => ({ dispose: () => undefined }),
        onDidChangeWorkspaceFolders: () => ({ dispose: () => undefined }),
      };
      const child = container.createChildContainer();
      child.registerInstance(TOKENS.LOGGER, {
        debug: jest.fn(),
        warn: jest.fn(),
      });
      const storeLogger = child.resolve<Logger>(TOKENS.LOGGER);
      const presets = new HarnessConfigStore(
        storeLogger,
        new HarnessPromptBuilderService(),
      );
      const proposals = new HarnessProposalStore(storeLogger, workspace);
      const config: HarnessConfig = {
        name: 'Bot path fixture',
        persona: { label: '', description: '', goals: [] },
        agents: {
          enabledAgents: {},
          harnessSubagents: [{ ...item, executionMode: 'on-demand' }],
        },
        skills: { selectedSkills: [], createdSkills: [] },
        prompt: { systemPrompt: '', enhancedSections: {} },
        mcp: { servers: [], enabledTools: {} },
        claudeMd: {
          generateProjectClaudeMd: false,
          customSections: {},
          previewContent: '',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const writtenPreset = await presets.writePresetToDisk(
        'Bot path fixture',
        config,
      );
      const savedProposal = await proposals.save(
        '  real-session  ',
        { agents: config.agents },
        false,
        undefined,
        root,
      );
      const instance = new BotSourceReader(
        new BotWorkspaceAuthorizer(workspace),
        logger,
      );
      const presetResult = await instance.read({
        kind: 'preset',
        presetId: path.basename(writtenPreset, '.json'),
      });
      expect(presetResult.items[0]?.raw).toEqual(
        config.agents.harnessSubagents?.[0],
      );
      const selector = {
        kind: 'proposal' as const,
        workspaceRoot: root,
        sessionId: '  real-session  ',
      };
      const proposalResult = await instance.read(selector);
      expect(proposalResult.items[0]?.source).toEqual({
        ...selector,
        sessionId: 'real-session',
        itemId: 'worker',
      });
      const directory = path.join(root, '.ptah', 'harness', 'proposals');
      const entries = await fs.readdir(directory);
      const record = entries.find((entry) => entry.endsWith('.json'));
      if (!record) throw new Error('Proposal writer did not create a record');
      const file = path.join(directory, record);
      const now = Date.now();
      const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
      try {
        const boundary = {
          ...savedProposal,
          updatedAt: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(),
        };
        await fs.writeFile(file, JSON.stringify(boundary));
        expect((await instance.read(selector)).items).toHaveLength(1);
        expect(await proposals.get('real-session', root)).not.toBeNull();
        const expired = JSON.stringify({
          ...boundary,
          updatedAt: new Date(Date.parse(boundary.updatedAt) - 1).toISOString(),
        });
        await fs.writeFile(file, expired);
        expect((await instance.read(selector)).diagnostics[0]?.code).toBe(
          'SOURCE_MISSING',
        );
        expect(await fs.readFile(file, 'utf8')).toBe(expired);
        // The existing store applies the identical cutoff (and prunes on get).
        expect(await proposals.get('real-session', root)).toBeNull();
      } finally {
        clock.mockRestore();
      }
    } finally {
      await removeStoreFixture(root);
    }
  });
});
