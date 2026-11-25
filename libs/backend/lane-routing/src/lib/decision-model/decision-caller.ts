import { loggableErrorName } from '@ptah-extension/shared';

import type { LaneRoutingLogger } from '../lane-routing-logger';
import type {
  ModelDispatch,
  ModelRequestOutcome,
  SystemOneCaller,
} from '../pipeline/model-refine';
import { systemOneClientOptions } from '../pipeline/model-refine';
import type { OpenedCaller } from '../pipeline/phase-plan';
import { PrefillRateStore } from '../pipeline/prefill-rate.store';
import { DECISION_REQUEST_TIMEOUT_MS } from '../routing-constants';
import type { DecisionModelConfig } from './decision-model.config';
import { keyOf } from './decision-model.probe';
import type { DecisionModelKind } from './decision-model.types';
import type { StructuredDecisionCompleter } from './structured-decision.port';
import {
  SystemOneClient,
  type SystemOneClientOptions,
} from './system-one.client';

export interface DecisionCallerDependencies {
  readonly config: DecisionModelConfig;
  readonly logger: LaneRoutingLogger;
  readonly structured?: StructuredDecisionCompleter;
  readonly readPrefillTokensPerSecond?: () => unknown;
  readonly seams?: {
    readonly monotonicNow?: () => number;
    readonly systemOne?: (options: SystemOneClientOptions) => SystemOneCaller;
  };
}

/** Opens and dispatches one decision-model request for each routing caller. */
export class DecisionCaller {
  private readonly rates = new PrefillRateStore();

  constructor(private readonly deps: DecisionCallerDependencies) {}

  async openCaller(): Promise<OpenedCaller> {
    const selection = this.deps.config.getSelection();
    if (selection.kind === 'unset') return { kind: 'unset' };
    if (selection.kind === 'structured') {
      if (this.deps.structured === undefined) {
        this.deps.logger.warn(
          '[lane-routing] structured decision port is not registered',
          { providerId: selection.providerId },
        );
        return { kind: 'blocked', cause: 'provider-error' };
      }
      return {
        kind: 'structured',
        providerId: selection.providerId,
        model: selection.model,
      };
    }
    try {
      // Resolve the target from the same selection used for a live 404 re-check.
      const target = await this.deps.config.resolveSystemOneTarget(selection);
      if (target === null) return { kind: 'blocked', cause: 'unreachable' };
      if (selection.kind === 'jev' && target.apiKey === undefined) {
        return { kind: 'blocked', cause: 'auth' };
      }
      return {
        kind: 'system-one',
        selection,
        target,
        provider: systemOneProvider(selection.kind),
      };
    } catch (error: unknown) {
      this.deps.logger.warn(
        '[lane-routing] decision model target could not be resolved',
        { name: loggableErrorName(error) },
      );
      return { kind: 'blocked', cause: 'unreachable' };
    }
  }

  dispatchFor(
    caller: OpenedCaller,
    budget?: { readonly signal: AbortSignal; readonly remainingMs: () => number },
  ): ModelDispatch {
    if (caller.kind === 'structured') {
      const structured = this.deps.structured;
      if (structured === undefined) {
        throw new Error('structured decision port is not registered');
      }
      const cap = budget === undefined ? DECISION_REQUEST_TIMEOUT_MS : validBudgetMs(budget.remainingMs());
      const signal = cap === 0
        ? AbortSignal.abort()
        : AbortSignal.timeout(Math.floor(Math.min(cap, DECISION_REQUEST_TIMEOUT_MS)));
      return {
        kind: 'structured',
        completer: structured,
        providerId: caller.providerId,
        model: caller.model,
        signal: budget === undefined ? signal : AbortSignal.any([signal, budget.signal]),
      };
    }
    if (caller.kind !== 'system-one') {
      throw new Error('decision model dispatch requires a caller');
    }
    const defaults = systemOneClientOptions(caller.target);
    const factory =
      this.deps.seams?.systemOne ??
      ((next: SystemOneClientOptions) =>
        new SystemOneClient(next, {
          logger: budget === undefined ? this.deps.logger : {
            debug: (message, meta) => this.deps.logger.debug(message, meta),
            info: (message, meta) => this.deps.logger.info(message, meta),
            warn: (message, meta) => {
              // The transport only sees its own timer when classifying fetch aborts.
              if (budget.signal.aborted && meta?.['cause'] === 'unreachable') return;
              this.deps.logger.warn(message, meta);
            },
            error: (message, meta) => this.deps.logger.error(message, meta),
          },
          ...(budget === undefined ? {} : {
            fetch: (url, init) => fetch(url, {
              ...init,
              signal: init?.signal == null ? budget.signal : AbortSignal.any([init.signal, budget.signal]),
            }),
          }),
        }));
    return {
      kind: 'system-one',
      caller: budget === undefined ? factory(defaults) : {
        decide: (payload, timeoutCapMs) => factory({
          ...defaults,
          timeoutMs: Math.min(caller.target.timeoutMs, Math.floor(validBudgetMs(timeoutCapMs ?? budget.remainingMs()))),
          coldTimeoutMs: undefined,
        }).decide(payload),
      },
      model: caller.target.model,
      ...(defaults.keepAlive !== undefined ? { keepAlive: defaults.keepAlive } : {}),
      ...(budget === undefined ? {} : {
        admission: {
          ...budget,
          remainingMs: () => validBudgetMs(budget.remainingMs()),
          maxTimeoutMs: caller.target.timeoutMs,
          targetKey: keyOf(caller.selection, caller.target.baseUrl),
          rates: this.rates,
          configuredRate: this.configuredPrefillRate(),
          now: this.deps.seams?.monotonicNow ?? (() => performance.now()),
        },
      }),
    };
  }

  private configuredPrefillRate(): number | undefined {
    try {
      const value = this.deps.readPrefillTokensPerSecond?.();
      return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
    } catch (error: unknown) {
      this.deps.logger.warn('[lane-routing] decision model prefill setting could not be read', {
        name: loggableErrorName(error),
      });
      return undefined;
    }
  }

  /** Re-check live 404/405 results; only a failed probe can mark unsupported. */
  async noteLive(
    caller: OpenedCaller,
    outcome: ModelRequestOutcome,
  ): Promise<void> {
    if (caller.kind !== 'system-one' || !outcome.sent) return;
    if (outcome.notFoundDetail !== null) {
      await this.deps.config.recheckAfterLiveNotFound(
        { selection: caller.selection, baseUrl: caller.target.baseUrl },
        outcome.notFoundDetail,
      );
      return;
    }
    if (outcome.succeeded) this.deps.config.recordLiveSuccess();
  }
}

function validBudgetMs(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function systemOneProvider(
  kind: Exclude<DecisionModelKind, 'unset' | 'structured'>,
): 'ollama' | 'jev' {
  switch (kind) {
    case 'jev':
      return 'jev';
    case 'ollama':
    case 'ollama-cloud':
    case 'custom':
      return 'ollama';
  }
}
