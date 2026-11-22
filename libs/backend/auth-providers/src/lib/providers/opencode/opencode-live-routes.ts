import axios from 'axios';
import { z } from 'zod';
import {
  getAnthropicProvider,
  type OpenCodeProtocol,
  type OpenCodeProviderId,
  type ModelListFailureReason,
  type ProviderModelInfo,
} from '@ptah-extension/shared';
import {
  ModelListError,
  classifyModelListFailure,
} from '../../model-list-error';

export const OPENCODE_LIVE_TTL_MS = 6 * 60 * 60 * 1000;
export const OPENCODE_LIVE_RETRY_MS = 5 * 60 * 1000;

const API_PROTOCOL: Readonly<Record<string, OpenCodeProtocol>> = {
  messages: 'messages',
  responses: 'responses',
  'chat-completions': 'chat/completions',
};
const NPM_PROTOCOL: Readonly<Record<string, OpenCodeProtocol>> = {
  '@ai-sdk/anthropic': 'messages',
  '@ai-sdk/openai': 'responses',
  '@ai-sdk/openai-compatible': 'chat/completions',
};

/**
 * Own-property lookup for keys that arrive from the remote gateway payload.
 * A plain `table[key]` returns an inherited `Object.prototype` member for a
 * key such as `constructor`, `toString` or `__proto__` — truthy, and then
 * used as the model's protocol.
 */
function ownProtocol(
  table: Readonly<Record<string, OpenCodeProtocol>>,
  key: string,
): OpenCodeProtocol | undefined {
  return Object.prototype.hasOwnProperty.call(table, key)
    ? table[key]
    : undefined;
}

export function protocolFromNpm(npm: string): OpenCodeProtocol | undefined {
  return ownProtocol(NPM_PROTOCOL, npm);
}

const modelSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  type: z.string().optional(),
  recommended_api: z.string().optional(),
  limit: z.object({ context: z.number().nonnegative().optional() }).optional(),
  capabilities: z
    .object({ tools: z.object({ supported: z.boolean() }).optional() })
    .optional(),
  api: z.record(z.string(), z.unknown()).optional(),
});
/**
 * Envelope only: entries are validated one by one during the refresh, so one
 * malformed row from the third-party gateway cannot reject the whole payload.
 */
const gatewaySchema = z.object({ data: z.array(z.unknown()).min(1).max(1000) });
const apiEntrySchema = z.object({
  sdk: z.object({ aisdk: z.string() }).optional(),
});

/** A routable OpenCode chat model, in the shape the model picker lists. */
export type OpenCodeLiveModel = ProviderModelInfo & {
  upstreamProtocol: OpenCodeProtocol;
};

/**
 * Where the versioned persisted catalog is read from and written to. Attached
 * once at DI registration (`usePersistedCatalog`); the gateway catalog itself
 * stays credential-free.
 */
export interface OpenCodeCatalogStore {
  read(
    providerId: OpenCodeProviderId,
  ): { models: ProviderModelInfo[]; savedAt: number } | null;
  write(providerId: OpenCodeProviderId, models: ProviderModelInfo[]): void;
}

/** How a request for one model id is routed. */
export type OpenCodeRouteResolution =
  | { outcome: 'routed'; protocol: OpenCodeProtocol }
  | { outcome: 'not-listed' | 'catalog-unavailable' };

export function protocolFromGatewayApi(
  api: Record<string, unknown> | undefined,
): OpenCodeProtocol | undefined {
  if (!api) return undefined;
  const keys = Object.keys(api);
  if (keys.length !== 1) return undefined;
  const key = keys[0];
  const direct = ownProtocol(API_PROTOCOL, key);
  if (direct) return direct;
  const entry = apiEntrySchema.safeParse(api[key]);
  return entry.success && entry.data.sdk
    ? protocolFromNpm(entry.data.sdk.aisdk)
    : undefined;
}

/**
 * The protocol picked for a row that lists several routable `api` keys and
 * no usable `recommended_api`: the native Messages API first (no
 * translation), then Responses, then Chat Completions. Every candidate is one
 * the row itself declares.
 */
const MULTI_API_PREFERENCE: readonly OpenCodeProtocol[] = [
  'messages',
  'responses',
  'chat/completions',
];

/**
 * `recommended_api` first; otherwise the single-`api`-key rule; otherwise,
 * for a row with several `api` keys, the most preferred protocol among the
 * keys that resolve ({@link MULTI_API_PREFERENCE}). Such a row used to be
 * dropped from the list and from routing.
 */
function rowProtocol(
  row: z.infer<typeof modelSchema>,
): OpenCodeProtocol | undefined {
  const recommended =
    row.recommended_api !== undefined
      ? ownProtocol(API_PROTOCOL, row.recommended_api)
      : undefined;
  if (recommended) return recommended;
  const single = protocolFromGatewayApi(row.api);
  if (single || !row.api) return single;
  const declared = new Set(
    Object.keys(row.api).flatMap((key) => {
      const protocol = protocolFromGatewayApi({ [key]: row.api?.[key] });
      return protocol ? [protocol] : [];
    }),
  );
  return MULTI_API_PREFERENCE.find((protocol) => declared.has(protocol));
}

type Cache = {
  models: ReadonlyMap<string, OpenCodeLiveModel>;
  updatedAt: number;
  failedAt: number;
  failureReason?: ModelListFailureReason;
};
type LiveRoutesLogger = {
  debug(message: string, context?: Record<string, unknown>): void;
};

/** Public, credential-free gateway catalog shared by request routing and settings. */
export class OpenCodeLiveRoutes {
  private readonly caches = new Map<OpenCodeProviderId, Cache>();
  private readonly inFlight = new Map<OpenCodeProviderId, Promise<void>>();
  private store: OpenCodeCatalogStore | null = null;

  constructor(
    private readonly getJson: (url: string) => Promise<unknown> = async (
      url,
    ) => {
      const response = await axios.get<unknown>(url, {
        headers: { 'User-Agent': 'Ptah-Extension/1.0' },
        timeout: 4000,
        maxContentLength: 2 * 1024 * 1024,
      });
      return response.data;
    },
    private readonly options: { logger?: LiveRoutesLogger } = {},
  ) {}

  /** Attach the versioned persisted catalog. Called once at DI registration. */
  usePersistedCatalog(store: OpenCodeCatalogStore): void {
    this.store = store;
  }

  private endpoint(providerId: OpenCodeProviderId): string | undefined {
    const baseUrl = getAnthropicProvider(providerId)?.baseUrl;
    return baseUrl ? `${baseUrl.replace(/\/+$/, '')}/models` : undefined;
  }

  private debug(message: string, context: Record<string, unknown>): void {
    this.options.logger?.debug(message, context);
  }

  private readPersisted(
    providerId: OpenCodeProviderId,
  ): { models: ProviderModelInfo[]; savedAt: number } | null {
    if (!this.store) return null;
    try {
      return this.store.read(providerId);
    } catch (error: unknown) {
      // degradation-audit: optional-capability - a failed store read only means no saved catalog; routing continues on the live catalog or reports catalog-unavailable.
      this.debug('OpenCode persisted catalog read failed', {
        providerId,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  private writePersisted(
    providerId: OpenCodeProviderId,
    models: ProviderModelInfo[],
  ): void {
    if (!this.store) return;
    try {
      this.store.write(providerId, models);
    } catch (error: unknown) {
      // degradation-audit: optional-capability - the live catalog is already cached in memory; a failed write only loses the offline copy.
      this.debug('OpenCode persisted catalog write failed', {
        providerId,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /** The live map, when one younger than the TTL is cached. */
  private liveModels(
    providerId: OpenCodeProviderId,
  ): ReadonlyMap<string, OpenCodeLiveModel> | null {
    const cache = this.caches.get(providerId);
    return cache?.updatedAt &&
      cache.models.size > 0 &&
      Date.now() - cache.updatedAt < OPENCODE_LIVE_TTL_MS
      ? cache.models
      : null;
  }

  private parseCatalog(
    providerId: OpenCodeProviderId,
    payload: unknown,
  ): Map<string, OpenCodeLiveModel> {
    const parsed = gatewaySchema.safeParse(payload);
    if (!parsed.success) throw new ModelListError('bad-response');
    const providerName = getAnthropicProvider(providerId)?.name ?? 'OpenCode';
    const models = new Map<string, OpenCodeLiveModel>();
    let skipped = 0;
    for (const raw of parsed.data.data) {
      const entry = modelSchema.safeParse(raw);
      const row = entry.success ? entry.data : undefined;
      const protocol = row ? rowProtocol(row) : undefined;
      if (
        !row ||
        (row.type !== undefined && row.type !== 'chat') ||
        !protocol
      ) {
        skipped++;
        continue;
      }
      const name = row.name ?? row.id;
      const contextLength = row.limit?.context ?? 0;
      const tools = row.capabilities?.tools?.supported;
      models.set(row.id, {
        id: row.id,
        name,
        description: `${name} via ${providerName}`,
        contextLength,
        ...(contextLength > 0 && { contextLengthSource: 'provider' as const }),
        ...(tools === undefined
          ? { supportsToolUse: false, toolUseUnknown: true as const }
          : { supportsToolUse: tools }),
        upstreamProtocol: protocol,
      });
    }
    if (skipped > 0) {
      this.debug('OpenCode live model refresh skipped catalog entries', {
        providerId,
        kept: models.size,
        skipped,
      });
    }
    if (models.size === 0) throw new ModelListError('bad-response');
    return models;
  }

  /**
   * Fetch the gateway catalog. Joins an in-flight refresh. Without `force`, a
   * failure within the last {@link OPENCODE_LIVE_RETRY_MS} suppresses a new
   * attempt; `force` (a user Retry) skips that backoff. A success also writes
   * the catalog through the attached store, so request routing alone keeps
   * the persisted copy fresh.
   */
  async refresh(
    providerId: OpenCodeProviderId,
    options: { force?: boolean } = {},
  ): Promise<void> {
    const existing = this.inFlight.get(providerId);
    if (existing) return existing;
    const cache = this.caches.get(providerId);
    if (
      !options.force &&
      cache &&
      Date.now() - cache.failedAt < OPENCODE_LIVE_RETRY_MS
    )
      return;
    const endpoint = this.endpoint(providerId);
    if (!endpoint) {
      this.caches.set(providerId, {
        models: cache?.models ?? new Map(),
        updatedAt: cache?.updatedAt ?? 0,
        failedAt: Date.now(),
        failureReason: 'no-live-source',
      });
      return;
    }
    const promise = (async () => {
      try {
        const models = this.parseCatalog(
          providerId,
          await this.getJson(endpoint),
        );
        this.caches.set(providerId, {
          models,
          updatedAt: Date.now(),
          failedAt: 0,
        });
        this.writePersisted(providerId, [...models.values()]);
      } catch (error: unknown) {
        // degradation-audit: reported - the classified reason is kept on the cache and surfaced by list() as ModelListError; the last good map is retained and failed public refreshes are rate-limited.
        const failureReason = classifyModelListFailure(error);
        this.debug('OpenCode live model refresh failed', {
          providerId,
          failureReason,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
        this.caches.set(providerId, {
          models: cache?.models ?? new Map(),
          updatedAt: cache?.updatedAt ?? 0,
          failedAt: Date.now(),
          failureReason,
        });
      } finally {
        this.inFlight.delete(providerId);
      }
    })();
    this.inFlight.set(providerId, promise);
    return promise;
  }

  /**
   * The live catalog rows. Refreshes when the cache is missing or older than
   * {@link OPENCODE_LIVE_RETRY_MS}. Throws `ModelListError` with the reason
   * of the last failure when that refresh failed, or when no live map younger
   * than the TTL exists. The map a failed refresh retains keeps serving
   * request routing ({@link resolve}), never this listing: the caller saves
   * what it returns as a fresh live list.
   */
  async list(
    providerId: OpenCodeProviderId,
    options: { force?: boolean } = {},
  ): Promise<OpenCodeLiveModel[]> {
    const cache = this.caches.get(providerId);
    if (!cache || Date.now() - cache.updatedAt >= OPENCODE_LIVE_RETRY_MS)
      await this.refresh(providerId, options);
    const after = this.caches.get(providerId);
    const live =
      after && after.failedAt > after.updatedAt
        ? undefined
        : this.liveModels(providerId);
    if (live) return [...live.values()];
    throw new ModelListError(
      this.caches.get(providerId)?.failureReason ?? 'unexpected',
    );
  }

  /**
   * Model ids to resolve aliases against: the live catalog, else one awaited
   * refresh under the backoff rule, else the persisted catalog, else `null`.
   */
  async modelIds(
    providerId: OpenCodeProviderId,
  ): Promise<readonly string[] | null> {
    if (!this.liveModels(providerId)) await this.refresh(providerId);
    const live = this.liveModels(providerId);
    if (live) return [...live.keys()];
    const persisted = this.readPersisted(providerId);
    return persisted && persisted.models.length > 0
      ? persisted.models.map((m) => m.id)
      : null;
  }

  /**
   * Route one request: a live hit; otherwise, when the cache is missing,
   * expired, or misses the id and is older than the backoff, one awaited
   * refresh and a second live lookup; then the persisted row's protocol.
   * `not-listed` when a catalog is on hand without the id, otherwise
   * `catalog-unavailable`.
   */
  async resolve(
    providerId: OpenCodeProviderId,
    modelId: string,
  ): Promise<OpenCodeRouteResolution> {
    const cache = this.caches.get(providerId);
    if (
      !cache ||
      Date.now() - cache.updatedAt >= OPENCODE_LIVE_TTL_MS ||
      (!cache.models.has(modelId) &&
        Date.now() - cache.updatedAt >= OPENCODE_LIVE_RETRY_MS)
    ) {
      await this.refresh(providerId);
    }
    const live = this.liveModels(providerId);
    const hit = live?.get(modelId);
    if (hit) return { outcome: 'routed', protocol: hit.upstreamProtocol };
    if (live) return { outcome: 'not-listed' };
    const persisted = this.readPersisted(providerId);
    if (!persisted || persisted.models.length === 0)
      return { outcome: 'catalog-unavailable' };
    const row = persisted.models.find((m) => m.id === modelId);
    if (!row) return { outcome: 'not-listed' };
    return row.upstreamProtocol
      ? { outcome: 'routed', protocol: row.upstreamProtocol }
      : { outcome: 'catalog-unavailable' };
  }
}

export const openCodeLiveRoutes = new OpenCodeLiveRoutes();
