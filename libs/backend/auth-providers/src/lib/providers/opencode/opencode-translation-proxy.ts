/**
 * OpenCode translation proxy.
 *
 * One immutable subscription selects the endpoint and credential source. Each
 * request resolves tier aliases against the gateway's live model ids (or the
 * persisted catalog), then its protocol from the live gateway catalog, with
 * the persisted catalog's protocol as the only fallback. The base owns
 * transport, native relay, translation, quota, cancellation and teardown.
 */
import type { Logger } from '@ptah-extension/vscode-core';
import {
  closestLiveModel,
  OPENCODE_ZEN_PROVIDER_ENTRY,
  OPENCODE_GO_PROVIDER_ENTRY,
  type OpenCodeProviderId,
  type AnthropicProvider,
  type OpenCodeProtocol,
  type ProviderModelTier,
} from '@ptah-extension/shared';
import { TranslationProxyBase } from '../../translation';
import { deriveTiersFromCatalog } from '../../model-tier-derivation';
import type { IOpenCodeAuthService } from './opencode-provider.types';
import { openCodeLiveRoutes } from './opencode-live-routes';

const ALIAS_TIERS: Readonly<Record<string, ProviderModelTier>> = {
  default: 'sonnet',
  sonnet: 'sonnet',
  opus: 'opus',
  haiku: 'haiku',
};

/** `${providerId}:${tier}` pairs whose preference replacement was logged. */
const loggedTierReplacements = new Set<string>();

export class OpenCodeTranslationProxy extends TranslationProxyBase {
  private readonly entry: Readonly<AnthropicProvider>;

  constructor(
    logger: Logger,
    private readonly providerId: OpenCodeProviderId,
    private readonly auth: IOpenCodeAuthService,
  ) {
    const entry =
      providerId === 'opencode-zen'
        ? OPENCODE_ZEN_PROVIDER_ENTRY
        : OPENCODE_GO_PROVIDER_ENTRY;
    super(logger, {
      name: entry.name,
      modelPrefix: '',
      completionsPath: '/chat/completions',
      responsesPath: '/responses',
      messagesPath: '/messages',
    });
    this.entry = entry;
  }

  protected getProviderId(): string {
    return this.providerId;
  }

  protected async getApiEndpoint(): Promise<string> {
    return this.entry.baseUrl;
  }

  protected async getHeaders(): Promise<Record<string, string>> {
    return this.auth.getHeaders();
  }

  /** API keys cannot refresh; never retry against another subscription. */
  protected async onAuthFailure(): Promise<boolean> {
    return false;
  }

  /**
   * `default`/`sonnet`/`opus`/`haiku` resolve to the entry's tier preference
   * when the gateway still lists it. A retired preference resolves to the
   * closest live id of the same family, else the tier derived from the live
   * ids, else stays as is (routing then explains why it cannot be served).
   * With no catalog on hand the preference is used unverified.
   */
  protected override async resolveRequestModelId(
    modelId: string,
  ): Promise<string> {
    const tier = Object.prototype.hasOwnProperty.call(ALIAS_TIERS, modelId)
      ? ALIAS_TIERS[modelId]
      : undefined;
    if (!tier) return modelId;
    const preferred = this.entry.defaultTiers?.[tier];
    if (!preferred) return modelId;
    const ids = await openCodeLiveRoutes.modelIds(this.providerId);
    if (!ids || ids.includes(preferred)) return preferred;
    const family = closestLiveModel(preferred, ids);
    const derived = family
      ? undefined
      : deriveTiersFromCatalog(
          ids.map((id) => ({
            id,
            name: id,
            description: '',
            contextLength: 0,
            supportsToolUse: false,
          })),
        )[tier];
    const resolved = family ?? derived ?? preferred;
    const rule = family ? 'family' : derived ? 'derived' : 'none';
    const key = `${this.providerId}:${tier}`;
    if (!loggedTierReplacements.has(key)) {
      loggedTierReplacements.add(key);
      this.logger.warn('[provider-auth] tier preference not in live catalog', {
        providerId: this.providerId,
        tier,
        preferred,
        resolved,
        rule,
      });
    }
    return resolved;
  }

  protected override async resolveUpstreamProtocolForRequest(
    modelId: string,
  ): Promise<OpenCodeProtocol | 'not-listed' | 'catalog-unavailable'> {
    const route = await openCodeLiveRoutes.resolve(this.providerId, modelId);
    return route.outcome === 'routed' ? route.protocol : route.outcome;
  }

  protected override getUnsupportedModelMessage(
    modelId: string,
    outcome?: 'not-listed' | 'catalog-unavailable',
  ): string {
    if (outcome === 'catalog-unavailable') {
      return `Couldn't load ${this.entry.name}'s model list to route '${modelId}'. Check your connection and retry.`;
    }
    return `Model '${modelId}' is not offered by ${this.entry.name} as a chat model. Choose a model from the list.`;
  }

  protected override getAuthFailureMessage(): string {
    return `${this.entry.name} rejected the API key. Update that subscription's key in Settings > Authentication.`;
  }

  /** Never expose raw upstream payloads in either client errors or logs. */
  protected override getUpstreamErrorMessage(
    status: number,
    _body: string,
  ): string {
    if (status === 403) {
      return `${this.entry.name} denied this request (403). Check access for this subscription and model.`;
    }
    if (status >= 500) {
      return `${this.entry.name} API error (${status}). The provider could not complete the request. Try again later.`;
    }
    return `${this.entry.name} API error (${status}). Check your subscription/balance, model selection and request.`;
  }
}
