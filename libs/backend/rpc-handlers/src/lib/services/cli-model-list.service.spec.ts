import 'reflect-metadata';

jest.mock('@ptah-extension/auth-providers', () => ({
  AUTH_PROVIDERS_TOKENS: {
    SDK_CODEX_AUTH: Symbol.for('CodexAuthService'),
    SDK_COPILOT_AUTH: Symbol.for('CopilotAuthService'),
  },
}));

import type { CliDetectionService } from '@ptah-extension/cli-agent-runtime';
import type { IModelDiscovery } from '@ptah-extension/platform-core';
import type {
  CodexAuthService,
  CopilotAuthService,
} from '@ptah-extension/auth-providers';
import type {
  AgentListCliModelsResult,
  EffortSupport,
} from '@ptah-extension/shared';
import { providerReported } from '@ptah-extension/shared';
import { CliModelListService } from './cli-model-list.service';

function makeHarness() {
  const modelMap: AgentListCliModelsResult = {
    codex: [{ id: 'codex-curated', name: 'Codex curated' }],
    copilot: [{ id: 'copilot-curated', name: 'Copilot curated' }],
    cursor: [{ id: 'cursor-model', name: 'Cursor model' }],
    antigravity: [{ id: 'antigravity-model', name: 'Antigravity model' }],
    opencode: [{ id: 'provider/model', name: 'OpenCode model' }],
    pi: [{ id: 'pi-model', name: 'Pi model' }],
    grok: [{ id: 'grok-model', name: 'Grok model' }],
    claude: [{ id: 'claude-model', name: 'Claude model' }],
  };
  const codexAdapter = {
    listCatalogModels: jest.fn().mockResolvedValue([]),
    laneEfforts: jest.fn(),
  };
  const cliDetection = {
    listModelsForAll: jest.fn().mockResolvedValue(modelMap),
    getAdapter: jest.fn((cli: string) =>
      cli === 'codex' ? codexAdapter : undefined,
    ),
    nativeEfforts: jest.fn((): EffortSupport => ({ provenance: 'unknown' })),
    recordNativeCatalog: jest.fn(),
  };
  const modelDiscovery = { getCopilotModels: jest.fn().mockResolvedValue([]) };
  const codexAuth = { listModels: jest.fn().mockResolvedValue([]) };
  const copilotAuth = { listModels: jest.fn().mockResolvedValue([]) };
  const service = new CliModelListService(
    cliDetection as unknown as CliDetectionService,
    modelDiscovery as unknown as IModelDiscovery,
    codexAuth as unknown as CodexAuthService,
    copilotAuth as unknown as CopilotAuthService,
  );
  return {
    service,
    cliDetection,
    codexAdapter,
    modelDiscovery,
    codexAuth,
    copilotAuth,
    modelMap,
  };
}

describe('CliModelListService', () => {
  describe('lane source order', () => {
    it('prefers the installed Codex CLI catalog over the account list', async () => {
      const h = makeHarness();
      const catalog = [
        {
          id: 'gpt-6-sol',
          name: 'GPT-6-Sol',
          isDefault: true,
          efforts: {
            provenance: 'native',
            supported: ['vendor-max', 'low'],
            default: 'vendor-max',
          },
        },
      ] as const;
      h.codexAdapter.listCatalogModels.mockResolvedValue(catalog);
      h.codexAuth.listModels.mockResolvedValue([
        { id: 'gpt-6.1-sol', name: 'Too new for this CLI' },
      ]);
      const result = await h.service.listForClassification();
      expect(result.codex).toEqual(catalog);
      expect(h.cliDetection.recordNativeCatalog).toHaveBeenCalledTimes(1);
      expect(h.cliDetection.recordNativeCatalog).toHaveBeenCalledWith(
        'codex',
        catalog,
      );
      expect(h.codexAuth.listModels).not.toHaveBeenCalled();
    });

    it('uses the Copilot account list when the host has no Language Model API', async () => {
      const h = makeHarness();
      h.copilotAuth.listModels.mockResolvedValue([
        { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5' },
      ]);
      const result = await h.service.listForClassification();
      expect(result.copilot).toEqual([
        { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5' },
      ]);
      expect(result.copilot[0]).not.toHaveProperty('isFallback');
    });
  });

  describe('effortSupport', () => {
    it('prefers native registry efforts, including a known empty list', () => {
      const h = makeHarness();
      const native = {
        provenance: 'native',
        supported: [],
        default: null,
      } as const;
      h.cliDetection.nativeEfforts.mockReturnValue(native);

      expect(h.service.effortSupport('codex', 'test-model')).toBe(native);
      expect(h.cliDetection.nativeEfforts).toHaveBeenCalledWith(
        'codex',
        'test-model',
      );
      expect(h.cliDetection.getAdapter).not.toHaveBeenCalled();
    });

    it.each([{ supported: ['high', 'low'] }, { supported: [] }])(
      'labels the adapter fallback list $supported',
      ({ supported }) => {
        const h = makeHarness();
        h.codexAdapter.laneEfforts.mockReturnValue(supported);

        expect(h.service.effortSupport('codex', 'test-model')).toEqual({
          provenance: 'ptah-fallback',
          supported,
          default: null,
        });
        expect(h.codexAdapter.laneEfforts).toHaveBeenCalledWith('test-model');
      },
    );

    it('returns unknown when there is no native list or adapter fallback', () => {
      const h = makeHarness();
      expect(h.service.effortSupport('cursor', 'test-model')).toEqual({
        provenance: 'unknown',
      });
      expect(h.cliDetection.getAdapter).toHaveBeenCalledWith('cursor');
    });
  });

  it('shares concurrent model reads and starts a new load after success', async () => {
    const h = makeHarness();
    const [first, classified, second] = await Promise.all([
      h.service.listAll(),
      h.service.listForClassification(),
      h.service.listAll(),
    ]);

    expect(first).toBe(second);
    expect(classified.cursor).toBe(first.cursor);
    expect(h.cliDetection.listModelsForAll).toHaveBeenCalledTimes(1);
    expect(h.codexAdapter.listCatalogModels).toHaveBeenCalledTimes(1);
    expect(h.cliDetection.recordNativeCatalog).not.toHaveBeenCalled();
    expect(h.codexAuth.listModels).toHaveBeenCalledTimes(1);
    expect(h.modelDiscovery.getCopilotModels).toHaveBeenCalledTimes(1);
    expect(h.copilotAuth.listModels).toHaveBeenCalledTimes(1);

    await h.service.listAll();
    expect(h.cliDetection.listModelsForAll).toHaveBeenCalledTimes(2);
  });

  describe('listForClassification', () => {
    it.each(['codex', 'copilot'] as const)(
      'returns live %s entries without fallback metadata',
      async (provider) => {
        const h = makeHarness();
        const query =
          provider === 'codex'
            ? h.codexAuth.listModels
            : h.modelDiscovery.getCopilotModels;
        query.mockResolvedValue([{ id: 'live-model', name: 'Live Model' }]);

        const result = await h.service.listForClassification();

        expect(result[provider]).toEqual([
          { id: 'live-model', name: 'Live Model' },
        ]);
        expect(result[provider][0]).not.toHaveProperty('isFallback');
        expect(providerReported(result[provider])).toEqual(result[provider]);
        expect(h.cliDetection.listModelsForAll).toHaveBeenCalledTimes(1);
        expect(h.codexAuth.listModels).toHaveBeenCalledTimes(1);
        expect(h.modelDiscovery.getCopilotModels).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(await h.service.listAll())).toBe(
          JSON.stringify({
            ...h.modelMap,
            [provider]: [{ id: 'live-model', name: 'Live Model' }],
          }),
        );
      },
    );

    it.each(['codex', 'copilot'] as const)(
      'marks every detector %s entry as fallback when the live list is empty',
      async (provider) => {
        const h = makeHarness();
        h.modelMap[provider].push({
          id: 'second',
          name: 'Second',
          isFallback: false,
        });
        const before = JSON.stringify(h.modelMap);

        const result = await h.service.listForClassification();

        expect(result[provider]).toEqual(
          h.modelMap[provider].map((entry) => ({
            ...entry,
            isFallback: true,
          })),
        );
        expect(providerReported(result[provider])).toEqual([]);
        expect(JSON.stringify(h.modelMap)).toBe(before);
        expect(h.cliDetection.listModelsForAll).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(await h.service.listAll())).toBe(before);
      },
    );

    it('keeps Cursor row provenance, reports OpenCode rows, and leaves Claude empty', async () => {
      const h = makeHarness();
      h.modelMap.cursor.push({ id: 'cursor-fallback', name: 'Cursor fallback', isFallback: true });
      const result = await h.service.listForClassification();

      expect(result.cursor).toEqual([
        { id: 'cursor-model', name: 'Cursor model' },
        { id: 'cursor-fallback', name: 'Cursor fallback', isFallback: true },
      ]);
      expect(providerReported(result.cursor)).toEqual([h.modelMap.cursor[0]]);
      expect(result.opencode).toEqual([
        { id: 'provider/model', name: 'OpenCode model' },
      ]);
      expect(providerReported(result.opencode)).toEqual(h.modelMap.opencode);
      expect(result.claude).toEqual([]);
      expect(Object.keys(result)).toEqual([
        'claude',
        'codex',
        'copilot',
        'cursor',
        'opencode',
      ]);
      expect(h.cliDetection.listModelsForAll).toHaveBeenCalledTimes(1);
    });

    it('marks OpenCode notice lines and ids without a provider as fallback', async () => {
      const h = makeHarness();
      h.modelMap.opencode.push(
        { id: 'Notice: models updated', name: 'Notice' },
        { id: 'unqualified', name: 'Unqualified' },
      );
      const result = await h.service.listForClassification();
      expect(result.opencode).toEqual([
        { id: 'provider/model', name: 'OpenCode model' },
        { id: 'Notice: models updated', name: 'Notice', isFallback: true },
        { id: 'unqualified', name: 'Unqualified', isFallback: true },
      ]);
      expect(providerReported(result.opencode)).toEqual([h.modelMap.opencode[0]]);
    });

    it('returns empty classification lists when the detector and live lists are empty', async () => {
      const h = makeHarness();
      h.cliDetection.listModelsForAll.mockResolvedValue({});

      expect(await h.service.listForClassification()).toEqual({
        claude: [],
        codex: [],
        copilot: [],
        cursor: [],
        opencode: [],
      });
      expect(h.cliDetection.listModelsForAll).toHaveBeenCalledTimes(1);
    });

    it('marks detector entries as fallback when live queries fail', async () => {
      const h = makeHarness();
      h.codexAuth.listModels.mockRejectedValue(new Error('offline'));
      h.modelDiscovery.getCopilotModels.mockRejectedValue(
        new Error('unavailable'),
      );

      const result = await h.service.listForClassification();

      expect(result.codex).toEqual([
        { id: 'codex-curated', name: 'Codex curated', isFallback: true },
      ]);
      expect(result.copilot).toEqual([
        { id: 'copilot-curated', name: 'Copilot curated', isFallback: true },
      ]);
    });
  });

  it('preserves the serialized map and entry metadata when refinements are empty', async () => {
    const h = makeHarness();
    h.modelMap.cursor.push({
      id: 'fallback',
      name: 'Fallback',
      isFallback: true,
    });

    const result = await h.service.listAll();

    expect(JSON.stringify(result)).toBe(JSON.stringify(h.modelMap));
    expect(result.codex).toBe(h.modelMap.codex);
    expect(result.copilot).toBe(h.modelMap.copilot);
    expect(result.cursor).toBe(h.modelMap.cursor);
  });

  it('uses auth and host models with the existing naming and property order', async () => {
    const h = makeHarness();
    h.codexAuth.listModels.mockResolvedValue([
      { id: 'gpt-5.3-codex', name: 'Account model', contextLength: 100 },
      { id: 'gpt-5.4-ai', name: '' },
    ]);
    h.modelDiscovery.getCopilotModels.mockResolvedValue([
      { id: 'claude-opus-4.6', name: 'Ignored host name', contextLength: 100 },
    ]);

    expect(JSON.stringify(await h.service.listAll())).toBe(
      JSON.stringify({
        ...h.modelMap,
        codex: [
          { id: 'gpt-5.3-codex', name: 'Account model' },
          { id: 'gpt-5.4-ai', name: 'GPT 5.4 AI' },
        ],
        copilot: [{ id: 'claude-opus-4.6', name: 'Claude Opus 4.6' }],
      }),
    );
  });

  it.each(['codex', 'copilot', 'both'])(
    'keeps the detector lists when %s refinement fails',
    async (failure) => {
      const h = makeHarness();
      if (failure !== 'copilot') {
        h.codexAuth.listModels.mockRejectedValue(new Error('offline'));
      }
      if (failure !== 'codex') {
        h.modelDiscovery.getCopilotModels.mockRejectedValue(
          new Error('unavailable'),
        );
      }

      expect(await h.service.listAll()).toEqual(h.modelMap);
      expect(h.codexAuth.listModels).toHaveBeenCalledTimes(1);
      expect(h.modelDiscovery.getCopilotModels).toHaveBeenCalledTimes(1);
    },
  );

  it('returns empty arrays for missing detector entries', async () => {
    const h = makeHarness();
    h.cliDetection.listModelsForAll.mockResolvedValue({});
    expect(await h.service.listAll()).toEqual({
      codex: [],
      copilot: [],
      cursor: [],
      antigravity: [],
      opencode: [],
      pi: [],
      grok: [],
      claude: [],
    });
  });

  it('still refines live models when the detector has no entries', async () => {
    const h = makeHarness();
    h.cliDetection.listModelsForAll.mockResolvedValue({});
    h.codexAuth.listModels.mockResolvedValue([{ id: 'gpt-5', name: 'GPT 5' }]);
    const result = await h.service.listAll();
    expect(result.codex).toEqual([{ id: 'gpt-5', name: 'GPT 5' }]);
    expect(result.copilot).toEqual([]);
  });

  it('propagates a shared detector failure and retries the next load', async () => {
    const h = makeHarness();
    const error = new Error('detector failed');
    h.cliDetection.listModelsForAll.mockRejectedValueOnce(error);
    await Promise.all([
      expect(h.service.listAll()).rejects.toBe(error),
      expect(h.service.listForClassification()).rejects.toBe(error),
    ]);
    expect(h.cliDetection.listModelsForAll).toHaveBeenCalledTimes(1);
    expect(h.codexAuth.listModels).not.toHaveBeenCalled();
    expect(h.modelDiscovery.getCopilotModels).not.toHaveBeenCalled();
    await expect(h.service.listAll()).resolves.toEqual(h.modelMap);
    expect(h.cliDetection.listModelsForAll).toHaveBeenCalledTimes(2);
  });
});
