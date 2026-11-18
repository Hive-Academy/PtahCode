import { completedTurnTelemetry, findModelPricing, type AgentBudgetPolicy, type AgentBudgetSettings, type AgentBudgetSnapshot } from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';
import type { SubagentRequestUsage } from './subagent-budget-monitor';
import { independentSafetyCause, unavailableUsageCause, type SubagentStopCause } from './subagent-stop-cause';

interface UsageState {
  initialContext?: number; warningRequestCount?: number;
  stopFired: boolean; stopInFlight: boolean; warnedAgentId?: string;
  policySnapshot: AgentBudgetSnapshot; startedAt: number; requestSequence: number;
  lastMessageId?: string; lastWeighted: number; lastRaw: number; weightedUsed: number;
  contextTokens: number; costUnavailableLogged: boolean; stopCause?: SubagentStopCause;
}
/** Repeated content blocks replace their request share, rather than accumulating it. */
export function countSubagentUsage(state: UsageState, message: Record<string, unknown> | undefined,
  usage: SubagentRequestUsage, settings: AgentBudgetSettings, policy: AgentBudgetPolicy,
  sessionId: string, taskId: string, logger: Pick<Logger, 'info' | 'warn'>): void {
    const messageId = message?.['id'];
    const sameRequest = typeof messageId === 'string' && messageId === state.lastMessageId;
    if (!sameRequest) state.requestSequence += 1;
    const model = message?.['model'];
    const modelId = typeof model === 'string' ? model : undefined;
    const telemetry = completedTurnTelemetry({
      turnId: `${sessionId}:${taskId}:${String(messageId ?? state.requestSequence)}`,
      modelId, source: 'sdk', uncachedInput: true,
      usage: {
        inputTokens: usage.inputTokens, outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens, cacheWriteTokens: usage.cacheWriteTokens,
        contextTokens: (usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens),
        costUsd: usage.providerCostUsd,
      },
    });
    const before = sameRequest ? {
      ...state.policySnapshot,
      weightedTokens: state.policySnapshot.weightedTokens - state.lastWeighted,
      rawTokens: state.policySnapshot.rawTokens - state.lastRaw,
      turnIds: state.policySnapshot.turnIds.slice(0, -1),
    } : state.policySnapshot;
    const transition = policy.evaluate(
      before, telemetry, Date.now() - state.startedAt,
      modelId ? findModelPricing(modelId) : null,
    );
    state.initialContext ??= usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
    if (transition.snapshot.warned) state.warningRequestCount ??= state.requestSequence;
    state.lastWeighted = transition.snapshot.weightedTokens - before.weightedTokens;
    state.lastRaw = transition.snapshot.rawTokens - before.rawTokens;
    const safetyCause = telemetry.status === 'unavailable' ? unavailableUsageCause()
      : independentSafetyCause(transition.snapshot, Date.now() - state.startedAt, settings);
    if ((!state.stopFired && !state.stopInFlight && !state.warnedAgentId) ||
      (safetyCause && (!state.stopCause || ['warning-notes-complete', 'warning-turn-ended', 'notes-timeout'].includes(state.stopCause.kind)))) state.stopCause = safetyCause;
    // A context-only ceiling enters the notes phase rather than immediately stopping it.
    state.policySnapshot = { ...transition.snapshot, stopped: !!safetyCause };
    state.weightedUsed = transition.snapshot.weightedTokens;
    state.lastMessageId = typeof messageId === 'string' ? messageId : undefined;
    state.contextTokens = (usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens);
    if (!sameRequest) {
      const costAuthority = transition.cost.status === 'reported' ? transition.cost.source : 'unavailable';
      logger.info('[SubagentBudgetMonitor] Accepted subagent turn', {
        sessionId: sessionId, taskId, model: modelId ?? 'unavailable',
        inputTokens: usage.inputTokens, outputTokens: usage.outputTokens,
        weightedTotal: transition.snapshot.weightedTokens,
        ratio: Math.max(transition.snapshot.rawTokens, transition.snapshot.weightedTokens) / settings.stopWeightedTokens,
        costAuthority,
      });
      if (costAuthority === 'unavailable' && !state.costUnavailableLogged) {
        state.costUnavailableLogged = true;
        logger.warn('[SubagentBudgetMonitor] Turn cost unavailable', { sessionId: sessionId, taskId, model: modelId ?? 'unavailable' });
      }
    }
}
