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
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), 'ptah-consent-test-'),
    );
    jest.clearAllMocks();
    methods.clear();
    keepSelected.mockReturnValue(true);
    staged.mockImplementation(async (_request, root) => {
      const skill = path.join(root, '.claude', 'skills', 'example');
      await fs.mkdir(skill, { recursive: true });
      await fs.writeFile(path.join(skill, 'SKILL.md'), '# Example');
      await fs.writeFile(path.join(skill, 'run.sh'), 'echo example');
      return { success: true };
    });
    install.mockImplementation(async () => {
      const root = workspacePluginsDir(workspaceRoot) as string;
      const skill = path.join(
        root,
        'ptah-skillssh-owner-repo',
        'skills',
        'example',
      );
      await fs.mkdir(skill, { recursive: true });
      await fs.writeFile(path.join(skill, 'SKILL.md'), '# Example');
      return { success: true, data: { success: true } };
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
        handleMessage: install,
      },
      workspaceProvider: { getWorkspaceRoot: () => workspaceRoot },
      skillsShApi: { invalidateInstallCaches: jest.fn() },
      container: {
        resolve: (token: symbol) => {
          if (String(token).includes('SkillConsent')) return consent;
          if (String(token).includes('SkillSyncGate')) return { keepSelected };
          return { propagate };
        },
      },
      logger: { debug: jest.fn(), error: jest.fn() },
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
      expect.objectContaining({ method: 'skillsSh:install' }),
    );
    expect(keepSelected).toHaveBeenCalledWith(workspaceRoot, ['example']);
    expect(propagate).toHaveBeenCalledTimes(1);
  });

  it('refuses unapproved scripts before install or propagation', async () => {
    consent.hasScripts.mockReturnValue(true);
    await expect(
      method()({ skills: ['owner/repo/example'], consentRecords: [] }),
    ).rejects.toThrow('requires consent');
    expect(install).not.toHaveBeenCalled();
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
    ).rejects.toThrow('changed since preview');
    expect(install).not.toHaveBeenCalled();
  });

  it('refuses changed bytes fetched during install', async () => {
    consent.hasScripts.mockReturnValue(true);
    consent.computeContentHash
      .mockReturnValueOnce('a'.repeat(64))
      .mockReturnValueOnce('b'.repeat(64));
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
    ).rejects.toThrow('Installed skill content changed');
    expect(consent.recordConsent).not.toHaveBeenCalled();
    expect(keepSelected).not.toHaveBeenCalled();
    expect(propagate).not.toHaveBeenCalled();
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
    install.mockResolvedValue({ success: true, data: { success: false } });
    await expect(
      method()({ skills: ['owner/repo/example'], consentRecords: [] }),
    ).resolves.toEqual({ success: false, installed: [] });
    expect(keepSelected).not.toHaveBeenCalled();
    expect(propagate).not.toHaveBeenCalled();
  });
});
