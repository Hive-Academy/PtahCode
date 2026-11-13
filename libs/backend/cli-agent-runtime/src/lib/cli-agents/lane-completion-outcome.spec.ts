import { AgentId, type AgentProcessInfo } from '@ptah-extension/shared';
import { Logger } from '@ptah-extension/vscode-core';
import type { SessionUsageSink, SessionUsageContribution } from '@ptah-extension/platform-core';
import { recordLaneUsageOutcome } from './lane-completion-outcome';

describe('recordLaneUsageOutcome model attribution', () => {
  const info: AgentProcessInfo = {
    agentId: AgentId.create(), cli: 'claude', task: 'test',
    workingDirectory: 'C:/workspace', status: 'completed',
    startedAt: '2026-11-08T00:00:00.000Z', model: 'requested-alias',
  };
  const logger = Object.create(Logger.prototype) as Logger;
  jest.spyOn(logger, 'warn').mockImplementation();
  jest.spyOn(logger, 'error').mockImplementation();

  it.each([
    ['one model', 'actual-model', 'actual-model'],
    ['mixed models', undefined, null],
    ['missing model', undefined, null],
  ])('%s does not attribute cost to the requested alias', (_, model, expected) => {
    const records: SessionUsageContribution[] = [];
    const sink: SessionUsageSink = { recordUsage: (value) => { records.push(value); } };
    recordLaneUsageOutcome(sink, logger, info, '2026-11-08T00:01:00.000Z', {
      inputTokens: 10, outputTokens: 2, costUsd: 0.001,
      ...(model ? { model } : {}),
    });
    expect(records).toHaveLength(1);
    expect(records[0].models[0].modelId).toBe(expected);
  });

  it('records lane executor and phase dimensions', () => {
    const records: SessionUsageContribution[] = [];
    const sink: SessionUsageSink = { recordUsage: (value) => { records.push(value); } };
    const toolProfile = { disallowedTools: [], permission: 'allow' as const };
    const phasedInfo = { ...info, phase: {
      version: 1, kind: 'implement', text: 'work',
      toolProfile,
      definition: {
        version: 1, kind: 'implement', input: [], deliverable: [],
        verdict: [], acceptanceStep: [], requiredCapabilities: [],
        toolProfile,
        discipline: { method: '', outputContract: '', returnValue: '',
          refusals: '', escalationProtocol: '' },
      },
    } };
    recordLaneUsageOutcome(sink, logger, phasedInfo, '2026-11-08T00:01:00.000Z', {
      inputTokens: 1, outputTokens: 1,
    });
    expect(records[0]).toMatchObject({ executorType: 'lane', phaseKind: 'implement' });
  });
});
