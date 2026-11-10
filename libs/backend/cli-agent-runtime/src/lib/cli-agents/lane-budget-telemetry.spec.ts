import { Logger } from '@ptah-extension/vscode-core';
import type { AgentTurnTelemetry } from '@ptah-extension/shared';
import { AgentBudgetCoordinator } from './agent-budget-coordinator';
import { deliverLaneBudgetWarning, LaneBudgetTelemetry, takeHeldBudgetWarning } from './lane-budget-telemetry';
import type { TrackedAgent } from './tracked-agent';

const missing = { status: 'unavailable', reason: 'absent', source: 'stream' } as const;
const turn: AgentTurnTelemetry = { status: 'reported', usage: {
  turnId: 'one', modelId: 'unpriced-test-model', scope: 'turn', source: 'stream',
  inputTokens: 80, outputTokens: 0, cacheReadTokens: missing,
  cacheWriteTokens: missing, requestContextTokens: missing,
  providerCostUsd: missing, cacheSemantics: 'unknown',
} };

it('holds a completed lane warning without starting another turn', async () => {
  const queueForNextTurn = jest.fn();
  const steer = jest.fn();
  const attach = jest.fn().mockReturnValue(true);
  const outcome = await deliverLaneBudgetWarning('lane', { steer, queueForNextTurn }, false);
  expect(outcome).toEqual({ mode: 'held' });
  expect(steer).not.toHaveBeenCalled();
  expect(queueForNextTurn).not.toHaveBeenCalled();
  expect(attach).not.toHaveBeenCalled();
});

it('attaches to an already pending message without sending another message', async () => {
  const attach = jest.fn().mockReturnValue(true);
  const outcome = await deliverLaneBudgetWarning('lane', undefined, false, attach);
  expect(attach).toHaveBeenCalledWith(expect.stringContaining('Budget warning'));
  expect(outcome).toEqual({ mode: 'queue-next-turn' });
});

it('steers a running turn', async () => {
  const steer = jest.fn().mockResolvedValue(undefined);
  const attach = jest.fn().mockReturnValue(true);
  const outcome = await deliverLaneBudgetWarning('lane', { steer }, true, attach);
  expect(outcome).toEqual({ mode: 'steer' });
  expect(attach).not.toHaveBeenCalled();
});

it('holds after a rejected steer when no next turn is pending', async () => {
  const steer = jest.fn().mockRejectedValue(new Error('closed turn'));
  const outcome = await deliverLaneBudgetWarning('lane', { steer }, true);
  expect(steer).toHaveBeenCalledTimes(1);
  expect(outcome).toEqual({ mode: 'held' });
});

it('attaches to a pending Codex turn through its next-turn mailbox', async () => {
  const queueForNextTurn = jest.fn();
  const attach = jest.fn().mockImplementation((message: string) => {
    queueForNextTurn(message);
    return true;
  });
  const outcome = await deliverLaneBudgetWarning('lane', { queueForNextTurn }, false, attach);
  expect(outcome).toEqual({ mode: 'queue-next-turn' });
  expect(queueForNextTurn).toHaveBeenCalledWith(expect.stringContaining('Budget warning'));
  expect(attach).toHaveBeenCalledTimes(1);
});

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
  expect(stop).not.toHaveBeenCalled();
  telemetry.accept('lane', tracked, { ...turn, usage: { ...turn.usage, turnId: 'three' } });
  expect(stop).toHaveBeenCalledWith('lane', 'budget');
  expect(logger.warn).toHaveBeenCalledTimes(1);
});

it('logs a held warning once', async () => {
  const warn = jest.fn().mockResolvedValue({ mode: 'held' });
  const logger = Object.assign(Object.create(Logger.prototype) as Logger, {
    warn: jest.fn(), info: jest.fn(), error: jest.fn(),
  });
  const telemetry = new LaneBudgetTelemetry(logger, warn, jest.fn());
  const tracked = { info: { status: 'running' } } as TrackedAgent;
  telemetry.dispatch('lane', tracked, { warning: true });
  await Promise.resolve();
  expect(logger.info).toHaveBeenCalledTimes(1);
  expect(logger.info).toHaveBeenCalledWith('[LaneBudgetTelemetry] Budget warning held', {
    agentId: 'lane', mode: 'held',
  });
  expect(tracked.heldBudgetWarning).toContain('Budget warning');
});

it('prepends a held warning to one later parent message', () => {
  const tracked = { heldBudgetWarning: 'Budget warning: finish work.' } as TrackedAgent;
  expect(takeHeldBudgetWarning(tracked, 'First message'))
    .toBe('Budget warning: finish work.\n\nFirst message');
  expect(takeHeldBudgetWarning(tracked, 'Second message')).toBe('Second message');
  expect(tracked.heldBudgetWarning).toBeUndefined();
});

it('does not hold a warning that was steered into the live turn', async () => {
  const logger = Object.assign(Object.create(Logger.prototype) as Logger, {
    warn: jest.fn(), info: jest.fn(), error: jest.fn(),
  });
  const tracked = { info: { status: 'running' } } as TrackedAgent;
  new LaneBudgetTelemetry(logger, jest.fn().mockResolvedValue({ mode: 'steer' }), jest.fn())
    .dispatch('lane', tracked, { warning: true });
  await Promise.resolve();
  expect(tracked.heldBudgetWarning).toBeUndefined();
});

it('delivers a warning before stopping on the next accounted turn', () => {
  const warn = jest.fn().mockResolvedValue({ mode: 'queue-next-turn' });
  const stop = jest.fn();
  const logger = Object.assign(Object.create(Logger.prototype) as Logger, {
    warn: jest.fn(), info: jest.fn(), error: jest.fn(),
  });
  const telemetry = new LaneBudgetTelemetry(logger, warn, stop);
  const tracked = { budget: new AgentBudgetCoordinator({ warnRatio: 0.8,
    stopWeightedTokens: 80, handoffContextTokens: 50, maxDurationMin: 2 }, Date.now()),
    info: { status: 'running' } } as TrackedAgent;
  telemetry.accept('lane', tracked, turn);
  expect(warn).toHaveBeenCalledTimes(1);
  expect(stop).not.toHaveBeenCalled();
  expect(logger.info).toHaveBeenCalledWith('[LaneBudgetTelemetry] Accepted lane turn', expect.objectContaining({
    agentId: 'lane', turnId: 'one', model: 'unpriced-test-model', inputTokens: 80,
    outputTokens: 0, weightedTotal: 80, ratio: 1, costAuthority: 'unavailable',
  }));
  telemetry.accept('lane', tracked, turn);
  expect(stop).not.toHaveBeenCalled();
  telemetry.accept('lane', tracked, { ...turn, usage: { ...turn.usage, turnId: 'two' } });
  expect(stop).toHaveBeenCalledWith('lane', 'budget');
});
