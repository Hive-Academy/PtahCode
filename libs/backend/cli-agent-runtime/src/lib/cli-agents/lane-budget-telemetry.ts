import {
  formatAgentActionNotice,
  type AgentActionNotice,
  type AgentAdmissionAssessment,
  type AgentTurnTelemetry,
} from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';
import { clearLaneAdmission, type TrackedAgent } from './tracked-agent';
import { armLaneBudgetDeadline } from './lane-budget-deadline';
import type { SdkHandle } from './cli-adapters/cli-adapter.interface';

export type LaneBudgetWarningOutcome = { readonly mode: 'steer' | 'queue-next-turn' | 'held' };

/** Map a budget admission assessment to the Ptah budget monitor's notice, or none while running. */
export function laneBudgetNotice(assessment: AgentAdmissionAssessment): AgentActionNotice | undefined {
  if (assessment.phase === 'running' || !assessment.reason) return undefined;
  return {
    actor: 'ptah-budget',
    action: assessment.phase,
    reason: assessment.reason,
    nextStep: assessment.phase === 'paused' ? 'review-live-agent' : 'return-report',
    ...(assessment.measured === undefined ? {} : { measured: assessment.measured }),
    ...(assessment.limit === undefined ? {} : { limit: assessment.limit }),
    ...(assessment.unit === undefined ? {} : { unit: assessment.unit }),
  };
}

/** Read-only ask copy sent to a lane: a lane has no approved notes path. */
export function laneBudgetAskText(notice: AgentActionNotice): string {
  return formatAgentActionNotice(notice);
}

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
  message: string,
  attachToPending?: (message: string) => boolean,
): Promise<LaneBudgetWarningOutcome> {
  if (turnActive && handle?.steer) {
    try {
      await handle.steer(message);
      return { mode: 'steer' };
    } catch {
      // degradation-audit: reported - caller logs the held or attached outcome
    }
  }
  try {
    if (attachToPending?.(message)) {
      return { mode: 'queue-next-turn' };
    }
  } catch {
    // degradation-audit: reported - caller logs the held warning for parent delivery
  }
  return { mode: 'held' };
}

export interface LaneBudgetDecision {
  readonly admission: AgentAdmissionAssessment;
  readonly costUnavailable?: boolean;
}

/**
 * Release the budget monitor's notice after a running assessment. A telemetry notice stays
 * latched: one valid sample resets the miss counter, not the turns whose usage went unseen.
 * Returns true when no budget notice remains.
 */
export function releaseLaneBudgetNotice(tracked: TrackedAgent): boolean {
  if (tracked.laneAdmission?.budget?.reason === 'telemetry-unavailable') return false;
  clearLaneAdmission(tracked, 'budget');
  return true;
}

/**
 * Applies accounting and dispatches its once-only lane side effects. Nothing here ends a
 * lane: an ask crossing sends the read-only handoff ask once, and a pause crossing publishes
 * the notice, which stops new tool calls while the lane stays live for review.
 *
 * `publish` owns the notice state and its deduplication: it records and announces a notice
 * and returns false when that notice was already announced (or would downgrade a pause).
 * `ask` only delivers the ask text to the lane.
 */
export class LaneBudgetTelemetry {
  constructor(
    private readonly logger: Logger,
    private readonly publish: (agentId: string, notice: AgentActionNotice) => boolean,
    private readonly ask: (agentId: string, text: string) => Promise<LaneBudgetWarningOutcome>,
  ) {}

  armDeadline(agentId: string, tracked: TrackedAgent, isCurrent: () => boolean): void {
    armLaneBudgetDeadline(tracked, isCurrent, () => {
      const budget = tracked.budget;
      if (budget) this.dispatch(agentId, tracked, { admission: budget.admission() });
    });
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
    const notice = laneBudgetNotice(decision.admission);
    if (!notice) {
      // Counters only grow, so a running assessment follows a raised limit or a rebind:
      // release the budget monitor's notice so a later crossing is announced again.
      releaseLaneBudgetNotice(tracked);
      return;
    }
    if (notice.action === 'paused') {
      // A single sample can jump from below the ask point past the pause point: the lane
      // still gets its handoff ask, published before the pause.
      if (!tracked.laneAdmission?.budget)
        this.sendAsk(agentId, tracked, { ...notice, action: 'asked-handoff', nextStep: 'return-report' });
      if (!this.publish(agentId, notice)) return;
      this.logger.warn('[LaneBudgetTelemetry] Lane paused by budget monitor', {
        agentId, reason: notice.reason, measured: notice.measured, limit: notice.limit,
      });
      return;
    }
    this.sendAsk(agentId, tracked, notice);
  }

  private sendAsk(agentId: string, tracked: TrackedAgent, notice: AgentActionNotice): void {
    if (!this.publish(agentId, notice)) return;
    const text = laneBudgetAskText(notice);
    void this.ask(agentId, text).then((outcome) => {
      if (outcome.mode === 'held') tracked.heldBudgetWarning = text;
      this.logger.info(outcome.mode === 'held'
        ? '[LaneBudgetTelemetry] Budget handoff ask held'
        : '[LaneBudgetTelemetry] Budget handoff ask delivered', { agentId, mode: outcome.mode, reason: notice.reason });
    }).catch((error: unknown) => {
      this.logger.error('[LaneBudgetTelemetry] Budget handoff ask failed', error instanceof Error ? error : new Error(String(error)));
    });
  }
}
