import type { AgentBudgetRecord, AgentBudgetSettings, AgentMessageOutcome, AgentTurnTelemetry, AgentProcessInfo, CliType } from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';
import { AgentBudgetCoordinator } from './agent-budget-coordinator';
import type { TrackedAgent } from './tracked-agent';

export function laneRecordsForSession(agents: Iterable<TrackedAgent>, cliSessionId: string): TrackedAgent[] {
  return Array.from(agents)
    .filter((tracked) => tracked.info.cliSessionId === cliSessionId)
    .sort((a, b) => a.info.startedAt.localeCompare(b.info.startedAt));
}

export function previousResumeRecord(agents: Iterable<TrackedAgent>, cli: CliType, cliSessionId: string | undefined): AgentProcessInfo | undefined {
  if (!cliSessionId) return undefined;
  let latest: AgentProcessInfo | undefined;
  for (const tracked of agents) {
    const info = tracked.info;
    if (info.cli !== cli || info.cliSessionId !== cliSessionId) continue;
    if (!latest || info.startedAt >= latest.startedAt) latest = info;
  }
  return latest;
}

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
    previous?.turnCount ?? previous?.turnIds.length,
  );
}

export function armLaneBudgetDeadline(tracked: {
  budget?: AgentBudgetCoordinator;
  budgetTimer?: NodeJS.Timeout;
  info: { status: AgentProcessInfo['status'] };
}, isCurrent: () => boolean, stop: () => void): void {
  if (!tracked.budget) return;
  clearTimeout(tracked.budgetTimer);
  const timer = setTimeout(() => {
    if (isCurrent() && tracked.info.status === 'running') stop();
  }, tracked.budget.remainingMs());
  timer.unref();
  tracked.budgetTimer = timer;
}

export function acceptLaneTurnTelemetry(input: {
  tracked: TrackedAgent;
  telemetry: AgentTurnTelemetry;
  agentId: string;
  logger: Logger;
  warn: () => Promise<AgentMessageOutcome>;
  stop: (reason: NonNullable<ReturnType<AgentBudgetCoordinator['accept']>['stopReason']>) => void;
}): void {
  const { tracked, telemetry, agentId, logger } = input;
  const budget = tracked.budget;
  if (!budget || tracked.info.status !== 'running') return;
  const result = budget.accept(telemetry);
  tracked.info = { ...tracked.info, agentBudget: budget.record() };
  if (result.costUnavailable && !tracked.budgetCostWarned) {
    tracked.budgetCostWarned = true;
    logger.warn('[AgentProcessManager] Lane turn cost unavailable', { agentId });
  }
  if (result.warning) {
    void input.warn().then((outcome) => {
      logger.info('[AgentProcessManager] Budget warning delivered', { agentId, mode: outcome.mode });
    }).catch((error: unknown) => {
      logger.error('[AgentProcessManager] Budget warning failed', error instanceof Error ? error : new Error(String(error)));
    });
  }
  if (result.stopReason) input.stop(result.stopReason);
}
