/**
 * Live vendor-catalog parser probe.
 *
 * Proves that Ptah's production parsers still read each vendor's live model
 * catalog, and raises the one staleness signal that still matters: a tier
 * preference (`defaultTiers`) the vendor has retired. It never compares
 * against a repo list and never asserts a specific model id or count.
 *
 * It makes REAL network calls, so it is `describe.skip` unless
 * `PTAH_LIVE_PROBES=1` is set. The daily `model-lists-probe.yml` workflow runs
 * it and files an issue on failure.
 *
 * ```
 * PTAH_LIVE_PROBES=1 npx jest --config libs/backend/auth-providers/jest.config.ts \
 *   --runInBand --coverage=false --runTestsByPath \
 *   libs/backend/auth-providers/src/lib/vendor-model-parsers.live.spec.ts
 * ```
 *
 * Keyed providers run only when their env key is set:
 * `PTAH_LIVE_ANTHROPIC_KEY`, `PTAH_LIVE_ZAI_KEY`, `PTAH_LIVE_SAKANA_KEY`.
 */
import 'reflect-metadata';
import {
  closestLiveModel,
  getPtahCliLaneProvider,
  toCloudId,
  type ProviderModelInfo,
} from '@ptah-extension/shared';
import { createMockLogger } from '@ptah-extension/shared/testing';
import { createMockConfigManager } from '@ptah-extension/vscode-core/testing';
import type {
  ConfigManager,
  IAuthSecretsService,
  Logger,
  SentryService,
} from '@ptah-extension/vscode-core';
import { ActiveProviderResolver } from './auth/active-provider-resolver';
import type { WorkspaceScopeResolver } from '@ptah-extension/settings-core';
import { ProviderModelsService } from './provider-models.service';
import { parseModelsApiRows } from './models-api-parser';
import { openCodeLiveRoutes } from './providers/opencode/opencode-live-routes';
import { OllamaModelDiscoveryService } from './providers/local/ollama-model-discovery.service';
import { OllamaCloudMetadataService } from './providers/local/ollama-cloud-metadata.service';
import type { OpenRouterPricingService } from './providers/openrouter';

const live = process.env['PTAH_LIVE_PROBES'] === '1';
const describeLive = live ? describe : describe.skip;

const PROTOCOLS = ['messages', 'chat/completions', 'responses'];
const TIERS = ['sonnet', 'opus', 'haiku'] as const;

function log(message: string): void {
  process.stdout.write(`[vendor-model-parsers.live] ${message}\n`);
}

async function getJson(url: string): Promise<{ data?: unknown[] }> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Ptah-Extension/model-parser-probe' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return (await response.json()) as { data?: unknown[] };
}

function makeModelsService() {
  const config = createMockConfigManager();
  const service = new ProviderModelsService(
    createMockLogger() as unknown as Logger,
    config as unknown as ConfigManager,
    {},
    new ActiveProviderResolver({
      read: () => undefined,
      isStored: () => false,
    } as unknown as WorkspaceScopeResolver),
  );
  // The same store wiring DI registration performs.
  openCodeLiveRoutes.usePersistedCatalog({
    read: (id) => service.getPersistedCatalog(id),
    write: (id, models) => service.savePersistedCatalog(id, models),
  });
  return { service, config };
}

/**
 * The staleness alarm: every declared tier preference must be listed live.
 * `same` normalises an id the way the provider's own list spells it.
 */
function missingPreferences(
  providerId: string,
  liveIds: readonly string[],
  same: (id: string) => string = (id) => id,
): string[] {
  const defaults = getPtahCliLaneProvider(providerId)?.defaultTiers;
  const normalizedLive = new Set(liveIds.map(same));
  const missing: string[] = [];
  for (const tier of TIERS) {
    const preferred = defaults?.[tier];
    if (!preferred) continue;
    if (normalizedLive.has(same(preferred))) {
      log(`${providerId} ${tier} preference ${preferred}: listed`);
      continue;
    }
    const closest = closestLiveModel(preferred, liveIds);
    missing.push(
      `tier preference ${preferred} (${providerId} ${tier}) is no longer listed; ` +
        `runtime resolves it to ${closest ?? 'the live-derived tier or nothing'}`,
    );
  }
  return missing;
}

describeLive('live vendor catalog parsers', () => {
  jest.setTimeout(180_000);

  describe.each(['opencode-zen', 'opencode-go'] as const)(
    '%s gateway',
    (providerId) => {
      let models: ProviderModelInfo[] = [];
      let config: ReturnType<typeof makeModelsService>['config'];

      beforeAll(async () => {
        const made = makeModelsService();
        config = made.config;
        const result = await made.service.fetchModels(providerId, null);
        expect({
          source: result.source,
          failureReason: result.failureReason,
        }).toEqual({ source: 'live', failureReason: undefined });
        models = result.models;
        log(`${providerId}: ${models.length} routable chat model(s) parsed`);
      });

      it('lists at least one model with a resolved upstream protocol', () => {
        expect(models.length).toBeGreaterThanOrEqual(1);
        const protocols = models.map(
          (m) => (m as { upstreamProtocol?: string }).upstreamProtocol,
        );
        expect(protocols.filter((p) => !PROTOCOLS.includes(p ?? ''))).toEqual(
          [],
        );
      });

      it('saves a schema 2 live catalog record', () => {
        const record = config.__snapshot()[
          `provider.${providerId}.modelCatalog`
        ] as { schema?: number; origin?: string } | undefined;
        expect(record).toMatchObject({ schema: 2, origin: 'live' });
      });

      it('still lists every tier preference', () => {
        expect(
          missingPreferences(
            providerId,
            models.map((m) => m.id),
          ),
        ).toEqual([]);
      });
    },
  );

  describe('ollama-cloud discovery', () => {
    let models: ProviderModelInfo[] = [];

    beforeAll(async () => {
      // A closed local port: only ollama.com can answer.
      const config = createMockConfigManager({
        values: { 'provider.ollama-cloud.baseUrl': 'http://127.0.0.1:1' },
      });
      const logger = createMockLogger() as unknown as Logger;
      const service = new OllamaModelDiscoveryService(
        logger,
        config as unknown as ConfigManager,
        new OllamaCloudMetadataService(
          logger,
          {} as unknown as OpenRouterPricingService,
        ),
        {
          getProviderKey: async () => null,
        } as unknown as IAuthSecretsService,
        { captureException: () => undefined } as unknown as SentryService,
      );
      models = await service.listCloudModels();
      log(`ollama-cloud: ${models.length} chat model(s) parsed`);
    }, 180_000);

    it('lists at least one model', () => {
      expect(models.length).toBeGreaterThanOrEqual(1);
    });

    it('reports a positive context length for enriched tags', () => {
      const sample = models.slice(0, 3);
      const withWindow = sample.filter((m) => (m.contextLength ?? 0) > 0);
      log(
        `ollama-cloud: ${withWindow.length}/${sample.length} sampled tag(s) with a context length`,
      );
      expect(withWindow.length).toBeGreaterThanOrEqual(1);
    });

    it('still lists every tier preference', () => {
      expect(
        missingPreferences(
          'ollama-cloud',
          models.map((m) => m.id),
          toCloudId,
        ),
      ).toEqual([]);
    });
  });

  describe.each([
    ['openrouter', 'https://openrouter.ai/api/v1/models'],
    ['requesty', 'https://router.requesty.ai/v1/models'],
  ] as const)('%s keyless /v1/models', (name, url) => {
    it('parses rows with ids and positive context lengths', async () => {
      const body = await getJson(url);
      const raw = Array.isArray(body.data) ? body.data : [];
      const rows = parseModelsApiRows(raw);
      log(
        `${name}: ${rows.length} row(s) kept, ${raw.length - rows.length} skipped`,
      );
      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(rows.some((r) => r.contextLength > 0)).toBe(true);
    });
  });

  describe.each([
    ['anthropic-api', 'PTAH_LIVE_ANTHROPIC_KEY'],
    ['z-ai', 'PTAH_LIVE_ZAI_KEY'],
    ['sakana', 'PTAH_LIVE_SAKANA_KEY'],
  ] as const)('%s keyed list', (providerId, envKey) => {
    const key = process.env[envKey];
    const itKeyed = key ? it : it.skip;
    itKeyed(`lists live models when ${envKey} is set`, async () => {
      const { service } = makeModelsService();
      const result = await service.fetchModels(providerId, key as string);
      log(`${providerId}: ${result.models.length} model(s) parsed`);
      expect(result.source).toBe('live');
      expect(result.models.length).toBeGreaterThanOrEqual(1);
    });
  });
});
