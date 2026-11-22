import type { AgentBudgetRecord, AgentBudgetSettings } from '@ptah-extension/shared';
import { AgentBudgetCoordinator, turnCountOf } from './agent-budget-coordinator';
import type { TrackedAgent } from './tracked-agent';

export function createLaneBudget(settings: AgentBudgetSettings, startedAt: string, previous?: AgentBudgetRecord): AgentBudgetCoordinator {
  return new AgentBudgetCoordinator(
    settings,
    previous?.startedAtMs ?? Date.parse(startedAt),
    previous ? {
      weightedTokens: previous.weightedTokens,
      rawTokens: previous.rawTokens,
      ...(previous.largestTurnTokens === undefined ? {} : { largestTurnTokens: previous.largestTurnTokens }),
      ...(previous.unavailableTurns === undefined ? {} : { unavailableTurns: previous.unavailableTurns }),
      turnIds: previous.turnIds,
      elapsedMs: 0, warned: false, stopped: false,
    } : undefined,
    previous ? turnCountOf(previous) : undefined,
  );
}

/**
 * Arm one timer at the lane's next duration ask or pause point (measured from its original
 * start). When it fires for the current running lane, `onDeadline` re-assesses admission and
 * the timer re-arms for the following point. Re-arming clears the prior timer, so a settings
 * change can call it again. No timer is armed once the lane is past the pause point.
 */
export function armLaneBudgetDeadline(tracked: TrackedAgent, isCurrent: () => boolean, onDeadline: () => void): void {
  if (!tracked.budget) return;
  clearTimeout(tracked.budgetTimer);
  tracked.budgetTimer = undefined;
  const delay = tracked.budget.nextAdmissionDeadlineMs();
  if (delay === undefined) return;
  const timer = setTimeout(() => {
    tracked.budgetTimer = undefined;
    if (!isCurrent() || tracked.info.status !== 'running') return;
    onDeadline();
    armLaneBudgetDeadline(tracked, isCurrent, onDeadline);
  }, delay);
  timer.unref();
  tracked.budgetTimer = timer;
}
