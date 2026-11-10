import 'reflect-metadata';
import { PtahCliRegistry } from './ptah-cli-registry';
import type { PtahCliConfig } from '@ptah-extension/shared';
import { createFakeSdkProcessSpawner } from './testing/fake-sdk-process-spawner';

async function* emptyStream(): AsyncGenerator<never, void, unknown> {
  // The query options are captured before stream consumption.
}

function harness() {
  const configs: PtahCliConfig[] = [];
  let sharedKey: string | undefined;
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  const secrets = {
    getCredential: jest.fn(async () => sharedKey),
    getProviderKey: jest.fn(async (): Promise<string | undefined> => undefined),
    hasProviderKey: jest.fn(async () => false),
    setProviderKey: jest.fn(async () => undefined),
    deleteProviderKey: jest.fn(async () => undefined),
  };
  const persistence = {
    ensureMigrated: jest.fn(async () => undefined),
    loadConfigs: jest.fn(() => configs),
    saveConfigs: jest.fn(async () => undefined),
  };
  const query = jest.fn((_input: { options: { env?: Record<string, string | undefined> } }) => emptyStream());
  const registry = new PtahCliRegistry(
    logger as never, secrets as never,
    { getCliJsPath: jest.fn(async () => undefined), getQueryFunction: jest.fn(async () => query) } as never,
    { createIsolated: jest.fn(() => ({ transform: jest.fn(() => []) })) } as never,
    { getPermissionLevel: jest.fn(() => 'yolo'), createCallback: jest.fn() } as never,
    null as never, null as never, null as never,
    { getModelTiers: jest.fn(() => ({ sonnet: null, opus: null, haiku: null })) } as never,
    persistence as never,
    { assembleSpawnOptions: jest.fn(async () => ({
      builtinPolicy: { disallowedTools: [], deniedSkillNames: [] },
      mcpServers: {}, hooks: undefined, autoCompact: {},
      systemPromptMode: 'append', systemPromptContent: undefined,
    })) } as never,
    null as never, { get: jest.fn(() => undefined) } as never, createFakeSdkProcessSpawner(),
  );
  return { registry, configs, secrets, persistence, logger, query, setSharedKey: (key?: string) => { sharedKey = key; } };
}

describe('Ptah CLI direct Claude API credentials', () => {
  it('creates shared instance without a per-instance secret or key in settings, then reads rotated key', async () => {
    const h = harness();
    const ambientKey = process.env['ANTHROPIC_API_KEY'];
    h.setSharedKey('first-key');
    const created = await h.registry.createAgent('Claude', 'anthropic-api', undefined, 'shared-connection');
    expect(h.secrets.setProviderKey).not.toHaveBeenCalled();
    expect(JSON.stringify(h.configs)).not.toContain('first-key');
    expect(created.hasApiKey).toBe(true);
    expect(created.credentialSource).toBe('shared-connection');
    expect((await h.registry.listAgents()).find((agent) => agent.id === created.id)?.credentialSource).toBe('shared-connection');
    h.setSharedKey('rotated-key');
    await h.registry.spawnAgent(created.id, 'hello');
    expect(h.query).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({
        env: expect.objectContaining({ ANTHROPIC_API_KEY: 'rotated-key', ANTHROPIC_BASE_URL: 'https://api.anthropic.com' }),
        model: 'claude-sonnet-5-5',
      }),
    }));
    const profile = await h.registry.getProfile(created.id);
    expect(profile?.authEnv).toMatchObject({ ANTHROPIC_API_KEY: 'rotated-key', ANTHROPIC_BASE_URL: 'https://api.anthropic.com' });
    expect(profile?.authEnv.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(JSON.stringify(Object.values(h.logger).map((fn) => fn.mock.calls))).not.toContain('rotated-key');
    expect(process.env['ANTHROPIC_API_KEY']).toBe(ambientKey);
  });

  it('stores instance override and rejects shared source for subscription lane', async () => {
    const h = harness();
    await h.registry.createAgent('Claude', 'anthropic-api', 'instance-key', 'instance');
    expect(h.secrets.setProviderKey).toHaveBeenCalledWith(expect.stringMatching(/^ptahCli\./), 'instance-key');
    await expect(h.registry.createAgent('Subscription', 'claude-cli', undefined, 'shared-connection')).rejects.toThrow();
  });

  it('reports a missing shared connection without exposing key material', async () => {
    const h = harness();
    const created = await h.registry.createAgent('Claude', 'anthropic-api', undefined, 'shared-connection');
    const result = await h.registry.spawnAgent(created.id, 'hello');
    expect(result).toMatchObject({ status: 'no_api_key', message: expect.stringContaining('Connect Claude API') });
    expect(JSON.stringify(result)).not.toContain('instance-key');
  });

  it('keeps subscription lane auth environment free of API keys', async () => {
    const h = harness();
    h.setSharedKey('shared-direct-key');
    h.secrets.getProviderKey.mockResolvedValue('subscription-instance-key');
    const created = await h.registry.createAgent('Subscription', 'claude-cli', 'subscription-instance-key', 'instance');
    const profile = await h.registry.getProfile(created.id);
    expect(profile).toBeDefined();
    expect(h.secrets.getCredential).not.toHaveBeenCalled();
    expect(profile?.authEnv.ANTHROPIC_API_KEY).toBeUndefined();
    expect(profile?.authEnv.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(profile?.authEnv.ANTHROPIC_BASE_URL).toBeUndefined();
    await h.registry.spawnAgent(created.id, 'hello');
    const env = h.query.mock.calls.at(-1)?.[0].options.env;
    expect(env).toBeDefined();
    expect(env?.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env?.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(env?.ANTHROPIC_BASE_URL).toBeUndefined();
    expect(JSON.stringify(env)).not.toContain('shared-direct-key');
  });

  it('restores the instance source when deleting its secret fails', async () => {
    const h = harness();
    const created = await h.registry.createAgent('Claude', 'anthropic-api', 'instance-key', 'instance');
    h.secrets.deleteProviderKey.mockRejectedValue(new Error('secret deletion failed'));
    await expect(h.registry.updateAgent(created.id, { credentialSource: 'shared-connection' })).rejects.toThrow('Could not switch agent credential source');
    expect(h.configs[0].credentialSource).toBe('instance');
    expect(h.persistence.saveConfigs).toHaveBeenCalledTimes(3);
    expect(h.logger.error).toHaveBeenCalledWith(expect.any(String), expect.any(Error));
    expect(JSON.stringify(h.logger.error.mock.calls)).not.toContain('instance-key');
  });

  it('accepts an unchanged instance source without replacing its existing key', async () => {
    const h = harness();
    const created = await h.registry.createAgent('Claude', 'anthropic-api', 'instance-key', 'instance');
    h.secrets.setProviderKey.mockClear();
    await h.registry.updateAgent(created.id, { credentialSource: 'instance', name: 'Renamed' });
    expect(h.configs[0]).toMatchObject({ name: 'Renamed', credentialSource: 'instance' });
    expect(h.secrets.setProviderKey).not.toHaveBeenCalled();
  });

  it('keeps the shared source when writing an instance key fails', async () => {
    const h = harness();
    const created = await h.registry.createAgent('Claude', 'anthropic-api', undefined, 'shared-connection');
    h.secrets.setProviderKey.mockRejectedValueOnce(new Error('secret write failed'));
    await expect(h.registry.updateAgent(created.id, { credentialSource: 'instance' }, 'new-secret')).rejects.toThrow('secret write failed');
    expect(h.configs[0].credentialSource).toBe('shared-connection');
    expect(h.persistence.saveConfigs).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(h.configs)).not.toContain('new-secret');
  });

  it('reports failed cleanup without logging a secret or masking the save error', async () => {
    const h = harness();
    h.persistence.saveConfigs.mockRejectedValueOnce(new Error('configuration failed'));
    h.secrets.deleteProviderKey.mockRejectedValueOnce(new Error('secret value must not appear'));
    await expect(h.registry.createAgent('Claude', 'anthropic-api', 'instance-key', 'instance')).rejects.toThrow('configuration failed');
    expect(h.logger.error).toHaveBeenCalledWith(expect.any(String), expect.any(Error));
    expect(JSON.stringify(h.logger.error.mock.calls)).not.toContain('secret value must not appear');
    expect(JSON.stringify(h.logger.error.mock.calls)).not.toContain('instance-key');
  });
});
