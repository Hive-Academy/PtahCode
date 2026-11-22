/**
 * Provider RPC Handlers (generalized from OpenRouterRpcHandlers).
 *
 * Handles provider-related RPC methods for model listing and tier configuration:
 * - provider:listModels - The provider's model list, live or saved
 * - provider:setModelTier - Set model for a tier (Sonnet/Opus/Haiku)
 * - provider:getModelTiers - Get current tier mappings
 * - provider:clearModelTier - Clear a tier override (reset to default)
 * - provider:getAccountUsage - The selected provider's plan usage
 * - provider:getPlanLimits - Every in-scope quota owner's plan limits
 *
 * Supports all Anthropic-compatible providers (OpenRouter, Kimi Code, Z.AI).
 */

import { injectable, inject } from 'tsyringe';
import {
  Logger,
  RpcHandler,
  TOKENS,
  ConfigManager,
  IAuthSecretsService,
  RpcUserError,
} from '@ptah-extension/vscode-core';
import {
  ProviderListModelsSchema,
  ProviderSetModelTierSchema,
  ProviderGetModelTiersSchema,
  ProviderClearModelTierSchema,
  ProviderAddCustomEntrySchema,
  ProviderUpdateCustomEntrySchema,
  ProviderRemoveCustomEntrySchema,
  ProviderTestCustomEntrySchema,
  ProviderGetAccountUsageSchema,
  ProviderGetPlanLimitsSchema,
} from './provider-rpc.schema';
import {
  PlanLimitsSnapshotService,
  type PlanLimitsSnapshotRequest,
} from '../services/plan-limits-snapshot.service';
import {
  SETTINGS_TOKENS,
  CustomProviderStore,
} from '@ptah-extension/settings-core';
import { ConnectionCheckRecorder } from '../utils/connection-check-recorder';
import {
  customEntryEditStalesCheck,
  testCustomEntryAndRecord,
} from './connection-check';
import type { SentryService } from '@ptah-extension/vscode-core';
import type { IModelDiscovery } from '@ptah-extension/platform-core';
import { SettingsPersistError } from '@ptah-extension/platform-core';
import {
  SdkAgentAdapter,
  SDK_TOKENS,
  DEFAULT_PROVIDER_ID,
  ANTHROPIC_DIRECT_PROVIDER_ID,
} from '@ptah-extension/agent-sdk';
import {
  AUTH_PROVIDERS_TOKENS,
  ProviderModelsService,
  CODEX_PROVIDER_ENTRY,
  KimiCodeAuthUnavailableError,
  ModelListError,
  ClaudeAmbientLoginStatusReader,
  classifyModelListFailure,
  type ProviderModelList,
  OllamaModelDiscoveryService,
  CopilotAuthService,
  CodexAuthService,
  type IKimiCodeAuthService,
  type ICodexAccountUsageService,
} from '@ptah-extension/auth-providers';
import { CliDetectionService } from '@ptah-extension/cli-agent-runtime';
import {
  ProviderListModelsParams,
  ProviderListModelsResult,
  ProviderModelInfo,
  ProviderSetModelTierParams,
  ProviderSetModelTierResult,
  ProviderGetModelTiersParams,
  ProviderGetModelTiersResult,
  ProviderClearModelTierParams,
  ProviderClearModelTierResult,
  ProviderListCustomEntriesParams,
  ProviderListCustomEntriesResult,
  ProviderAddCustomEntryParams,
  ProviderAddCustomEntryResult,
  ProviderUpdateCustomEntryParams,
  ProviderUpdateCustomEntryResult,
  ProviderRemoveCustomEntryParams,
  ProviderRemoveCustomEntryResult,
  ProviderTestCustomEntryParams,
  ProviderTestCustomEntryResult,
  ProviderGetAccountUsageParams,
  ProviderGetAccountUsageResult,
  ProviderGetPlanLimitsParams,
  ProviderGetPlanLimitsResult,
  getModelPricingDescription,
  getModelContextWindow,
  isDirectAnthropic,
  parseKimiCodeModels,
  modelListErrorText,
  modelListNoticeText,
  getAnthropicProvider,
  getPtahCliLaneProvider,
  getProviderSessionProfile,
  PROVIDER_SESSION_PROVIDER_IDS,
} from '@ptah-extension/shared';
import type {
  ModelListFailureReason,
  RuntimeHostCapabilities,
} from '@ptah-extension/shared';
import type { AuthEnv } from '@ptah-extension/shared';
import type { RpcMethodName } from '@ptah-extension/shared';

/**
 * Client-facing text for a failed tier write. Raw errors can carry paths or
 * credentials, so only SettingsPersistError (fixed text by construction)
 * passes through; everything else gets the per-RPC fixed message.
 */
function clientTierError(error: unknown, fixedMessage: string): string {
  return error instanceof SettingsPersistError ? error.message : fixedMessage;
}

/**
 * RPC handlers for provider model operations
 */
@injectable()
export class ProviderRpcHandlers {
  static readonly METHODS = [
    'provider:listModels',
    'provider:setModelTier',
    'provider:getModelTiers',
    'provider:clearModelTier',
    'provider:listCustomEntries',
    'provider:addCustomEntry',
    'provider:updateCustomEntry',
    'provider:removeCustomEntry',
    'provider:testCustomEntry',
    'provider:getAccountUsage',
    'provider:getPlanLimits',
  ] as const satisfies readonly RpcMethodName[];

  constructor(
    @inject(TOKENS.LOGGER) private readonly logger: Logger,
    @inject(TOKENS.RPC_HANDLER) private readonly rpcHandler: RpcHandler,
    @inject(TOKENS.CONFIG_MANAGER)
    private readonly configManager: ConfigManager,
    @inject(TOKENS.AUTH_SECRETS_SERVICE)
    private readonly authSecretsService: IAuthSecretsService,
    @inject(AUTH_PROVIDERS_TOKENS.SDK_PROVIDER_MODELS)
    private readonly providerModels: ProviderModelsService,
    @inject(TOKENS.CLI_DETECTION_SERVICE)
    private readonly cliDetection: CliDetectionService,
    @inject(TOKENS.MODEL_DISCOVERY)
    private readonly modelDiscovery: IModelDiscovery,
    @inject(SDK_TOKENS.SDK_AGENT_ADAPTER)
    private readonly sdkAdapter: SdkAgentAdapter,
    @inject(AUTH_PROVIDERS_TOKENS.SDK_AUTH_ENV)
    private readonly authEnv: AuthEnv,
    @inject(AUTH_PROVIDERS_TOKENS.SDK_OLLAMA_DISCOVERY)
    private readonly ollamaDiscovery: OllamaModelDiscoveryService,
    @inject(AUTH_PROVIDERS_TOKENS.SDK_COPILOT_AUTH)
    private readonly copilotAuthService: CopilotAuthService,
    @inject(AUTH_PROVIDERS_TOKENS.SDK_CODEX_AUTH)
    private readonly codexAuthService: CodexAuthService,
    @inject(AUTH_PROVIDERS_TOKENS.SDK_CODEX_ACCOUNT_USAGE)
    private readonly codexAccountUsage: ICodexAccountUsageService,
    @inject(TOKENS.SENTRY_SERVICE)
    private readonly sentryService: SentryService,
    @inject(SETTINGS_TOKENS.CUSTOM_PROVIDER_STORE)
    private readonly customProviders: CustomProviderStore,
    @inject(ConnectionCheckRecorder)
    private readonly connectionChecks: ConnectionCheckRecorder,
    @inject(PlanLimitsSnapshotService)
    private readonly planLimits: Pick<
      PlanLimitsSnapshotService,
      'snapshot' | 'ownerSnapshotForProvider'
    >,
    @inject(AUTH_PROVIDERS_TOKENS.SDK_LM_STUDIO_PROXY)
    private readonly lmStudioProxy: {
      listModels(): Promise<ProviderModelInfo[]>;
    },
    @inject(ClaudeAmbientLoginStatusReader)
    private readonly ambientLogin: Pick<ClaudeAmbientLoginStatusReader, 'read'>,
    @inject(AUTH_PROVIDERS_TOKENS.SDK_KIMI_CODE_AUTH, { isOptional: true })
    private readonly kimiAuth?: IKimiCodeAuthService,
    /**
     * The host's admitted runtimes. The Electron bootstrap registers the final
     * value before the RPC surface (and so this handler) is resolved; absent in
     * unit harnesses, which then admit no provider session.
     */
    @inject(SDK_TOKENS.RUNTIME_HOST_CAPABILITIES, { isOptional: true })
    private readonly hostCapabilities?: RuntimeHostCapabilities,
  ) {}

  /**
   * Register all provider RPC methods
   */
  register(): void {
    this.registerCopilotDynamicFetcher();
    this.registerCodexDynamicFetcher();
    this.registerKimiCodeDynamicFetcher();
    this.registerProviderSessionDynamicFetchers();
    this.registerAnthropicDirectFetcher();
    this.registerOllamaDynamicFetchers();
    this.registerListModels();
    this.registerSetModelTier();
    this.registerGetModelTiers();
    this.registerClearModelTier();
    this.registerCustomEntryMethods();
    this.registerAccountUsage();
    this.registerPlanLimits();

    this.logger.debug('Provider RPC handlers registered', {
      methods: ProviderRpcHandlers.METHODS,
    });
  }

  /**
   * provider:getAccountUsage — the selected provider's owner, read through
   * `PlanUsageService` (TASK_2026_596), in the existing result shape plus the
   * additive plan-limit fields.
   *
   * Codex keeps its legacy fields exactly: once the owner read has completed
   * (`available` or `stale`), the Codex account service's own result is
   * spread first. The reader just went through that service, so this second
   * call is answered from its cache and never starts another read.
   */
  private registerAccountUsage(): void {
    this.rpcHandler.registerMethod<
      ProviderGetAccountUsageParams,
      ProviderGetAccountUsageResult
    >('provider:getAccountUsage', async (params) => {
      const validated = ProviderGetAccountUsageSchema.parse(params);
      const { providerId } = validated;
      const ownerResult = await this.planLimits.ownerSnapshotForProvider(
        providerId,
        validated.refresh === true,
      );
      if (ownerResult.kind === 'unavailable') {
        return { status: 'service-unavailable', providerId };
      }
      if (ownerResult.kind === 'no-owner') {
        return { status: 'provider-unsupported', providerId };
      }
      const snapshot = ownerResult.snapshot;

      const planFields = {
        owner: snapshot.owner,
        windows: snapshot.windows,
        ownerEvidence: snapshot.ownerEvidence,
        windowSetEstablished: snapshot.windowSetEstablished,
        ...(snapshot.cooldown && { cooldown: snapshot.cooldown }),
      };
      if (
        providerId === CODEX_PROVIDER_ENTRY.id &&
        (snapshot.status === 'available' || snapshot.status === 'stale')
      ) {
        const legacy = await this.codexAccountUsage.getAccountUsage({
          refresh: false,
        });
        return { ...legacy, ...planFields };
      }
      return {
        status: snapshot.status,
        providerId,
        ...(snapshot.fetchedAt !== undefined && {
          fetchedAt: snapshot.fetchedAt,
        }),
        ...(snapshot.staleSince !== undefined && {
          staleSince: snapshot.staleSince,
        }),
        ...(snapshot.account && { account: snapshot.account }),
        ...(snapshot.activity && { activity: snapshot.activity }),
        ...planFields,
      };
    });
  }

  /**
   * provider:getPlanLimits — every in-scope owner's snapshot (TASK_2026_596).
   * Discovery names the owners; `read` owners are read in parallel under a
   * per-owner deadline, `known` owners pass through unread. Credentials are
   * resolved inside the backend and never serialized.
   */
  private registerPlanLimits(): void {
    this.rpcHandler.registerMethod<
      ProviderGetPlanLimitsParams,
      ProviderGetPlanLimitsResult
    >('provider:getPlanLimits', async (params) => {
      const validated = ProviderGetPlanLimitsSchema.parse(params ?? {});
      const request: PlanLimitsSnapshotRequest = validated;
      return this.planLimits.snapshot(request);
    });
  }

  /**
   * Register a dynamic fetcher for GitHub Copilot models.
   *
   * Live sources only, in order; the first non-empty answer wins:
   * 1. Host LM discovery (`getCopilotModels`), subscription-filtered.
   * 2. The Copilot account `/models` endpoint (`CopilotAuthService.listModels`).
   * 3. The Copilot CLI adapter (`listModels`).
   *
   * When none answers, the fetcher throws a `ModelListError`:
   * `not-signed-in` when the account source has no Copilot session, else the
   * classified reason of the last source that failed (`empty` when every
   * source answered with no models). `ProviderModelsService` turns that into a
   * persisted or unavailable list; nothing here substitutes a repository list.
   */
  private registerCopilotDynamicFetcher(): void {
    this.providerModels.registerDynamicFetcher('github-copilot', async () => {
      let lastFailure: ModelListFailureReason = 'empty';
      try {
        const platformModels = await this.modelDiscovery.getCopilotModels();
        if (platformModels.length > 0) {
          this.logger.info(
            `[ProviderRpc] Fetched ${platformModels.length} Copilot models from platform discovery`,
          );
          return platformModels.map((m) => ({
            id: m.id,
            name: this.formatCopilotModelName(m.id),
            description: '',
            contextLength: m.contextLength,
            ...(typeof m.contextLength === 'number' &&
            Number.isFinite(m.contextLength) &&
            m.contextLength > 0
              ? { contextLengthSource: 'provider' as const }
              : {}),
            supportsToolUse: true,
          }));
        }
      } catch (error) {
        // degradation-audit: reported - the classified reason is thrown below when no later source answers.
        lastFailure = classifyModelListFailure(error);
        this.logger.debug(
          `[ProviderRpc] Platform model discovery unavailable: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      try {
        const authModels = await this.copilotAuthService.listModels();
        if (authModels.length > 0) {
          this.logger.info(
            `[ProviderRpc] Fetched ${authModels.length} Copilot models from auth service API`,
          );
          return authModels;
        }
      } catch (error) {
        // degradation-audit: reported - the classified reason is thrown below when no later source answers.
        lastFailure = classifyModelListFailure(error);
        this.logger.debug(
          `[ProviderRpc] Copilot auth service model listing unavailable: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      try {
        const copilotAdapter = this.cliDetection.getAdapter('copilot');
        if (copilotAdapter?.listModels) {
          const cliModels = await copilotAdapter.listModels();
          if (cliModels.length > 0) {
            this.logger.info(
              `[ProviderRpc] Fetched ${cliModels.length} Copilot models from CLI SDK`,
            );
            return cliModels.map((m) => ({
              id: m.id,
              name: m.name || this.formatCopilotModelName(m.id),
              description: '',
              contextLength: 0,
              supportsToolUse: true,
            }));
          }
        }
      } catch (error) {
        // degradation-audit: reported - the classified reason is thrown below.
        lastFailure = classifyModelListFailure(error);
        this.logger.debug(
          `[ProviderRpc] Copilot CLI SDK unavailable: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      const signedIn = await this.readSignIn('Copilot', () =>
        this.copilotAuthService.isAuthenticated(),
      );
      const reason: ModelListFailureReason =
        signedIn === false ? 'not-signed-in' : lastFailure;
      this.logger.info('[ProviderRpc] No live Copilot model source answered', {
        reason,
      });
      throw new ModelListError(reason);
    });
  }

  /**
   * Register a dynamic fetcher for OpenAI Codex models.
   *
   * Dynamic sources only, in order:
   * 1. The selected Codex app-server's own `model/list` catalog, read through
   *    the CLI detector's codex adapter. Nothing filters the IDs: the selected
   *    Codex version decides what is visible, so a future model appears
   *    without a Ptah release.
   * 2. The account API (`CodexAuthService.listModels`), a separate dynamic
   *    source for when no app-server catalog is available.
   *
   * When neither source lists a model, the fetcher throws a `ModelListError`:
   * `not-signed-in` when the Codex account reports no login, else the
   * classified reason of the last source that failed. Only when every source
   * answered with no models is the result `[]` (reported as `empty`). There is
   * no static fallback: a hardcoded ID list would hide every model that
   * shipped after it.
   */
  private registerCodexDynamicFetcher(): void {
    this.providerModels.registerDynamicFetcher('openai-codex', async () => {
      let lastFailure: ModelListFailureReason | undefined;
      try {
        const adapter = this.cliDetection.getAdapter('codex');
        const catalog = adapter?.listModels
          ? await adapter.listModels()
          : undefined;
        if (catalog && catalog.length > 0) {
          this.logger.info(
            `[ProviderRpc] Fetched ${catalog.length} Codex models from the selected app-server catalog`,
          );
          return catalog.map((m) => ({
            id: m.id,
            name: m.name,
            description: '',
            contextLength: 0,
            supportsToolUse: true,
          }));
        }
      } catch (error) {
        // degradation-audit: reported - the classified reason is thrown below when the account API does not answer.
        lastFailure = classifyModelListFailure(error);
        this.logger.debug(
          `[ProviderRpc] Codex app-server model catalog unavailable: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      try {
        const authModels = await this.codexAuthService.listModels();
        if (authModels.length > 0) {
          this.logger.info(
            `[ProviderRpc] Fetched ${authModels.length} Codex models from auth service API`,
          );
          return authModels;
        }
      } catch (error) {
        // degradation-audit: reported - the classified reason is thrown below.
        lastFailure = classifyModelListFailure(error);
        this.logger.debug(
          `[ProviderRpc] Codex auth service model listing unavailable: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      const signedIn = await this.readSignIn('Codex', () =>
        this.codexAuthService.isAuthenticated(),
      );
      if (signedIn === false) {
        this.logger.info(
          '[ProviderRpc] Codex is not signed in; no live model list',
        );
        throw new ModelListError('not-signed-in');
      }
      if (lastFailure) {
        this.logger.info('[ProviderRpc] No live Codex model source answered', {
          reason: lastFailure,
        });
        throw new ModelListError(lastFailure);
      }
      this.logger.info('[ProviderRpc] Every Codex model source listed nothing');
      return [];
    });
  }

  /**
   * Model fetchers for each provider-session provider this host admits, so
   * the model picker works before a session exists. The catalog is the
   * CLI's own list (`listModels()` of the profile's lane adapter, the profile
   * id is its CLI type); never a repository list.
   *
   * - No adapter or no `listModels` -> `no-live-source`.
   * - No models and the adapter's sign-in check (`ensureTokensFresh`) says
   *   `false` -> `not-signed-in`, so no saved list of another account shows.
   * - A thrown `listModels` -> its classified reason.
   * - A clean empty answer -> `[]` (reported as `empty`).
   */
  private registerProviderSessionDynamicFetchers(): void {
    const admitted = this.hostCapabilities?.providerSessions ?? [];
    for (const providerId of PROVIDER_SESSION_PROVIDER_IDS) {
      const profile = getProviderSessionProfile(providerId);
      if (!profile || !admitted.includes(profile)) continue;
      this.providerModels.registerDynamicFetcher(providerId, async () => {
        const adapter = this.cliDetection.getAdapter(profile);
        if (!adapter?.listModels) throw new ModelListError('no-live-source');
        let catalog: Awaited<
          ReturnType<NonNullable<typeof adapter.listModels>>
        > = [];
        let failure: ModelListFailureReason | undefined;
        try {
          catalog = await adapter.listModels();
        } catch (error) {
          // degradation-audit: reported - rethrown below as a classified ModelListError unless sign-in decides first.
          failure = classifyModelListFailure(error);
          this.logger.debug(
            `[ProviderRpc] ${providerId} model catalog unavailable: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
        if (catalog.length > 0) {
          this.logger.debug(
            `[ProviderRpc] Fetched ${catalog.length} ${providerId} models from the CLI catalog`,
          );
          return catalog.map((m) => ({
            id: m.id,
            name: m.name,
            description: '',
            contextLength: 0,
            supportsToolUse: true,
          }));
        }
        const ensureTokensFresh = adapter.ensureTokensFresh?.bind(adapter);
        const signedIn = ensureTokensFresh
          ? await this.readSignIn(providerId, ensureTokensFresh)
          : undefined;
        if (signedIn === false) throw new ModelListError('not-signed-in');
        if (failure) throw new ModelListError(failure);
        return [];
      });
    }
  }

  /**
   * A provider's sign-in state for a model-list failure: `true`/`false` from
   * `check`, `undefined` when the check itself throws (the caller then keeps
   * the reason it already has).
   */
  private async readSignIn(
    label: string,
    check: () => Promise<boolean>,
  ): Promise<boolean | undefined> {
    try {
      return await check();
    } catch (error) {
      // degradation-audit: reported - an unreadable sign-in state leaves the classified fetch reason in place.
      this.logger.debug(`[ProviderRpc] ${label} sign-in state unreadable`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  /**
   * Live Kimi Code catalog (`/coding/v1/models`), parsed by
   * `parseKimiCodeModels`. Every failure throws a `ModelListError`, never a
   * list: `ProviderModelsService` caches and persists any non-empty answer as
   * a live catalog, so a failure reported as rows would poison both.
   *
   * - No auth service or no base URL -> `no-live-source`.
   * - No CLI login and no stored key -> `not-signed-in`.
   * - HTTP 401/403 -> `auth-rejected`; any other non-OK status -> `http-error`.
   * - A payload the parser cannot read (`null`) -> `bad-response`.
   * - A thrown fetch (timeout, network) -> its classified reason.
   */
  private registerKimiCodeDynamicFetcher(): void {
    this.providerModels.registerDynamicFetcher('kimi-code', async () => {
      if (!this.kimiAuth) throw new ModelListError('no-live-source');
      const baseUrl = getAnthropicProvider('kimi-code')?.baseUrl;
      if (!baseUrl) throw new ModelListError('no-live-source');
      let credential: Awaited<
        ReturnType<IKimiCodeAuthService['resolveRequestCredential']>
      >;
      try {
        credential = await this.kimiAuth.resolveRequestCredential();
      } catch (error) {
        if (error instanceof KimiCodeAuthUnavailableError) {
          throw new ModelListError('not-signed-in');
        }
        throw error;
      }
      const headers: Record<string, string> =
        credential.kind === 'oauth'
          ? {
              Authorization: `Bearer ${credential.accessToken}`,
              'x-api-key': credential.accessToken,
            }
          : { 'x-api-key': credential.apiKey };
      let response: Response;
      try {
        response = await fetch(`${baseUrl.replace(/\/+$/, '')}/v1/models`, {
          headers,
          signal: AbortSignal.timeout(10_000),
        });
      } catch (error) {
        // degradation-audit: reported - rethrown as a classified ModelListError; the raw message stays in the debug log.
        this.logger.debug('[ProviderRpc] Kimi Code model catalog unavailable', {
          error: error instanceof Error ? error.message : String(error),
        });
        throw new ModelListError(classifyModelListFailure(error));
      }
      if (!response.ok) {
        this.logger.debug('[ProviderRpc] Kimi Code model catalog unavailable', {
          status: response.status,
        });
        throw new ModelListError(
          response.status === 401 || response.status === 403
            ? 'auth-rejected'
            : 'http-error',
        );
      }
      const payload: unknown = await response.json().catch((error: unknown) => {
        // degradation-audit: reported - an unreadable body is reported as bad-response by the parse below.
        this.logger.debug('[ProviderRpc] Kimi Code model catalog is not JSON', {
          error: error instanceof Error ? error.message : String(error),
        });
        return undefined;
      });
      const models = parseKimiCodeModels(payload);
      if (models === null) {
        // The live row shape is not confirmed. Record the shape (never the
        // content) so that a wrong schema is visible in the log.
        this.logger.debug(
          '[ProviderRpc] Kimi Code model catalog has an unknown shape',
          {
            payloadType: Array.isArray(payload) ? 'array' : typeof payload,
            keys:
              payload !== null &&
              typeof payload === 'object' &&
              !Array.isArray(payload)
                ? Object.keys(payload).slice(0, 10)
                : [],
          },
        );
        throw new ModelListError('bad-response');
      }
      return models;
    });
  }

  /**
   * Register a dynamic model fetcher for direct Anthropic auth (oauth/apiKey/claudeCli).
   *
   * 'anthropic' is a virtual provider ID for direct Claude auth
   * users — it is NOT in the ANTHROPIC_PROVIDERS registry.
   *
   * Cascade:
   * 1. API key present → /v1/models API (returns specific model versions).
   *    Its failure is final: no SDK fall-through under the same key.
   * 2. No API key → SDK supportedModels() (CLI/OAuth), read under the native
   *    Claude login while a third-party provider owns the auth env (its proxy
   *    would answer with that provider's models). A signed-out native Claude
   *    login is reported as `not-signed-in`.
   *
   * Both paths populate contextLength from the pricing map as a selection
   * hint only. Neither supplies provider capacity evidence. No repository
   * list backs either path: a failure reaches `ProviderModelsService`, which
   * reports a persisted or unavailable list. The SDK reads are the live ones
   * (`getLive*`): the service saves what a fetcher returns as live, so a
   * catalog the SDK restored from its cross-boot store must not reach it.
   */
  private registerAnthropicDirectFetcher(): void {
    const fetcher = async (): Promise<ProviderModelInfo[]> => {
      // Only a key bound for api.anthropic.com may list Anthropic models. A
      // third-party provider that authenticates with ANTHROPIC_API_KEY (Kimi
      // Code) would otherwise send its key to its own host's /v1/models.
      const hasApiKey =
        !!this.authEnv.ANTHROPIC_API_KEY && isDirectAnthropic(this.authEnv);

      if (hasApiKey) {
        // The key is the identity: a refused key, an outage or a bad
        // payload is reported as such. Falling on to the SDK would answer
        // with its tier aliases under the same key, which the chain would
        // show and save as the live list.
        const read = await this.sdkAdapter.getLiveApiModels();
        if (!read.ok) {
          this.logger.warn(
            `[ProviderRpc] Anthropic /v1/models unavailable (${read.reason})`,
          );
          throw new ModelListError(read.reason);
        }
        this.logger.info(
          `[ProviderRpc] Fetched ${read.models.length} models from /v1/models (API key)`,
        );
        return read.models.map((m) => ({
          id: m.value,
          name: m.displayName,
          description: getModelPricingDescription(m.value),
          contextLength: getModelContextWindow(m.value),
          supportsToolUse: true,
        }));
      }

      // Direct Anthropic auth reads the active env (OAuth token or the host
      // login). Any other active provider routes the SDK through its own
      // proxy, so the direct list is read under the native Claude login.
      const direct = isDirectAnthropic(this.authEnv);
      const sdkModels = direct
        ? await this.sdkAdapter.getLiveSupportedModels()
        : await this.sdkAdapter.getLiveNativeClaudeModels();
      if (sdkModels.length === 0) {
        // The SDK bridge answers `[]` for every failure; Claude always lists
        // models, so `[]` is a failure, not an empty catalog. With no key or
        // token in the env the credential is the host's Claude login.
        const usesNativeLogin = !direct || !this.authEnv.ANTHROPIC_AUTH_TOKEN;
        throw new ModelListError(
          usesNativeLogin
            ? await this.nativeClaudeFailureReason()
            : 'unexpected',
        );
      }
      this.logger.info(
        `[ProviderRpc] Fetched ${sdkModels.length} models from SDK supportedModels()`,
      );
      return sdkModels.map((m) => ({
        id: m.value,
        name: m.displayName,
        description: m.description || getModelPricingDescription(m.value),
        contextLength: getModelContextWindow(m.value),
        supportsToolUse: true,
      }));
    };

    // The virtual 'anthropic' direct provider and the native 'claude-cli'
    // ptah-cli provider share the same auth path — both resolve models from the
    // host's Claude login via the SDK (no API key needed).
    this.providerModels.registerDynamicFetcher(
      ANTHROPIC_DIRECT_PROVIDER_ID,
      fetcher,
    );

    // 'claude-cli' is a `nativeAuth` provider: an agent running on it ALWAYS
    // spawns with an EMPTY auth env (see CLAUDE_CLI_PROVIDER_ENTRY /
    // PtahCliRegistry.buildAuthEnv), so it always talks to the host's real
    // Claude login. The fetcher above reads the PROCESS-GLOBAL AuthEnv — when a
    // third-party provider is active (Codex, Copilot, Kimi Code, …) its proxy
    // owns ANTHROPIC_BASE_URL and the SDK reports THAT catalog instead. Ask the
    // SDK under the native login so this list always matches what the agent
    // actually runs on, whatever the active provider happens to be.
    // The sign-in reader runs before any list is served, a cached one too, so
    // a native login signed out since the last fetch shows no list.
    const claudeCliSignedIn = async (): Promise<boolean | undefined> => {
      const status = await this.ambientLogin.read();
      return status.state === 'signed-out' ? false : undefined;
    };
    this.providerModels.registerDynamicFetcher(
      'claude-cli',
      async () => {
        const models = await this.sdkAdapter.getLiveNativeClaudeModels();
        if (models.length === 0) {
          // The SDK bridge answers `[]` for every failure (no CLI, a failed or
          // timed-out probe) and Claude always lists models, so `[]` is a
          // failure whose reason the bridge did not keep, not an empty catalog.
          throw new ModelListError(await this.nativeClaudeFailureReason());
        }
        this.logger.info(
          `[ProviderRpc] Fetched ${models.length} claude-cli models from the native Claude login`,
        );
        return models.map((m) => ({
          id: m.value,
          name: m.displayName,
          description: m.description || getModelPricingDescription(m.value),
          contextLength: getModelContextWindow(m.value),
          supportsToolUse: true,
        }));
      },
      { signedIn: claudeCliSignedIn },
    );
  }

  /**
   * Why the native Claude login listed no models, from `claude auth status`
   * (the reader `provider:listAccounts` uses). Signed out, or no Claude CLI
   * to sign in with, is a credential failure: the saved list may belong to
   * the previous login and is not shown. A status that could not be read
   * proves nothing about the login and stays `unexpected`.
   */
  private async nativeClaudeFailureReason(): Promise<ModelListFailureReason> {
    const status = await this.ambientLogin.read();
    this.logger.debug(
      '[ProviderRpc] claude-cli: native Claude login returned no models',
      { loginState: status.state },
    );
    if (status.state === 'signed-out') return 'not-signed-in';
    if (status.state === 'unknown' && status.reason === 'cli-missing') {
      return 'not-signed-in';
    }
    return 'unexpected';
  }

  /**
   * Register dynamic model fetchers for Ollama (local) and Ollama Cloud eagerly.
   *
   * Previously, these fetchers were only registered inside
   * `LocalNativeStrategy.configure()` — which runs AFTER the user selects Ollama
   * as the active provider. But the model dropdown is what the user uses to
   * make that selection, creating a chicken-and-egg where the dropdown was
   * always empty until the user had already configured Ollama.
   *
   * Registering at startup (same pattern as Copilot, Codex, Anthropic direct)
   * makes the dropdown populate as soon as the UI queries it, independent of
   * which provider is currently active. An unreachable daemon throws a
   * classified `ModelListError`; `ProviderModelsService` then reports the
   * persisted or unavailable list.
   */
  private registerOllamaDynamicFetchers(): void {
    this.providerModels.registerDynamicFetcher('ollama', () =>
      this.ollamaDiscovery.listLocalModels(),
    );
    this.providerModels.registerDynamicFetcher('ollama-cloud', () =>
      this.ollamaDiscovery.listCloudModels(),
    );
    // Same chicken-and-egg for LM Studio: its fetcher used to be registered
    // only once LM Studio was the active provider. Listing its models needs
    // only the configured endpoint, not the running translation proxy.
    this.providerModels.registerDynamicFetcher('lm-studio', () =>
      this.lmStudioProxy.listModels(),
    );
    this.logger.debug(
      '[ProviderRpc] Registered eager Ollama and LM Studio dynamic fetchers',
    );
  }

  /** Convert model ID slug to display name: "gpt-5.3-codex" → "GPT 5.3 Codex" */
  private formatCopilotModelName(id: string): string {
    return id
      .split('-')
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(' ');
  }

  /**
   * Resolve the provider ID from params or config
   */
  private resolveProviderId(providerId?: string): string {
    if (providerId) return providerId;
    return this.configManager.getWithDefault<string>(
      'anthropicProviderId',
      DEFAULT_PROVIDER_ID,
    );
  }

  /**
   * provider:listModels - The provider's model list, live or saved.
   *
   * `ProviderModelsService.fetchModels` owns the chain (live route, then the
   * persisted catalog) and never throws for a vendor failure: it returns a
   * typed `ProviderModelList`. This handler maps it onto the RPC result:
   * - `live` -> `{ models, totalCount, source }`
   * - `persisted` -> plus `failureReason`, `savedAt` and a fixed-copy `notice`
   * - `unavailable` -> `{ models: [], totalCount: 0, source, failureReason,
   *   error }` with fixed-copy `error`
   *
   * Only an unknown provider id (or an internal fault) throws; that reaches
   * the RPC boundary after a Sentry capture.
   *
   * 'anthropic' (virtual provider for direct OAuth/API key auth) is not in the
   * registry; its dynamic fetcher (registerAnthropicDirectFetcher) answers.
   */
  private registerListModels(): void {
    this.rpcHandler.registerMethod<
      ProviderListModelsParams,
      ProviderListModelsResult
    >('provider:listModels', async (params) => {
      const validated = ProviderListModelsSchema.parse(params);
      const providerId = this.resolveProviderId(validated.providerId);

      try {
        this.logger.debug('RPC: provider:listModels called', {
          providerId,
          toolUseOnly: validated.toolUseOnly,
        });
        const apiKey = await this.authSecretsService.getProviderKey(providerId);
        const result = await this.providerModels.fetchModels(
          providerId,
          apiKey ?? null,
          validated.toolUseOnly ?? false,
        );

        this.logger.info('RPC: provider:listModels completed', {
          providerId,
          count: result.models.length,
          totalCount: result.totalCount,
          source: result.source,
          failureReason: result.failureReason,
        });

        // Opening the picker warms both catalog caches, which is exactly what
        // the tier derivation reads — but nothing used to tell it so, and the
        // ambient tier env vars stayed unset until the next provider
        // activation (TASK_2026_262 residual hole 3). Guarded, synchronous and
        // total by contract; it decides nothing here and cannot throw into
        // this handler. `totalCount` rather than `models.length` because the
        // latter is already narrowed by `toolUseOnly`.
        if (result.totalCount > 0) {
          this.providerModels.reapplyTiersForWarmedCatalog(providerId);
        }

        return this.toListModelsResult(providerId, result);
      } catch (error) {
        this.logger.error(
          'RPC: provider:listModels failed',
          error instanceof Error ? error : new Error(String(error)),
        );
        this.sentryService.captureException(
          error instanceof Error ? error : new Error(String(error)),
          { errorSource: 'ProviderRpcHandlers.registerListModels' },
        );
        throw error;
      }
    });
  }

  /** Map the service's typed list onto the `provider:listModels` result. */
  private toListModelsResult(
    providerId: string,
    result: ProviderModelList,
  ): ProviderListModelsResult {
    const { models, totalCount, source, failureReason, savedAt } = result;
    if (source === 'live' || !failureReason) {
      return { models, totalCount, source };
    }
    const providerName = getPtahCliLaneProvider(providerId)?.name ?? providerId;
    if (source === 'persisted') {
      return {
        models,
        totalCount,
        source,
        failureReason,
        ...(savedAt !== undefined && {
          savedAt,
          notice: modelListNoticeText(failureReason, providerName, savedAt),
        }),
      };
    }
    return {
      models: [],
      totalCount: 0,
      source,
      failureReason,
      error: modelListErrorText(failureReason, providerName),
    };
  }

  /**
   * provider:setModelTier - Set model for a tier (Sonnet/Opus/Haiku)
   */
  private registerSetModelTier(): void {
    this.rpcHandler.registerMethod<
      ProviderSetModelTierParams,
      ProviderSetModelTierResult
    >('provider:setModelTier', async (params) => {
      try {
        const validated = ProviderSetModelTierSchema.parse(params);
        const providerId = this.resolveProviderId(validated.providerId);

        this.logger.debug('RPC: provider:setModelTier called', {
          providerId,
          tier: validated.tier,
          modelId: validated.modelId,
          scope: validated.scope,
        });

        await this.providerModels.setModelTier(
          providerId,
          validated.tier,
          validated.modelId,
          validated.scope,
        );
        this.sdkAdapter.clearModelCache();

        this.logger.info('RPC: provider:setModelTier completed', {
          providerId,
          tier: validated.tier,
          modelId: validated.modelId,
          scope: validated.scope,
        });

        return { success: true };
      } catch (error) {
        this.logger.error(
          'RPC: provider:setModelTier failed',
          error instanceof Error ? error : new Error(String(error)),
        );
        this.sentryService.captureException(
          error instanceof Error ? error : new Error(String(error)),
          { errorSource: 'ProviderRpcHandlers.registerSetModelTier' },
        );
        return {
          success: false,
          error: clientTierError(error, 'Could not save the model tier.'),
        };
      }
    });
  }

  /**
   * provider:getModelTiers - Get current tier mappings
   */
  private registerGetModelTiers(): void {
    this.rpcHandler.registerMethod<
      ProviderGetModelTiersParams,
      ProviderGetModelTiersResult
    >('provider:getModelTiers', async (params) => {
      try {
        const validated = ProviderGetModelTiersSchema.parse(params ?? {});
        const providerId = this.resolveProviderId(validated.providerId);

        this.logger.debug('RPC: provider:getModelTiers called', {
          providerId,
          scope: validated.scope,
        });

        const tiers = this.providerModels.getModelTiers(
          providerId,
          validated.scope,
        );

        this.logger.debug('RPC: provider:getModelTiers result', {
          providerId,
          scope: validated.scope,
          tiers,
        });

        return tiers;
      } catch (error) {
        this.logger.error(
          'RPC: provider:getModelTiers failed',
          error instanceof Error ? error : new Error(String(error)),
        );
        this.sentryService.captureException(
          error instanceof Error ? error : new Error(String(error)),
          { errorSource: 'ProviderRpcHandlers.registerGetModelTiers' },
        );
        throw error;
      }
    });
  }

  /**
   * provider:clearModelTier - Clear a tier override (reset to default)
   */
  private registerClearModelTier(): void {
    this.rpcHandler.registerMethod<
      ProviderClearModelTierParams,
      ProviderClearModelTierResult
    >('provider:clearModelTier', async (params) => {
      try {
        const validated = ProviderClearModelTierSchema.parse(params);
        const providerId = this.resolveProviderId(validated.providerId);

        this.logger.debug('RPC: provider:clearModelTier called', {
          providerId,
          tier: validated.tier,
          scope: validated.scope,
        });

        await this.providerModels.clearModelTier(
          providerId,
          validated.tier,
          validated.scope,
        );
        this.sdkAdapter.clearModelCache();

        this.logger.info('RPC: provider:clearModelTier completed', {
          providerId,
          tier: validated.tier,
          scope: validated.scope,
        });

        return { success: true };
      } catch (error) {
        this.logger.error(
          'RPC: provider:clearModelTier failed',
          error instanceof Error ? error : new Error(String(error)),
        );
        this.sentryService.captureException(
          error instanceof Error ? error : new Error(String(error)),
          { errorSource: 'ProviderRpcHandlers.registerClearModelTier' },
        );
        return {
          success: false,
          error: clientTierError(error, 'Could not reset the model tier.'),
        };
      }
    });
  }

  // -------------------------------------------------------------------------
  // User-defined provider entries (TASK_2026_236)
  //
  // All five methods live under the already-allowlisted `provider:` prefix, so
  // no `ALLOWED_METHOD_PREFIXES` change was needed — only the compile-time
  // `RpcMethodName` union and the METHODS tuple above.
  //
  // SECRET HANDLING: `apiKey` never reaches CustomProviderStore. It is routed
  // straight to AuthSecretsService (platform SecretStorage) so that
  // `provider.custom.entries` in ~/.ptah/settings.json stays non-secret
  // metadata that is safe to hand-edit, diff, and log.
  // -------------------------------------------------------------------------
  private registerCustomEntryMethods(): void {
    this.registerListCustomEntries();
    this.registerAddCustomEntry();
    this.registerUpdateCustomEntry();
    this.registerRemoveCustomEntry();
    this.registerTestCustomEntry();
  }

  /** provider:listCustomEntries — every user-defined entry, freshly read. */
  private registerListCustomEntries(): void {
    this.rpcHandler.registerMethod<
      ProviderListCustomEntriesParams,
      ProviderListCustomEntriesResult
    >('provider:listCustomEntries', async () => {
      const { entries, dropped } = this.customProviders.load();
      if (dropped.length > 0) {
        this.logger.warn(
          'RPC: provider:listCustomEntries dropped invalid entries',
          { dropped: dropped.map((entry) => entry.id) },
        );
      }
      return { entries: [...entries] };
    });
  }

  /** provider:addCustomEntry — create an entry, optionally storing its key. */
  private registerAddCustomEntry(): void {
    this.rpcHandler.registerMethod<
      ProviderAddCustomEntryParams,
      ProviderAddCustomEntryResult
    >('provider:addCustomEntry', async (params) => {
      const validated = ProviderAddCustomEntrySchema.parse(params);
      try {
        const entry = await this.customProviders.add(validated.entry);
        await this.storeProviderKey(entry.id, validated.apiKey);
        this.logger.info('RPC: provider:addCustomEntry completed', {
          providerId: entry.id,
          lane: entry.lane,
          hasApiKey: !!validated.apiKey,
        });
        return { entry };
      } catch (error: unknown) {
        throw this.describeCustomEntryFailure('addCustomEntry', error);
      }
    });
  }

  /**
   * provider:updateCustomEntry — patch an entry.
   *
   * A supplied `apiKey` REPLACES the stored key; omitting it leaves the
   * existing key untouched, so an edit to (say) the display name does not
   * silently wipe the credential.
   */
  private registerUpdateCustomEntry(): void {
    this.rpcHandler.registerMethod<
      ProviderUpdateCustomEntryParams,
      ProviderUpdateCustomEntryResult
    >('provider:updateCustomEntry', async (params) => {
      const validated = ProviderUpdateCustomEntrySchema.parse(params);
      try {
        const entry = await this.customProviders.update(
          validated.id,
          validated.changes,
        );
        await this.storeProviderKey(entry.id, validated.apiKey);
        this.logger.info('RPC: provider:updateCustomEntry completed', {
          providerId: entry.id,
          changedKeys: Object.keys(validated.changes),
          hasApiKey: !!validated.apiKey,
        });
        return { entry };
      } catch (error: unknown) {
        throw this.describeCustomEntryFailure('updateCustomEntry', error);
      } finally {
        // Also after a partial write: the old result may no longer apply.
        this.clearStaleCheck(validated);
      }
    });
  }

  /**
   * provider:removeCustomEntry — delete an entry AND its stored key.
   *
   * The secret is deleted even when the entry was already absent: a stale
   * `ptah.auth.provider.<id>` secret left behind after a partial delete would
   * otherwise be re-adopted by any future entry that reuses the id.
   *
   * Refused with `CONNECTION_IN_USE` (fixed text, nothing removed) while the
   * entry is the main agent's current connection (`anthropicProviderId`): the
   * webview checks this from its route snapshot, but that snapshot can be
   * stale and other RPC clients do not check at all.
   */
  private registerRemoveCustomEntry(): void {
    this.rpcHandler.registerMethod<
      ProviderRemoveCustomEntryParams,
      ProviderRemoveCustomEntryResult
    >('provider:removeCustomEntry', async (params) => {
      const validated = ProviderRemoveCustomEntrySchema.parse(params);
      if (this.resolveProviderId() === validated.id) {
        throw new RpcUserError(
          'This connection runs the main agent. Switch the main agent to another connection before removing it.',
          'CONNECTION_IN_USE',
        );
      }
      try {
        const removed = await this.customProviders.remove(validated.id);
        await this.authSecretsService.deleteProviderKey(validated.id);
        this.logger.info('RPC: provider:removeCustomEntry completed', {
          providerId: validated.id,
          removed,
        });
        return { removed };
      } catch (error: unknown) {
        throw this.describeCustomEntryFailure('removeCustomEntry', error);
      } finally {
        this.connectionChecks.clear(validated.id);
      }
    });
  }

  /**
   * provider:testCustomEntry — one REAL round-trip with a tool definition.
   *
   * Custom entries only. Built-in providers keep today's local-health
   * `auth:testConnection` behaviour; closing that latent gap is deliberately
   * out of scope (plan.md decision 1).
   */
  private registerTestCustomEntry(): void {
    this.rpcHandler.registerMethod<
      ProviderTestCustomEntryParams,
      ProviderTestCustomEntryResult
    >('provider:testCustomEntry', async (params) => {
      const validated = ProviderTestCustomEntrySchema.parse(params);
      const entry = this.customProviders.get(validated.id);
      if (!entry) {
        return {
          ok: false,
          message: `No custom provider entry with id '${validated.id}'. Save the entry before testing it.`,
        };
      }

      // Probes, records the entry's last check, and shapes the wire result.
      return testCustomEntryAndRecord(
        this.connectionChecks,
        this.logger,
        entry,
        () => this.authSecretsService.getProviderKey(entry.id),
      );
    });
  }

  /** An edit to the endpoint, lane, models or key makes the last check stale. */
  private clearStaleCheck(edit: {
    readonly id: string;
    readonly changes: object;
    readonly apiKey?: string;
  }): void {
    if (customEntryEditStalesCheck(edit.changes, edit.apiKey))
      this.connectionChecks.clear(edit.id);
  }

  /** Write (or clear) the SecretStorage key for a custom entry. */
  private async storeProviderKey(
    providerId: string,
    apiKey: string | undefined,
  ): Promise<void> {
    if (apiKey === undefined) return;
    // setProviderKey already deletes on an empty/whitespace value, so an
    // explicit '' from the form is a deliberate "forget my key".
    await this.authSecretsService.setProviderKey(providerId, apiKey);
  }

  /**
   * Turn a store failure into an error the user can act on.
   *
   * `CustomProviderStoreError` messages are ours and are written for humans, so
   * they pass through. Anything else is logged in full and reported as a
   * generic failure rather than leaking an internal message to the client.
   */
  private describeCustomEntryFailure(method: string, error: unknown): Error {
    if (error instanceof Error && error.name === 'CustomProviderStoreError') {
      return error;
    }
    const wrapped = error instanceof Error ? error : new Error(String(error));
    this.logger.error(`RPC: provider:${method} failed`, wrapped);
    this.sentryService.captureException(wrapped, {
      errorSource: `ProviderRpcHandlers.${method}`,
    });
    return new Error(
      `Could not ${method === 'removeCustomEntry' ? 'remove' : 'save'} the custom provider entry. See the Ptah output channel for details.`,
    );
  }
}
