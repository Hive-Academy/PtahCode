import type { AgentBudgetStopReason, AgentMessageOutcome, AgentTurnTelemetry } from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';
import type { TrackedAgent } from './tracked-agent';
import { armLaneBudgetDeadline } from './lane-budget-deadline';

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
    const decision = budget.accept(telemetry);
    tracked.info = { ...tracked.info, agentBudget: budget.record() };
    this.dispatch(agentId, tracked, decision);
  }

  dispatch(agentId: string, tracked: TrackedAgent, decision: LaneBudgetDecision): void {
    if (tracked.info.status !== 'running') return;
    if (decision.costUnavailable && !tracked.budgetCostWarned) {
      tracked.budgetCostWarned = true;
      this.logger.warn('[LaneBudgetTelemetry] Lane turn cost unavailable', { agentId });
    }
    if (decision.warning) {
      void this.warn(agentId).then((outcome) => {
        this.logger.info('[LaneBudgetTelemetry] Budget warning delivered', { agentId, mode: outcome.mode });
      }).catch((error: unknown) => {
        this.logger.error('[LaneBudgetTelemetry] Budget warning failed', error instanceof Error ? error : new Error(String(error)));
      });
    }
    if (decision.stopReason) this.stop(agentId, decision.stopReason);
  }
}
