import type { AgentBudgetStopReason, AgentTurnTelemetry } from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';
import type { TrackedAgent } from './tracked-agent';
import { armLaneBudgetDeadline } from './lane-budget-deadline';
import type { SdkHandle } from './cli-adapters/cli-adapter.interface';

export const LANE_BUDGET_WARNING = 'Budget warning: finish your current work, report progress, and prepare a short handoff.';
type LaneBudgetWarningOutcome = { readonly mode: 'steer' | 'queue-next-turn' | 'held' };

/** Claim the warning before routing, so concurrent sends cannot both attach it. */
export function takeHeldBudgetWarning(tracked: TrackedAgent, message: string): string {
  const warning = tracked.heldBudgetWarning;
  if (!warning) return message;
  tracked.heldBudgetWarning = undefined;
  return `${warning}\n\n${message}`;
}

/** Attach a warning only to work that already has a turn scheduled. */
export async function deliverLaneBudgetWarning(
  _agentId: string,
  handle: Pick<SdkHandle, 'steer' | 'queueForNextTurn'> | undefined,
  turnActive: boolean,
  attachToPending?: (message: string) => boolean,
): Promise<LaneBudgetWarningOutcome> {
  if (turnActive && handle?.steer) {
    try {
      await handle.steer(LANE_BUDGET_WARNING);
      return { mode: 'steer' };
    } catch {
      // degradation-audit: reported - caller logs the held or attached outcome
    }
  }
  try {
    if (attachToPending?.(LANE_BUDGET_WARNING)) {
      return { mode: 'queue-next-turn' };
    }
  } catch {
    // degradation-audit: reported - caller logs the held warning for parent delivery
  }
  return { mode: 'held' };
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
    private readonly warn: (agentId: string) => Promise<LaneBudgetWarningOutcome>,
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
        ratio: budget.counters.weightedTokens /
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
    // A first token-limit crossing warns; the next accounted turn stops the lane.
    if (decision.warning && !decision.stopReason) {
      void this.warn(agentId).then((outcome) => {
        if (outcome.mode === 'held') tracked.heldBudgetWarning = LANE_BUDGET_WARNING;
        this.logger.info(outcome.mode === 'held'
          ? '[LaneBudgetTelemetry] Budget warning held'
          : '[LaneBudgetTelemetry] Budget warning delivered', { agentId, mode: outcome.mode });
      }).catch((error: unknown) => {
        this.logger.error('[LaneBudgetTelemetry] Budget warning failed', error instanceof Error ? error : new Error(String(error)));
      });
    }
    if (decision.stopReason) this.stop(agentId, decision.stopReason);
  }
}
