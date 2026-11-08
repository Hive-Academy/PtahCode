import type { AgentBudgetStopReason, AgentMessageOutcome, AgentTurnTelemetry } from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';
import type { TrackedAgent } from './tracked-agent';
import { armLaneBudgetDeadline } from './lane-budget-deadline';
import type { SdkHandle } from './cli-adapters/cli-adapter.interface';

/** Queue-capable adapters receive the warning without a failed steer probe. */
export async function deliverLaneBudgetWarning(
  agentId: string,
  handle: Pick<SdkHandle, 'steer' | 'queueForNextTurn'> | undefined,
  send: (agentId: string, message: string, delivery: 'steer' | 'queue') => Promise<AgentMessageOutcome>,
): Promise<AgentMessageOutcome> {
  const message = 'Budget warning: finish your current work, report progress, and prepare a short handoff.';
  if (!handle?.steer && handle?.queueForNextTurn) {
    handle.queueForNextTurn(message);
    return { mode: 'queue-next-turn' };
  }
  const steered = await send(agentId, message, 'steer');
  if (steered.mode !== 'unsupported') return steered;
  if (handle?.queueForNextTurn) {
    handle.queueForNextTurn(message);
    return { mode: 'queue-next-turn' };
  }
  return send(agentId, message, 'queue');
}

export interface LaneBudgetDecision {
  warning: boolean;
  stopReason?: AgentBudgetStopReason;
  costUnavailable?: boolean;
}

/** Applies accounting and dispatches its once-only lane side effects. */
export class LaneBudgetTelemetry {
  constructor(
    private readonly logger: Logger,
    private readonly warn: (agentId: string) => Promise<AgentMessageOutcome>,
    private readonly stop: (agentId: string, reason: AgentBudgetStopReason) => void,
  ) {}

  armDeadline(agentId: string, tracked: TrackedAgent, isCurrent: () => boolean): void {
    armLaneBudgetDeadline(tracked, isCurrent, () => this.stop(agentId, 'duration'));
  }

  accept(agentId: string, tracked: TrackedAgent, telemetry: AgentTurnTelemetry): void {
    const budget = tracked.budget;
    if (!budget || tracked.info.status !== 'running') return;
    const duplicate = telemetry.status === 'reported' && budget.counters.turnIds.includes(telemetry.usage.turnId);
    const decision = budget.accept(telemetry);
    tracked.info = { ...tracked.info, agentBudget: budget.record() };
    if (telemetry.status === 'reported' && !duplicate) {
      const usage = telemetry.usage;
      this.logger.info('[LaneBudgetTelemetry] Accepted lane turn', {
        agentId, turnId: usage.turnId, model: usage.modelId,
        inputTokens: usage.inputTokens, outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens.status === 'reported' ? usage.cacheReadTokens.value : null,
        cacheWriteTokens: usage.cacheWriteTokens.status === 'reported' ? usage.cacheWriteTokens.value : null,
        weightedTotal: budget.counters.weightedTokens,
        ratio: Math.max(budget.counters.rawTokens, budget.counters.weightedTokens) /
          budget.settings.stopWeightedTokens,
        costAuthority: decision.costAuthority,
      });
    } else if (telemetry.status === 'unavailable') {
      this.logger.info('[LaneBudgetTelemetry] Lane turn telemetry unavailable', {
        agentId, turnId: telemetry.turnId, reason: telemetry.reason,
      });
    }
    this.dispatch(agentId, tracked, decision);
  }

  dispatch(agentId: string, tracked: TrackedAgent, decision: LaneBudgetDecision): void {
    if (tracked.info.status !== 'running') return;
    if (decision.costUnavailable && !tracked.budgetCostWarned) {
      tracked.budgetCostWarned = true;
      this.logger.warn('[LaneBudgetTelemetry] Lane turn cost unavailable', { agentId });
    }
    // A completed turn can cross both thresholds; the completion envelope carries the warning.
    if (decision.warning && !decision.stopReason) {
      void this.warn(agentId).then((outcome) => {
        if (outcome.mode === 'unsupported')
          this.logger.info('[LaneBudgetTelemetry] Budget warning unavailable; stop message will carry warning', { agentId, reason: outcome.reasonCode ?? outcome.detail });
        else this.logger.info('[LaneBudgetTelemetry] Budget warning delivered', { agentId, mode: outcome.mode });
      }).catch((error: unknown) => {
        this.logger.error('[LaneBudgetTelemetry] Budget warning failed', error instanceof Error ? error : new Error(String(error)));
      });
    }
    if (decision.stopReason) this.stop(agentId, decision.stopReason);
  }
}
