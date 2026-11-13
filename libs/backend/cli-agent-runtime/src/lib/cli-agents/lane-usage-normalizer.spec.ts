import { LaneUsageNormalizer } from './lane-usage-normalizer';
import { AgentId, type AgentProcessInfo } from '@ptah-extension/shared';
import { Logger } from '@ptah-extension/vscode-core';
import { LaneOutcomeRecorder } from '@ptah-extension/lane-outcomes';
import type { SessionUsageSink, UsageMissingReason } from '@ptah-extension/platform-core';
import { recordLaneUsageOutcome } from './lane-completion-outcome';

describe('LaneUsageNormalizer', () => {
  const usage = (inputTokens?: number) => ({ inputTokens });

  it('keeps one message total per turn', () => {
    const normalizer = new LaneUsageNormalizer();
    expect(normalizer.accept('lane', 'message', usage(2)).inputTokens).toBe(2);
    expect(normalizer.accept('lane', 'message', usage(3)).inputTokens).toBe(5);
    normalizer.settleTurn('lane');
    expect(normalizer.accept('lane', 'message', usage(1)).inputTokens).toBe(1);
  });

  it('passes turn totals and preserves measured zero', () => {
    const normalizer = new LaneUsageNormalizer();
    expect(normalizer.accept('lane', 'turn', usage(0)).inputTokens).toBe(0);
    expect(normalizer.accept('lane', 'turn', usage()).inputTokens).toBeUndefined();
  });

  it('turns cumulative snapshots into deltas and handles regression', () => {
    const normalizer = new LaneUsageNormalizer();
    expect(normalizer.accept('lane', 'cumulative', usage(5)).inputTokens).toBe(5);
    expect(normalizer.accept('lane', 'cumulative', usage(8)).inputTokens).toBe(3);
    expect(normalizer.accept('lane', 'cumulative', usage(2)).inputTokens).toBe(2);
    expect(normalizer.accept('lane', 'cumulative', usage()).inputTokens).toBeUndefined();
    expect(normalizer.accept('lane', 'cumulative', usage(0)).inputTokens).toBe(0);
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
