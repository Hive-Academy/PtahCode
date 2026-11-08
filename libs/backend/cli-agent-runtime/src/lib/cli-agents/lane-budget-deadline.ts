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
      turnIds: previous.turnIds,
      elapsedMs: 0, warned: false, stopped: false,
    } : undefined,
    previous ? turnCountOf(previous) : undefined,
  );
}

export function armLaneBudgetDeadline(tracked: TrackedAgent, isCurrent: () => boolean, stop: () => void): void {
  if (!tracked.budget) return;
  clearTimeout(tracked.budgetTimer);
  const timer = setTimeout(() => {
    if (!isCurrent() || tracked.info.status !== 'running') return;
    if (tracked.budget?.remainingMs() === 0) stop();
    else armLaneBudgetDeadline(tracked, isCurrent, stop);
  }, Math.min(tracked.budget.remainingMs(), 2_147_483_647));
  timer.unref();
  tracked.budgetTimer = timer;
}
