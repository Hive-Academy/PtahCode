import type { AgentBudgetStopReason } from '@ptah-extension/shared';
import type { TrackedAgent } from './tracked-agent';
import { previousResumeRecord } from './lane-restore';

/** Bind a transport's native ID and merge any resumed budget ledger. */
export function bindLaneSessionId(
  tracked: TrackedAgent,
  sessionId: string | undefined,
  agents: Iterable<TrackedAgent>,
): { warning: boolean; stopReason?: AgentBudgetStopReason } | undefined {
  if (!sessionId || sessionId === tracked.info.cliSessionId) return undefined;
  const prior = previousResumeRecord(agents, tracked.info.cli, sessionId)?.agentBudget;
  const decision = prior && tracked.budget ? tracked.budget.rebindRecord(prior) : undefined;
  const previous = tracked.info.cliSessionId;
  // Only a Codex bundled fallback abandons its first thread.
  const replaced = previous && tracked.info.cli === 'codex'
    ? [...new Set([...(tracked.info.replacesCliSessionIds ?? []), previous])]
    : tracked.info.replacesCliSessionIds;
  tracked.info = { ...tracked.info, cliSessionId: sessionId,
    ...(decision && tracked.budget ? { agentBudget: tracked.budget.record() } : {}),
    ...(replaced ? { replacesCliSessionIds: replaced } : {}) };
  return decision;
}
