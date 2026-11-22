/**
 * Provider Models Service
 *
 * Fetches available models from any Anthropic-compatible provider and manages
 * model tier mappings for Sonnet/Opus/Haiku overrides.
 *
 * Every provider's list comes from one live route (the OpenCode gateway, a
 * registered dynamic fetcher, or the provider's `/v1/models` endpoint). When
 * the live fetch fails, the list saved from the last live success is used;
 * otherwise the answer is an explicit `unavailable` with a closed failure
 * reason. There is no repo-literal model list anywhere in this chain.
 *
 * Environment Variables Set:
 * - ANTHROPIC_DEFAULT_SONNET_MODEL
 * - ANTHROPIC_DEFAULT_OPUS_MODEL
 * - ANTHROPIC_DEFAULT_HAIKU_MODEL
 */

import { createHash } from 'crypto';
import { injectable, inject } from 'tsyringe';
import axios from 'axios';
import { Logger, ConfigManager, TOKENS } from '@ptah-extension/vscode-core';
import type {
  AuthEnv,
  ModelCapability,
  ModelListFailureReason,
  ProviderModelInfo,
  ProviderModelListSource,
  ProviderModelTier,
  ProviderTierScope,
  ModelPricing,
} from '@ptah-extension/shared';
import {
  CREDENTIAL_FAILURE_REASONS,
  closestLiveModel,
  getAnthropicProvider,
  getProviderLiveModelCapabilities,
  getPtahCliLaneProvider,
  isOpenCodeProviderId,
  replaceProviderContextWindows,
  updatePricingMap,
  type AnthropicProvider,
} from '@ptah-extension/shared';
import {
  SdkError,
  TIER_ENV_VAR_MAP,
  TIER_METADATA_ENV_VAR_MAP,
  ALL_TIER_ENV_KEYS,
} from '@ptah-extension/agent-sdk';
import { AUTH_PROVIDERS_TOKENS } from './di/tokens';
import { openCodeLiveRoutes } from './providers/opencode/opencode-live-routes';
import { ActiveProviderResolver } from './auth/active-provider-resolver';
import {
  deriveTiersFromCatalog,
  type DerivedTierMap,
} from './model-tier-derivation';
import { ModelListError, classifyModelListFailure } from './model-list-error';
import { parseModelsApiRows } from './models-api-parser';

/** Per-provider cache entry */
interface ProviderCache {
  models: ProviderModelInfo[];
  timestamp: number;
  /** {@link credentialFingerprint} of the key the list was fetched with. */
  credential?: string;
  /**
   * Monotonic write sequence (`ProviderModelsService.cacheRevision`). Unlike
   * `timestamp`, two writes in the same millisecond still differ.
   */
  revision?: number;
}

/**
 * A short, one-way fingerprint of the credential a list was fetched with:
 * the first 16 hex digits of a SHA-256 over a fixed prefix and the key, or
 * `''` without a key. A cached or saved list is served only to the same
 * fingerprint, so two keys (two Ptah CLI agents, or a rotated key) never share
 * a list. The raw key is never stored.
 */
export function credentialFingerprint(apiKey: string | null): string {
  if (!apiKey) return '';
  return createHash('sha256')
    .update(`ptah-model-list:${apiKey}`)
    .digest('hex')
    .slice(0, 16);
}

/**
 * The credential a synchronous catalog read is for: the key one run
 * authenticates with (`null` without one). The read then answers only from a
 * list fetched under that credential's fingerprint, not from whichever
 * credential listed this provider last.
 */
export interface CatalogCredentialScope {
  apiKey: string | null;
}

/** Callback type for dynamic model fetchers (e.g., Copilot SDK listModels) */
export type DynamicModelFetcher = () => Promise<ProviderModelInfo[]>;

/** Optional hooks a dynamic fetcher registers with its route. */
export interface DynamicFetcherOptions {
  /**
   * The account's sign-in state, read before any list is served (also a
   * cached one): `false` returns `unavailable` / `not-signed-in` and drops the
   * cached list; `true` or `undefined` (unknown) lets the chain continue.
   */
  signedIn?: () => Promise<boolean | undefined>;
}

/**
 * One provider's model list and how sure the service is about it.
 *
 * `failureReason` is set exactly when `source !== 'live'`. `savedAt` is set
 * only for `source: 'persisted'`.
 */
export interface ProviderModelList {
  /** After the `toolUseOnly` filter (rows with unknown tool support kept). */
  models: ProviderModelInfo[];
  /** Size of the full, unfiltered list. */
  totalCount: number;
  source: ProviderModelListSource;
  /** Epoch ms at which a persisted list was fetched live. */
  savedAt?: number;
  failureReason?: ModelListFailureReason;
}

/** A persisted catalog read back: the saved rows and when they were fetched. */
export interface PersistedModelCatalog {
  models: ProviderModelInfo[];
  savedAt: number;
  /**
   * Fingerprint of the key the list was fetched with (`''` without a key or
   * for a record saved without one).
   */
  credential: string;
}

/**
 * Version of the persisted `provider.<id>.modelCatalog` record. Records with
 * any other version, or without `origin: 'live'`, predate live-only lists
 * (they may hold the static rows of an older release) and are ignored.
 */
const PERSISTED_CATALOG_SCHEMA = 2;

const UPSTREAM_PROTOCOLS: ReadonlySet<string> = new Set([
  'messages',
  'chat/completions',
  'responses',
]);

/** Anthropic `/v1/models` pagination bound; one page at `limit=1000` today. */
const MAX_MODELS_API_PAGES = 10;

/** Every capability name; the compiler keeps it complete. */
const MODEL_CAPABILITY_NAMES: Readonly<Record<ModelCapability, true>> = {
  adaptive_thinking: true,
  effort: true,
  interleaved_thinking: true,
  max_effort: true,
  temperature: true,
  thinking: true,
  xhigh_effort: true,
};

function isModelCapability(value: unknown): value is ModelCapability {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(MODEL_CAPABILITY_NAMES, value)
  );
}

/**
 * These catalogues hide models for reasons other than availability, so a
 * preference missing from them is not evidence that the model is retired.
 */
const FILTERED_TIER_CATALOG_PROVIDERS = new Set([
  'openai-codex',
  'github-copilot',
]);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function stripContextSuffix(id: string): string {
  return id.replace(/\[[^\]]*\]$/, '');
}

/**
 * Validate one persisted row. The record survives across releases, so every
 * field that drives behaviour is re-checked: `upstreamProtocol` is kept only
 * when it is one of the three routable literals, `toolUseUnknown` only when it
 * is exactly `true`, `capabilities` only as an array of known capability
 * names (otherwise dropped, so the provider's declared capabilities apply).
 */
function persistedRow(row: unknown): ProviderModelInfo | null {
  if (!row || typeof row !== 'object') return null;
  const candidate = row as Record<string, unknown>;
  if (
    typeof candidate['id'] !== 'string' ||
    typeof candidate['name'] !== 'string'
  )
    return null;
  const { upstreamProtocol, toolUseUnknown, capabilities, ...rest } =
    candidate as unknown as ProviderModelInfo;
  const savedCapabilities: unknown = capabilities;
  return {
    ...rest,
    ...(typeof upstreamProtocol === 'string' &&
      UPSTREAM_PROTOCOLS.has(upstreamProtocol) && { upstreamProtocol }),
    ...(toolUseUnknown === true && { toolUseUnknown: true as const }),
    ...(Array.isArray(savedCapabilities) &&
      savedCapabilities.every(isModelCapability) && {
        capabilities: [...savedCapabilities],
      }),
  };
}

@injectable()
export class ProviderModelsService {
  /** `${providerId}:${tier}` pairs whose preference replacement was logged. */
  private static readonly loggedTierReplacements = new Set<string>();
  /** Providers whose pre-version persisted record was reported, per process. */
  private static readonly loggedIgnoredCatalogs = new Set<string>();
  private readonly modelCache = new Map<string, ProviderCache>();
  /** Bumped on every `modelCache` write; see {@link ProviderCache.revision}. */
  private cacheRevision = 0;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  /**
   * A persisted catalog older than this is not used: vendors retire models
   * within weeks, so an old saved answer would offer IDs that now fail. The
   * list is then `unavailable` until the next live success.
   */
  private readonly PERSISTED_CATALOG_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

  /** Per-provider dynamic model fetcher callbacks */
  private readonly dynamicFetchers = new Map<string, DynamicModelFetcher>();
  /** Sign-in readers registered with a fetcher ({@link DynamicFetcherOptions}). */
  private readonly fetcherSignIn = new Map<
    string,
    NonNullable<DynamicFetcherOptions['signedIn']>
  >();

  /**
   * The credential fingerprint of each provider's latest list request, or
   * `null` when that request failed for a credential reason. The synchronous
   * catalog reads ({@link readLiveCatalog}) answer only from a list saved
   * under this credential, and nothing after a credential failure. No entry
   * (no request yet this boot) accepts the saved list as it is.
   */
  private readonly catalogCredential = new Map<string, string | null>();

  /**
   * Providers whose saved catalog {@link clearCache} invalidated. A saved
   * record is not read for them until a new live list is saved, so neither
   * the deferred deletion nor its failure lets the previous credential's
   * list answer again in this process.
   */
  private readonly invalidatedCatalogs = new Set<string>();

  /**
   * Bumped by {@link clearCache} (per provider, or globally for a full
   * clear). A list request started before a bump writes nothing when it
   * completes: its answer belongs to the previous credential.
   */
  private readonly cacheGeneration = new Map<string, number>();
  private globalCacheGeneration = 0;

  /**
   * Providers whose catalogue is being refreshed for tier derivation right now.
   *
   * Bounds the work to one in-flight refresh per provider and, because the
   * entry is only cleared after the re-application, stops the re-application
   * from scheduling a refresh of its own. One activation, at most one fetch.
   */
  private readonly tierRefreshInFlight = new Set<string>();

  constructor(
    @inject(TOKENS.LOGGER) private logger: Logger,
    @inject(TOKENS.CONFIG_MANAGER) private config: ConfigManager,
    @inject(AUTH_PROVIDERS_TOKENS.SDK_AUTH_ENV) private authEnv: AuthEnv,
    @inject(AUTH_PROVIDERS_TOKENS.SDK_ACTIVE_PROVIDER_RESOLVER)
    private activeProviderResolver: ActiveProviderResolver,
  ) {}

  /**
   * Register a dynamic model fetcher for a specific provider.
   * When registered, it is that provider's live route in fetchModels(). A
   * throw is classified into a failure reason; an empty result is `empty`.
   * Capacity evidence must be declared by the fetcher at the provider
   * response boundary; a positive selection hint alone does not establish
   * provider provenance.
   */
  registerDynamicFetcher(
    providerId: string,
    fetcher: DynamicModelFetcher,
    options: DynamicFetcherOptions = {},
  ): void {
    this.dynamicFetchers.set(providerId, fetcher);
    if (options.signedIn) {
      this.fetcherSignIn.set(providerId, options.signedIn);
    } else {
      this.fetcherSignIn.delete(providerId);
    }
    this.logger.debug(
      '[ProviderModelsService] Registered dynamic model fetcher',
      { providerId },
    );
  }

  /**
   * Get the per-provider, per-scope config key for a tier.
   *
   * Key shape: `provider.<providerId>.<scope>.modelTier.<tier>`
   * e.g.  `provider.kimi-code.mainAgent.modelTier.haiku`
   *       `provider.kimi-code.cliAgent.modelTier.haiku`
   *
   * The legacy (pre-scope) key `provider.<providerId>.modelTier.<tier>` is
   * still honoured on read for the `mainAgent` scope via
   * `getPersistedTierValue` — no migration writes are needed.
   */
  private getTierConfigKey(
    providerId: string,
    tier: ProviderModelTier,
    scope: ProviderTierScope,
  ): string {
    return `provider.${providerId}.${scope}.modelTier.${tier}`;
  }

  /** Config key holding the last catalog a provider successfully returned. */
  private getCatalogConfigKey(providerId: string): string {
    return `provider.${providerId}.modelCatalog`;
  }

  /**
   * Remember the full catalog a provider just returned live, as a versioned
   * record, so a later fetch failure can show real data.
   *
   * Fire-and-forget: a failed write must never break the fetch that produced
   * the data, so this swallows its own errors after logging. A successful
   * write ends an invalidation ({@link invalidatedCatalogs}) unless another
   * {@link clearCache} ran since `generation` was read.
   */
  private async persistCatalog(
    providerId: string,
    models: ProviderModelInfo[],
    credential = '',
    generation = this.generationOf(providerId),
  ): Promise<void> {
    try {
      await this.config.set(this.getCatalogConfigKey(providerId), {
        schema: PERSISTED_CATALOG_SCHEMA,
        origin: 'live',
        models,
        timestamp: Date.now(),
        ...(credential ? { credential } : {}),
      });
      if (this.generationOf(providerId) === generation) {
        this.invalidatedCatalogs.delete(providerId);
      }
    } catch (error: unknown) {
      // degradation-audit: reported - logged below; only the offline copy is lost and the next live success writes it again.
      this.logger.debug(
        '[ProviderModelsService] Failed to persist model catalog',
        { providerId, error: errorMessage(error) },
      );
    }
  }

  /**
   * Read the persisted catalog synchronously. Returns null when absent, not a
   * `{schema: 2, origin: 'live'}` record, older than
   * PERSISTED_CATALOG_MAX_AGE_MS (a missing timestamp counts as too old), or
   * without one valid row: the value survives across releases, so treat it as
   * untrusted. Never writes; the next live success overwrites an old record.
   */
  private readPersistedCatalog(
    providerId: string,
  ): PersistedModelCatalog | null {
    // Invalidated by clearCache: the record on disk (if its deletion has not
    // run or failed) belongs to the previous credential.
    if (this.invalidatedCatalogs.has(providerId)) return null;
    const stored = this.config.get<unknown>(
      this.getCatalogConfigKey(providerId),
    );
    if (!stored || typeof stored !== 'object') return null;
    const record = stored as Record<string, unknown>;
    if (
      record['schema'] !== PERSISTED_CATALOG_SCHEMA ||
      record['origin'] !== 'live'
    ) {
      if (!ProviderModelsService.loggedIgnoredCatalogs.has(providerId)) {
        ProviderModelsService.loggedIgnoredCatalogs.add(providerId);
        this.logger.debug(
          '[ProviderModelsService] Ignoring a catalog saved before live-only lists',
          { providerId },
        );
      }
      return null;
    }
    const savedAt = record['timestamp'];
    if (
      typeof savedAt !== 'number' ||
      !Number.isFinite(savedAt) ||
      Date.now() - savedAt > this.PERSISTED_CATALOG_MAX_AGE_MS
    ) {
      this.logger.debug(
        '[ProviderModelsService] Ignoring a persisted model catalog that is too old',
        { providerId, savedAt },
      );
      return null;
    }
    const rows = record['models'];
    if (!Array.isArray(rows)) return null;
    const models = rows
      .map(persistedRow)
      .filter((m): m is ProviderModelInfo => m !== null);
    if (models.length === 0) return null;
    const credential = record['credential'];
    return {
      models,
      savedAt,
      credential: typeof credential === 'string' ? credential : '',
    };
  }

  /**
   * The versioned persisted catalog, for OpenCode request routing (attached
   * at DI registration). Same rules as the model-list chain's persisted rung.
   */
  getPersistedCatalog(providerId: string): PersistedModelCatalog | null {
    const saved = this.readPersistedCatalog(providerId);
    if (saved) this.recordContextWindows(saved.models, providerId);
    return saved;
  }

  /**
   * Save a live catalog fetched outside {@link fetchModels} (OpenCode
   * request routing). Fire-and-forget, like every catalog write.
   */
  savePersistedCatalog(providerId: string, models: ProviderModelInfo[]): void {
    void this.persistCatalog(providerId, models);
  }

  /**
   * Feed discovered context windows into the shared exact-match registry.
   * Unlike {@link feedPricingMap} this does not require a price: a provider
   * that reports `context_window` for an unpriced model (every Codex
   * subscription model) is still the authority on that model's window.
   *
   * Every caller passes the provider's COMPLETE catalog, so this replaces that
   * provider's evidence: a model the refreshed catalog drops, or now reports
   * without provider evidence, stops being reported as known capacity.
   */
  private recordContextWindows(
    models: readonly ProviderModelInfo[],
    providerId: string,
  ): void {
    replaceProviderContextWindows(
      providerId,
      models
        .filter((m) => m.contextLengthSource === 'provider')
        .map((m) => ({ id: m.id, contextLength: m.contextLength })),
    );
  }

  /**
   * Legacy config key shape used before scope was introduced.
   * Only used as a read-fallback for the `mainAgent` scope.
   */
  private getLegacyTierConfigKey(
    providerId: string,
    tier: ProviderModelTier,
  ): string {
    return `provider.${providerId}.modelTier.${tier}`;
  }

  /**
   * Fetch a provider's model list.
   *
   * Chain: memory cache younger than CACHE_TTL_MS -> the provider's one live
   * route -> (unless the failure is a credential reason) the persisted live
   * catalog -> `unavailable`. Never throws for a vendor failure; throws only
   * for an unknown provider.
   *
   * For the `/v1/models` route, the memory cache and the persisted catalog
   * are used only when their credential fingerprint matches `apiKey`'s: a
   * deleted key no longer hits a list fetched with it (the live route then
   * reports `no-key`), and agents with different keys never read each
   * other's list.
   *
   * Persisted and unavailable answers are not memory-cached, so a Retry runs
   * the live route again.
   *
   * @param providerId - Provider ID to fetch models for
   * @param apiKey - Provider API key (endpoint providers only)
   * @param toolUseOnly - Keep only models that support tool use or do not
   *   report it; applied to the returned copy only
   */
  async fetchModels(
    providerId: string,
    apiKey: string | null,
    toolUseOnly = false,
  ): Promise<ProviderModelList> {
    const provider = getPtahCliLaneProvider(providerId);
    const fetcher = this.dynamicFetchers.get(providerId);
    if (!provider && !fetcher) {
      throw new SdkError(`Unknown provider: ${providerId}`);
    }
    const shape = (
      models: ProviderModelInfo[],
      source: ProviderModelListSource,
      extra: Pick<ProviderModelList, 'savedAt' | 'failureReason'> = {},
    ): ProviderModelList => ({
      models: toolUseOnly
        ? models.filter((m) => m.supportsToolUse || m.toolUseUnknown === true)
        : models,
      totalCount: models.length,
      source,
      ...extra,
    });

    const credential = this.catalogCredentialFor(providerId, apiKey);
    // A clearCache() during any await below makes this request stale: it
    // then writes nothing (memory, context windows, marker, saved catalog).
    const generation = this.generationOf(providerId);
    const isCurrent = (): boolean =>
      this.generationOf(providerId) === generation;

    const signedIn = this.fetcherSignIn.get(providerId);
    const revisionAtStart = this.cacheRevision;
    if (
      signedIn &&
      (await this.readFetcherSignIn(providerId, signedIn)) === false
    ) {
      // The sign-in read awaits: a clear or a newer request may have
      // written state since. Only a current request may drop the list, and
      // only one cached before this request started (by write sequence, not
      // by clock, so a write in the same millisecond still counts as newer).
      const cachedNow = this.modelCache.get(providerId);
      if (
        isCurrent() &&
        (!cachedNow || (cachedNow.revision ?? 0) <= revisionAtStart)
      ) {
        this.modelCache.delete(providerId);
        this.catalogCredential.set(providerId, null);
      }
      this.logger.warn('[ProviderModelsService] No usable model list', {
        providerId,
        source: 'unavailable',
        failureReason: 'not-signed-in',
      });
      return shape([], 'unavailable', { failureReason: 'not-signed-in' });
    }

    const cached = this.modelCache.get(providerId);
    if (
      cached &&
      cached.models.length > 0 &&
      (cached.credential ?? '') === credential &&
      Date.now() - cached.timestamp < this.CACHE_TTL_MS
    ) {
      return shape(cached.models, 'live');
    }

    let failureReason: ModelListFailureReason;
    try {
      const models = this.withLiveCapabilities(
        providerId,
        await this.fetchLive(providerId, provider, fetcher, apiKey),
      );
      if (models.length > 0) {
        if (!isCurrent()) {
          this.logger.debug(
            '[ProviderModelsService] Not caching a model list requested before its credential changed',
            { providerId },
          );
          return shape(models, 'live');
        }
        this.modelCache.set(providerId, {
          models,
          timestamp: Date.now(),
          credential,
          revision: ++this.cacheRevision,
        });
        this.catalogCredential.set(providerId, credential);
        this.recordContextWindows(models, providerId);
        // The OpenCode routes write their own refreshes through the attached
        // store (DI), so a second write here would only repeat it.
        if (!isOpenCodeProviderId(providerId)) {
          void this.persistCatalog(providerId, models, credential, generation);
        }
        return shape(models, 'live');
      }
      failureReason = 'empty';
    } catch (error: unknown) {
      // degradation-audit: reported - classified into a closed failure reason that the returned list carries to the RPC caller; the raw message stays in the debug log.
      failureReason = classifyModelListFailure(error);
      this.logger.debug('[ProviderModelsService] Live model list failed', {
        providerId,
        failureReason,
        error: errorMessage(error),
      });
    }

    // A credential failure hides every list of this provider from the
    // synchronous reads too; any other failure scopes them to this request's
    // credential. A stale request (see `generation`) neither sets the marker
    // nor answers from the saved catalog.
    const current = isCurrent();
    if (current) {
      this.catalogCredential.set(
        providerId,
        CREDENTIAL_FAILURE_REASONS.has(failureReason) ? null : credential,
      );
    }
    if (current && !CREDENTIAL_FAILURE_REASONS.has(failureReason)) {
      const saved = this.readPersistedCatalog(providerId);
      // A list saved under another key belongs to another account.
      const persisted = saved?.credential === credential ? saved : null;
      if (saved && !persisted) {
        this.logger.debug(
          '[ProviderModelsService] Ignoring a persisted catalog saved under another credential',
          { providerId },
        );
      }
      if (persisted) {
        this.recordContextWindows(persisted.models, providerId);
        this.logger.info(
          '[ProviderModelsService] Live fetch unavailable — using the last catalog this provider returned',
          {
            providerId,
            source: 'persisted',
            failureReason,
            count: persisted.models.length,
          },
        );
        return shape(persisted.models, 'persisted', {
          savedAt: persisted.savedAt,
          failureReason,
        });
      }
    }
    this.logger.warn('[ProviderModelsService] No usable model list', {
      providerId,
      source: 'unavailable',
      failureReason,
    });
    return shape([], 'unavailable', { failureReason });
  }

  /**
   * The fingerprint a provider's lists are scoped to. Only the `/v1/models`
   * route sends `apiKey`. A fetcher reads its own credential and the OpenCode
   * gateway catalog is credential-free, so their lists are scoped to no key
   * (`''`).
   */
  private catalogCredentialFor(
    providerId: string,
    apiKey: string | null,
  ): string {
    const usesApiKey =
      !this.dynamicFetchers.has(providerId) &&
      !isOpenCodeProviderId(providerId) &&
      !!getPtahCliLaneProvider(providerId)?.modelsEndpoint;
    return usesApiKey ? credentialFingerprint(apiKey) : '';
  }

  /** The invalidation generation a request captures (see {@link clearCache}). */
  private generationOf(providerId: string): number {
    return (
      this.globalCacheGeneration + (this.cacheGeneration.get(providerId) ?? 0)
    );
  }

  /**
   * A fetcher's sign-in state; `undefined` when the reader throws (the
   * chain then decides from the fetch itself).
   */
  private async readFetcherSignIn(
    providerId: string,
    signedIn: NonNullable<DynamicFetcherOptions['signedIn']>,
  ): Promise<boolean | undefined> {
    try {
      return await signedIn();
    } catch (error: unknown) {
      // degradation-audit: reported - an unreadable sign-in state proves nothing; the live route still reports its own classified failure.
      this.logger.debug('[ProviderModelsService] Sign-in state unreadable', {
        providerId,
        error: errorMessage(error),
      });
      return undefined;
    }
  }

  /**
   * The provider's single live route. Throws `ModelListError('no-key')` for
   * an endpoint provider without a key and `ModelListError('no-live-source')`
   * when the provider has no route at all.
   */
  private async fetchLive(
    providerId: string,
    provider: AnthropicProvider | undefined,
    fetcher: DynamicModelFetcher | undefined,
    apiKey: string | null,
  ): Promise<ProviderModelInfo[]> {
    if (isOpenCodeProviderId(providerId)) {
      return openCodeLiveRoutes.list(providerId, { force: true });
    }
    if (fetcher) {
      return (await fetcher()).map(({ contextLengthSource, ...model }) => ({
        ...model,
        ...(contextLengthSource === 'provider' &&
        typeof model.contextLength === 'number' &&
        Number.isFinite(model.contextLength) &&
        model.contextLength > 0
          ? { contextLengthSource: 'provider' as const }
          : {}),
      }));
    }
    if (provider?.modelsEndpoint) {
      if (!apiKey) throw new ModelListError('no-key');
      return this.fetchDynamicModels(provider, provider.modelsEndpoint, apiKey);
    }
    throw new ModelListError('no-live-source');
  }

  /**
   * Attach the capabilities a provider declares for every live model (Kimi's
   * SDK allowlist) to rows that report none.
   */
  private withLiveCapabilities(
    providerId: string,
    models: ProviderModelInfo[],
  ): ProviderModelInfo[] {
    const capabilities = getProviderLiveModelCapabilities(providerId);
    if (!capabilities) return models;
    return models.map((m) =>
      m.capabilities ? m : { ...m, capabilities: [...capabilities] },
    );
  }

  /**
   * Request headers for a `modelsEndpoint` call. Absent or `'bearer'` scheme:
   * `Authorization: Bearer` (every existing and custom provider).
   * `'anthropic'`: `x-api-key` plus `anthropic-version`.
   */
  private modelsRequestHeaders(
    provider: AnthropicProvider,
    apiKey: string,
  ): Record<string, string> {
    const auth: Record<string, string> =
      provider.modelsAuthScheme === 'anthropic'
        ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
        : { Authorization: `Bearer ${apiKey}` };
    return {
      ...auth,
      'Content-Type': 'application/json',
      'User-Agent': 'Ptah-Extension/1.0',
    };
  }

  /**
   * Fetch models from a provider's `/v1/models` endpoint. An envelope without
   * a `data` array, or a non-empty `data` with no valid row, is
   * `bad-response`. Anthropic-scheme pages with `has_more` are followed by
   * `after_id`; a missing `last_id` or more than MAX_MODELS_API_PAGES pages
   * is `bad-response`, never a partial list.
   */
  private async fetchDynamicModels(
    provider: AnthropicProvider,
    endpoint: string,
    apiKey: string,
  ): Promise<ProviderModelInfo[]> {
    this.logger.info(
      `[ProviderModelsService] Fetching models from ${provider.name} API`,
    );
    const headers = this.modelsRequestHeaders(provider, apiKey);
    const rows: unknown[] = [];
    const followed = new Set<string>();
    let url = endpoint;
    for (let page = 1; ; page++) {
      const { data } = await axios.get<unknown>(url, {
        headers,
        timeout: 10_000,
      });
      const envelope =
        data && typeof data === 'object'
          ? (data as Record<string, unknown>)
          : undefined;
      const pageRows = envelope?.['data'];
      if (!Array.isArray(pageRows)) throw new ModelListError('bad-response');
      rows.push(...pageRows);
      if (
        provider.modelsAuthScheme !== 'anthropic' ||
        envelope?.['has_more'] !== true
      )
        break;
      const lastId = envelope['last_id'];
      // An empty or repeated cursor would restart the listing.
      if (
        typeof lastId !== 'string' ||
        lastId.length === 0 ||
        followed.has(lastId) ||
        page >= MAX_MODELS_API_PAGES
      )
        throw new ModelListError('bad-response');
      followed.add(lastId);
      const next = new URL(endpoint);
      next.searchParams.set('after_id', lastId);
      url = next.toString();
    }
    const models = parseModelsApiRows(rows);
    if (rows.length > 0 && models.length === 0)
      throw new ModelListError('bad-response');
    this.feedPricingMap(models);
    this.logger.info(
      `[ProviderModelsService] Fetched models from ${provider.name}`,
      {
        total: models.length,
        withToolUse: models.filter((m) => m.supportsToolUse).length,
      },
    );
    return models;
  }

  /**
   * Set model override for a tier on a specific provider.
   *
   * Always persists to the scoped config key.
   * Mutates `this.authEnv` and `process.env` ONLY when `scope === 'mainAgent'`
   * AND `providerId` is the active main-agent provider
   * ({@link resolveActiveProviderId}), so neither CLI sub-agent tiers nor the
   * saved tiers of a connected-but-inactive provider change the running main
   * agent. Activation applies saved tiers via {@link switchActiveProvider}.
   *
   * @param providerId - Provider ID
   * @param tier - Sonnet, Opus, or Haiku
   * @param modelId - Model ID (e.g., "openai/gpt-5.1-codex-max")
   * @param scope - Whether this write is for the main agent or a CLI sub-agent
   */
  async setModelTier(
    providerId: string,
    tier: ProviderModelTier,
    modelId: string,
    scope: ProviderTierScope,
  ): Promise<void> {
    const envVar = TIER_ENV_VAR_MAP[tier];
    const configKey = this.getTierConfigKey(providerId, tier, scope);
    await this.config.set(configKey, modelId);
    // The env is the RUNNING main agent's. A saved tier for a provider that is
    // not the active one must not change it; it is applied by
    // switchActiveProvider -> applyPersistedTiers when that provider is activated.
    const appliesToRuntime =
      scope === 'mainAgent' && providerId === this.resolveActiveProviderId();
    if (appliesToRuntime) {
      this.authEnv[envVar as keyof AuthEnv] = modelId;
      process.env[envVar] = modelId;
      this.applyTierMetadata(providerId, tier, modelId);
    }

    this.logger.info('[ProviderModelsService] Set model tier', {
      providerId,
      tier,
      modelId,
      scope,
      envVar: appliesToRuntime
        ? envVar
        : scope === 'mainAgent'
          ? '(not set — provider is not the active main-agent provider)'
          : '(not set — cliAgent scope)',
    });
  }

  /**
   * Get current model tier mappings for a specific provider and scope.
   *
   * Reads from the scoped config key
   * (`provider.<id>.<scope>.modelTier.<tier>`). For `mainAgent` scope,
   * transparently falls back to the legacy unscoped key
   * (`provider.<id>.modelTier.<tier>`) so existing user configurations
   * continue to work without any data migration.
   *
   * @param providerId - Provider ID
   * @param scope - Which agent's tier mapping to retrieve
   */
  getModelTiers(
    providerId: string,
    scope: ProviderTierScope,
  ): {
    sonnet: string | null;
    opus: string | null;
    haiku: string | null;
  } {
    return {
      sonnet: this.getPersistedTierValue(providerId, 'sonnet', scope),
      opus: this.getPersistedTierValue(providerId, 'opus', scope),
      haiku: this.getPersistedTierValue(providerId, 'haiku', scope),
    };
  }

  /**
   * Clear a model tier override for a specific provider and scope.
   *
   * Always clears the scoped config key; for `mainAgent` also the legacy
   * unscoped key that reads fall back to. Removes the global env var entry
   * ONLY when `scope === 'mainAgent'` to avoid clearing main-agent runtime
   * state when a CLI sub-agent tier is reset.
   *
   * @param providerId - Provider ID
   * @param tier - Sonnet, Opus, or Haiku
   * @param scope - Which agent's tier mapping to clear
   */
  async clearModelTier(
    providerId: string,
    tier: ProviderModelTier,
    scope: ProviderTierScope,
  ): Promise<void> {
    const envVar = TIER_ENV_VAR_MAP[tier];
    const configKey = this.getTierConfigKey(providerId, tier, scope);
    await this.config.set(configKey, undefined);
    // mainAgent reads fall back to the legacy unscoped key
    // (getPersistedTierValue), so a cleared tier would come back from it on the
    // next applyPersistedTiers. Clear it too. cliAgent never reads it.
    if (scope === 'mainAgent') {
      const legacyKey = this.getLegacyTierConfigKey(providerId, tier);
      if (this.config.get<string>(legacyKey) !== undefined) {
        await this.config.set(legacyKey, undefined);
      }
    }
    if (
      scope === 'mainAgent' &&
      providerId === this.resolveActiveProviderId()
    ) {
      // Both env stores feed the next SDK launch (`process.env` is spread
      // first), so fall back to the tier that `resolveEffectiveTiers` selects
      // with no user tier (the rule applyPersistedTiers uses), or remove the
      // tier and its metadata from both when none exists.
      const fallback = this.resolveEffectiveTiers(providerId, {})[tier];
      if (fallback) {
        this.authEnv[envVar as keyof AuthEnv] = fallback;
        process.env[envVar] = fallback;
        this.applyTierMetadata(providerId, tier, fallback);
      } else {
        delete this.authEnv[envVar as keyof AuthEnv];
        delete process.env[envVar];
        for (const key of Object.values(TIER_METADATA_ENV_VAR_MAP[tier])) {
          delete this.authEnv[key as keyof AuthEnv];
          delete process.env[key];
        }
      }
    }

    this.logger.info('[ProviderModelsService] Cleared model tier', {
      providerId,
      tier,
      scope,
    });
  }

  /**
   * The most recent catalogue this provider itself returned, read
   * SYNCHRONOUSLY. In-memory cache first, then the versioned copy persisted
   * by {@link persistCatalog}. Both hold only lists the provider itself
   * returned live: the whole point of deriving tiers from a catalogue is that
   * the provider vouched for the ids.
   *
   * Synchronous by requirement, not by preference. `ModelResolver.resolve` is
   * `string`-returning and sits on per-message hot paths, so everything that
   * feeds it has to be readable without awaiting.
   */
  private readLiveCatalog(
    providerId: string,
    scope?: CatalogCredentialScope,
  ): ProviderModelInfo[] | null {
    // Only a list fetched under the provider's current credential counts,
    // and none after a credential failure ({@link catalogCredential}). A
    // scoped read requires the scope's own credential instead.
    const active = this.catalogCredential.get(providerId);
    if (active === null) return null;
    const wanted = scope
      ? this.catalogCredentialFor(providerId, scope.apiKey)
      : active;
    const cached = this.modelCache.get(providerId);
    if (
      cached &&
      cached.models.length > 0 &&
      (wanted === undefined || (cached.credential ?? '') === wanted)
    )
      return cached.models;
    const saved = this.readPersistedCatalog(providerId);
    if (!saved || (wanted !== undefined && saved.credential !== wanted))
      return null;
    this.recordContextWindows(saved.models, providerId);
    return saved.models;
  }

  /**
   * The tier mapping this provider's OWN catalogue implies — the third link of
   * the `userTiers ?? defaultTiers ?? liveDerived` chain, on its own so that
   * every site that owns a copy of that chain shares ONE implementation.
   *
   * There are three such sites and they are not interchangeable, which is why
   * this is a method rather than an inlined expression:
   *
   *  - {@link applyPersistedTiers} — mutates the shared `authEnv` and
   *    `process.env` for the ACTIVE provider (the foreground chat path);
   *  - `WorkspaceProviderProfileResolver.applyProviderTiers` — builds an
   *    isolated per-workspace SNAPSHOT and must never touch a global;
   *  - `ProviderAuthResolver.buildTierValues` — builds a background lane's /
   *    curator's override env, with the chat provider's tier keys blanked.
   *
   * They agree on WHAT a tier means and differ only in WHERE they write it. A
   * second copy of the derivation would be a second thing to get wrong, and it
   * would drift silently: all three land on the same three env var names, so a
   * disagreement shows up as one surface resolving a tier and another sending
   * the bare word.
   *
   * Pure with respect to globals: a synchronous catalogue read plus arithmetic
   * on an array. No network, no env write, no `setModelTier`. That is what
   * makes it safe for the two snapshot callers, whose whole reason to exist is
   * that they do not disturb the live chat session.
   *
   * Returns `{}` — never a guess — when the provider has no catalogue on hand.
   */
  /**
   * Model ids of the most recent catalogue this provider returned (in-memory,
   * then persisted), read synchronously. `null` when none is on hand — a
   * caller must then not treat any model as unavailable. With `scope`, only
   * a list fetched under that credential counts.
   */
  getCachedModelIds(
    providerId: string,
    scope?: CatalogCredentialScope,
  ): string[] | null {
    const catalog = this.readLiveCatalog(providerId, scope);
    return catalog && catalog.length > 0 ? catalog.map((m) => m.id) : null;
  }

  getLiveDerivedTiers(
    providerId: string,
    scope?: CatalogCredentialScope,
  ): DerivedTierMap {
    return deriveTiersFromCatalog(this.readLiveCatalog(providerId, scope));
  }

  /**
   * Resolve user tiers, registry tier preferences and live-derived tiers
   * consistently for every runtime path.
   *
   * A user tier wins. Otherwise the registry preference, when no catalogue is
   * on hand (it then only fills an SDK env slot, unverified) or when the
   * catalogue lists it. A preference the catalogue lacks resolves to the
   * closest same-family live id, else the live-derived tier, else stays; each
   * replacement warns once per provider and tier.
   */
  resolveEffectiveTiers(
    providerId: string,
    userTiers: Partial<Record<ProviderModelTier, string | null | undefined>>,
    scope?: CatalogCredentialScope,
  ): Partial<Record<ProviderModelTier, string>> {
    const defaults = getPtahCliLaneProvider(providerId)?.defaultTiers;
    let knownIds: string[] | null = null;
    let catalogRead = false;
    const knownCatalog = (): string[] | null => {
      if (!catalogRead) {
        knownIds = FILTERED_TIER_CATALOG_PROVIDERS.has(providerId)
          ? null
          : this.getCachedModelIds(providerId, scope);
        catalogRead = true;
      }
      return knownIds;
    };
    let derived: DerivedTierMap | undefined;
    const derivedFor = (tier: ProviderModelTier): string | undefined => {
      derived ??= this.getLiveDerivedTiers(providerId, scope);
      return derived[tier];
    };
    const effective: Partial<Record<ProviderModelTier, string>> = {};
    for (const tier of ['sonnet', 'opus', 'haiku'] as const) {
      const override = userTiers[tier];
      if (override) {
        effective[tier] = override;
        continue;
      }
      const fallback = defaults?.[tier];
      if (!fallback) {
        effective[tier] = derivedFor(tier);
        continue;
      }
      const ids = knownCatalog();
      const normalized = stripContextSuffix(fallback);
      if (!ids || ids.some((id) => stripContextSuffix(id) === normalized)) {
        effective[tier] = fallback;
        continue;
      }
      const family = closestLiveModel(fallback, ids);
      const live = family ? undefined : derivedFor(tier);
      const resolved = family ?? live ?? fallback;
      const key = `${providerId}:${tier}`;
      if (!ProviderModelsService.loggedTierReplacements.has(key)) {
        ProviderModelsService.loggedTierReplacements.add(key);
        this.logger.warn(
          '[provider-auth] tier preference not in live catalog',
          {
            providerId,
            tier,
            preferred: fallback,
            resolved,
            rule: family ? 'family' : live ? 'derived' : 'none',
          },
        );
      }
      effective[tier] = resolved;
    }
    return effective;
  }

  /**
   * Apply persisted tier mappings to environment for a specific provider.
   * Call this during authentication setup when a provider is active.
   *
   * Always reads from the `mainAgent` scope — this method's job is to
   * populate the main agent's runtime env vars, not CLI sub-agent configs.
   *
   * ## Tier selection
   *
   * The third link is TASK_2026_262. `openrouter`, `lm-studio` and `requesty`
   * declare no `defaultTiers`, so before it this method ran and legitimately
   * wrote NOTHING for them — leaving `ModelResolver.resolve` to send the bare
   * string `'opus'` (which is what the chat path's `'default'` becomes) to an
   * endpoint that cannot serve it. Deriving the missing tiers from the
   * catalogue the provider itself returned closes that for the chat path, the
   * lane-alias path and the pinned-id path at once, because all three read
   * these same three env vars.
   *
   * A non-empty user tier wins. A registry preference wins while no live
   * catalogue is known or when that catalogue contains it. Otherwise the
   * closest same-family live id, then a live-derived tier, replaces it
   * ({@link resolveEffectiveTiers}).
   *
   * @param providerId provider whose tiers should populate the runtime env
   * @param options.apiKey the provider's API key, when the caller has it in
   *   hand. Used only by the out-of-band refresh below — this method itself
   *   never makes a network call. Callers that hold a placeholder rather than
   *   a real key should pass nothing.
   */
  applyPersistedTiers(
    providerId: string,
    options: { apiKey?: string | null } = {},
  ): void {
    const userTiers = this.getModelTiers(providerId, 'mainAgent');
    const effectiveTiers = this.resolveEffectiveTiers(providerId, userTiers);

    for (const [tier, envKey] of Object.entries(TIER_ENV_VAR_MAP)) {
      const value = effectiveTiers[tier as ProviderModelTier];
      if (value) {
        this.authEnv[envKey as keyof AuthEnv] = value;
        process.env[envKey] = value;
        this.applyTierMetadata(providerId, tier as ProviderModelTier, value);
      }
    }

    this.logger.debug(
      '[ProviderModelsService] Applied persisted tier mappings',
      { providerId, userTiers, effectiveTiers },
    );

    const unresolved = Object.keys(TIER_ENV_VAR_MAP).filter(
      (tier) => !effectiveTiers[tier as ProviderModelTier],
    );
    if (unresolved.length > 0) {
      void this.refreshTiersFromLiveCatalog(
        providerId,
        options.apiKey ?? null,
        unresolved,
      );
    }
  }

  /**
   * Fetch the provider's catalogue out of band, then re-apply its tiers.
   *
   * The cold-cache case this exists for: a fresh install where the user has
   * just entered a key for a provider that declares no `defaultTiers` and has
   * never opened the model picker. Nothing is cached, nothing is persisted, so
   * the synchronous derivation above finds no catalogue and writes nothing —
   * exactly the state the bug was filed about. One fetch turns that into a
   * populated catalogue and a second, now-successful, tier application.
   *
   * Deliberately fire-and-forget, matching {@link persistCatalog}: this runs
   * off a provider activation, and a slow or failing model list must never
   * block or fail the activation, still less a message send. Every failure
   * mode ends in a debug line and a return — an offline LM Studio, whose
   * fetcher throws and whose `fetchModels` swallows that and returns an empty
   * list, simply leaves the tiers where they were.
   *
   * The single `await` before any work is not incidental. Two strategies
   * register their dynamic fetcher on the statement immediately AFTER
   * `switchActiveProvider` (`local-proxy.strategy.ts:101-102`,
   * `local-native.strategy.ts:153-161`), so looking for a fetcher in the same
   * synchronous turn would always miss it and LM Studio — the provider with no
   * `modelsEndpoint`, i.e. the one with nowhere else to get a catalogue —
   * would never resolve.
   */
  private async refreshTiersFromLiveCatalog(
    providerId: string,
    apiKey: string | null,
    unresolved: string[],
  ): Promise<void> {
    if (this.tierRefreshInFlight.has(providerId)) return;
    this.tierRefreshInFlight.add(providerId);
    try {
      await Promise.resolve();
      const hasRoute =
        this.dynamicFetchers.has(providerId) ||
        !!getPtahCliLaneProvider(providerId)?.modelsEndpoint;
      if (!hasRoute) return;

      this.logger.debug(
        '[ProviderModelsService] Tiers unresolved from registry preferences — refreshing the live catalog',
        { providerId, unresolved },
      );
      const { models } = await this.fetchModels(providerId, apiKey);
      if (models.length === 0) return;

      this.applyPersistedTiers(providerId, { apiKey });
    } catch (error: unknown) {
      this.logger.debug(
        '[ProviderModelsService] Live catalog refresh for tier derivation failed',
        {
          providerId,
          error: error instanceof Error ? error.message : String(error),
        },
      );
    } finally {
      this.tierRefreshInFlight.delete(providerId);
    }
  }

  /**
   * Re-apply the ACTIVE provider's tiers after SOMEBODY ELSE warmed its
   * catalogue.
   *
   * ## The hole this fills
   *
   * `applyPersistedTiers` derives from whatever catalogue is on hand *at the
   * moment it runs*, and it runs once, at provider activation. `fetchModels`
   * warms both catalogue caches — in-memory and persisted — but writes no tier
   * env var of its own. So the model picker (`provider:listModels`) produces
   * exactly the data the derivation wants and then leaves it sitting there:
   * the user has a populated catalogue on screen while
   * `ANTHROPIC_DEFAULT_{OPUS,SONNET,HAIKU}_MODEL` stay unset, and the next
   * resolution still sends the bare tier word. Before this, that state cleared
   * only on the next provider activation — an auth flow the user has no reason
   * to re-enter.
   *
   * This is the trigger for writer #1 and NOT a fourth writer: the precedence
   * chain, the derivation and the env write all stay in
   * {@link applyPersistedTiers}. The caller reports an event; it decides
   * nothing.
   *
   * ## The three guards, each load-bearing
   *
   * 1. **Activeness.** `applyPersistedTiers` does not check whether the
   *    provider it is given is the active one, and it writes process-global
   *    env. Re-applying for a provider the user merely browsed in the picker
   *    would repoint the ACTIVE provider's tiers at another provider's model
   *    ids — a silent wrong-model send, which is worse than the 404 this whole
   *    carrier is about. A second writer on the fetch path used to have exactly
   *    this hazard and was deleted for it (TASK_2026_265); do not reintroduce a
   *    tier write that runs off a fetch without this guard.
   * 2. **Nothing stale to write.** Returns when every tier env var already
   *    holds exactly what `resolveEffectiveTiers` would select now. A user's
   *    explicit pick is safe twice over — the comparison does not count it
   *    (the pick IS what the derivation selects), and `applyPersistedTiers`'
   *    own `userTiers ?? providerDefaults ?? liveDerived` order would rank it
   *    above the derivation anyway. Comparing against the derivation is what
   *    lets a warmed catalogue retire a tier preference that activation wrote
   *    while no catalogue was known. Tiers the derivation still cannot
   *    resolve are excluded from the comparison: `applyPersistedTiers`
   *    writes only resolved tiers, so re-applying for them could neither fix
   *    nor finish anything.
   * 3. **Something new to derive from.** Returns when the catalogue on hand
   *    still implies no tiers. Without it, a picker open against a provider
   *    with no catalogue would reach `applyPersistedTiers`, find the same hole
   *    and schedule ANOTHER out-of-band fetch — turning a UI action into a
   *    network round trip that cannot possibly succeed where the one the user
   *    just triggered did not.
   *
   * Synchronous and total, for the same reason the refresh is fire-and-forget:
   * it hangs off an RPC handler that has already done its job, so it must not
   * throw into it and must not make it wait. Every failure ends in a debug
   * line.
   *
   * @param providerId the provider whose catalogue was just fetched
   */
  reapplyTiersForWarmedCatalog(providerId: string): void {
    try {
      if (providerId !== this.resolveActiveProviderId()) return;

      const userTiers = this.getModelTiers(providerId, 'mainAgent');
      const effectiveTiers = this.resolveEffectiveTiers(providerId, userTiers);
      const stale = Object.entries(TIER_ENV_VAR_MAP).filter(
        ([tier, envKey]) =>
          effectiveTiers[tier as ProviderModelTier] !== undefined &&
          this.authEnv[envKey as keyof AuthEnv] !==
            effectiveTiers[tier as ProviderModelTier],
      );
      if (stale.length === 0) return;

      if (Object.keys(this.getLiveDerivedTiers(providerId)).length === 0)
        return;

      this.logger.debug(
        '[ProviderModelsService] Catalog warmed out of band — re-applying tiers',
        { providerId, effectiveTiers },
      );
      this.applyPersistedTiers(providerId);
    } catch (error: unknown) {
      this.logger.debug(
        '[ProviderModelsService] Re-applying tiers after a catalog warm failed',
        {
          providerId,
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  /**
   * Publish the display metadata the SDK pairs with a remapped tier.
   *
   * Without `_NAME`/`_DESCRIPTION` the picker labels a mapped tier with its raw
   * model id and shows Claude's own description. Resolved from the provider's
   * last known model list, so it is only available for models we've actually
   * listed — a tier pointing at a hand-typed custom id keeps the bare id.
   * Capabilities alone also fall back to the capabilities the provider
   * declares for every live model (`liveModelCapabilities`, Kimi Code), so
   * effort reaches the runtime even while the catalogue is cold. That lookup
   * reads the same cache-then-persisted catalogue the tier
   * derivation does: a live-derived tier is by construction an id from that
   * catalogue, so it must not lose its label just because the in-memory cache
   * is cold on this run.
   *
   * `_SUPPORTED_CAPABILITIES` is deliberately only written when the provider
   * declares capabilities: the SDK treats that var as an allowlist and reports
   * anything absent from it as unsupported, so guessing would silently disable
   * working features.
   */
  private applyTierMetadata(
    providerId: string,
    tier: ProviderModelTier,
    modelId: string,
  ): void {
    const keys = TIER_METADATA_ENV_VAR_MAP[tier];
    const model = this.readLiveCatalog(providerId)?.find(
      (m) => m.id === modelId,
    );
    const capabilities =
      model?.capabilities ?? getProviderLiveModelCapabilities(providerId);

    const write = (key: keyof AuthEnv, value: string | undefined): void => {
      if (value) {
        this.authEnv[key] = value;
        process.env[key] = value;
      } else {
        delete this.authEnv[key];
        delete process.env[key];
      }
    };

    write(keys.name, model?.name);
    write(keys.description, model?.description);
    write(keys.capabilities, capabilities?.join(','));
  }

  /**
   * Clear all tier environment variables
   * Call this when switching providers or switching to OAuth/API key auth
   */
  clearAllTierEnvVars(): void {
    for (const envKey of ALL_TIER_ENV_KEYS) {
      delete this.authEnv[envKey as keyof AuthEnv];
      delete process.env[envKey];
    }

    this.logger.debug(
      '[ProviderModelsService] Cleared all tier environment variables',
    );
  }

  /**
   * Switch the active provider's tier mappings
   * Clears all tier env vars, then applies persisted tiers for the new provider
   *
   * Still synchronous, and stays that way: all eight production call sites are
   * inside strategy `configure` methods that treat this as a fast local
   * bookkeeping step. Any catalogue fetch it triggers happens out of band —
   * see {@link refreshTiersFromLiveCatalog}.
   *
   * @param options.apiKey the provider key, when the caller already holds it.
   *   Only the out-of-band refresh uses it, and only for providers whose
   *   catalogue lives behind an authenticated `modelsEndpoint`.
   */
  switchActiveProvider(
    providerId: string,
    options: { apiKey?: string | null } = {},
  ): void {
    this.clearAllTierEnvVars();
    this.applyPersistedTiers(providerId, options);

    this.logger.info(
      `[ProviderModelsService] Switched active provider tiers to ${providerId}`,
    );
  }

  /**
   * Resolve the active provider ID based on the current auth method.
   *
   * Single source of truth for auth-method → provider-ID mapping.
   * Used by config:models-list (tier overrides) and anywhere else
   * that needs to know which provider's tier config is active.
   *
   * Mapping:
   *  - apiKey / claudeCli     → ANTHROPIC_DIRECT_PROVIDER_ID (Anthropic native)
   *  - thirdParty             → saved anthropicProviderId (OpenRouter, Kimi Code, etc.)
   */
  resolveActiveProviderId(): string {
    return this.activeProviderResolver.resolveActiveAuth().providerId;
  }

  /**
   * Clear cache for a specific provider (or all if no ID provided).
   *
   * For one provider (its key or connection changed) the saved catalog goes
   * too: a list fetched with the previous credential must not answer for the
   * new one, in the chain or in the synchronous reads. The saved record stays
   * unread from here on ({@link invalidatedCatalogs}), whether or not its
   * deferred deletion succeeds, until a new live list is saved. Every clear
   * also makes the list requests in flight stale ({@link cacheGeneration}).
   */
  clearCache(providerId?: string): void {
    if (providerId) {
      this.cacheGeneration.set(
        providerId,
        (this.cacheGeneration.get(providerId) ?? 0) + 1,
      );
      this.invalidatedCatalogs.add(providerId);
      this.modelCache.delete(providerId);
      this.catalogCredential.delete(providerId);
      const catalogKey = this.getCatalogConfigKey(providerId);
      void Promise.resolve()
        .then(() => this.config.set(catalogKey, undefined))
        .catch((error: unknown) => {
          // degradation-audit: reported - logged; the saved list stays credential-checked by fetchModels, and the next live success overwrites it.
          this.logger.debug(
            '[ProviderModelsService] Failed to drop a saved model catalog',
            { providerId, error: errorMessage(error) },
          );
        });
    } else {
      this.globalCacheGeneration += 1;
      this.modelCache.clear();
    }
  }

  /**
   * Pre-fetch pricing data from OpenRouter (no auth required)
   *
   * OpenRouter's /api/v1/models endpoint is publicly accessible and returns
   * pricing, display names, and context windows for 200+ models. This method
   * fetches that data at startup to populate the dynamic pricing map before
   * the user configures any API keys.
   *
   * Uses a separate cache key ('openrouter:pricing') so authenticated model
   * fetches are not short-circuited by the unauthenticated prefetch data.
   *
   * @returns Number of models with pricing data loaded
   */
  async prefetchPricing(): Promise<number> {
    const PREFETCH_CACHE_KEY = 'openrouter:pricing';
    const openRouter = getAnthropicProvider('openrouter');
    if (!openRouter?.modelsEndpoint) {
      return 0;
    }
    const cached = this.modelCache.get(PREFETCH_CACHE_KEY);
    if (
      cached &&
      cached.models.length > 0 &&
      Date.now() - cached.timestamp < this.CACHE_TTL_MS
    ) {
      this.feedPricingMap(cached.models);
      // The prefetch is the FIRST model fetch on a cold start, and its models
      // carry `contextLength`. Feeding only the pricing map discarded every
      // provider-reported window until some other fetch path happened to run
      // (PR #493 review C).
      this.recordContextWindows(cached.models, 'openrouter');
      return cached.models.filter((m) => m.inputCostPerToken !== undefined)
        .length;
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.logger.info(
          '[ProviderModelsService] Pre-fetching pricing from OpenRouter (no auth)',
          { attempt },
        );

        const { data } = await axios.get<unknown>(openRouter.modelsEndpoint, {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Ptah-Extension/1.0',
          },
          timeout: 15_000,
        });
        const rows =
          data && typeof data === 'object'
            ? (data as Record<string, unknown>)['data']
            : undefined;
        if (!Array.isArray(rows)) {
          return 0;
        }

        const models = parseModelsApiRows(rows);
        if (rows.length > 0 && models.length === 0) {
          // A payload with no valid row would replace the published windows
          // with nothing; retry instead.
          throw new ModelListError('bad-response');
        }
        this.modelCache.set(PREFETCH_CACHE_KEY, {
          models,
          timestamp: Date.now(),
          revision: ++this.cacheRevision,
        });

        const pricedCount = this.feedPricingMap(models);
        this.recordContextWindows(models, 'openrouter');

        this.logger.info(
          '[ProviderModelsService] Pre-fetched pricing from OpenRouter',
          { totalModels: models.length, modelsWithPricing: pricedCount },
        );

        return pricedCount;
      } catch (error: unknown) {
        if (axios.isAxiosError(error) && error.response) {
          this.logger.warn(
            `[ProviderModelsService] OpenRouter pricing pre-fetch failed: ${error.response.status}`,
          );
          return 0;
        }

        const errorMsg = error instanceof Error ? error.message : String(error);

        if (attempt < maxAttempts) {
          this.logger.info(
            `[ProviderModelsService] Pricing pre-fetch attempt ${attempt} failed, retrying in 5s`,
            { error: errorMsg },
          );
          await new Promise((resolve) => setTimeout(resolve, 5000));
        } else {
          this.logger.warn(
            '[ProviderModelsService] Pricing pre-fetch failed after retries (will use bundled fallback)',
            { error: errorMsg, attempts: maxAttempts },
          );
        }
      }
    }

    return 0;
  }

  /**
   * Feed model pricing data into the shared pricing map
   * (calls {@link updatePricingMap} from `@ptah-extension/shared`).
   *
   * Creates pricing map entries keyed by:
   * 1. Full provider model ID (e.g., "anthropic/claude-opus-4.5")
   * 2. Model ID without provider prefix (e.g., "claude-opus-4.5")
   * 3. Normalized model ID with dots to hyphens (e.g., "claude-opus-4-5")
   *
   * This ensures findModelPricing() partial matching works for both
   * OpenRouter-style IDs and SDK-reported model IDs (e.g., "claude-opus-4-5-20251101").
   *
   * @returns Number of models with pricing data
   */
  private feedPricingMap(models: ProviderModelInfo[]): number {
    const pricingEntries: Record<string, ModelPricing> = {};
    let pricedCount = 0;

    for (const model of models) {
      if (
        model.inputCostPerToken === undefined ||
        model.outputCostPerToken === undefined
      ) {
        continue;
      }

      pricedCount++;

      const pricing: ModelPricing = {
        inputCostPerToken: model.inputCostPerToken,
        outputCostPerToken: model.outputCostPerToken,
        cacheReadCostPerToken: model.cacheReadCostPerToken,
        cacheCreationCostPerToken: model.cacheCreationCostPerToken,
      };
      const fullId = model.id.toLowerCase();
      pricingEntries[fullId] = pricing;
      if (fullId.includes('/')) {
        const stripped = fullId.split('/').slice(1).join('/');
        pricingEntries[stripped] = pricing;
        const normalized = stripped.replace(/\./g, '-');
        if (normalized !== stripped) {
          pricingEntries[normalized] = pricing;
        }
      }
    }

    if (Object.keys(pricingEntries).length > 0) {
      updatePricingMap(pricingEntries);
    }

    return pricedCount;
  }

  /**
   * Get persisted tier value from config for a specific scope.
   *
   * Read order:
   * 1. Scoped key: `provider.<id>.<scope>.modelTier.<tier>`
   * 2. (mainAgent only) Legacy key: `provider.<id>.modelTier.<tier>`
   *    — transparent fallback for existing user config written before this
   *    scope field was introduced. No migration writes are performed.
   *
   * The legacy fallback is intentionally limited to `mainAgent` scope so
   * that CLI sub-agents do not accidentally inherit main-agent tier
   * overrides that were written before the scope split.
   */
  private getPersistedTierValue(
    providerId: string,
    tier: ProviderModelTier,
    scope: ProviderTierScope,
  ): string | null {
    const scopedKey = this.getTierConfigKey(providerId, tier, scope);
    const scopedValue = this.config.get<string>(scopedKey);
    if (scopedValue) return scopedValue;
    if (scope === 'mainAgent') {
      const legacyKey = this.getLegacyTierConfigKey(providerId, tier);
      const legacyValue = this.config.get<string>(legacyKey);
      if (legacyValue) return legacyValue;
    }

    return null;
  }
}
