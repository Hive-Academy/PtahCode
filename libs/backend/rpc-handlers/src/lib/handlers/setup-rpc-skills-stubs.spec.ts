import 'reflect-metadata';

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
} from './setup-rpc.schema';

describe('setup wizard skill RPC stubs', () => {
  const names = [
    'wizard:recommend-skills',
    'wizard:search-skills',
    'wizard:get-project-guidance',
    'wizard:install-skills-with-consent',
  ];

  it('registers all four methods and returns typed stubs', async () => {
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
    });
    handler.register();
    expect(names.every((name) => methods.has(name))).toBe(true);
    await expect(
      methods.get(names[0])?.({ analysis: { projectType: 'node' } }),
    ).resolves.toEqual({ skills: [] });
    await expect(methods.get(names[1])?.({ query: 'nx' })).resolves.toEqual({
      skills: [],
    });
    await expect(methods.get(names[2])?.({})).resolves.toEqual({ facts: [] });
    await expect(
      methods.get(names[3])?.({ skills: [], consentRecords: [] }),
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
      true,
    );
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
