import { AgentId, completedTurnTelemetry, turnIdentity, type CliOutputSegment } from '@ptah-extension/shared';
import {
  laneResumeModelLookup,
  lastRunModelFromOutput,
  type LaneOutputPage,
  type LaneOutputPageReader,
} from './lane-last-model';

const info = { agentId: AgentId.create(), cli: 'claude' as const, parentSessionId: 'parent-1' };

function telemetrySegment(modelId: string, turn = 1): CliOutputSegment {
  return {
    type: 'info',
    content: 'turn usage',
    turnTelemetry: completedTurnTelemetry({
      ...turnIdentity({ provider: 'claude', turnId: `s:${turn}`, modelId, source: 'sdk' }),
      usage: { inputTokens: 10, outputTokens: 2 },
    }),
  };
}

function pages(...segmentPages: CliOutputSegment[][]): jest.Mock<Promise<LaneOutputPage>, Parameters<LaneOutputPageReader>> {
  return jest.fn(async (_agentId: string, cursor: string | undefined, _sessionId: string | undefined) => {
    const index = cursor === undefined ? 0 : Number(cursor);
    const items = (segmentPages[index] ?? []).map((value) => ({ tag: 'segment' as const, value }));
    const last = index >= segmentPages.length - 1;
    return { items, nextCursor: last ? null : String(index + 1), done: last };
  });
}

describe('lastRunModelFromOutput (F1)', () => {
  it('returns the model of the last reported turn across pages', async () => {
    const read = pages(
      [telemetrySegment('claude-sonnet-4-5', 1), { type: 'text', content: 'hi' }],
      [telemetrySegment('claude-haiku-4-5-20251001', 2)],
    );
    await expect(lastRunModelFromOutput(read, info)).resolves.toEqual({ model: 'claude-haiku-4-5-20251001', truncated: false });
    expect(read).toHaveBeenCalledWith(String(info.agentId), undefined, 'parent-1');
    expect(read).toHaveBeenCalledWith(String(info.agentId), '1', 'parent-1');
  });

  it('falls back to a usage model and skips placeholder ids', async () => {
    const read = pages([
      { type: 'info', content: 'usage', usage: { model: 'claude-haiku-4-5' } },
      { type: 'info', content: 'usage', usage: { model: 'claude/unknown' } },
      { type: 'info', content: 'usage', usage: { model: 'multi-model' } },
      { type: 'info', content: 'usage', usage: { model: 'claude/multi-model' } },
    ]);
    await expect(lastRunModelFromOutput(read, info)).resolves.toEqual({ model: 'claude-haiku-4-5', truncated: false });
  });

  it('returns undefined when the output names no model', async () => {
    await expect(lastRunModelFromOutput(pages([{ type: 'text', content: 'hi' }]), info))
      .resolves.toEqual({ model: undefined, truncated: false });
  });

  it('reports no model, not an older one, when the page limit cuts the scan short (CR)', async () => {
    const read = jest.fn(async (_agentId: string, cursor: string | undefined, _sessionId: string | undefined) => ({
      items: [{ tag: 'segment' as const, value: telemetrySegment('claude-sonnet-4-5', Number(cursor ?? 0)) }],
      nextCursor: String(Number(cursor ?? 0) + 1),
      done: false,
    }));
    await expect(lastRunModelFromOutput(read, info)).resolves.toEqual({ model: undefined, truncated: true });
    expect(read).toHaveBeenCalledTimes(64);
  });
});

describe('laneResumeModelLookup (F1)', () => {
  const logger = () => ({ info: jest.fn(), warn: jest.fn() });

  it('resolves the last-run model and logs it', async () => {
    const log = logger();
    const lookup = laneResumeModelLookup(pages([telemetrySegment('claude-haiku-4-5-20251001')]), log);
    await expect(lookup({ ...info, task: 't', workingDirectory: '.', status: 'stopped', startedAt: '' }))
      .resolves.toBe('claude-haiku-4-5-20251001');
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('warns, naming the lane, when nothing is known', async () => {
    const log = logger();
    const lookup = laneResumeModelLookup(pages([]), log);
    await expect(lookup({ ...info, task: 't', workingDirectory: '.', status: 'stopped', startedAt: '' }))
      .resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalledWith(
      '[AgentLaneResume] No stored or last-run model for the lane; it resumes on the CLI default',
      { agentId: info.agentId, cli: 'claude' },
    );
  });

  it('warns about the scan limit and resolves undefined for an over-long output (CR)', async () => {
    const log = logger();
    const endless: LaneOutputPageReader = async (_agentId, cursor) => ({
      items: [{ tag: 'segment', value: telemetrySegment('claude-sonnet-4-5') }],
      nextCursor: String(Number(cursor ?? 0) + 1),
      done: false,
    });
    const lookup = laneResumeModelLookup(endless, log);
    await expect(lookup({ ...info, task: 't', workingDirectory: '.', status: 'stopped', startedAt: '' }))
      .resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalledWith(
      '[AgentLaneResume] Lane output exceeds the scan limit; its last model is unknown',
      { agentId: info.agentId, pages: 64 },
    );
  });

  it('warns and resolves undefined when the output cannot be read', async () => {
    const log = logger();
    const lookup = laneResumeModelLookup(jest.fn(async () => { throw new Error('disk'); }), log);
    await expect(lookup({ ...info, task: 't', workingDirectory: '.', status: 'stopped', startedAt: '' }))
      .resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalledTimes(2);
  });
});
