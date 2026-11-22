/**
 * Copilot Translation Proxy
 *
 * Thin subclass of TranslationProxyBase that provides Copilot-specific
 * configuration: auth headers, API endpoint, model prefix, and completions path.
 *
 * All HTTP server logic, request/response translation, retry, and streaming
 * are handled by the base class in openai-translation/translation-proxy-base.ts.
 */

import { injectable, inject } from 'tsyringe';
import { Logger, TOKENS } from '@ptah-extension/vscode-core';
import { TranslationProxyBase } from '../../translation';
import type { ICopilotAuthService } from './copilot-provider.types';
import { COPILOT_PROVIDER_ENTRY } from '@ptah-extension/shared';
import { AUTH_PROVIDERS_TOKENS } from '../../di/tokens';

/** Default Copilot API endpoint (used when auth state has no override) */
const DEFAULT_COPILOT_API_ENDPOINT = 'https://api.githubcopilot.com';

@injectable()
export class CopilotTranslationProxy extends TranslationProxyBase {
  constructor(
    @inject(TOKENS.LOGGER) logger: Logger,
    @inject(AUTH_PROVIDERS_TOKENS.SDK_COPILOT_AUTH)
    private readonly copilotAuth: ICopilotAuthService,
  ) {
    super(logger, {
      name: 'Copilot',
      modelPrefix: '',
      completionsPath: '/chat/completions',
    });
  }

  /**
   * The registry id, taken from the provider entry rather than re-typed, so the
   * quota gate keys on the same string `ProviderAuthResolver` resolves. The
   * config's `name` above is a log label and would key nothing.
   */
  protected getProviderId(): string {
    return COPILOT_PROVIDER_ENTRY.id;
  }

  /**
   * Get the Copilot API base URL from the current auth state.
   * Falls back to the default endpoint if no auth state or no override.
   */
  protected async getApiEndpoint(): Promise<string> {
    const authState = await this.copilotAuth.getAuthState();
    return authState?.apiEndpoint ?? DEFAULT_COPILOT_API_ENDPOINT;
  }

  /**
   * Get Copilot-specific auth and request headers from the auth service.
   */
  protected async getHeaders(): Promise<Record<string, string>> {
    return this.copilotAuth.getHeaders();
  }

  /**
   * On 401, attempt to re-login via GitHub OAuth to refresh the Copilot token.
   */
  protected async onAuthFailure(): Promise<boolean> {
    return this.copilotAuth.login();
  }

  /**
   * Normalize Anthropic-format Claude model IDs to Copilot format.
   *
   * The SDK's resolveModelId() returns Anthropic API IDs with hyphens
   * (e.g., 'claude-opus-4-6', 'claude-haiku-4-5-20251001'), but the
   * Copilot API expects dot notation (e.g., 'claude-opus-4.6', 'claude-haiku-4.5').
   *
   * Non-Claude models (GPT, Gemini) pass through unchanged.
   */
  protected override normalizeModelId(modelId: string): string {
    if (!modelId.startsWith('claude-')) {
      return modelId;
    }
    const match = modelId.match(
      /^(claude-(?:opus|sonnet|haiku)-\d+)-(\d+)(?:-.+)?$/,
    );
    if (match) {
      return `${match[1]}.${match[2]}`;
    }

    return modelId;
  }

  /**
   * Copilot uses Chat Completions (/chat/completions) for all models.
   *
   * The Copilot API at api.githubcopilot.com does not reliably support the
   * Responses API (/responses) for all GPT-5+ models — sending unsupported
   * models there results in "model_not_supported" errors. Chat Completions
   * is the known-working endpoint for all Copilot models.
   */
  protected override resolveUpstreamProtocol(
    _modelId: string,
  ): 'chat/completions' {
    return 'chat/completions';
  }
}
