import { Logger } from '@ptah-extension/vscode-core';
import type { AgentTurnTelemetry } from '@ptah-extension/shared';
import { AgentBudgetCoordinator } from './agent-budget-coordinator';
import { LaneBudgetTelemetry } from './lane-budget-telemetry';
import type { TrackedAgent } from './tracked-agent';

const missing = { status: 'unavailable', reason: 'absent', source: 'stream' } as const;
const turn: AgentTurnTelemetry = { status: 'reported', usage: {
  turnId: 'one', modelId: 'unpriced-test-model', scope: 'turn', source: 'stream',
  inputTokens: 80, outputTokens: 0, cacheReadTokens: missing,
  cacheWriteTokens: missing, requestContextTokens: missing,
  providerCostUsd: missing, cacheSemantics: 'unknown',
} };

it('dispatches warning, cost warning once, then stop', async () => {
  const warn = jest.fn().mockResolvedValue({ mode: 'steer' });
  const stop = jest.fn();
  const logger = Object.assign(Object.create(Logger.prototype) as Logger, {
    warn: jest.fn(), info: jest.fn(), error: jest.fn(),
  });
  const telemetry = new LaneBudgetTelemetry(logger, warn, stop);
  const tracked = { budget: new AgentBudgetCoordinator({ warnRatio: 0.8,
    stopWeightedTokens: 100, handoffContextTokens: 50, maxDurationMin: 2 }, Date.now()),
    info: { status: 'running' } } as TrackedAgent;
  telemetry.accept('lane', tracked, turn);
  await Promise.resolve();
  expect(warn).toHaveBeenCalledTimes(1);
  expect(logger.warn).toHaveBeenCalledTimes(1);
  telemetry.accept('lane', tracked, { ...turn, usage: { ...turn.usage, turnId: 'two' } });
  expect(stop).toHaveBeenCalledWith('lane', 'budget');
  expect(logger.warn).toHaveBeenCalledTimes(1);
});
