/**
 * Ollama Model Discovery Service
 *
 * Fetches models from Ollama's native /api/tags endpoint and enriches
 * metadata from /api/show for each model (context length, capabilities).
 *
 * Key differences from the old listModels() in LocalModelTranslationProxy:
 * - Uses /api/tags (native) instead of /v1/models (OpenAI compat)
 * - Fetches real context lengths from /api/show per model
 * - Infers tool use and thinking capabilities from model metadata
 * - Separates local vs cloud models (`:cloud` suffix detection)
 * - Caches /api/show results with TTL to avoid repeated calls
 *
 * Ollama Cloud models come only from live sources: ollama.com/api/tags and
 * the local daemon's cloud tags. There is no bundled model list. Listing
 * failures throw `ModelListError` so the caller can report why the list is
 * unavailable.
 */

import * as http from 'http';
import * as https from 'https';
import { injectable, inject } from 'tsyringe';
import {
  Logger,
  ConfigManager,
  TOKENS,
  IAuthSecretsService,
} from '@ptah-extension/vscode-core';
import type { SentryService } from '@ptah-extension/vscode-core';
import type { ProviderModelInfo } from '@ptah-extension/shared';
import {
  getAnthropicProvider,
  isCloudTag,
  toCloudId,
} from '@ptah-extension/shared';
import { AUTH_PROVIDERS_TOKENS } from '../../di/tokens';
import {
  ModelListError,
  classifyModelListFailure,
} from '../../model-list-error';
import {
  OllamaCloudMetadataService,
  type OllamaCloudTag,
} from './ollama-cloud-metadata.service';

/** Host that answers the hosted /api/tags and /api/show for Ollama Cloud. */
const OLLAMA_COM_BASE_URL = 'https://ollama.com';

/** Largest response body read from an Ollama server (1 MiB). */
const MAX_RESPONSE_BYTES = 1024 * 1024;

/** Ollama /api/version response shape */
interface OllamaVersionResponse {
  version: string; // e.g., "0.14.2"
}

/** Minimum Ollama version required for Anthropic Messages API (/v1/messages) */
const MIN_OLLAMA_VERSION = '0.14.0';

/** Ollama /api/tags response shape */
interface OllamaTagsResponse {
  models: OllamaModelTag[];
}

interface OllamaModelTag {
  name: string; // e.g., "llama3.3:latest", "kimi-k2.5:cloud"
  model: string; // e.g., "llama3.3:latest"
  modified_at: string;
  size: number;
  digest: string;
  details: {
    parent_model: string;
    format: string;
    family: string;
    families: string[] | null;
    parameter_size: string;
    quantization_level: string;
  };
}

/**
 * Ollama /api/show response shape (subset of fields we need). The local daemon
 * has reported `modelinfo`; ollama.com and current daemons report
 * `model_info`. Both are read.
 */
interface OllamaShowResponse {
  model_info?: Record<string, unknown>;
  modelinfo?: Record<string, unknown>;
  template?: string;
  details?: {
    parent_model?: string;
    format?: string;
    family?: string;
    families?: string[] | null;
    parameter_size?: string;
    quantization_level?: string;
  };
}

/** Cached model metadata from /api/show */
interface ModelMetadataCache {
  contextLength: number;
  contextLengthSource?: 'provider';
  supportsToolUse: boolean;
  supportsThinking: boolean;
  supportsVision: boolean;
  timestamp: number;
  /** True if this was a fallback/error response — uses shorter TTL */
  isFallback?: boolean;
}

/** Known model families that support tool use */
const TOOL_USE_FAMILIES = new Set([
  'llama',
  'qwen2',
  'qwen3',
  'gemma2',
  'gemma3',
  'command-r',
  'mistral',
  'devstral',
  'phi3',
  'phi4',
]);

@injectable()
export class OllamaModelDiscoveryService {
  /** Cache for /api/show metadata per model */
  private readonly metadataCache = new Map<string, ModelMetadataCache>();
  private readonly METADATA_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
  private readonly FALLBACK_CACHE_TTL_MS = 60 * 1000; // 1 minute for error fallbacks
  private readonly MAX_CONCURRENT_ENRICHMENTS = 5;

  constructor(
    @inject(TOKENS.LOGGER) private readonly logger: Logger,
    @inject(TOKENS.CONFIG_MANAGER)
    private readonly configManager: ConfigManager,
    @inject(AUTH_PROVIDERS_TOKENS.SDK_OLLAMA_CLOUD_METADATA)
    private readonly cloudMetadata: OllamaCloudMetadataService,
    @inject(TOKENS.AUTH_SECRETS_SERVICE)
    private readonly authSecrets: IAuthSecretsService,
    @inject(TOKENS.SENTRY_SERVICE)
    private readonly sentryService: SentryService,
  ) {}

  /**
   * Get the Ollama server base URL.
   * Checks for user-configured custom URL first, falls back to provider entry default.
   * Shared by both ollama and ollama-cloud providers.
   */
  private getBaseUrl(providerId: string): string {
    const customUrl = this.configManager.get<string>(
      `provider.${providerId}.baseUrl`,
    );
    if (customUrl?.trim()) {
      return customUrl.trim().replace(/\/+$/, '');
    }

    const provider = getAnthropicProvider(providerId);
    if (!provider?.baseUrl) {
      return 'http://127.0.0.1:11434';
    }
    return provider.baseUrl.replace(/\/+$/, '');
  }

  /**
   * Check if the Ollama server version supports the Anthropic Messages API.
   * Ollama v0.14.0+ is required for /v1/messages.
   *
   * @returns Object with version info and whether it meets the minimum requirement.
   * @throws If the server is not reachable.
   */
  async checkVersion(
    providerId = 'ollama',
  ): Promise<{ version: string; supported: boolean }> {
    const baseUrl = this.getBaseUrl(providerId);
    const response = await this.httpGet<OllamaVersionResponse>(
      `${baseUrl}/api/version`,
    );
    const version = response.version;
    const supported = this.isVersionAtLeast(version, MIN_OLLAMA_VERSION);

    this.logger.debug(`[OllamaModelDiscovery] Version check`, {
      version,
      minRequired: MIN_OLLAMA_VERSION,
      supported,
    });

    return { version, supported };
  }

  /**
   * Compare semver strings: is `actual` >= `minimum`?
   */
  private isVersionAtLeast(actual: string, minimum: string): boolean {
    const parse = (v: string) => v.split('.').map((n) => parseInt(n, 10) || 0);
    const a = parse(actual);
    const m = parse(minimum);
    for (let i = 0; i < Math.max(a.length, m.length); i++) {
      const av = a[i] ?? 0;
      const mv = m[i] ?? 0;
      if (av > mv) return true;
      if (av < mv) return false;
    }
    return true; // equal
  }

  /**
   * Fetch models for the 'ollama' (local) provider.
   * Returns only non-cloud models.
   */
  async listLocalModels(): Promise<ProviderModelInfo[]> {
    return this.listModels('ollama', (name) => !isCloudTag(name));
  }

  /**
   * Fetch models for the 'ollama-cloud' provider.
   *
   * The list is the union, keyed by `toCloudId`, of:
   *   (a) ollama.com/api/tags entries whose declared `capabilities` include
   *       `completion` (an entry that declares no capabilities is kept), and
   *   (b) cloud tags the local daemon reports (`ollama pull <model>:cloud`).
   * A model in both keeps the ollama.com fields. ollama.com rows take the
   * tool flag from `capabilities` (`toolUseUnknown` when none are declared)
   * and the context window from ollama.com/api/show; a failed or empty
   * /api/show leaves the window unknown (`contextLength: 0`).
   *
   * @throws ModelListError with the ollama.com reason whenever ollama.com
   *   fails, even when the local daemon lists cloud tags. Those tags alone
   *   are a partial catalog: returning them would make the caller cache and
   *   persist them as the full live list, overwriting the saved complete one.
   *   A cloud model also runs on ollama.com, so an unreachable ollama.com
   *   cannot serve it either. The caller then shows the saved list (or, for a
   *   credential reason, none). A successful empty ollama.com answer with no
   *   local cloud tags returns `[]`.
   */
  async listCloudModels(): Promise<ProviderModelInfo[]> {
    const apiKey = await this.getOllamaCloudApiKey();
    const [remote, local] = await Promise.allSettled([
      this.cloudMetadata.fetchCloudTags(apiKey),
      this.listModels('ollama-cloud', (name) => isCloudTag(name)),
    ]);

    if (local.status === 'rejected') {
      // Expected in direct mode (no daemon); the reason is already captured
      // and logged by listModels.
      this.logger.debug(
        `[OllamaModelDiscovery] listCloudModels: local daemon cloud tags unavailable (${classifyModelListFailure(local.reason)})`,
      );
    }
    const localModels = local.status === 'fulfilled' ? local.value : [];

    if (remote.status === 'rejected') {
      const reason = classifyModelListFailure(remote.reason);
      this.sentryService.captureException(
        remote.reason instanceof Error
          ? remote.reason
          : new Error(String(remote.reason)),
        {
          errorSource: 'OllamaModelDiscoveryService.listCloudModels',
          activeProvider: 'ollama-cloud',
        },
      );
      this.logger.warn(
        `[OllamaModelDiscovery] listCloudModels: ollama.com/api/tags failed (${reason}); ` +
          `not listing the ${localModels.length} local daemon cloud model(s) alone`,
      );
      throw new ModelListError(reason);
    }

    const chatTags = remote.value.filter(
      (tag) => !tag.capabilities || tag.capabilities.includes('completion'),
    );
    const remoteModels = await this.inBatches(chatTags, (tag) =>
      this.toCloudModel(tag),
    );
    const byId = new Map<string, ProviderModelInfo>();
    for (const model of remoteModels) byId.set(toCloudId(model.id), model);
    const localOnly: string[] = [];
    for (const model of localModels) {
      const key = toCloudId(model.id);
      if (byId.has(key)) continue;
      byId.set(key, model);
      localOnly.push(model.id);
    }

    this.logger.info(
      `[OllamaModelDiscovery] listCloudModels: ${byId.size} model(s): ` +
        `${remoteModels.length} from ollama.com (${remote.value.length - chatTags.length} non-chat skipped), ` +
        `${localOnly.length} only on the local daemon${localOnly.length > 0 ? ` [${localOnly.join(', ')}]` : ''}`,
    );
    return Array.from(byId.values());
  }

  /**
   * Build one ollama.com row: tool flag from the declared capabilities, the
   * context window from ollama.com/api/show (0 when it is not reported).
   */
  private async toCloudModel(tag: OllamaCloudTag): Promise<ProviderModelInfo> {
    const metadata = await this.getModelMetadata(OLLAMA_COM_BASE_URL, tag.id);
    const knownWindow = metadata.contextLengthSource === 'provider';
    const contextLength = knownWindow ? metadata.contextLength : 0;
    const caps = tag.capabilities;
    return {
      id: tag.id,
      name: this.formatModelName(tag.id),
      description: this.buildDescription(undefined, contextLength, {
        tools: caps?.includes('tools') ?? false,
        vision: caps?.includes('vision') ?? false,
        thinking: caps?.includes('thinking') ?? false,
      }),
      contextLength,
      ...(knownWindow && { contextLengthSource: 'provider' as const }),
      supportsToolUse: caps?.includes('tools') ?? false,
      ...(caps === undefined && { toolUseUnknown: true as const }),
    };
  }

  /** Map items with at most MAX_CONCURRENT_ENRICHMENTS calls in flight. */
  private async inBatches<T, R>(
    items: readonly T[],
    map: (item: T) => Promise<R>,
  ): Promise<R[]> {
    const results: R[] = [];
    for (let i = 0; i < items.length; i += this.MAX_CONCURRENT_ENRICHMENTS) {
      const batch = items.slice(i, i + this.MAX_CONCURRENT_ENRICHMENTS);
      results.push(...(await Promise.all(batch.map(map))));
    }
    return results;
  }

  /**
   * Read the optional ollama.com API key from SecretStorage via
   * IAuthSecretsService — same slot the auth UI writes to via
   * `auth:saveSettings` → `setProviderKey('ollama-cloud', ...)`. Returns null
   * when unset (the common case — inference still works via `ollama signin`).
   */
  private async getOllamaCloudApiKey(): Promise<string | null> {
    const raw = await this.authSecrets.getProviderKey('ollama-cloud');
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    return trimmed.length > 0 ? trimmed : null;
  }

  /**
   * Core model listing logic.
   * Fetches from /api/tags and enriches with /api/show metadata.
   *
   * @throws ModelListError when the daemon cannot be read (`network` when it
   *   is unreachable). A reachable daemon with no matching models returns `[]`.
   */
  private async listModels(
    providerId: string,
    filter: (name: string) => boolean,
  ): Promise<ProviderModelInfo[]> {
    const baseUrl = this.getBaseUrl(providerId);

    let tagsResponse: OllamaTagsResponse;
    try {
      tagsResponse = await this.httpGet<OllamaTagsResponse>(
        `${baseUrl}/api/tags`,
      );
    } catch (error) {
      this.sentryService.captureException(
        error instanceof Error ? error : new Error(String(error)),
        {
          errorSource: 'OllamaModelDiscoveryService.listModels',
          activeProvider: providerId,
        },
      );
      const reason = classifyModelListFailure(error);
      this.logger.warn(
        `[OllamaModelDiscovery] Failed to list models for ${providerId} (${reason}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error instanceof ModelListError
        ? error
        : new ModelListError(reason);
    }

    if (!tagsResponse?.models?.length) {
      this.logger.debug(
        `[OllamaModelDiscovery] No models returned from /api/tags`,
      );
      return [];
    }
    const filtered = tagsResponse.models.filter((m) => filter(m.name));
    const enriched = await this.inBatches(filtered, (model) =>
      this.enrichModel(baseUrl, model),
    );

    this.logger.debug(
      `[OllamaModelDiscovery] Discovered ${enriched.length} models for ${providerId}`,
      { total: tagsResponse.models.length, filtered: enriched.length },
    );

    return enriched;
  }

  /**
   * Enrich a single model with metadata from /api/show.
   * Uses cached results when available.
   */
  private async enrichModel(
    baseUrl: string,
    model: OllamaModelTag,
  ): Promise<ProviderModelInfo> {
    const metadata = await this.getModelMetadata(baseUrl, model.name);

    return {
      id: model.name,
      name: this.formatModelName(model.name),
      description: this.buildDescription(
        model.details?.parameter_size,
        metadata.contextLength,
        {
          tools: metadata.supportsToolUse,
          vision: metadata.supportsVision,
          thinking: metadata.supportsThinking,
        },
      ),
      contextLength: metadata.contextLength,
      ...(metadata.contextLengthSource === 'provider' && {
        contextLengthSource: 'provider' as const,
      }),
      supportsToolUse: metadata.supportsToolUse,
    };
  }

  /**
   * Get metadata for a model, from cache or /api/show.
   */
  private async getModelMetadata(
    baseUrl: string,
    modelName: string,
  ): Promise<ModelMetadataCache> {
    // Keyed by server as well as model: a base-URL change while an entry is
    // still fresh must not certify the previous server's window for the new one.
    const cacheKey = JSON.stringify([baseUrl, modelName]);
    const cached = this.metadataCache.get(cacheKey);
    if (cached) {
      const ttl = cached.isFallback
        ? this.FALLBACK_CACHE_TTL_MS
        : this.METADATA_CACHE_TTL_MS;
      if (Date.now() - cached.timestamp < ttl) {
        return cached;
      }
    }
    try {
      const showResponse = await this.httpPost<OllamaShowResponse>(
        `${baseUrl}/api/show`,
        { model: modelName },
      );

      const metadata = this.parseShowResponse(showResponse, modelName);
      this.metadataCache.set(cacheKey, metadata);
      return metadata;
    } catch (showError) {
      this.sentryService.captureException(
        showError instanceof Error ? showError : new Error(String(showError)),
        { errorSource: 'OllamaModelDiscoveryService.getModelMetadata' },
      );
      const fallback: ModelMetadataCache = {
        contextLength: 8192,
        supportsToolUse: this.inferToolUseFromFamily(modelName),
        supportsThinking: false,
        supportsVision: false,
        timestamp: Date.now(),
        isFallback: true,
      };
      this.metadataCache.set(cacheKey, fallback);
      return fallback;
    }
  }

  /**
   * Parse /api/show response to extract model capabilities.
   */
  private parseShowResponse(
    response: OllamaShowResponse,
    modelName: string,
  ): ModelMetadataCache {
    // Validate each candidate before choosing: an invalid `general` value
    // (e.g. 0) must not hide a valid architecture-specific one
    // (`llama.context_length`, `gptoss.context_length`, ...).
    const reportedContextLength = [response.model_info, response.modelinfo]
      .flatMap((info) => this.contextLengthCandidates(info))
      .find(
        (value): value is number =>
          typeof value === 'number' && Number.isSafeInteger(value) && value > 0,
      );
    const hasProviderCapacity = reportedContextLength !== undefined;
    const contextLength = reportedContextLength ?? 8192;
    const template = response.template ?? '';
    const families = response.details?.families ?? [];
    const supportsToolUse =
      template.includes('tool') ||
      template.includes('function') ||
      families.some((f) => TOOL_USE_FAMILIES.has(f)) ||
      this.inferToolUseFromFamily(modelName);
    const supportsVision =
      families.includes('clip') || families.includes('mllama');
    const supportsThinking =
      modelName.includes('thinking') ||
      template.includes('thinking') ||
      template.includes('<think>');

    return {
      contextLength,
      ...(hasProviderCapacity && { contextLengthSource: 'provider' as const }),
      supportsToolUse,
      supportsThinking,
      supportsVision,
      timestamp: Date.now(),
    };
  }

  /**
   * Values of every own `*.context_length` key, `general.context_length`
   * first so a valid general value wins over an architecture-specific one.
   */
  private contextLengthCandidates(info: unknown): unknown[] {
    if (!info || typeof info !== 'object' || Array.isArray(info)) return [];
    const record = info as Record<string, unknown>;
    const keys = Object.keys(record).filter((key) =>
      key.endsWith('.context_length'),
    );
    keys.sort(
      (a, b) =>
        Number(b === 'general.context_length') -
        Number(a === 'general.context_length'),
    );
    return keys.map((key) => record[key]);
  }

  /**
   * Infer tool use support from model name as a last-resort fallback.
   */
  private inferToolUseFromFamily(modelName: string): boolean {
    const lower = modelName.toLowerCase().split(':')[0]; // base name only
    return Array.from(TOOL_USE_FAMILIES).some(
      (family) => lower === family || lower.startsWith(`${family}-`),
    );
  }

  /**
   * Convert model name to display name.
   * "llama3.3:latest" -> "Llama3.3"
   * "kimi-k2.5:cloud" -> "Kimi K2.5 (Cloud)"
   */
  private formatModelName(name: string): string {
    const cloud = isCloudTag(name);
    const baseName = name
      .replace(/:latest$/, '')
      .replace(/:cloud$/, '')
      .replace(/-cloud$/, '');
    const display = baseName
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
    return cloud ? `${display} (Cloud)` : display;
  }

  /**
   * Build a short description: parameter size, context window, capabilities.
   */
  private buildDescription(
    parameterSize: string | undefined,
    contextLength: number,
    capabilities: { tools: boolean; vision: boolean; thinking: boolean },
  ): string {
    const parts: string[] = [];
    if (parameterSize) {
      parts.push(parameterSize);
    }
    if (contextLength >= 1000) {
      parts.push(`${Math.round(contextLength / 1000)}K context`);
    }
    const caps: string[] = [];
    if (capabilities.tools) caps.push('tools');
    if (capabilities.vision) caps.push('vision');
    if (capabilities.thinking) caps.push('thinking');
    if (caps.length > 0) parts.push(caps.join(', '));

    return parts.join(' \u2022 ');
  }

  /**
   * Clear all cached metadata.
   */
  clearCache(): void {
    this.metadataCache.clear();
  }

  private httpGet<T>(url: string): Promise<T> {
    return this.httpRequest<T>(url, 'GET');
  }

  private httpPost<T>(url: string, body: Record<string, unknown>): Promise<T> {
    return this.httpRequest<T>(url, 'POST', JSON.stringify(body));
  }

  /**
   * JSON request with a 5 s timeout and a {@link MAX_RESPONSE_BYTES} body cap.
   * Rejects with `ModelListError`: 401/403 -> `auth-rejected`, any other
   * non-2xx -> `http-error`, oversize or
   * non-JSON body -> `bad-response`, timeout -> `timeout`. A connection
   * failure rejects with the raw Node error (its code classifies as
   * `network`).
   */
  private httpRequest<T>(
    url: string,
    method: string,
    body?: string,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const requestFn =
        parsedUrl.protocol === 'https:' ? https.request : http.request;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (body) {
        headers['Content-Length'] = Buffer.byteLength(body).toString();
      }

      const req = requestFn(
        parsedUrl,
        { method, headers, timeout: 5000 },
        (res) => {
          const chunks: Buffer[] = [];
          let received = 0;
          res.on('data', (c: Buffer) => {
            received += c.length;
            if (received > MAX_RESPONSE_BYTES) {
              this.logger.debug(
                `[OllamaModelDiscovery] ${url} response exceeded ${MAX_RESPONSE_BYTES} bytes`,
              );
              reject(new ModelListError('bad-response'));
              req.destroy();
              return;
            }
            chunks.push(c);
          });
          res.on('end', () => {
            if (received > MAX_RESPONSE_BYTES) return;
            if (
              res.statusCode &&
              res.statusCode >= 200 &&
              res.statusCode < 300
            ) {
              try {
                resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
              } catch {
                this.logger.debug(
                  `[OllamaModelDiscovery] Invalid JSON response from ${url}`,
                );
                reject(new ModelListError('bad-response'));
              }
            } else {
              this.logger.debug(
                `[OllamaModelDiscovery] ${url} returned ${res.statusCode}`,
              );
              reject(
                new ModelListError(
                  res.statusCode === 401 || res.statusCode === 403
                    ? 'auth-rejected'
                    : 'http-error',
                ),
              );
            }
          });
        },
      );
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new ModelListError('timeout'));
      });
      if (body) req.write(body);
      req.end();
    });
  }
}
