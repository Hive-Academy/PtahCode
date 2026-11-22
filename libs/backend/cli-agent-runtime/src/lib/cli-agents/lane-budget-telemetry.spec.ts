import { Logger } from '@ptah-extension/vscode-core';
import type { AgentActionNotice, AgentTurnTelemetry } from '@ptah-extension/shared';
import { AgentBudgetCoordinator } from './agent-budget-coordinator';
import {
  deliverLaneBudgetWarning,
  laneBudgetNotice,
  LaneBudgetTelemetry,
  takeHeldBudgetWarning,
  type LaneBudgetWarningOutcome,
} from './lane-budget-telemetry';
import { announceLaneNotice, type TrackedAgent } from './tracked-agent';

const missing = { status: 'unavailable', reason: 'absent', source: 'stream' } as const;
const turn: AgentTurnTelemetry = { status: 'reported', usage: {
  turnId: 'one', modelId: 'unpriced-test-model', scope: 'turn', source: 'stream',
  inputTokens: 80, outputTokens: 0, cacheReadTokens: missing,
  cacheWriteTokens: missing, requestContextTokens: missing,
  providerCostUsd: missing, cacheSemantics: 'unknown',
} };
const withTurnId = (turnId: string): AgentTurnTelemetry =>
  ({ ...turn, usage: { ...(turn as Extract<AgentTurnTelemetry, { status: 'reported' }>).usage, turnId } });
const ASK = 'Read-only ask.';

function makeLogger(): Logger {
  return Object.assign(Object.create(Logger.prototype) as Logger, {
    warn: jest.fn(), info: jest.fn(), error: jest.fn(),
  });
}

function makeTracked(stopWeightedTokens = 100): TrackedAgent {
  return { budget: new AgentBudgetCoordinator({ warnRatio: 0.8,
    stopWeightedTokens, handoffContextTokens: 50, maxDurationMin: 2 }, Date.now()),
    info: { status: 'running' } } as TrackedAgent;
}

describe('deliverLaneBudgetWarning', () => {
  it('holds a completed lane warning without starting another turn', async () => {
    const queueForNextTurn = jest.fn();
    const steer = jest.fn();
    const outcome = await deliverLaneBudgetWarning('lane', { steer, queueForNextTurn }, false, ASK);
    expect(outcome).toEqual({ mode: 'held' });
    expect(steer).not.toHaveBeenCalled();
    expect(queueForNextTurn).not.toHaveBeenCalled();
  });

  it('attaches the given message to an already pending message', async () => {
    const attach = jest.fn().mockReturnValue(true);
    const outcome = await deliverLaneBudgetWarning('lane', undefined, false, ASK, attach);
    expect(attach).toHaveBeenCalledWith(ASK);
    expect(outcome).toEqual({ mode: 'queue-next-turn' });
  });

  it('steers a running turn with the given message', async () => {
    const steer = jest.fn().mockResolvedValue(undefined);
    const attach = jest.fn().mockReturnValue(true);
    const outcome = await deliverLaneBudgetWarning('lane', { steer }, true, ASK, attach);
    expect(steer).toHaveBeenCalledWith(ASK);
    expect(outcome).toEqual({ mode: 'steer' });
    expect(attach).not.toHaveBeenCalled();
  });

  it('holds after a rejected steer when no next turn is pending', async () => {
    const steer = jest.fn().mockRejectedValue(new Error('closed turn'));
    const outcome = await deliverLaneBudgetWarning('lane', { steer }, true, ASK);
    expect(steer).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ mode: 'held' });
  });

  it('holds when attaching throws', async () => {
    const attach = jest.fn(() => { throw new Error('mailbox closed'); });
    expect(await deliverLaneBudgetWarning('lane', undefined, false, ASK, attach)).toEqual({ mode: 'held' });
  });
});

describe('laneBudgetNotice', () => {
  it('maps ask and pause assessments to Ptah budget notices', () => {
    expect(laneBudgetNotice({ phase: 'running' })).toBeUndefined();
    expect(laneBudgetNotice({ phase: 'asked-handoff', reason: 'weighted-budget', measured: 80, limit: 100, unit: 'tokens' }))
      .toEqual({ actor: 'ptah-budget', action: 'asked-handoff', reason: 'weighted-budget',
        nextStep: 'return-report', measured: 80, limit: 100, unit: 'tokens' });
    expect(laneBudgetNotice({ phase: 'paused', reason: 'duration' }))
      .toEqual({ actor: 'ptah-budget', action: 'paused', reason: 'duration', nextStep: 'review-live-agent' });
  });
});

/** Publish as the manager does: it owns the notice state and its deduplication. */
function harness(tracked: TrackedAgent, outcome: Promise<LaneBudgetWarningOutcome> | (() => Promise<LaneBudgetWarningOutcome>) = Promise.resolve({ mode: 'steer' })) {
  const announced: AgentActionNotice[] = [];
  const publish = jest.fn((_agentId: string, notice: AgentActionNotice) => {
    const fresh = announceLaneNotice(tracked, 'budget', notice);
    if (fresh) announced.push(notice);
    return fresh;
  });
  const ask = jest.fn(typeof outcome === 'function' ? outcome : () => outcome);
  const logger = makeLogger();
  return { announced, publish, ask, logger, telemetry: new LaneBudgetTelemetry(logger, publish, ask) };
}
const actions = (notices: AgentActionNotice[]) => notices.map((n) => `${n.action}:${n.reason}`);

describe('LaneBudgetTelemetry', () => {
  it('asks once at the ask point, then pauses once past twice the limit', async () => {
    const tracked = makeTracked();
    const { announced, ask, logger, telemetry } = harness(tracked);
    telemetry.accept('lane', tracked, turn);
    await Promise.resolve();
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask).toHaveBeenCalledWith('lane', expect.stringContaining('Ptah budget monitor'));
    expect(tracked.info.actionNotice).toMatchObject({ actor: 'ptah-budget', action: 'asked-handoff' });
    expect(logger.info).toHaveBeenCalledWith('[LaneBudgetTelemetry] Accepted lane turn', expect.objectContaining({
      agentId: 'lane', turnId: 'one', model: 'unpriced-test-model', inputTokens: 80,
      outputTokens: 0, weightedTotal: 80, ratio: 0.8, costAuthority: 'unavailable',
    }));
    telemetry.accept('lane', tracked, withTurnId('two'));
    expect(ask).toHaveBeenCalledTimes(1);
    expect(actions(announced)).toEqual(['asked-handoff:weighted-budget']);
    telemetry.accept('lane', tracked, withTurnId('three'));
    expect(announced[1]).toEqual(expect.objectContaining({
      actor: 'ptah-budget', action: 'paused', reason: 'weighted-budget', nextStep: 'review-live-agent',
    }));
    expect(tracked.info.actionNotice).toMatchObject({ action: 'paused' });
    telemetry.accept('lane', tracked, withTurnId('four'));
    expect(actions(announced)).toEqual(['asked-handoff:weighted-budget', 'paused:weighted-budget']);
    expect(ask).toHaveBeenCalledTimes(1);
    expect((logger.warn as jest.Mock).mock.calls.filter(([m]) => m === '[LaneBudgetTelemetry] Lane turn cost unavailable'))
      .toHaveLength(1);
  });

  it('asks before it pauses when one turn jumps from below the ask point past twice the limit', async () => {
    const tracked = makeTracked(30);
    const { announced, ask, telemetry } = harness(tracked);
    telemetry.accept('lane', tracked, turn);
    await Promise.resolve();
    expect(actions(announced)).toEqual(['asked-handoff:weighted-budget', 'paused:weighted-budget']);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask).toHaveBeenCalledWith('lane', expect.stringMatching(/^Ptah budget monitor asked for a handoff/));
    expect(tracked.info.actionNotice).toMatchObject({ action: 'paused', reason: 'weighted-budget' });
  });

  it('keeps a telemetry pause latched when a valid sample follows the missing ones', () => {
    const tracked = makeTracked(1_000_000);
    const { announced, telemetry } = harness(tracked);
    for (const id of ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'])
      telemetry.accept('lane', tracked, { status: 'unavailable', turnId: id, reason: 'absent', source: 'stream' } as AgentTurnTelemetry);
    expect(tracked.laneAdmission?.budget).toMatchObject({ reason: 'telemetry-unavailable', action: 'paused' });
    const before = announced.length;
    telemetry.accept('lane', tracked, withTurnId('valid'));
    expect(tracked.laneAdmission?.budget).toMatchObject({ reason: 'telemetry-unavailable', action: 'paused' });
    expect(tracked.info.actionNotice).toMatchObject({ reason: 'telemetry-unavailable' });
    expect(announced).toHaveLength(before);
  });

  it('asks at exactly the limit without pausing', () => {
    const tracked = makeTracked(80);
    const { announced, ask, telemetry } = harness(tracked, Promise.resolve({ mode: 'queue-next-turn' }));
    telemetry.accept('lane', tracked, turn);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(actions(announced)).toEqual(['asked-handoff:weighted-budget']);
  });

  it('sends nothing when the publisher reports the notice as already announced', () => {
    const ask = jest.fn();
    const telemetry = new LaneBudgetTelemetry(makeLogger(), jest.fn().mockReturnValue(false), ask);
    telemetry.dispatch('lane', { info: { status: 'running' } } as TrackedAgent,
      { admission: { phase: 'asked-handoff', reason: 'duration' } });
    expect(ask).not.toHaveBeenCalled();
  });

  it('holds the read-only ask text when it cannot be delivered', async () => {
    const tracked = { info: { status: 'running' } } as TrackedAgent;
    const { logger, telemetry } = harness(tracked, Promise.resolve({ mode: 'held' }));
    telemetry.dispatch('lane', tracked, { admission: { phase: 'asked-handoff', reason: 'weighted-budget', measured: 80, limit: 100, unit: 'tokens' } });
    await Promise.resolve();
    await Promise.resolve();
    expect(tracked.heldBudgetWarning).toMatch(/^Ptah budget monitor asked for a handoff/);
    expect(logger.info).toHaveBeenCalledWith('[LaneBudgetTelemetry] Budget handoff ask held', expect.objectContaining({ mode: 'held' }));
    expect(takeHeldBudgetWarning(tracked, 'Next message')).toMatch(/^Ptah budget monitor asked for a handoff[\s\S]*\n\nNext message$/);
    expect(takeHeldBudgetWarning(tracked, 'Second message')).toBe('Second message');
    expect(tracked.heldBudgetWarning).toBeUndefined();
  });

  it('does not hold an ask that was steered into the live turn', async () => {
    const tracked = { info: { status: 'running' } } as TrackedAgent;
    harness(tracked).telemetry.dispatch('lane', tracked, { admission: { phase: 'asked-handoff', reason: 'duration' } });
    await Promise.resolve();
    expect(tracked.heldBudgetWarning).toBeUndefined();
  });

  it('logs a failed ask as an error', async () => {
    const tracked = { info: { status: 'running' } } as TrackedAgent;
    const { logger, telemetry } = harness(tracked, () => Promise.reject(new Error('send failed')));
    telemetry.dispatch('lane', tracked, { admission: { phase: 'asked-handoff', reason: 'duration' } });
    await new Promise((resolve) => setImmediate(resolve));
    expect(logger.error).toHaveBeenCalledWith('[LaneBudgetTelemetry] Budget handoff ask failed', expect.any(Error));
  });

  it('ignores lanes that are not running and clears the notice when admission returns to running', () => {
    const stopped = { info: { status: 'completed' } } as TrackedAgent;
    const idle = harness(stopped);
    idle.telemetry.dispatch('lane', stopped, { admission: { phase: 'paused', reason: 'duration' } });
    expect(idle.publish).not.toHaveBeenCalled();
    const tracked = { info: { status: 'running' } } as TrackedAgent;
    const { announced, telemetry } = harness(tracked);
    telemetry.dispatch('lane', tracked, { admission: { phase: 'paused', reason: 'duration' } });
    expect(tracked.info.actionNotice).toMatchObject({ action: 'paused' });
    telemetry.dispatch('lane', tracked, { admission: { phase: 'running' } });
    expect(tracked.info.actionNotice).toBeUndefined();
    telemetry.dispatch('lane', tracked, { admission: { phase: 'paused', reason: 'duration' } });
    expect(actions(announced).filter((a) => a.startsWith('paused'))).toHaveLength(2);
  });
});
