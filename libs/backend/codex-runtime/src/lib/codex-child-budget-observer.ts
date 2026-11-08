import {
  agentBudgetSettingsSchema,
  DEFAULT_AGENT_BUDGET_SETTINGS,
  findModelPricing,
  type AgentBudgetSettings,
  type ModelPricing,
} from '@ptah-extension/shared';
import { CodexChildBudgetTap, CODEX_CHILD_BUDGET_MAX_ENTRIES,
  type CodexChildBudgetDecision } from './codex-child-budget-tap';
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
const CHILD_USAGE_DRAIN_MS = 2_000;

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
  if (tap.isCompleted(event.threadId, event.turnId)) return undefined;
  const modelId = event.evidence?.modelId ?? tap.modelIdFor(event.threadId, event.turnId);
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
      ...(decision.telemetry.status === 'reported' ? {
        ...(decision.telemetry.usage.requestContextTokens.status === 'reported' ? {
          contextTokens: decision.telemetry.usage.requestContextTokens.value,
        } : {}),
        inputTokens: decision.telemetry.usage.inputTokens,
        outputTokens: decision.telemetry.usage.outputTokens,
        modelId: decision.telemetry.usage.modelId,
      } : { reason: decision.telemetry.reason }),
      ...(stopReason ? { stopReason } : {}),
    });
  return decision;
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
  const draining = new Map<string, { event: CodexRuntimeEvent; timer: ReturnType<typeof setTimeout> }>();
  const keyOf = (event: CodexRuntimeEvent): string => `${event.threadId}\u0000${event.turnId}`;
  const settle = (event: CodexRuntimeEvent): void => {
    try {
      settleCodexChildBudgetEvent(event, tap, logger, pricing);
    } catch (error: unknown) {
      // degradation-audit: reported - one failed charge must not stop later charges
      logger.warn('[Codex budget] Child budget charge failed', {
        errorClass: errorClass(error),
      });
    }
  };
  void (async () => {
    try {
      for await (const event of context.events(controller.signal)) {
        if (event.type === 'terminal' && tap.parentOf(event.threadId) &&
          !tap.hasAcceptedUsage(event.threadId, event.turnId)) {
          const key = keyOf(event);
          if (!draining.has(key)) {
            if (draining.size >= CODEX_CHILD_BUDGET_MAX_ENTRIES) {
              const oldestKey = draining.keys().next().value;
              const oldest = oldestKey === undefined ? undefined : draining.get(oldestKey);
              if (oldestKey && oldest) {
                clearTimeout(oldest.timer);
                draining.delete(oldestKey);
                settle(oldest.event);
              }
            }
            const timer = setTimeout(() => {
              draining.delete(key);
              settle(event);
            }, CHILD_USAGE_DRAIN_MS);
            draining.set(key, { event, timer });
          }
          continue;
        }
        settle(event);
        if (event.type === 'usage' && event.evidence?.accepted) {
          const key = keyOf(event);
          const waiting = draining.get(key);
          if (waiting) {
            clearTimeout(waiting.timer);
            draining.delete(key);
            settle(waiting.event);
          }
        }
      }
    } catch (error: unknown) {
      // degradation-audit: reported - the observer is advisory; the context owner sees the stream failure
      logger.warn('[Codex budget] Child budget observer stopped', {
        errorClass: errorClass(error),
      });
    } finally {
      for (const { timer } of draining.values()) clearTimeout(timer);
      draining.clear();
      tap.dispose();
    }
  })();
  return {
    dispose: () => {
      controller.abort();
      for (const { timer } of draining.values()) clearTimeout(timer);
      draining.clear();
      tap.dispose();
    },
  };
}
