import { AgentBudgetCoordinator } from './agent-budget-coordinator';
import { bindLaneSessionId } from './lane-session-binding';
import type { TrackedAgent } from './tracked-agent';

it('merges a late native ID and preserves the replaced Codex thread', () => {
  const now = Date.now();
  const previous = Object.assign(Object.create(null) as TrackedAgent, { info: { cli: 'codex', cliSessionId: 'native',
    startedAt: new Date(now - 1000).toISOString(),
    agentBudget: { weightedTokens: 90, rawTokens: 90, turnIds: ['old'],
      startedAtMs: now - 1000 } } });
  const tracked = { info: { cli: 'codex', cliSessionId: 'fallback',
    startedAt: new Date(now).toISOString(), status: 'running' },
    budget: new AgentBudgetCoordinator({ warnRatio: 0.8, stopWeightedTokens: 100,
      handoffContextTokens: 50, maxDurationMin: 2 }, now) } as TrackedAgent;
  const decision = bindLaneSessionId(tracked, 'native', [previous, tracked]);
  expect(decision).toEqual({ warning: true });
  expect(tracked.info.replacesCliSessionIds).toEqual(['fallback']);
  expect(tracked.info.agentBudget?.rawTokens).toBe(90);
});
