import 'reflect-metadata';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { workspacePluginsDir } from '@ptah-extension/shared';
jest.mock('@ptah-extension/memory-curator', () => ({
  deriveWorkspaceFingerprint: jest.fn(),
}));
jest.mock('@ptah-extension/agent-sdk', () => ({
  SDK_TOKENS: { SDK_PLUGIN_LOADER: Symbol('SDK_PLUGIN_LOADER') },
  PluginLoaderService: class PluginLoaderServiceStub {},
}));
jest.mock('@ptah-extension/cli-agent-runtime', () => ({
  SkillsShApiClient: class SkillsShApiClientStub {},
}));
jest.mock('@ptah-extension/agent-generation', () => ({
  AGENT_GENERATION_TOKENS: {
    SKILL_CONSENT_SERVICE: Symbol.for('SkillConsentService'),
  },
  ProjectAnalysisZodSchema: require('zod').z.object({
    projectType: require('zod').z.string(),
  }),
  ProjectAnalysisResultSchema: require('zod').z.object({}),
  normalizeAgentOutput: (analysis: unknown) => analysis,
}));
jest.mock('./setup/pack-install.service', () => ({
  PackInstallService: class PackInstallServiceStub {},
}));
import { SetupRpcHandlers } from './setup-rpc.handlers';
import { stageSkillsInstall } from '../utils/skills-sh-cli';

jest.mock('../utils/skills-sh-cli', () => ({
  STAGED_SKILLS_REL: ['.claude', 'skills'],
  stageSkillsInstall: jest.fn(),
}));

const staged = stageSkillsInstall as jest.MockedFunction<
  typeof stageSkillsInstall
>;

describe('wizard skill installation', () => {
  const methods = new Map<string, (params: unknown) => Promise<unknown>>();
  const consent = {
    hasScripts: jest.fn(),
    computeContentHash: jest.fn().mockReturnValue('a'.repeat(64)),
    canInstall: jest.fn().mockReturnValue(false),
    recordConsent: jest.fn(),
  };
  const install = jest.fn();
  const propagate = jest.fn();
  const keepSelected = jest.fn();
  const loggerError = jest.fn();
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), 'ptah-consent-test-'),
    );
    jest.clearAllMocks();
    consent.computeContentHash.mockReturnValue('a'.repeat(64));
    methods.clear();
    keepSelected.mockReturnValue(true);
    staged.mockImplementation(async (_request, root) => {
      const skill = path.join(root, '.claude', 'skills', 'example');
      await fs.mkdir(skill, { recursive: true });
      await fs.writeFile(path.join(skill, 'SKILL.md'), '# Example');
      await fs.writeFile(path.join(skill, 'run.sh'), 'echo example');
      return { success: true };
    });
    install.mockImplementation(async (params, verifyStaged) => {
      const stagingDir = await fs.mkdtemp(
        path.join(os.tmpdir(), 'ptah-install-stage-'),
      );
      try {
        const result = await staged(params, stagingDir);
        if (!result.success) return { success: false };
        const dir = path.join(stagingDir, '.claude', 'skills', params.skillId);
        await verifyStaged([{ slug: params.skillId, dir }]);
        const root = workspacePluginsDir(workspaceRoot) as string;
        const skill = path.join(
          root,
          'ptah-skillssh-owner-repo',
          'skills',
          params.skillId,
        );
        await fs.mkdir(skill, { recursive: true });
        await fs.cp(dir, skill, { recursive: true, force: true });
        return { success: true };
      } finally {
        await fs.rm(stagingDir, { recursive: true, force: true });
      }
    });
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  function method() {
    const handler = Object.create(
      SetupRpcHandlers.prototype,
    ) as SetupRpcHandlers;
    Object.assign(handler, {
      rpcHandler: {
        registerMethod: (
          name: string,
          fn: (params: unknown) => Promise<unknown>,
        ) => methods.set(name, fn),
      },
      workspaceProvider: { getWorkspaceRoot: () => workspaceRoot },
      skillsShApi: { invalidateInstallCaches: jest.fn() },
      container: {
        resolve: (token: unknown) => {
          if (
            typeof token === 'function' &&
            token.name === 'SkillsShRpcHandlers'
          )
            return { install };
          if (String(token).includes('SkillConsent')) return consent;
          if (String(token).includes('SkillSyncGate')) return { keepSelected };
          return { propagate };
        },
      },
      logger: { debug: jest.fn(), error: loggerError },
    });
    handler.register();
    return methods.get('wizard:install-skills-with-consent') as (
      params: unknown,
    ) => Promise<unknown>;
  }

  it('installs approved script content and propagates the selected slug', async () => {
    consent.hasScripts.mockReturnValue(true);
    await expect(
      method()({
        skills: ['owner/repo/example'],
        consentRecords: [
          {
            skillName: 'owner/repo/example',
            contentHash: 'a'.repeat(64),
            consentDate: new Date().toISOString(),
          },
        ],
      }),
    ).resolves.toEqual({ success: true, installed: ['owner/repo/example'] });
    expect(consent.recordConsent).toHaveBeenCalledWith(
      'owner/repo/example',
      'a'.repeat(64),
    );
    expect(install).toHaveBeenCalledWith(
      { source: 'owner/repo', skillId: 'example', scope: 'workspace' },
      expect.any(Function),
    );
    expect(keepSelected).toHaveBeenCalledWith(workspaceRoot, ['example']);
    expect(propagate).toHaveBeenCalledTimes(1);
  });

  it('refuses unapproved scripts before install or propagation', async () => {
    consent.hasScripts.mockReturnValue(true);
    await expect(
      method()({ skills: ['owner/repo/example'], consentRecords: [] }),
    ).resolves.toEqual({
      success: false,
      installed: [],
      failedSkill: 'owner/repo/example',
      reason: expect.stringContaining('requires consent'),
    });
    expect(install).toHaveBeenCalledTimes(1);
    expect(propagate).not.toHaveBeenCalled();
  });

  it('refuses a hash mismatch before install', async () => {
    consent.hasScripts.mockReturnValue(true);
    await expect(
      method()({
        skills: ['owner/repo/example'],
        consentRecords: [
          {
            skillName: 'owner/repo/example',
            contentHash: 'b'.repeat(64),
            consentDate: new Date().toISOString(),
          },
        ],
      }),
    ).resolves.toEqual({
      success: false,
      installed: [],
      failedSkill: 'owner/repo/example',
      reason: expect.stringContaining('changed since preview'),
    });
    expect(install).toHaveBeenCalledTimes(1);
  });

  it('refuses changed bytes fetched during install', async () => {
    consent.hasScripts.mockReturnValue(true);
    consent.computeContentHash.mockReturnValue('b'.repeat(64));
    const installedPath = path.join(
      workspacePluginsDir(workspaceRoot) as string,
      'ptah-skillssh-owner-repo',
      'skills',
      'example',
    );
    await fs.mkdir(installedPath, { recursive: true });
    await fs.writeFile(path.join(installedPath, 'SKILL.md'), '# Old copy');
    const oldBytes = await fs.readFile(path.join(installedPath, 'SKILL.md'));
    await expect(
      method()({
        skills: ['owner/repo/example'],
        consentRecords: [
          {
            skillName: 'owner/repo/example',
            contentHash: 'a'.repeat(64),
            consentDate: new Date().toISOString(),
          },
        ],
      }),
    ).resolves.toEqual({
      success: false,
      installed: [],
      failedSkill: 'owner/repo/example',
      reason: expect.stringContaining('changed since preview'),
    });
    expect(consent.recordConsent).not.toHaveBeenCalled();
    expect(keepSelected).not.toHaveBeenCalled();
    expect(propagate).not.toHaveBeenCalled();
    await expect(
      fs.readFile(path.join(installedPath, 'SKILL.md')),
    ).resolves.toEqual(oldBytes);
  });

  it('previews staged files and computes the consent hash', async () => {
    consent.hasScripts.mockReturnValue(false);
    method();
    const preview = methods.get('wizard:preview-skills-for-consent');
    await expect(
      preview?.({ skills: ['owner/repo/example'] }),
    ).resolves.toEqual({
      skills: [
        {
          skillName: 'owner/repo/example',
          files: ['SKILL.md', 'run.sh'],
          scriptFiles: ['run.sh'],
          hasScripts: false,
          contentHash: 'a'.repeat(64),
        },
      ],
    });
    expect(consent.computeContentHash).toHaveBeenCalledTimes(1);
  });

  it('does not run the final propagation after a failed install', async () => {
    consent.hasScripts.mockReturnValue(false);
    install.mockResolvedValue({ success: false });
    await expect(
      method()({ skills: ['owner/repo/example'], consentRecords: [] }),
    ).resolves.toEqual({
      success: false,
      installed: [],
      failedSkill: 'owner/repo/example',
      reason: 'Skill install failed.',
    });
    expect(keepSelected).not.toHaveBeenCalled();
    expect(propagate).not.toHaveBeenCalled();
  });

  it.each(['owner/repo', 'owner/repo/skill/extra'])(
    'refuses invalid name %s before installing or logging it',
    async (name) => {
      await expect(method()({ skills: [name], consentRecords: [] })).resolves.toEqual({
        success: false,
        installed: [],
        failedSkill: name,
        reason: 'Invalid skill name. Expected owner/repo/skill.',
      });
      expect(install).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['null', []],
    ['{"dependencies":"angular","devDependencies":{"jest":"1"}}', ['jest']],
  ])('ignores non-object package dependency data in %s', async (contents, expected) => {
    await fs.writeFile(path.join(workspaceRoot, 'package.json'), contents);
    const recommend = jest.fn().mockResolvedValue([]);
    const handler = Object.create(SetupRpcHandlers.prototype) as SetupRpcHandlers;
    Object.assign(handler, {
      rpcHandler: { registerMethod: (name: string, fn: (params: unknown) => Promise<unknown>) => methods.set(name, fn) },
      workspaceProvider: { getWorkspaceRoot: () => workspaceRoot },
      container: { resolve: (token: unknown) =>
        String(token).includes('SkillRecommendation') ? { recommend } : { select: () => [] } },
      skillsShApi: { search: jest.fn() },
      logger: { debug: jest.fn(), error: loggerError },
    });
    handler.register();
    const fn = methods.get('wizard:recommend-skills');
    await fn?.({ analysis: { projectType: 'test', frameworks: [] } });
    expect(recommend).toHaveBeenCalledWith(expect.objectContaining({ dependencies: expected }));
  });

  it('reports partial progress and propagates earlier installs when a later skill throws', async () => {
    consent.hasScripts.mockReturnValue(false);
    staged.mockImplementation(async (request, root) => {
      const skill = path.join(
        root,
        '.claude',
        'skills',
        request.skillId ?? 'example',
      );
      await fs.mkdir(skill, { recursive: true });
      await fs.writeFile(path.join(skill, 'SKILL.md'), '# Example');
      return { success: true };
    });
    install.mockImplementation(async (params, verifyStaged) => {
      if (params.skillId === 'second')
        throw new Error('network failed at /private/path');
      const stagingDir = await fs.mkdtemp(
        path.join(os.tmpdir(), 'ptah-install-stage-'),
      );
      try {
        await staged(params, stagingDir);
        await verifyStaged([
          {
            slug: params.skillId,
            dir: path.join(stagingDir, '.claude', 'skills', params.skillId),
          },
        ]);
        const skill = path.join(
          workspacePluginsDir(workspaceRoot) as string,
          'ptah-skillssh-owner-repo',
          'skills',
          'example',
        );
        await fs.mkdir(skill, { recursive: true });
        await fs.writeFile(path.join(skill, 'SKILL.md'), '# Example');
        return { success: true };
      } finally {
        await fs.rm(stagingDir, { recursive: true, force: true });
      }
    });
    await expect(
      method()({
        skills: ['owner/repo/example', 'owner/repo/second'],
        consentRecords: [],
      }),
    ).resolves.toEqual({
      success: false,
      installed: ['owner/repo/example'],
      failedSkill: 'owner/repo/second',
      reason: 'Skill install failed.',
    });
    expect(keepSelected).toHaveBeenCalledWith(workspaceRoot, ['example']);
    expect(propagate).toHaveBeenCalledTimes(1);
    expect(loggerError).toHaveBeenCalledWith(
      'Failed to install skill owner/repo/second',
      expect.any(Error),
    );
  });
});
