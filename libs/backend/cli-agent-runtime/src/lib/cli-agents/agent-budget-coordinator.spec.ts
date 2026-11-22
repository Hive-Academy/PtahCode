import { AgentBudgetCoordinator } from './agent-budget-coordinator';
import type { AgentTurnUsage } from '@ptah-extension/shared';

const settings = { warnRatio: 0.8, stopWeightedTokens: 100,
  handoffContextTokens: 50, maxDurationMin: 2 };
const unavailable = { status: 'unavailable', reason: 'absent', source: 'stream' } as const;
const usage: AgentTurnUsage = {
  turnId: 'turn-1', modelId: 'unknown', scope: 'turn', source: 'stream',
  inputTokens: 60, outputTokens: 20,
  cacheReadTokens: unavailable, cacheWriteTokens: unavailable,
  requestContextTokens: unavailable, providerCostUsd: unavailable,
  cacheSemantics: 'unknown',
};

describe('AgentBudgetCoordinator', () => {
  it('reassesses changed limits without losing charged turns or restarting duration', () => {
    const coordinator = new AgentBudgetCoordinator({ ...settings, stopWeightedTokens: 200 }, 1_000);
    coordinator.accept({ status: 'reported', usage: { ...usage, inputTokens: 30, outputTokens: 10 } }, 2_000);
    expect(coordinator.updateSettings({ ...settings, stopWeightedTokens: 60 }, 3_000).phase).toBe('running');
    expect(coordinator.updateSettings({ ...settings, stopWeightedTokens: 50 }, 3_000)).toMatchObject({ phase: 'asked-handoff', reason: 'weighted-budget' });
    expect(coordinator.updateSettings({ ...settings, stopWeightedTokens: 15 }, 4_000)).toMatchObject({ phase: 'paused', reason: 'weighted-budget' });
    expect(coordinator.counters.stopped).toBe(false);
    expect(coordinator.turnCount).toBe(1);
    expect(coordinator.counters.rawTokens).toBe(40);
    expect(coordinator.startedAtMs).toBe(1_000);
    expect(coordinator.record().stopWeightedTokens).toBe(15);
  });

  it('applies a shorter lifetime to the existing start time', () => {
    const coordinator = new AgentBudgetCoordinator(settings, 1_000);
    expect(coordinator.updateSettings({ ...settings, maxDurationMin: 1 }, 61_000)).toMatchObject({
      phase: 'asked-handoff', reason: 'duration', unit: 'milliseconds', limit: 60_000,
    });
    // Ask at 0.8 x 60 s, pause at 2 x 60 s, both from the original start.
    expect(coordinator.nextAdmissionDeadlineMs(61_000)).toBe(60_000);
    expect(coordinator.admission(121_000)).toMatchObject({ phase: 'paused', reason: 'duration' });
    expect(coordinator.nextAdmissionDeadlineMs(121_000)).toBeUndefined();
  });

  it('schedules the next duration point: ask first, then pause', () => {
    const coordinator = new AgentBudgetCoordinator(settings, 1_000);
    expect(coordinator.nextAdmissionDeadlineMs(2_000)).toBe(95_000);
    expect(coordinator.nextAdmissionDeadlineMs(97_000)).toBe(144_000);
    expect(coordinator.nextAdmissionDeadlineMs(0)).toBe(96_000);
  });

  it('asks at the threshold, deduplicates turn IDs, and pauses at twice the limit', () => {
    const coordinator = new AgentBudgetCoordinator(settings, 0);
    const first = coordinator.accept({ status: 'reported', usage }, 10);
    expect(first.admission).toMatchObject({ phase: 'asked-handoff', reason: 'weighted-budget', measured: 80, limit: 100 });
    expect(first.costUnavailable).toBe(true);
    expect(coordinator.turnCount).toBe(1);
    expect(coordinator.accept({ status: 'reported', usage }, 11).admission.phase).toBe('asked-handoff');
    expect(coordinator.turnCount).toBe(1);
    expect(coordinator.counters.rawTokens).toBe(80);
    expect(coordinator.accept({ status: 'reported', usage: { ...usage, turnId: 'turn-2' } }, 12).admission.phase).toBe('asked-handoff');
    expect(coordinator.turnCount).toBe(2);
    expect(coordinator.accept({ status: 'reported', usage: { ...usage, turnId: 'turn-3' } }, 13).admission)
      .toMatchObject({ phase: 'paused', reason: 'weighted-budget', measured: 240 });
    expect(coordinator.turnCount).toBe(3);
  });

  it('keeps accounting after a pause', () => {
    const coordinator = new AgentBudgetCoordinator(settings, 0);
    coordinator.accept({ status: 'reported', usage: { ...usage, inputTokens: 200 } }, 10);
    expect(coordinator.admission(10).phase).toBe('paused');
    coordinator.accept({ status: 'reported', usage: { ...usage, turnId: 'turn-2' } }, 20);
    expect(coordinator.counters.stopped).toBe(false);
    expect(coordinator.counters.rawTokens).toBe(300);
    expect(coordinator.turnCount).toBe(2);
  });

  it('asks after one missing total', () => {
    const coordinator = new AgentBudgetCoordinator(settings, 1_000);
    expect(coordinator.accept({ status: 'unavailable', turnId: 'missing', modelId: 'unknown', source: 'stream', reason: 'missing' }, 2_000).admission)
      .toMatchObject({ phase: 'asked-handoff', reason: 'telemetry-unavailable', measured: 1, unit: 'turns' });
    expect(coordinator.record().unavailableTurns).toBe(1);
  });

  it('persists the unavailable streak and carries the newer count across a ledger rebind', () => {
    const first = new AgentBudgetCoordinator({ ...settings, stopWeightedTokens: 200 }, 1_000);
    const missingTurn = (turnId: string) => ({ status: 'unavailable' as const, turnId,
      modelId: 'unknown', source: 'stream' as const, reason: 'missing' });
    first.accept(missingTurn('old'), 1_100);
    const record = first.record();
    expect(record.unavailableTurns).toBe(1);
    const resumed = new AgentBudgetCoordinator({ ...settings, stopWeightedTokens: 200 }, 2_000);
    resumed.accept(missingTurn('new'), 2_100);
    resumed.rebindRecord(record, 2_200);
    expect(resumed.counters.unavailableTurns).toBe(2);
    expect(resumed.record().turnIds).toEqual(['old', 'new']);
    expect(resumed.turnCount).toBe(2);
    expect(resumed.accept(missingTurn('last'), 2_300).admission).toMatchObject({ phase: 'paused', reason: 'telemetry-unavailable' });
    expect(resumed.counters.unavailableTurns).toBe(3);
    resumed.accept(missingTurn('after-pause'), 2_400);
    expect(resumed.counters.unavailableTurns).toBe(4);
  });

  it('adds unavailable streaks across distinct ledgers without a reported reset', () => {
    const coordinator = new AgentBudgetCoordinator({ ...settings, stopWeightedTokens: 200 }, 2_000);
    coordinator.accept({ status: 'unavailable', turnId: 'current', modelId: 'unknown',
      source: 'stream', reason: 'missing' }, 2_100);
    coordinator.rebindRecord({ weightedTokens: 0, rawTokens: 0, unavailableTurns: 2,
      turnIds: ['prior-1', 'prior-2'], turnCount: 2, startedAtMs: 1_000 }, 2_200);
    expect(coordinator.counters.unavailableTurns).toBe(3);
  });

  it('uses the current streak after a reported turn resets the prior ledger', () => {
    const coordinator = new AgentBudgetCoordinator({ ...settings, stopWeightedTokens: 200 }, 2_000);
    coordinator.accept({ status: 'reported', usage: { ...usage, inputTokens: 10, outputTokens: 0 } }, 2_100);
    coordinator.accept({ status: 'unavailable', turnId: 'current', modelId: 'unknown',
      source: 'stream', reason: 'missing' }, 2_200);
    coordinator.rebindRecord({ weightedTokens: 0, rawTokens: 0, unavailableTurns: 2,
      turnIds: ['prior-1', 'prior-2'], turnCount: 2, startedAtMs: 1_000 }, 2_300);
    expect(coordinator.counters.unavailableTurns).toBe(1);
  });

  it('merges a prior ledger after its provisional first charge', () => {
    const coordinator = new AgentBudgetCoordinator(settings, 5_000);
    coordinator.accept({ status: 'reported', usage }, 5_100);
    const decision = coordinator.rebindRecord({ weightedTokens: 40, rawTokens: 30,
      turnIds: ['native:1'], turnCount: 1, startedAtMs: 1_000,
      stopWeightedTokens: 100, maxDurationMin: 2 }, 6_000);
    expect(coordinator.counters.rawTokens).toBe(110);
    expect(coordinator.counters.turnIds).toEqual(['native:1', 'turn-1']);
    expect(coordinator.turnCount).toBe(2);
    expect(coordinator.startedAtMs).toBe(1_000);
    expect(coordinator.nextAdmissionDeadlineMs(6_000)).toBe(91_000);
    expect(coordinator.record().rawTokens).toBe(110);
    expect(decision).toMatchObject({ phase: 'asked-handoff', reason: 'weighted-budget', measured: 120 });
    expect(coordinator.counters.stopped).toBe(false);
  });

  it('asks immediately when a late ledger merge crosses the ask threshold', () => {
    const coordinator = new AgentBudgetCoordinator(settings, Date.now());
    coordinator.accept({ status: 'reported', usage: { ...usage, inputTokens: 30, outputTokens: 10 } });
    const decision = coordinator.rebindRecord({ weightedTokens: 45, rawTokens: 45,
      turnIds: ['native:1'], turnCount: 1, startedAtMs: Date.now(),
      stopWeightedTokens: 100, maxDurationMin: 2 });
    expect(decision).toMatchObject({ phase: 'asked-handoff', reason: 'weighted-budget', measured: 85 });
  });
});
