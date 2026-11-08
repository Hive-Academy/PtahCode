import {
  agentBudgetSettingsSchema,
  DEFAULT_AGENT_BUDGET_SETTINGS,
  findModelPricing,
  type AgentBudgetSettings,
  type ModelPricing,
} from '@ptah-extension/shared';
import { CodexChildBudgetTap, type CodexChildBudgetDecision } from './codex-child-budget-tap';
import type { CodexRuntimeLogger } from './codex-runtime-ports';
import type { CodexContext, CodexRuntimeEvent } from './codex-runtime.types';

export type CodexChildBudgetSettingKey = `agentBudget.${keyof AgentBudgetSettings}`;

/** Host port: the runtime reads the settings once for each opened context. */
export interface CodexChildBudgetPort {
  /** Raw host value of one `ptah.*` setting; the runtime validates it. */
  readonly readSetting: (key: CodexChildBudgetSettingKey, fallback: number) => unknown;
  /** Defaults to the shared pricing catalog. */
  readonly pricing?: (modelId: string) => ModelPricing | null;
}

export interface CodexChildBudgetObserver {
  /** Abort the subscription and release all tap state. Idempotent. */
  dispose(): void;
}

type ObserverLogger = Pick<CodexRuntimeLogger, 'warn'>;

/** Invalid host values fall back to the shared defaults as one complete set. */
export function readCodexChildBudgetSettings(
  port: Pick<CodexChildBudgetPort, 'readSetting'>,
  logger: ObserverLogger,
): AgentBudgetSettings {
  const read = (key: keyof AgentBudgetSettings): unknown =>
    port.readSetting(`agentBudget.${key}`, DEFAULT_AGENT_BUDGET_SETTINGS[key]);
  const parsed = agentBudgetSettingsSchema.safeParse({
    warnRatio: read('warnRatio'),
    stopWeightedTokens: read('stopWeightedTokens'),
    handoffContextTokens: read('handoffContextTokens'),
    maxDurationMin: read('maxDurationMin'),
  });
  if (parsed.success) return parsed.data;
  logger.warn('[Codex budget] Invalid agent budget settings; using defaults');
  return DEFAULT_AGENT_BUDGET_SETTINGS;
}

export function errorClass(error: unknown): string {
  return error instanceof Error ? error.constructor.name : typeof error;
}

/** Charge one child terminal; untracked threads and non-terminal events return undefined. */
export function settleCodexChildBudgetEvent(
  event: CodexRuntimeEvent,
  tap: CodexChildBudgetTap,
  logger: ObserverLogger,
  pricing: (modelId: string) => ModelPricing | null = findModelPricing,
): CodexChildBudgetDecision | undefined {
  tap.observe(event);
  if (event.type !== 'terminal') return undefined;
  const parentThreadId = tap.parentOf(event.threadId);
  if (!parentThreadId) return undefined;
  const modelId = event.evidence?.modelId ?? tap.modelIdFor(event.threadId, event.turnId);
  try {
    const decision = tap.completeChildTurn({
      parentThreadId,
      childThreadId: event.threadId,
      turnId: event.turnId,
      modelId,
      elapsedMs: tap.elapsedMs(event.threadId),
      pricing: modelId ? pricing(modelId) : null,
    });
    const { warning, stopReason, handoff, coverage } = decision.transition;
    if (warning || stopReason || handoff)
      logger.warn('[Codex budget] Child budget decision', {
        childThreadId: event.threadId,
        warning,
        handoff,
        coverage,
        ...(stopReason ? { stopReason } : {}),
      });
    return decision;
  } finally {
    tap.releaseChild(event.threadId);
  }
}

/**
 * Attach one internal subscription to a context. The charge never depends on
 * how many callers read `events()`, and the context object stays unchanged,
 * so runtime lookups keyed by the context keep working.
 */
export function observeCodexChildBudgets(
  context: Pick<CodexContext, 'events'>,
  port: CodexChildBudgetPort,
  logger: ObserverLogger,
  now: () => number = Date.now,
): CodexChildBudgetObserver {
  const tap = new CodexChildBudgetTap(readCodexChildBudgetSettings(port, logger), now);
  const controller = new AbortController();
  const pricing = port.pricing ?? findModelPricing;
  void (async () => {
    try {
      for await (const event of context.events(controller.signal)) {
        try {
          settleCodexChildBudgetEvent(event, tap, logger, pricing);
        } catch (error: unknown) {
          // degradation-audit: reported - one failed charge must not stop the stream or later charges
          logger.warn('[Codex budget] Child budget charge failed', {
            errorClass: errorClass(error),
          });
        }
      }
    } catch (error: unknown) {
      // degradation-audit: reported - the observer is advisory; the context owner sees the stream failure
      logger.warn('[Codex budget] Child budget observer stopped', {
        errorClass: errorClass(error),
      });
    } finally {
      tap.dispose();
    }
  })();
  return {
    dispose: () => {
      controller.abort();
      tap.dispose();
    },
  };
}
