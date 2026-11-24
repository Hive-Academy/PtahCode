import { LaneUsageNormalizer } from './lane-usage-normalizer';
import { AgentId, type AgentProcessInfo } from '@ptah-extension/shared';
import { Logger } from '@ptah-extension/vscode-core';
import { LaneOutcomeRecorder } from '@ptah-extension/lane-outcomes';
import type { SessionUsageSink, UsageMissingReason } from '@ptah-extension/platform-core';
import { recordLaneUsageOutcome } from './lane-completion-outcome';

describe('LaneUsageNormalizer', () => {
  const usage = (inputTokens?: number) => ({ inputTokens });
  type Usage = Parameters<LaneUsageNormalizer['accept']>[2];
  const sumOf = (steps: { increment: Usage }[], key: 'inputTokens' | 'outputTokens') =>
    steps.reduce((total, step) => total + (step.increment[key] ?? 0), 0);

  it('message: each message is its own increment and the turn total adds them up', () => {
    const normalizer = new LaneUsageNormalizer();
    const steps = [normalizer.accept('lane', 'message', usage(2)), normalizer.accept('lane', 'message', usage(3))];
    expect(steps.map((step) => step.increment.inputTokens)).toEqual([2, 3]);
    expect(steps[1]?.turnTotal.inputTokens).toBe(5);
    expect(sumOf(steps, 'inputTokens')).toBe(steps[1]?.turnTotal.inputTokens);
    normalizer.settleTurn('lane');
    expect(normalizer.accept('lane', 'message', usage(1)).turnTotal.inputTokens).toBe(1);
  });

  it('turn: passes the total, preserves measured zero and keeps absent counters absent', () => {
    const normalizer = new LaneUsageNormalizer();
    expect(normalizer.accept('lane', 'turn', usage(0))).toEqual({ increment: { inputTokens: 0 }, turnTotal: { inputTokens: 0 } });
    const absent = normalizer.accept('other', 'turn', usage());
    expect(absent.increment).not.toHaveProperty('inputTokens');
    expect(absent.turnTotal.inputTokens).toBeUndefined();
  });

  it('turn after increments emits the (possibly negative) correction so card sum = total', () => {
    const normalizer = new LaneUsageNormalizer();
    const steps = [
      normalizer.accept('lane', 'message', { inputTokens: 4, outputTokens: 2 }),
      normalizer.accept('lane', 'message', { inputTokens: 6, outputTokens: 3 }),
      normalizer.accept('lane', 'turn', { inputTokens: 9, outputTokens: 7, costUsd: 0.02 }),
    ];
    expect(steps[2]?.increment).toEqual({ inputTokens: -1, outputTokens: 2, costUsd: 0.02 });
    expect(sumOf(steps, 'inputTokens')).toBe(9);
    expect(sumOf(steps, 'outputTokens')).toBe(7);
    expect(steps[2]?.turnTotal).toEqual({ inputTokens: 9, outputTokens: 7, costUsd: 0.02 });
  });

  it('cumulative: deltas to the previous snapshot of this turn; card sum = durable total', () => {
    const normalizer = new LaneUsageNormalizer();
    const steps = [5, 8, 8].map((tokens) => normalizer.accept('lane', 'cumulative', usage(tokens)));
    expect(steps.map((step) => step.increment.inputTokens)).toEqual([5, 3, 0]);
    expect(steps[2]?.turnTotal.inputTokens).toBe(8);
    expect(sumOf(steps, 'inputTokens')).toBe(8);
    expect(normalizer.accept('lane', 'cumulative', usage()).increment).not.toHaveProperty('inputTokens');
  });

  it('after settleTurn the first cumulative snapshot of the next turn is a full increment', () => {
    const normalizer = new LaneUsageNormalizer();
    normalizer.accept('lane', 'cumulative', usage(5));
    normalizer.accept('lane', 'cumulative', usage(8));
    normalizer.settleTurn('lane');
    expect(normalizer.accept('lane', 'cumulative', usage(6))).toMatchObject({
      increment: { inputTokens: 6 }, turnTotal: { inputTokens: 6 },
    });
  });

  it('passes contextTokens, durationMs and model through and never subtracts them', () => {
    const normalizer = new LaneUsageNormalizer();
    normalizer.accept('lane', 'cumulative', { inputTokens: 5, contextTokens: 900, durationMs: 10, model: 'm' });
    const second = normalizer.accept('lane', 'cumulative', {
      inputTokens: 8, totalTokens: 12, contextTokens: 1_200, durationMs: 25, model: 'm2', costUsd: 0.5,
    });
    expect(second.increment).toEqual({ inputTokens: 3, totalTokens: 12, contextTokens: 1_200, durationMs: 25, model: 'm2' });
    const turn = normalizer.accept('lane', 'turn', { inputTokens: 8, contextTokens: 1_300, durationMs: 30 });
    expect(turn.increment).toEqual({ inputTokens: 0, contextTokens: 1_300, durationMs: 30 });
  });

  it('omits costUsd on message and cumulative increments, keeps it on turn', () => {
    const normalizer = new LaneUsageNormalizer();
    expect(normalizer.accept('lane', 'message', { inputTokens: 1, costUsd: 0.1 }).increment).not.toHaveProperty('costUsd');
    expect(normalizer.accept('lane', 'turn', { inputTokens: 1, costUsd: 0.1 }).increment.costUsd).toBe(0.1);
  });
});

describe('Codex missing usage reasons', () => {
  const logger = Object.create(Logger.prototype) as Logger;
  jest.spyOn(logger, 'warn').mockImplementation();
  jest.spyOn(logger, 'error').mockImplementation();
  const completedAt = '2026-11-08T00:01:00.000Z';
  const accepted: SessionUsageSink = { recordUsage: () => undefined };

  async function expectReason(
    reason: UsageMissingReason,
    status: AgentProcessInfo['status'],
    usage: Parameters<typeof recordLaneUsageOutcome>[4],
    sink: SessionUsageSink | null = accepted,
  ): Promise<void> {
    const before = LaneOutcomeRecorder.codexUsageReasonCount(reason);
    const info: AgentProcessInfo = {
      agentId: AgentId.create(), cli: 'codex', task: 'synthetic',
      workingDirectory: 'C:/workspace', status,
      startedAt: '2026-11-08T00:00:00.000Z',
    };
    recordLaneUsageOutcome(sink, logger, info, completedAt, usage);
    await Promise.resolve();
    expect(LaneOutcomeRecorder.codexUsageReasonCount(reason)).toBe(before + 1);
    recordLaneUsageOutcome(sink, logger, info, completedAt, usage);
    await Promise.resolve();
    expect(LaneOutcomeRecorder.codexUsageReasonCount(reason)).toBe(before + 1);
  }

  it('classifies absence, invalidity, abort and failure', async () => {
    await expectReason('no-usage-event', 'completed', undefined);
    await expectReason('invalid-usage', 'completed', { inputTokens: -1 });
    await expectReason('aborted-before-result', 'stopped', undefined);
    await expectReason('failed-before-result', 'failed', undefined);
  });

  it('counts sink refusal once per completion', async () => {
    await expectReason('sink-unavailable', 'completed', { inputTokens: 1 }, null);
    await expectReason('sink-unavailable', 'completed', { inputTokens: 1 }, {
      recordUsage: () => { throw new Error('synthetic refusal'); },
    });
  });
});

describe('lane model breakdown', () => {
  it('retains reported models while keeping aggregate cost separate', async () => {
    const recordUsage = jest.fn();
    const logger = Object.create(Logger.prototype) as Logger;
    jest.spyOn(logger, 'warn').mockImplementation();
    const info: AgentProcessInfo = {
      agentId: AgentId.create(), cli: 'opencode', task: 'synthetic',
      workingDirectory: 'C:/workspace', status: 'completed', startedAt: '2026-11-08T00:00:00.000Z',
    };
    recordLaneUsageOutcome({ recordUsage }, logger, info, '2026-11-08T00:01:00.000Z', {
      inputTokens: 3, outputTokens: 4, costUsd: 0.1,
      models: [{ modelId: 'a', inputTokens: 1, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0 },
        { modelId: 'b', inputTokens: 2, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0 }],
    });
    await Promise.resolve();
    expect(recordUsage).toHaveBeenCalledWith(expect.objectContaining({
      totalCostMicroUsd: 100000,
      models: [expect.objectContaining({ modelId: 'a', inputTokens: 1 }),
        expect.objectContaining({ modelId: 'b', inputTokens: 2 })],
    }));
  });

  it('uses the current turn start for replay coverage', async () => {
    const recordUsage = jest.fn();
    const logger = Object.create(Logger.prototype) as Logger;
    jest.spyOn(logger, 'warn').mockImplementation();
    const info: AgentProcessInfo = {
      agentId: AgentId.create(), cli: 'codex', task: 'synthetic',
      workingDirectory: 'C:/workspace', status: 'completed', startedAt: '2026-11-08T00:00:00.000Z',
    };
    recordLaneUsageOutcome({ recordUsage }, logger, info, '2026-11-08T00:03:00.000Z',
      { inputTokens: 1 }, 'native-thread', undefined, '2026-11-08T00:02:00.000Z');
    await Promise.resolve();
    expect(recordUsage).toHaveBeenCalledWith(expect.objectContaining({
      coverageStartMs: Date.parse('2026-11-08T00:02:00.000Z'),
    }));
  });
});
