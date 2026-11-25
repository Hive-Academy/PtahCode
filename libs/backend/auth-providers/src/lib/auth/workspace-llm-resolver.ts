/**
 * WorkspaceLlmResolver — the `IWorkspaceLlmResolver` implementation.
 *
 * Resolves provider AND model for one workspace path from ONE place:
 *  - the provider: `ActiveProviderResolver.resolveActiveAuthForPath` (the
 *    workspace's override, else the app-, then global-scoped value; `''` for
 *    rootless callers reads app/global directly);
 *  - the model: `provider.<authKey>.selectedModel` read for that same path;
 *  - the credentials: `WorkspaceProviderProfileResolver.buildProfileForPath`,
 *    the snapshot builder the chat path uses, so the model's tier aliases are
 *    resolved against the provider they will be sent to.
 *
 * Never the process-wide `AuthEnv` and never the active workspace: a
 * workspace-scoped save re-configures that env for whichever workspace is
 * active, which is not necessarily the one this work belongs to.
 */

import { inject, injectable } from 'tsyringe';
import { Logger, TOKENS } from '@ptah-extension/vscode-core';
import { resolveAuthProviderKey } from '@ptah-extension/platform-core';
import {
  SETTINGS_TOKENS,
  type WorkspaceScopeResolver,
} from '@ptah-extension/settings-core';
import {
  AuthRequiredError,
  type IWorkspaceLlmResolver,
  type OneShotAuthOverride,
  type ResolvedSetupSnapshot,
  type SetupResolution,
  type WorkspaceLlmResolveOptions,
  type WorkspaceLlmSnapshot,
} from '@ptah-extension/agent-sdk';
import {
  ANTHROPIC_DIRECT_PROVIDER_ID,
  getAnthropicProvider,
  isProviderSessionProviderId,
  type ModelPair,
  type ProviderProfile,
} from '@ptah-extension/shared';
import { AUTH_PROVIDERS_TOKENS } from '../di/tokens';
import type { ProviderModelsService } from '../provider-models.service';
import type {
  ActiveAuth,
  ActiveProviderResolver,
} from './active-provider-resolver';
import {
  isConcreteModelId,
  type WorkspaceProviderProfileResolver,
} from './workspace-provider-profile-resolver';
import type { ProviderQuotaStore } from './provider-quota.store';

const TIER_ALIASES: ReadonlySet<string> = new Set([
  'default',
  'opus',
  'sonnet',
  'haiku',
]);

type ResolvedSetup = Extract<SetupResolution, { kind: 'set' | 'unset' }>;
type UnsetSetupResolution =
  | Exclude<SetupResolution, ResolvedSetup>
  | (ResolvedSetup & { kind: 'unset' });
type WorkspaceSetupResolution =
  | UnsetSetupResolution
  | (ResolvedSetup & { kind: 'set'; storedPair: ModelPair });

@injectable()
export class WorkspaceLlmResolver implements IWorkspaceLlmResolver {
  constructor(
    @inject(TOKENS.LOGGER) private readonly logger: Logger,
    @inject(SETTINGS_TOKENS.WORKSPACE_SCOPE_RESOLVER)
    private readonly scope: WorkspaceScopeResolver,
    @inject(AUTH_PROVIDERS_TOKENS.SDK_ACTIVE_PROVIDER_RESOLVER)
    private readonly activeProviderResolver: ActiveProviderResolver,
    @inject(AUTH_PROVIDERS_TOKENS.SDK_WORKSPACE_PROVIDER_PROFILE_RESOLVER)
    private readonly profileResolver: WorkspaceProviderProfileResolver,
    @inject(AUTH_PROVIDERS_TOKENS.SDK_PROVIDER_MODELS)
    private readonly providerModels: ProviderModelsService,
    @inject(AUTH_PROVIDERS_TOKENS.SDK_PROVIDER_QUOTA_STORE)
    private readonly quota: ProviderQuotaStore,
  ) {}

  async resolveForPath(
    workspaceRoot: string | undefined,
    options: WorkspaceLlmResolveOptions = {},
  ): Promise<WorkspaceLlmSnapshot> {
    const path = workspaceRoot?.trim() ?? '';
    const { authMethod, providerId } =
      this.activeProviderResolver.resolveActiveAuthForPath(path);
    const thirdParty = authMethod === 'thirdParty';
    const catalog = thirdParty
      ? this.providerModels.getCachedModelIds(providerId)
      : null;

    const savedModel =
      this.scope
        .readForPath<string>(
          `provider.${resolveAuthProviderKey(authMethod, providerId)}.selectedModel`,
          path,
          true,
        )
        ?.trim() || 'default';
    const requestedModel = this.acceptRequestedModel(
      options.requestedModel,
      thirdParty,
      catalog,
      providerId,
    );

    let profile: ProviderProfile | undefined;
    try {
      profile = await this.profileResolver.buildProfileForPath(
        path,
        requestedModel ?? savedModel,
      );
    } catch (error: unknown) {
      // Codex and provider sessions have no Claude-SDK route: fail explicitly
      // instead of letting the one-shot ride another provider's process-wide
      // auth.
      if (
        error instanceof AuthRequiredError &&
        error.providerId !== null &&
        (error.providerId === 'openai-codex' ||
          isProviderSessionProviderId(error.providerId))
      ) {
        throw error;
      }
      // The builder already returns `undefined` on its own failures; a throw
      // degrades the same way and is logged at warn here.
      this.logger.warn(
        '[WorkspaceLlmResolver] Could not build the provider snapshot',
        { error: error instanceof Error ? error.message : String(error) },
      );
    }

    if (!profile) {
      this.logger.warn(
        '[WorkspaceLlmResolver] No isolated provider snapshot for this workspace — the query rides the process-wide auth',
        { providerId, workspaceRoot: path || '(none)' },
      );
      return {
        providerId,
        model: requestedModel ?? savedModel,
        ...this.cooldownFor(providerId),
      };
    }

    const auth: OneShotAuthOverride = {
      env: { ...profile.authEnv },
      ...(profile.baseUrl ? { baseUrl: profile.baseUrl } : {}),
    };
    return {
      providerId: profile.providerId,
      model: this.ensureAvailable(profile, catalog),
      auth,
      // The cooldown belongs to the provider the snapshot targets.
      ...this.cooldownFor(profile.providerId),
    };
  }

  async resolveSetup(
    workspaceRoot: string | undefined,
  ): Promise<WorkspaceSetupResolution> {
    const path = workspaceRoot?.trim() ?? '';
    const stored = this.scope.readSetupPair();
    if (stored.provider === null && stored.model === null) {
      return this.resolveUnsetSetup(path);
    }
    return this.resolveSetSetup(path, stored.provider, stored.model);
  }

  /**
   * Validate a candidate Setup pair using the same strict admission rules as
   * {@link resolveSetup} without mutating stored settings. Used before
   * committing a user-selected pair so invalid inputs never touch disk.
   */
  async validateSetupPair(
    workspaceRoot: string | undefined,
    pair: { provider: string; model: string },
  ): Promise<WorkspaceSetupResolution> {
    const path = workspaceRoot?.trim() ?? '';
    const provider =
      typeof pair.provider === 'string' && pair.provider.trim().length > 0
        ? pair.provider.trim()
        : null;
    const model =
      typeof pair.model === 'string' && pair.model.trim().length > 0
        ? pair.model.trim()
        : null;
    if (provider === null && model === null) {
      return this.resolveUnsetSetup(path);
    }
    return this.resolveSetSetup(path, provider, model);
  }

  private async resolveUnsetSetup(
    workspacePath: string,
  ): Promise<UnsetSetupResolution> {
    const activeAuth =
      await this.profileResolver.resolveSetupWorkspaceAuth(workspacePath);
    const authKey = resolveAuthProviderKey(
      activeAuth.authMethod,
      activeAuth.providerId,
    );
    const rawSaved = this.scope
      .readForPath<string>(
        `provider.${authKey}.selectedModel`,
        workspacePath,
        true,
      )
      ?.trim();
    const savedModel = rawSaved && rawSaved.length > 0 ? rawSaved : null;

    if (
      activeAuth.providerId === 'openai-codex' ||
      isProviderSessionProviderId(activeAuth.providerId)
    ) {
      return {
        kind: 'invalid',
        source: 'workspace',
        provider: activeAuth.providerId,
        model: savedModel,
        cause: 'provider-unsupported',
      };
    }

    if (
      activeAuth.authMethod === 'thirdParty' &&
      !getAnthropicProvider(activeAuth.providerId)
    ) {
      return {
        kind: 'invalid',
        source: 'workspace',
        provider: activeAuth.providerId,
        model: savedModel,
        cause: 'provider-unknown',
      };
    }

    const catalogueProviderId =
      activeAuth.authMethod === 'thirdParty'
        ? activeAuth.providerId
        : ANTHROPIC_DIRECT_PROVIDER_ID;

    let concreteModel: string | undefined;
    if (savedModel && isConcreteModelId(savedModel)) {
      concreteModel = savedModel;
    } else {
      const persistedTiers = this.providerModels.getModelTiers(
        catalogueProviderId,
        'mainAgent',
      );
      const tiers = this.providerModels.resolveEffectiveTiers(
        catalogueProviderId,
        persistedTiers,
      );
      const lowerAlias = savedModel?.toLowerCase();
      const candidates: Array<string | undefined> =
        lowerAlias === 'opus' ||
        lowerAlias === 'sonnet' ||
        lowerAlias === 'haiku'
          ? [tiers[lowerAlias], tiers.sonnet, tiers.opus, tiers.haiku]
          : [tiers.opus, tiers.sonnet, tiers.haiku];
      concreteModel = candidates.find(
        (candidate): candidate is string =>
          typeof candidate === 'string' && isConcreteModelId(candidate),
      );
    }

    if (!concreteModel) {
      return {
        kind: 'invalid',
        source: 'workspace',
        provider: activeAuth.providerId,
        model: savedModel,
        cause: 'model-missing',
      };
    }

    const catalog = this.providerModels.getCachedModelIds(catalogueProviderId);
    if (catalog !== null && !catalog.includes(concreteModel)) {
      return {
        kind: 'invalid',
        source: 'workspace',
        provider: activeAuth.providerId,
        model: concreteModel,
        cause: 'model-stale',
      };
    }

    const built = await this.profileResolver.buildSetupProfile(
      activeAuth,
      workspacePath,
      concreteModel,
    );
    if (!built.ok) {
      return built.kind === 'unavailable'
        ? {
            kind: 'unavailable',
            source: 'workspace',
            provider: activeAuth.providerId,
            model: concreteModel,
            cause: 'provider-unavailable',
          }
        : {
            kind: 'invalid',
            source: 'workspace',
            provider: activeAuth.providerId,
            model: concreteModel,
            cause: built.cause,
          };
    }

    return {
      kind: 'unset',
      snapshot: this.toSetupSnapshot(built.profile),
    };
  }

  private async resolveSetSetup(
    workspacePath: string,
    provider: string | null,
    model: string | null,
  ): Promise<Exclude<WorkspaceSetupResolution, { kind: 'unset' }>> {
    if (provider === null) {
      return {
        kind: 'invalid',
        source: 'setup',
        provider: null,
        model,
        cause: 'provider-missing',
      };
    }
    if (model === null) {
      return {
        kind: 'invalid',
        source: 'setup',
        provider,
        model: null,
        cause: 'model-missing',
      };
    }

    if (provider === 'openai-codex' || isProviderSessionProviderId(provider)) {
      return {
        kind: 'invalid',
        source: 'setup',
        provider,
        model,
        cause: 'provider-unsupported',
      };
    }

    let mapped:
      | {
          readonly kind: 'fixed';
          readonly activeAuth: ActiveAuth;
          readonly catalogueProviderId: string;
        }
      | {
          readonly kind: 'direct-disambiguate';
          readonly catalogueProviderId: string;
        };

    if (provider === 'claudeCli') {
      mapped = {
        kind: 'fixed',
        activeAuth: {
          authMethod: 'claudeCli',
          providerId: ANTHROPIC_DIRECT_PROVIDER_ID,
        },
        catalogueProviderId: ANTHROPIC_DIRECT_PROVIDER_ID,
      };
    } else if (provider === 'apiKey') {
      mapped = {
        kind: 'fixed',
        activeAuth: {
          authMethod: 'apiKey',
          providerId: ANTHROPIC_DIRECT_PROVIDER_ID,
        },
        catalogueProviderId: ANTHROPIC_DIRECT_PROVIDER_ID,
      };
    } else if (provider === ANTHROPIC_DIRECT_PROVIDER_ID) {
      mapped = {
        kind: 'direct-disambiguate',
        catalogueProviderId: ANTHROPIC_DIRECT_PROVIDER_ID,
      };
    } else if (getAnthropicProvider(provider)) {
      mapped = {
        kind: 'fixed',
        activeAuth: {
          authMethod: 'thirdParty',
          providerId: provider,
        },
        catalogueProviderId: provider,
      };
    } else {
      return {
        kind: 'invalid',
        source: 'setup',
        provider,
        model,
        cause: 'provider-unknown',
      };
    }

    if (!isConcreteModelId(model)) {
      return {
        kind: 'invalid',
        source: 'setup',
        provider,
        model,
        cause: 'model-stale',
      };
    }

    const catalog = this.providerModels.getCachedModelIds(
      mapped.catalogueProviderId,
    );
    if (catalog !== null && !catalog.includes(model)) {
      return {
        kind: 'invalid',
        source: 'setup',
        provider,
        model,
        cause: 'model-stale',
      };
    }

    let activeAuth: ActiveAuth;
    if (mapped.kind === 'fixed') {
      activeAuth = mapped.activeAuth;
    } else {
      const resolvedDirect = await this.disambiguateDirectAnthropic(
        workspacePath,
      );
      if (!resolvedDirect) {
        return {
          kind: 'invalid',
          source: 'setup',
          provider,
          model,
          cause: 'not-signed-in',
        };
      }
      activeAuth = resolvedDirect;
    }

    const built = await this.profileResolver.buildSetupProfile(
      activeAuth,
      workspacePath,
      model,
    );
    if (!built.ok) {
      return built.kind === 'unavailable'
        ? {
            kind: 'unavailable',
            source: 'setup',
            provider,
            model,
            cause: 'provider-unavailable',
          }
        : {
            kind: 'invalid',
            source: 'setup',
            provider,
            model,
            cause: built.cause,
          };
    }

    return {
      kind: 'set',
      storedPair: { provider, model },
      snapshot: this.toSetupSnapshot(built.profile),
    };
  }

  /**
   * Disambiguate stored `ANTHROPIC_DIRECT_PROVIDER_ID` (`'anthropic'`):
   * prefer the workspace's active direct method (`'apiKey'` or `'claudeCli'`)
   * when its credential is valid; otherwise accept whichever of `'apiKey'` or
   * `'claudeCli'` has valid credentials; if neither, return `null`.
   */
  private async disambiguateDirectAnthropic(
    workspacePath: string,
  ): Promise<ActiveAuth | null> {
    const workspaceActive =
      this.activeProviderResolver.resolveActiveAuthForPath(workspacePath);
    const preferredOrder: readonly ('apiKey' | 'claudeCli')[] =
      workspaceActive.authMethod === 'apiKey'
        ? ['apiKey', 'claudeCli']
        : ['claudeCli', 'apiKey'];
    const probe = this.profileResolver.getSetupCredentialProbe();
    for (const method of preferredOrder) {
      const ready =
        method === 'apiKey'
          ? await probe.hasAnthropicApiKey()
          : await probe.isClaudeCliConnected();
      if (ready) {
        return {
          authMethod: method,
          providerId: ANTHROPIC_DIRECT_PROVIDER_ID,
        };
      }
    }
    return null;
  }

  private toSetupSnapshot(profile: ProviderProfile): ResolvedSetupSnapshot {
    const auth: OneShotAuthOverride = {
      env: { ...profile.authEnv },
      ...(profile.baseUrl ? { baseUrl: profile.baseUrl } : {}),
    };
    return {
      providerId: profile.providerId,
      model: profile.model,
      auth,
      ...this.cooldownFor(profile.providerId),
    };
  }

  private cooldownFor(providerId: string): { cooldownMs?: number } {
    const cooldownMs = this.quota.retryAfterMs(providerId);
    return cooldownMs > 0 ? { cooldownMs } : {};
  }

  /**
   * A caller-supplied model is kept only when the snapshot's provider offers
   * it: in its cached catalogue for a third-party provider, or a Claude id /
   * tier alias for direct Anthropic. Anything else (typically a model the
   * frontend still holds for the previous provider) is ignored.
   */
  private acceptRequestedModel(
    requested: string | undefined,
    thirdParty: boolean,
    catalog: readonly string[] | null,
    providerId: string,
  ): string | undefined {
    const model = requested?.trim();
    if (!model) return undefined;
    const accepted = thirdParty
      ? catalog !== null && catalog.includes(model)
      : model.startsWith('claude-') || TIER_ALIASES.has(model.toLowerCase());
    if (!accepted) {
      this.logger.warn(
        '[WorkspaceLlmResolver] Ignoring a requested model the workspace provider does not offer',
        { requested: model, providerId },
      );
      return undefined;
    }
    return model;
  }

  /**
   * Stale-model pre-flight: a model absent from the provider's cached list is
   * replaced by the provider's tier mapping (opus → sonnet → haiku, the order
   * `resolveModel` uses for `default`), the first tier the list contains.
   * No cached list, or no tier in it → the model is kept (swapping one
   * unlisted id for another fixes nothing); this never blocks a run.
   */
  private ensureAvailable(
    profile: ProviderProfile,
    catalog: readonly string[] | null,
  ): string {
    if (!catalog || catalog.includes(profile.model)) return profile.model;
    const fallback = [
      profile.authEnv.ANTHROPIC_DEFAULT_OPUS_MODEL,
      profile.authEnv.ANTHROPIC_DEFAULT_SONNET_MODEL,
      profile.authEnv.ANTHROPIC_DEFAULT_HAIKU_MODEL,
    ].find(
      (m): m is string =>
        typeof m === 'string' && m.length > 0 && catalog.includes(m),
    );
    if (!fallback) return profile.model;
    this.logger.warn(
      '[WorkspaceLlmResolver] Saved model is not offered by the workspace provider — using its default tier',
      { model: profile.model, fallback, providerId: profile.providerId },
    );
    return fallback;
  }
}
