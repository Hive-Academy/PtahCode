import axios from 'axios';
import { z } from 'zod';
import {
  getAnthropicProvider,
  getOpenCodeModelProtocol,
  type OpenCodeProtocol,
  type OpenCodeProviderId,
} from '@ptah-extension/shared';

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
 * used as the model's protocol. The same guard `getOpenCodeModelProtocol`
 * already applies to its static route table.
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

export type OpenCodeLiveModel = {
  id: string;
  name: string;
  contextLength: number;
  supportsToolUse?: boolean;
  protocol?: OpenCodeProtocol;
};

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

type Cache = {
  models: ReadonlyMap<string, OpenCodeLiveModel>;
  updatedAt: number;
  failedAt: number;
};
type LiveRoutesLogger = {
  debug(message: string, context?: Record<string, unknown>): void;
};

/** Public, credential-free gateway catalog shared by request routing and settings. */
export class OpenCodeLiveRoutes {
  private readonly caches = new Map<OpenCodeProviderId, Cache>();
  private readonly inFlight = new Map<OpenCodeProviderId, Promise<void>>();

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

  private endpoint(providerId: OpenCodeProviderId): string | undefined {
    const baseUrl = getAnthropicProvider(providerId)?.baseUrl;
    return baseUrl ? `${baseUrl.replace(/\/+$/, '')}/models` : undefined;
  }

  async refresh(providerId: OpenCodeProviderId): Promise<void> {
    const existing = this.inFlight.get(providerId);
    if (existing) return existing;
    const cache = this.caches.get(providerId);
    if (cache && Date.now() - cache.failedAt < OPENCODE_LIVE_RETRY_MS) return;
    const endpoint = this.endpoint(providerId);
    if (!endpoint) return;
    const promise = (async () => {
      try {
        const parsed = gatewaySchema.parse(await this.getJson(endpoint));
        const models = new Map<string, OpenCodeLiveModel>();
        let skipped = 0;
        for (const raw of parsed.data) {
          const entry = modelSchema.safeParse(raw);
          if (!entry.success) {
            skipped++;
            continue;
          }
          const model = entry.data;
          models.set(model.id, {
            id: model.id,
            name: model.name ?? model.id,
            contextLength: model.limit?.context ?? 0,
            supportsToolUse: model.capabilities?.tools?.supported,
            protocol: protocolFromGatewayApi(model.api),
          });
        }
        if (models.size === 0) throw new Error('No valid models in catalog');
        if (skipped > 0 && this.options.logger) {
          this.options.logger.debug(
            'OpenCode live model refresh skipped invalid catalog entries',
            { providerId, kept: models.size, skipped },
          );
        }
        this.caches.set(providerId, {
          models,
          updatedAt: Date.now(),
          failedAt: 0,
        });
      } catch (error: unknown) {
        // degradation-audit: optional-capability - retain the last good map and rate-limit failed public refreshes.
        if (this.options.logger) {
          this.options.logger.debug('OpenCode live model refresh failed', {
            providerId,
            message: error instanceof Error ? error.message : 'Unknown error',
          });
        }
        this.caches.set(providerId, {
          models: cache?.models ?? new Map(),
          updatedAt: cache?.updatedAt ?? 0,
          failedAt: Date.now(),
        });
      } finally {
        this.inFlight.delete(providerId);
      }
    })();
    this.inFlight.set(providerId, promise);
    return promise;
  }

  async resolve(
    providerId: OpenCodeProviderId,
    modelId: string,
  ): Promise<OpenCodeProtocol | undefined> {
    const staticProtocol = getOpenCodeModelProtocol(providerId, modelId);
    if (staticProtocol) return staticProtocol;
    const cache = this.caches.get(providerId);
    if (
      !cache ||
      Date.now() - cache.updatedAt >= OPENCODE_LIVE_TTL_MS ||
      (!cache.models.has(modelId) &&
        Date.now() - cache.updatedAt >= OPENCODE_LIVE_RETRY_MS)
    ) {
      await this.refresh(providerId);
    }
    return this.caches.get(providerId)?.models.get(modelId)?.protocol;
  }

  async list(
    providerId: OpenCodeProviderId,
  ): Promise<ReadonlyMap<string, OpenCodeLiveModel> | null> {
    const cache = this.caches.get(providerId);
    if (!cache || Date.now() - cache.updatedAt >= OPENCODE_LIVE_RETRY_MS)
      await this.refresh(providerId);
    const current = this.caches.get(providerId);
    return current?.updatedAt &&
      Date.now() - current.updatedAt < OPENCODE_LIVE_TTL_MS
      ? current.models
      : null;
  }
}

export const openCodeLiveRoutes = new OpenCodeLiveRoutes();
