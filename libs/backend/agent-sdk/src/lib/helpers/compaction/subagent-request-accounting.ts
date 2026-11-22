import { completedTurnTelemetry, findModelPricing, type AgentBudgetPolicy, type AgentBudgetSettings, type AgentBudgetSnapshot } from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';
import type { SubagentRequestUsage } from './subagent-budget-monitor';

interface UsageState {
  initialContext?: number; warningRequestCount?: number;
  policySnapshot: AgentBudgetSnapshot; startedAt: number;
  requestOrder: Map<string, number>; lastResolvedRequest: number;
  lastMessageId?: string; lastWeighted: number; lastRaw: number; weightedUsed: number;
  contextTokens: number; costUnavailableLogged: boolean;
}
export function trackSubagentRequest(state: Pick<UsageState, 'requestOrder'>, invocationId: string, messageId: unknown): string {
  const turnId = typeof messageId === 'string'
    ? `${invocationId}:message:${messageId}`
    : `${invocationId}:sequence:${state.requestOrder.size + 1}`;
  if (!state.requestOrder.has(turnId)) state.requestOrder.set(turnId, state.requestOrder.size + 1);
  return turnId;
}

/**
 * Repeated content blocks of one assistant request replace that request's share (the final
 * sample wins), rather than accumulating it. Usage that cannot be read is not accounted here:
 * the monitor registers missing-telemetry requests in the same first-seen order. Nothing here
 * decides to stop a subagent; admission reads the snapshot.
 */
export function countSubagentUsage(state: UsageState, message: Record<string, unknown> | undefined,
  usage: SubagentRequestUsage, settings: AgentBudgetSettings, policy: AgentBudgetPolicy,
  invocationId: string, sessionId: string, taskId: string, logger: Pick<Logger, 'info' | 'warn'>): void {
    const messageId = message?.['id'];
    const turnId = trackSubagentRequest(state, invocationId, messageId);
    // Only the newest sample may be replaced. Replays of earlier requests leave
    // the current context and totals untouched.
    const sameRequest = state.policySnapshot.turnIds.at(-1) === turnId;
    if (!sameRequest && state.policySnapshot.turnIds.includes(turnId)) return;
    const model = message?.['model'];
    const modelId = typeof model === 'string' ? model : undefined;
    const telemetry = completedTurnTelemetry({
      turnId,
      modelId, source: 'sdk', uncachedInput: true,
      usage: {
        inputTokens: usage.inputTokens, outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens, cacheWriteTokens: usage.cacheWriteTokens,
        contextTokens: (usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens),
        costUsd: usage.providerCostUsd,
      },
    });
    if (telemetry.status === 'unavailable') return;
    // Only the latest resolved position ends the trailing missing-usage streak.
    const position = state.requestOrder.get(turnId);
    if (position !== undefined) state.lastResolvedRequest = Math.max(state.lastResolvedRequest, position);
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
    if (transition.snapshot.warned) state.warningRequestCount ??= state.requestOrder.size;
    state.lastWeighted = transition.snapshot.weightedTokens - before.weightedTokens;
    state.lastRaw = transition.snapshot.rawTokens - before.rawTokens;
    // The shared `stopped` bit is never set: the monitor does not stop agents, and a latched bit
    // would silence the policy's one-time warning.
    state.policySnapshot = { ...transition.snapshot, stopped: false };
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
