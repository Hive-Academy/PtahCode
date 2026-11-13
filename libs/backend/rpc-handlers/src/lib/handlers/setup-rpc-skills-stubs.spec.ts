import 'reflect-metadata';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

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
import {
  WizardRecommendSkillsParamsSchema,
  WizardSearchSkillsParamsSchema,
  WizardGetProjectGuidanceParamsSchema,
  WizardInstallSkillsWithConsentParamsSchema,
  WizardPreviewSkillsForConsentParamsSchema,
} from './setup-rpc.schema';

describe('setup wizard skill RPC services', () => {
  const names = [
    'wizard:recommend-skills',
    'wizard:search-skills',
    'wizard:get-project-guidance',
    'wizard:preview-skills-for-consent',
    'wizard:install-skills-with-consent',
  ];

  it('passes declared repository dependencies and catalog search to recommendations', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ptah-recommend-'));
    const methods = new Map<string, (params: unknown) => Promise<unknown>>();
    const recommend = jest.fn(
      async (input: {
        dependencies: string[];
        search: (query: string) => Promise<unknown[]>;
      }) => {
        expect(input.dependencies).toContain('@nestjs/core');
        await input.search('nestjs');
        return [
          {
            skill: { skillId: 'nestjs' },
            evidence: '@nestjs/core',
            score: 100,
          },
        ];
      },
    );
    const search = jest.fn().mockResolvedValue([]);
    try {
      await fs.writeFile(
        path.join(root, 'package.json'),
        JSON.stringify({ dependencies: { '@nestjs/core': '^10.0.0' } }),
      );
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
        workspaceProvider: { getWorkspaceRoot: () => root },
        skillsShApi: { search },
        container: {
          resolve: (token: symbol) =>
            String(token).includes('SkillSelection')
              ? { select: (items: unknown[]) => items }
              : { recommend },
        },
        logger: { debug: jest.fn() },
      });
      handler.register();
      await expect(
        methods.get('wizard:recommend-skills')?.({
          analysis: { projectType: 'node' },
        }),
      ).resolves.toEqual({
        skills: [expect.objectContaining({ evidence: '@nestjs/core' })],
      });
      expect(search).toHaveBeenCalledWith('nestjs');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('registers methods and delegates to services', async () => {
    const methods = new Map<string, (params: unknown) => unknown>();
    const handler = Object.create(
      SetupRpcHandlers.prototype,
    ) as SetupRpcHandlers;
    Object.assign(handler, {
      rpcHandler: {
        registerMethod: (name: string, fn: (params: unknown) => unknown) =>
          methods.set(name, fn),
      },
      logger: { debug: jest.fn() },
      workspaceProvider: { getWorkspaceRoot: () => process.cwd() },
      skillsShApi: { search: jest.fn().mockResolvedValue([]) },
      container: {
        resolve: (token: symbol) =>
          String(token).includes('Recommendation')
            ? { recommend: jest.fn().mockResolvedValue([]) }
            : String(token).includes('SkillSelection')
              ? { select: (items: unknown[]) => items }
            : {
                getGuidance: jest.fn().mockReturnValue({
                  facts: [],
                  ownerDecisionPrompt: 'Review facts',
                }),
              },
      },
    });
    handler.register();
    expect(names.every((name) => methods.has(name))).toBe(true);
    await expect(
      methods.get(names[0])?.({ analysis: { projectType: 'node' } }),
    ).resolves.toEqual({ skills: [] });
    await expect(methods.get(names[1])?.({ query: 'nx' })).resolves.toEqual({
      skills: [],
    });
    await expect(
      methods.get(names[2])?.({ analysis: { projectType: 'node' } }),
    ).resolves.toEqual({ facts: [], ownerDecisionPrompt: 'Review facts' });
    await expect(
      methods.get(names[4])?.({ skills: [], consentRecords: [] }),
    ).resolves.toEqual({ success: true, installed: [] });
    await expect(methods.get(names[1])?.({ query: '' })).rejects.toThrow();
  });

  it('validates request parameters', () => {
    expect(
      WizardRecommendSkillsParamsSchema.safeParse({ analysis: {} }).success,
    ).toBe(false);
    expect(
      WizardSearchSkillsParamsSchema.safeParse({ query: '  ' }).success,
    ).toBe(false);
    expect(WizardGetProjectGuidanceParamsSchema.safeParse({}).success).toBe(
      false,
    );
    expect(
      WizardPreviewSkillsForConsentParamsSchema.safeParse({ skills: [] })
        .success,
    ).toBe(false);
    expect(
      WizardInstallSkillsWithConsentParamsSchema.safeParse({
        skills: ['a'],
        consentRecords: [
          { skillName: 'a', contentHash: 'bad', consentDate: 'today' },
        ],
      }).success,
    ).toBe(false);
  });
});
