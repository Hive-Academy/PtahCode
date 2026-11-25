import 'reflect-metadata';

jest.mock('@ptah-extension/cli-agent-runtime', () => ({
  CLI_AGENT_RUNTIME_TOKENS: {
    SDK_PTAH_CLI_CONFIG_PERSISTENCE: Symbol.for('SdkPtahCliConfigPersistence'),
  },
  PTAH_CLI_KEY_PREFIX: 'ptahCli',
}));

jest.mock('@ptah-extension/auth-providers', () => ({
  AUTH_PROVIDERS_TOKENS: {
    SDK_PROVIDER_MODELS: Symbol.for('SdkProviderModels'),
    SDK_CODEX_AUTH: Symbol.for('SdkCodexAuth'),
    SDK_COPILOT_AUTH: Symbol.for('SdkCopilotAuth'),
  },
}));

import type {
  AgentModelEntry,
  AgentModelProvider,
  CliDetectionResult,
  EffortSupport,
  PtahCliConfig,
} from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';
import { CliModelListService } from './cli-model-list.service';
import { LaneModelListingAdapter } from './lane-model-listing.adapter';

type FetchResult = {
  models: readonly { readonly id: string }[];
  totalCount: number;
  source: 'live' | 'persisted' | 'unavailable';
  failureReason?: string;
};

type ListedCliModels = Awaited<ReturnType<CliModelListService['listAll']>>;

function emptyListed(): ListedCliModels {
  return {
    codex: [],
    copilot: [],
    cursor: [],
    antigravity: [],
    opencode: [],
    pi: [],
    grok: [],
    claude: [],
  };
}

function emptyClassified(): Record<AgentModelProvider, AgentModelEntry[]> {
  return {
    claude: [],
    codex: [],
    copilot: [],
    cursor: [],
    opencode: [],
  };
}

function cliRow(
  cli: CliDetectionResult['cli'],
  extra: Partial<CliDetectionResult> = {},
): CliDetectionResult {
  return {
    cli,
    installed: true,
    messagingMode: 'none',
    ...extra,
  };
}

function ptahConfig(overrides: Partial<PtahCliConfig> = {}): PtahCliConfig {
  return {
    id: 'cli-1',
    name: 'Lane',
    providerId: 'openrouter',
    enabled: true,
    updatedAt: 1,
    selectedModel: 'chosen',
    tierMappings: { sonnet: 'tier-s', opus: 'tier-o', haiku: 'tier-h' },
    ...overrides,
  };
}

function makeHarness(options?: {
  listed?: ListedCliModels;
  classified?: Record<AgentModelProvider, AgentModelEntry[]>;
  configs?: PtahCliConfig[];
  apiKey?: string | undefined;
  /** Keys per secret slot; overrides `apiKey` for `getProviderKey`. */
  keysBySlot?: Record<string, string | undefined>;
  /** The shared connection key (`getCredential('apiKey')`). */
  sharedKey?: string;
  fetch?: () => Promise<FetchResult>;
}) {
  const listAll = jest.fn(() =>
    Promise.resolve(options?.listed ?? emptyListed()),
  );
  const listForClassification = jest.fn(() =>
    Promise.resolve(options?.classified ?? emptyClassified()),
  );
  const effortSupport = jest.fn(
    (): EffortSupport => ({ provenance: 'unknown' }),
  );
  const loadConfigs = jest.fn(() => options?.configs ?? []);
  const fetchModels = jest.fn(
    (_providerId: string, _apiKey: string | null, _toolUseOnly?: boolean) =>
      options?.fetch?.() ??
      Promise.resolve<FetchResult>({
        models: [],
        totalCount: 0,
        source: 'live',
      }),
  );
  const getProviderKey = jest.fn((slot: string) =>
    Promise.resolve(
      options?.keysBySlot ? options.keysBySlot[slot] : options?.apiKey,
    ),
  );
  const getCredential = jest.fn(() => Promise.resolve(options?.sharedKey));
  const debug = jest.fn();
  const logger: Pick<Logger, 'debug'> = { debug };
  const adapter = new LaneModelListingAdapter(
    logger,
    { listAll, listForClassification, effortSupport },
    { loadConfigs },
    { fetchModels },
    { getProviderKey, getCredential },
  );
  return {
    adapter,
    listAll,
    listForClassification,
    effortSupport,
    loadConfigs,
    fetchModels,
    getProviderKey,
    getCredential,
    debug,
  };
}

describe('LaneModelListingAdapter', () => {
  it('keeps model provenance and prefers native row efforts over the service lookup', async () => {
    const native = {
      provenance: 'native',
      supported: ['vendor-max', 'low'],
      default: 'vendor-max',
    } as const;
    const fallback = {
      provenance: 'ptah-fallback',
      supported: ['low', 'high'],
      default: null,
    } as const;
    const listed = emptyListed();
    listed.codex = [
      { id: 'gpt-live', name: 'GPT Live', efforts: native },
      { id: ' gpt-old ', name: 'GPT Old' },
    ];
    const classified = emptyClassified();
    classified.codex = [
      { id: 'gpt-live' },
      { id: 'gpt-old', isFallback: true },
    ];
    const { adapter, listAll, listForClassification, effortSupport } = makeHarness({
      listed,
      classified,
    });
    effortSupport.mockReturnValue(fallback);

    const entries = await adapter.list(
      cliRow('codex'),
      new AbortController().signal,
    );

    expect(listAll).toHaveBeenCalledTimes(1);
    expect(listForClassification).toHaveBeenCalledTimes(1);
    expect(effortSupport).toHaveBeenCalledTimes(1);
    expect(effortSupport).toHaveBeenCalledWith('codex', 'gpt-old');
    expect(entries).toEqual([
      { id: 'gpt-live', provenance: 'reported', efforts: native },
      { id: 'gpt-old', provenance: 'fallback', efforts: fallback },
    ]);
    expect(entries[0].efforts).toBe(native);
  });

  it('tags an unclassified curated cli list as reported when isFallback is unset', async () => {
    const listed = emptyListed();
    listed.pi = [{ id: 'pi-model', name: 'Pi' }];
    const { adapter } = makeHarness({ listed });

    await expect(
      adapter.list(cliRow('pi'), new AbortController().signal),
    ).resolves.toEqual([{ id: 'pi-model', provenance: 'reported', efforts: { provenance: 'unknown' } }]);
  });

  it('keeps configured, then tier, then live discovery ids without duplicates', async () => {
    const { adapter, fetchModels } = makeHarness({
      configs: [
        ptahConfig({
          tierMappings: { sonnet: 'tier-s', opus: 'chosen', haiku: 'tier-h' },
        }),
      ],
      apiKey: 'sk-test',
      fetch: () =>
        Promise.resolve({
          models: [{ id: 'chosen' }, { id: 'tier-s' }, { id: 'live-new' }],
          totalCount: 3,
          source: 'live',
        }),
    });

    const entries = await adapter.list(
      cliRow('ptah-cli', { ptahCliId: 'cli-1', providerId: 'openrouter' }),
      new AbortController().signal,
    );

    expect(fetchModels).toHaveBeenCalledWith('openrouter', 'sk-test', false);
    expect(entries).toEqual([
      { id: 'chosen', provenance: 'configured', efforts: { provenance: 'unknown' } },
      { id: 'tier-s', provenance: 'tier', efforts: { provenance: 'unknown' } },
      { id: 'tier-h', provenance: 'tier', efforts: { provenance: 'unknown' } },
      { id: 'live-new', provenance: 'reported', efforts: { provenance: 'unknown' } },
    ]);
  });

  it('tags persisted discovery ids as fallback', async () => {
    const { adapter } = makeHarness({
      configs: [ptahConfig({ selectedModel: 'chosen', tierMappings: {} })],
      apiKey: 'sk-test',
      fetch: () =>
        Promise.resolve({
          models: [{ id: 'saved-id' }],
          totalCount: 1,
          source: 'persisted',
          failureReason: 'network',
        }),
    });

    await expect(
      adapter.list(
        cliRow('ptah-cli', { ptahCliId: 'cli-1' }),
        new AbortController().signal,
      ),
    ).resolves.toEqual([
      { id: 'chosen', provenance: 'configured', efforts: { provenance: 'unknown' } },
      { id: 'saved-id', provenance: 'fallback', efforts: { provenance: 'unknown' } },
    ]);
  });

  it('returns configured and tier entries and logs once when discovery throws', async () => {
    const { adapter, debug } = makeHarness({
      configs: [ptahConfig()],
      apiKey: 'sk-test',
      fetch: () => Promise.reject(new Error('network down')),
    });

    const entries = await adapter.list(
      cliRow('ptah-cli', { ptahCliId: 'cli-1', providerId: 'openrouter' }),
      new AbortController().signal,
    );

    expect(entries).toEqual([
      { id: 'chosen', provenance: 'configured', efforts: { provenance: 'unknown' } },
      { id: 'tier-s', provenance: 'tier', efforts: { provenance: 'unknown' } },
      { id: 'tier-o', provenance: 'tier', efforts: { provenance: 'unknown' } },
      { id: 'tier-h', provenance: 'tier', efforts: { provenance: 'unknown' } },
    ]);
    expect(debug).toHaveBeenCalledTimes(1);
    expect(debug).toHaveBeenCalledWith(
      '[LaneModelListing] discovery unavailable',
      { ptahCliId: 'cli-1', providerId: 'openrouter', reason: 'threw' },
    );
  });

  it('maps an unavailable list to a threw miss and keeps the saved entries', async () => {
    const { adapter, fetchModels, debug } = makeHarness({
      configs: [ptahConfig({ providerId: 'openrouter' })],
      apiKey: undefined,
      fetch: () =>
        Promise.resolve({
          models: [],
          totalCount: 0,
          source: 'unavailable',
          failureReason: 'no-key',
        }),
    });

    const entries = await adapter.list(
      cliRow('ptah-cli', { ptahCliId: 'cli-1', providerId: 'openrouter' }),
      new AbortController().signal,
    );

    // No handler-side key pre-check: the chain decides.
    expect(fetchModels).toHaveBeenCalledWith('openrouter', null, false);
    expect(debug).toHaveBeenCalledWith(
      '[LaneModelListing] discovery unavailable',
      { ptahCliId: 'cli-1', providerId: 'openrouter', reason: 'threw' },
    );
    expect(entries.map((entry) => entry.provenance)).toEqual([
      'configured',
      'tier',
      'tier',
      'tier',
    ]);
  });

  it('logs empty and keeps configured and tier entries when discovery returns nothing', async () => {
    const { adapter, debug } = makeHarness({
      configs: [ptahConfig({ tierMappings: { sonnet: 'tier-s' } })],
      apiKey: 'sk-test',
      fetch: () =>
        Promise.resolve({ models: [], totalCount: 0, source: 'live' }),
    });

    await expect(
      adapter.list(
        cliRow('ptah-cli', { ptahCliId: 'cli-1' }),
        new AbortController().signal,
      ),
    ).resolves.toEqual([
      { id: 'chosen', provenance: 'configured', efforts: { provenance: 'unknown' } },
      { id: 'tier-s', provenance: 'tier', efforts: { provenance: 'unknown' } },
    ]);
    expect(debug).toHaveBeenCalledWith(
      '[LaneModelListing] discovery unavailable',
      expect.objectContaining({ reason: 'empty' }),
    );
  });

  it('lists with the instance key, not the provider-wide slot', async () => {
    const { adapter, fetchModels, getProviderKey } = makeHarness({
      configs: [ptahConfig({ id: 'cli-1' })],
      keysBySlot: { 'ptahCli.cli-1': 'sk-instance', openrouter: 'sk-other' },
    });

    await adapter.list(
      cliRow('ptah-cli', { ptahCliId: 'cli-1', providerId: 'openrouter' }),
      new AbortController().signal,
    );

    expect(getProviderKey).toHaveBeenCalledWith('ptahCli.cli-1');
    expect(fetchModels).toHaveBeenCalledWith(
      'openrouter',
      'sk-instance',
      false,
    );
  });

  it('lists a shared-connection anthropic-api instance with the shared key', async () => {
    const { adapter, fetchModels, getCredential } = makeHarness({
      configs: [
        ptahConfig({
          id: 'cli-1',
          providerId: 'anthropic-api',
          credentialSource: 'shared-connection',
        }),
      ],
      sharedKey: 'sk-shared',
    });

    await adapter.list(
      cliRow('ptah-cli', { ptahCliId: 'cli-1', providerId: 'anthropic-api' }),
      new AbortController().signal,
    );

    expect(getCredential).toHaveBeenCalledWith('apiKey');
    expect(fetchModels).toHaveBeenCalledWith(
      'anthropic-api',
      'sk-shared',
      false,
    );
  });

  it('does not share one discovery between instances with different keys', async () => {
    const { adapter, fetchModels } = makeHarness({
      configs: [ptahConfig({ id: 'cli-1' }), ptahConfig({ id: 'cli-2' })],
      keysBySlot: { 'ptahCli.cli-1': 'sk-a', 'ptahCli.cli-2': 'sk-b' },
    });
    const signal = new AbortController().signal;

    await Promise.all([
      adapter.list(
        cliRow('ptah-cli', { ptahCliId: 'cli-1', providerId: 'openrouter' }),
        signal,
      ),
      adapter.list(
        cliRow('ptah-cli', { ptahCliId: 'cli-2', providerId: 'openrouter' }),
        signal,
      ),
    ]);

    expect(fetchModels).toHaveBeenCalledTimes(2);
    expect(fetchModels).toHaveBeenCalledWith('openrouter', 'sk-a', false);
    expect(fetchModels).toHaveBeenCalledWith('openrouter', 'sk-b', false);
  });

  it('shares one in-flight fetch across two rows on the same provider', async () => {
    let release: (result: FetchResult) => void = () => undefined;
    const pending = new Promise<FetchResult>((resolve) => {
      release = resolve;
    });
    const { adapter, fetchModels } = makeHarness({
      configs: [
        ptahConfig({ id: 'cli-1', selectedModel: 'chosen-a' }),
        ptahConfig({
          id: 'cli-2',
          selectedModel: 'chosen-b',
          tierMappings: { haiku: 'tier-b' },
        }),
      ],
      apiKey: 'sk-test',
      fetch: () => pending,
    });
    const signal = new AbortController().signal;

    const first = adapter.list(
      cliRow('ptah-cli', { ptahCliId: 'cli-1', providerId: 'openrouter' }),
      signal,
    );
    const second = adapter.list(
      cliRow('ptah-cli', { ptahCliId: 'cli-2', providerId: 'openrouter' }),
      signal,
    );
    // Each row reads its key first, then joins the shared discovery.
    await new Promise((resolve) => setImmediate(resolve));
    expect(fetchModels).toHaveBeenCalledTimes(1);

    release({
      models: [{ id: 'live-new' }],
      totalCount: 1,
      source: 'live',
    });

    await expect(first).resolves.toEqual([
      { id: 'chosen-a', provenance: 'configured', efforts: { provenance: 'unknown' } },
      { id: 'tier-s', provenance: 'tier', efforts: { provenance: 'unknown' } },
      { id: 'tier-o', provenance: 'tier', efforts: { provenance: 'unknown' } },
      { id: 'tier-h', provenance: 'tier', efforts: { provenance: 'unknown' } },
      { id: 'live-new', provenance: 'reported', efforts: { provenance: 'unknown' } },
    ]);
    await expect(second).resolves.toEqual([
      { id: 'chosen-b', provenance: 'configured', efforts: { provenance: 'unknown' } },
      { id: 'tier-b', provenance: 'tier', efforts: { provenance: 'unknown' } },
      { id: 'live-new', provenance: 'reported', efforts: { provenance: 'unknown' } },
    ]);
  });

  it('fetches again after the shared discovery promise settles', async () => {
    const { adapter, fetchModels } = makeHarness({
      configs: [ptahConfig()],
      apiKey: 'sk-test',
      fetch: () =>
        Promise.resolve({
          models: [{ id: 'live-new' }],
          totalCount: 1,
          source: 'live',
        }),
    });
    const row = cliRow('ptah-cli', { ptahCliId: 'cli-1' });
    const signal = new AbortController().signal;

    await adapter.list(row, signal);
    await adapter.list(row, signal);

    expect(fetchModels).toHaveBeenCalledTimes(2);
  });

  it('returns saved entries when discovery never settles and the signal aborts at 2000ms', async () => {
    jest.useFakeTimers();
    try {
      const { adapter, debug } = makeHarness({
        configs: [ptahConfig()],
        apiKey: 'sk-test',
        fetch: () => new Promise<FetchResult>(() => undefined),
        listed: {
          ...emptyListed(),
          codex: [{ id: 'gpt-live', name: 'GPT Live' }],
        },
        classified: {
          ...emptyClassified(),
          codex: [{ id: 'gpt-live' }],
        },
      });
      const ptahController = new AbortController();
      const ptahPending = adapter.list(
        cliRow('ptah-cli', { ptahCliId: 'cli-1', providerId: 'openrouter' }),
        ptahController.signal,
      );
      const cliPending = adapter.list(
        cliRow('codex'),
        new AbortController().signal,
      );
      await Promise.resolve();
      setTimeout(() => ptahController.abort(), 2000);
      jest.advanceTimersByTime(2000);

      await expect(ptahPending).resolves.toEqual([
        { id: 'chosen', provenance: 'configured', efforts: { provenance: 'unknown' } },
        { id: 'tier-s', provenance: 'tier', efforts: { provenance: 'unknown' } },
        { id: 'tier-o', provenance: 'tier', efforts: { provenance: 'unknown' } },
        { id: 'tier-h', provenance: 'tier', efforts: { provenance: 'unknown' } },
      ]);
      await expect(cliPending).resolves.toEqual([
        { id: 'gpt-live', provenance: 'reported', efforts: { provenance: 'unknown' } },
      ]);
      expect(debug).toHaveBeenCalledTimes(1);
      expect(debug).toHaveBeenCalledWith(
        '[LaneModelListing] discovery unavailable',
        expect.objectContaining({
          ptahCliId: 'cli-1',
          providerId: 'openrouter',
          reason: 'aborted',
        }),
      );
    } finally {
      jest.useRealTimers();
    }
  });
});
