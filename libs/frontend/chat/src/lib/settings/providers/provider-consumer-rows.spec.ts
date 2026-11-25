import type { ProvidersSettingsSection } from '@ptah-extension/core';
import {
  BACKGROUND_ROLE_IDS,
  CURATOR_UNSUPPORTED_PROVIDER_IDS,
  ENHANCEMENT_HELPER_COPY,
  PROVIDER_CONSUMER_IDS,
  buildConsumerRows,
  consumerPatch,
  formatResolvedSummary,
  providerReadiness,
  setupModelIssue,
  toBackendEnhancementModel,
  toPickerModel,
  type ConsumerSources,
} from './provider-consumer-rows';

const ready = <T>(data: T): ProvidersSettingsSection<T> => ({ status: 'ready', data, error: null });
const route = { driverProviderId: 'anthropic', resolvedAuthModality: 'api-key' };
const workspacePair = { provider: 'anthropic', model: 'claude-sonnet' };
const sources = (): ConsumerSources => ({
  setup: ready({ state: { kind: 'unset', effective: workspacePair }, committed: null, commitSeq: 0 }),
  memory: ready({ curatorProvider: '', curatorModel: '' }),
  enhancement: ready({ provider: 'kimi-code', model: 'inherit', timeoutMs: 120000 }),
});

describe('provider consumer rows', () => {
  it('shows Setup first, followed by Memory curator, Enhancement and the separate Decision model', () => {
    expect(PROVIDER_CONSUMER_IDS).toEqual(['setup', 'memory-curator', 'enhancement']);
    expect(BACKGROUND_ROLE_IDS).toEqual(['setup', 'memory-curator', 'enhancement', 'decision']);
    const [setup, memory, enhancement] = buildConsumerRows(sources(), route, () => null);
    expect(setup).toMatchObject({
      name: 'Setup',
      retryKey: 'setup',
      helperCopy: 'Runs project analysis, skill review, agent generation and guidance during setup.',
      cellLabel: 'Workspace model: anthropic / claude-sonnet',
      tierLabel: 'Following workspace',
      provider: '',
      model: '',
    });
    expect(memory).toMatchObject({ name: 'Memory curator', retryKey: 'memory' });
    expect(enhancement).toEqual(expect.objectContaining({
      name: 'Enhancement',
      retryKey: 'enhancement',
      helperCopy: ENHANCEMENT_HELPER_COPY,
      provider: 'kimi-code',
      model: '',
      providerFieldName: 'Enhancement provider',
      modelFieldName: 'Enhancement model',
    }));
  });

  it('uses the new setting keys for scope and shows an override', () => {
    const keys: string[] = [];
    const row = buildConsumerRows(sources(), route, (key) => {
      keys.push(key);
      return { scope: key.endsWith('.model') ? 'workspace' : 'global', hasOverride: key.endsWith('.model') };
    })[2];
    expect(keys).toEqual([
      'memory.curatorProvider', 'memory.curatorModel',
      'skills.enhancement.provider', 'skills.enhancement.model',
    ]);
    expect(row.modelScope).toBe('workspace');
    expect(row.scopeShown).toBe(true);
  });

  it('distinguishes unloaded and loaded sections', () => {
    const unloaded: ConsumerSources = {
      ...sources(),
      enhancement: { status: 'unloaded', data: null, error: null },
    };
    expect(buildConsumerRows(unloaded, route, () => null)[2]).toEqual(
      expect.objectContaining({ loaded: false, sectionStatus: 'unloaded' }),
    );
    expect(buildConsumerRows(sources(), route, () => null)[2].loaded).toBe(true);
  });

  it('round trips the inherit model sentinel in enhancement assignments', () => {
    expect(toPickerModel('inherit')).toBe('');
    expect(toBackendEnhancementModel('  ')).toBe('inherit');
    expect(toBackendEnhancementModel(' kimi ')).toBe('kimi');
    expect(consumerPatch('enhancement', 'kimi-code', '')).toEqual({
      enhancement: { provider: 'kimi-code', model: 'inherit' },
    });
    expect(consumerPatch('memory-curator', 'kimi-code', 'kimi')).toEqual({
      memory: { curatorProvider: 'kimi-code', curatorModel: 'kimi' },
    });
  });

  it('describes inherited and direct routes', () => {
    expect(formatResolvedSummary(null, '', '', 'haiku')).toContain('Active provider');
    const [, inherited, direct] = buildConsumerRows(sources(), route, () => null);
    expect(inherited.followsMain).toBe(true);
    expect(direct.followsMain).toBe(false);
    expect(direct.cellLabel).toContain('Kimi Code');
  });

  it('keeps provider readiness checks', () => {
    expect(providerReadiness('anthropic', [{ id: 'anthropic', status: 'connected' }], true)).toBeNull();
    expect(providerReadiness('', [], false)).toEqual(expect.objectContaining({ blocking: true }));
  });

  it('lists Codex as unsupported for Setup and Memory curator, and provider sessions for every role', () => {
    const sessions = ['antigravity-cli', 'grok-cli', 'opencode-cli'];
    expect(CURATOR_UNSUPPORTED_PROVIDER_IDS).toEqual(['openai-codex', ...sessions]);
    const [setup, curator, enhancement] = buildConsumerRows(sources(), route, () => null);
    expect(setup.unsupportedProviders).toBe(CURATOR_UNSUPPORTED_PROVIDER_IDS);
    expect(curator.unsupportedProviders).toEqual(['openai-codex', ...sessions]);
    expect(enhancement.unsupportedProviders).toEqual(sessions);
  });

  it('describes missing parts and offers clearing only for invalid Setup overrides', () => {
    const issue = { kind: 'invalid', cause: 'provider-missing', provider: null, model: 'custom-model' } as const;
    expect(setupModelIssue({ ...issue, source: 'setup' })).toMatchObject({
      action: 'provider',
      canUseWorkspace: true,
      message: 'Setup has no provider selected.',
    });
    expect(setupModelIssue({ ...issue, source: 'workspace' })).toMatchObject({
      action: 'provider',
      canUseWorkspace: false,
      message: 'The workspace model has no provider selected.',
    });
    const [row] = buildConsumerRows({
      ...sources(),
      setup: ready({ state: { ...issue, source: 'setup' }, committed: { provider: '', model: 'custom-model' }, commitSeq: 0 }),
    }, route, () => null);
    expect(row.cellLabel).toBe('(no provider) / custom-model');
  });

  it('blocks an unsupported provider even when it is connected, with no setup action', () => {
    const connected = [{ id: 'openai-codex', status: 'connected' }];
    expect(
      providerReadiness('openai-codex', connected, true, CURATOR_UNSUPPORTED_PROVIDER_IDS),
    ).toEqual({
      message: 'Memory curation cannot run on OpenAI Codex. Choose another provider.',
      setupProviderId: null,
      providerDisplayName: 'OpenAI Codex',
      blocking: true,
    });
    // Without the list (other roles) a connected Codex stays ready.
    expect(providerReadiness('openai-codex', connected, true)).toBeNull();
    // Following the main agent is not affected by the list.
    expect(providerReadiness('', [], true, CURATOR_UNSUPPORTED_PROVIDER_IDS)).toBeNull();
  });
});
