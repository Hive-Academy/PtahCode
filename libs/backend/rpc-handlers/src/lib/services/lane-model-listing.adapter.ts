/**
 * `LaneModelListing` for every host that calls `registerSharedRpcHandlers`.
 *
 * System CLI rows come from `CliModelListService`. Ptah CLI rows come from
 * the saved config (no network) plus one shared provider discovery per
 * provider, raced against the row's signal.
 */

import { createHash } from 'node:crypto';
import { inject, injectable } from 'tsyringe';
import {
  CLI_AGENT_RUNTIME_TOKENS,
  PTAH_CLI_KEY_PREFIX,
} from '@ptah-extension/cli-agent-runtime';
import { AUTH_PROVIDERS_TOKENS } from '@ptah-extension/auth-providers';
import type {
  LaneModelEntry,
  LaneModelListing,
} from '@ptah-extension/lane-routing';
import {
  TOKENS,
  type IAuthSecretsService,
  type Logger,
} from '@ptah-extension/vscode-core';
import {
  type AgentModelEntry,
  type AgentModelProvider,
  type CliDetectionResult,
  type EffortSupport,
  type PtahCliConfig,
  type ProviderModelListSource,
  type SystemCliType,
} from '@ptah-extension/shared';
import { CliModelListService } from './cli-model-list.service';

interface DiscoveryModels {
  readonly kind: 'models';
  readonly models: readonly { readonly id: string }[];
  /** `fallback` for a persisted list, `reported` for a live one. */
  readonly provenance: 'reported' | 'fallback';
}

interface DiscoveryEmpty {
  readonly kind: 'empty';
  readonly reason: 'empty';
}

interface DiscoveryFailed {
  readonly kind: 'error';
  readonly reason: 'threw' | 'threw-unknown';
}

type DiscoveryOutcome = DiscoveryModels | DiscoveryEmpty | DiscoveryFailed;

interface ProviderModelFetch {
  fetchModels(
    providerId: string,
    apiKey: string | null,
    toolUseOnly?: boolean,
  ): Promise<{
    models: readonly { readonly id: string }[];
    totalCount: number;
    source: ProviderModelListSource;
  }>;
}

const CLASSIFIED_CLIS = ['codex', 'copilot', 'cursor', 'opencode'] as const;

type ClassifiedCli = (typeof CLASSIFIED_CLIS)[number];

function isClassifiedCli(cli: SystemCliType): cli is ClassifiedCli {
  return (CLASSIFIED_CLIS as readonly string[]).includes(cli);
}

function failureReason(error: unknown): 'threw' | 'threw-unknown' {
  if (error instanceof Error) return 'threw';
  return 'threw-unknown';
}

/**
 * Lists models for one lane. Registered as a singleton under
 * `LANE_ROUTING_TOKENS.LANE_MODEL_LISTING`.
 */
@injectable()
export class LaneModelListingAdapter implements LaneModelListing {
  /** In-flight discovery for one burst. Dropped when that promise settles. */
  private readonly discoveryInFlight = new Map<
    string,
    Promise<DiscoveryOutcome>
  >();

  constructor(
    @inject(TOKENS.LOGGER) private readonly logger: Pick<Logger, 'debug'>,
    @inject(CliModelListService)
    private readonly cliModels: Pick<
      CliModelListService,
      'listAll' | 'listForClassification' | 'effortSupport'
    >,
    @inject(CLI_AGENT_RUNTIME_TOKENS.SDK_PTAH_CLI_CONFIG_PERSISTENCE)
    private readonly ptahCliConfigs: {
      loadConfigs(): PtahCliConfig[];
    },
    @inject(AUTH_PROVIDERS_TOKENS.SDK_PROVIDER_MODELS)
    private readonly providerModels: ProviderModelFetch,
    @inject(TOKENS.AUTH_SECRETS_SERVICE)
    private readonly authSecrets: Pick<
      IAuthSecretsService,
      'getProviderKey' | 'getCredential'
    >,
  ) {}

  async list(
    row: CliDetectionResult,
    signal: AbortSignal,
  ): Promise<readonly LaneModelEntry[]> {
    if (row.cli === 'ptah-cli') {
      return this.listPtahCli(row, signal);
    }
    return this.listSystemCli(row.cli);
  }

  private async listSystemCli(cli: SystemCliType): Promise<LaneModelEntry[]> {
    const [listed, classified] = await Promise.all([
      this.cliModels.listAll(),
      this.cliModels.listForClassification(),
    ]);
    const seen = new Set<string>();
    const entries: LaneModelEntry[] = [];
    const push = (
      id: string,
      isFallback: boolean | undefined,
      efforts?: EffortSupport,
    ): void => {
      const trimmed = id.trim();
      if (trimmed.length === 0 || seen.has(trimmed)) return;
      seen.add(trimmed);
      entries.push({
        id: trimmed,
        provenance: isFallback === true ? 'fallback' : 'reported',
        efforts: efforts ?? this.cliModels.effortSupport(cli, trimmed),
      });
    };

    for (const option of listed[cli]) {
      const fromClassification = this.classifiedById(
        classified,
        cli,
        option.id,
      );
      push(
        option.id,
        fromClassification ? fromClassification.isFallback : option.isFallback,
        option.efforts,
      );
    }
    if (isClassifiedCli(cli)) {
      for (const entry of classified[cli]) {
        push(entry.id, entry.isFallback);
      }
    }
    return entries;
  }

  private classifiedById(
    classified: Record<AgentModelProvider, AgentModelEntry[]>,
    cli: SystemCliType,
    id: string,
  ): AgentModelEntry | undefined {
    if (!isClassifiedCli(cli)) return undefined;
    const want = id.trim();
    return classified[cli].find((entry) => entry.id.trim() === want);
  }

  private async listPtahCli(
    row: CliDetectionResult,
    signal: AbortSignal,
  ): Promise<readonly LaneModelEntry[]> {
    const configs = this.ptahCliConfigs.loadConfigs();
    const config = row.ptahCliId
      ? configs.find((item) => item.id === row.ptahCliId)
      : undefined;
    const base = this.entriesFromConfig(config);
    const providerId = config?.providerId ?? row.providerId;
    if (!providerId) return base;
    if (signal.aborted) {
      this.logMiss(row.ptahCliId, providerId, 'aborted');
      return base;
    }

    try {
      const outcome = await this.awaitWithSignal(
        this.discoveryFor(providerId, config),
        signal,
      );
      if (outcome.kind === 'empty' || outcome.kind === 'error') {
        this.logMiss(row.ptahCliId, providerId, outcome.reason);
        return base;
      }
      return this.mergeDiscovery(base, outcome.models, outcome.provenance);
    } catch (error: unknown) {
      // degradation-audit: optional-capability - the row deadline or a
      // discovery failure leaves the saved configured and tier entries.
      this.logMiss(
        row.ptahCliId,
        providerId,
        signal.aborted ? 'aborted' : failureReason(error),
      );
      return base;
    }
  }

  private entriesFromConfig(config: PtahCliConfig | undefined): LaneModelEntry[] {
    if (!config) return [];
    const entries: LaneModelEntry[] = [];
    const seen = new Set<string>();
    const push = (
      id: string | undefined,
      provenance: LaneModelEntry['provenance'],
    ): void => {
      if (typeof id !== 'string') return;
      const trimmed = id.trim();
      if (trimmed.length === 0 || seen.has(trimmed)) return;
      seen.add(trimmed);
      entries.push({
        id: trimmed,
        provenance,
        efforts: { provenance: 'unknown' },
      });
    };
    push(config.selectedModel, 'configured');
    const tiers = config.tierMappings;
    if (tiers) {
      push(tiers.sonnet, 'tier');
      push(tiers.opus, 'tier');
      push(tiers.haiku, 'tier');
    }
    return entries;
  }

  private mergeDiscovery(
    base: readonly LaneModelEntry[],
    models: readonly { readonly id: string }[],
    provenance: DiscoveryModels['provenance'],
  ): LaneModelEntry[] {
    const entries = base.map((entry) => ({ ...entry }));
    const seen = new Set(entries.map((entry) => entry.id));
    for (const model of models) {
      const id = model.id.trim();
      if (id.length === 0 || seen.has(id)) continue;
      seen.add(id);
      entries.push({ id, provenance, efforts: { provenance: 'unknown' } });
    }
    return entries;
  }

  /**
   * The key this lane sends, resolved the way `ptahCli:listModels` resolves
   * it: the shared connection key for an `anthropic-api` instance set to use
   * it, else the instance's own `ptahCli.<id>` slot. A row without a saved
   * config falls back to the provider's slot.
   */
  private async laneKey(
    providerId: string,
    config: PtahCliConfig | undefined,
  ): Promise<string | null> {
    const key = !config
      ? await this.authSecrets.getProviderKey(providerId)
      : config.providerId === 'anthropic-api' &&
          config.credentialSource === 'shared-connection'
        ? await this.authSecrets.getCredential('apiKey')
        : await this.authSecrets.getProviderKey(
            `${PTAH_CLI_KEY_PREFIX}.${config.id}`,
          );
    return key?.trim() ? key : null;
  }

  private async discoveryFor(
    providerId: string,
    config: PtahCliConfig | undefined,
  ): Promise<DiscoveryOutcome> {
    let apiKey: string | null;
    try {
      apiKey = await this.laneKey(providerId, config);
    } catch (error: unknown) {
      // degradation-audit: optional-capability - an unreadable secret store leaves the saved configured and tier entries; the raw error is not logged.
      return { kind: 'error', reason: failureReason(error) };
    }
    return this.sharedDiscovery(providerId, apiKey);
  }

  /**
   * One discovery promise per provider and key until it settles. Each row
   * races its own signal against that shared promise, so one abort does not
   * cancel another row on the same provider. Rows with different keys never
   * share one: each key may see a different catalog.
   */
  private sharedDiscovery(
    providerId: string,
    apiKey: string | null,
  ): Promise<DiscoveryOutcome> {
    const credential = apiKey
      ? createHash('sha256').update(apiKey).digest('hex').slice(0, 16)
      : '';
    const slot = `${providerId}:${credential}`;
    const existing = this.discoveryInFlight.get(slot);
    if (existing) return existing;
    const pending = this.runDiscovery(providerId, apiKey);
    this.discoveryInFlight.set(slot, pending);
    const release = (): void => {
      if (this.discoveryInFlight.get(slot) === pending) {
        this.discoveryInFlight.delete(slot);
      }
    };
    void pending.then(release, release);
    return pending;
  }

  /**
   * One `fetchModels` call. The service owns the chain and never throws for a
   * vendor failure: `unavailable` becomes an `error` outcome, a `persisted`
   * list keeps its rows as `fallback`, a `live` list as `reported`.
   */
  private async runDiscovery(
    providerId: string,
    apiKey: string | null,
  ): Promise<DiscoveryOutcome> {
    try {
      const result = await this.providerModels.fetchModels(
        providerId,
        apiKey,
        false,
      );
      if (result.source === 'unavailable') {
        return { kind: 'error', reason: 'threw' };
      }
      const models = result.models.filter(
        (model) => model.id.trim().length > 0,
      );
      if (models.length === 0) return { kind: 'empty', reason: 'empty' };
      return {
        kind: 'models',
        models,
        provenance: result.source === 'persisted' ? 'fallback' : 'reported',
      };
    } catch (error: unknown) {
      // degradation-audit: optional-capability - provider discovery can fail
      // or hang; the row keeps configured and tier entries. The raw error is
      // not logged because a provider client can echo the request.
      return { kind: 'error', reason: failureReason(error) };
    }
  }

  private awaitWithSignal<T>(
    work: Promise<T>,
    signal: AbortSignal,
  ): Promise<T> {
    if (signal.aborted) return Promise.reject(this.abortError(signal));
    return new Promise<T>((resolve, reject) => {
      const onAbort = (): void => {
        reject(this.abortError(signal));
      };
      signal.addEventListener('abort', onAbort, { once: true });
      work.then(
        (value) => {
          signal.removeEventListener('abort', onAbort);
          if (signal.aborted) {
            reject(this.abortError(signal));
            return;
          }
          resolve(value);
        },
        (error: unknown) => {
          signal.removeEventListener('abort', onAbort);
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      );
    });
  }

  private abortError(signal: AbortSignal): Error {
    const reason: unknown = signal.reason;
    if (reason instanceof Error) return reason;
    if (typeof reason === 'string' && reason.length > 0) {
      return new Error(reason);
    }
    return new Error('aborted');
  }

  private logMiss(
    ptahCliId: string | undefined,
    providerId: string,
    reason: string,
  ): void {
    this.logger.debug('[LaneModelListing] discovery unavailable', {
      ptahCliId,
      providerId,
      reason,
    });
  }
}
