import {
  InMemoryLaneOutcomeStore,
  LaneOutcomeRecorder,
  OutcomeWritePipeline,
} from '@ptah-extension/lane-outcomes';
import { AgentId, type AgentProcessInfo, type LaneCompletionSignal } from '@ptah-extension/shared';
import { Logger } from '@ptah-extension/vscode-core';
import type { SessionUsageSink, SessionUsageContribution } from '@ptah-extension/platform-core';
import { enqueueLaneCompletionOutcome, recordLaneUsageOutcome } from './lane-completion-outcome';

describe('enqueueLaneCompletionOutcome routing facts', () => {
  const info: AgentProcessInfo = {
    agentId: AgentId.create(), cli: 'claude', task: 'test',
    workingDirectory: '/workspace', status: 'completed',
    startedAt: '2026-11-08T00:00:00.000Z', model: 'requested-alias',
  };
  const signal: LaneCompletionSignal = {
    agentId: info.agentId, cli: info.cli, agentLabel: 'Claude',
    status: info.status, startedAt: info.startedAt, completedAt: '2026-11-08T00:01:00.000Z',
    durationMs: 60_000, taskHeadline: 'test', deliverables: [], verdict: 'delivered', reportsDelivered: 0,
  };
  const routeFacts: NonNullable<AgentProcessInfo['routeFacts']> = {
    routeId: 'route-1', phaseId: 'phase-1', laneId: 'claude', model: 'routed-model',
    effort: 'max', source: 'model', decisionModel: `claude:${'a'.repeat(128)}`, proposalConfidence: 0.75,
  };

  async function writeOutcome(overrides: Partial<AgentProcessInfo>) {
    const logger = Object.create(Logger.prototype) as Logger;
    jest.spyOn(logger, 'warn').mockImplementation();
    jest.spyOn(logger, 'error').mockImplementation();
    const store = new InMemoryLaneOutcomeStore();
    const pipeline = new OutcomeWritePipeline(store, logger);
    const recorder = new LaneOutcomeRecorder(pipeline, store, logger);
    try {
      enqueueLaneCompletionOutcome(() => recorder, logger, { ...info, ...overrides }, 'run-1', signal, false, false, null);
      await pipeline.flush();
      return await store.get('run-1');
    } finally {
      await pipeline.dispose();
    }
  }

  it('persists all routing and native facts, including a truncated decision model', async () => {
    expect(await writeOutcome({
      modelSource: 'request',
      observedModel: 'telemetry-model',
      reportedSession: { model: 'native-model', effort: 'medium', efforts: { provenance: 'unknown' } },
      spawnEffort: {
        requested: 'max', sent: 'high', source: 'request',
        provenance: 'ptah-fallback', disposition: 'fallback-mapped',
      },
      routeFacts,
      routingSource: 'pin',
    })).toMatchObject({
      model: 'requested-alias',
      modelSource: 'request',
      resolvedModel: 'native-model',
      resolvedModelProvenance: 'native',
      requestedEffort: 'max',
      effort: 'high',
      effortSource: 'request',
      effortProvenance: 'ptah-fallback',
      effortDisposition: 'fallback-mapped',
      resolvedEffort: 'medium',
      resolvedEffortProvenance: 'native',
      routedModel: 'routed-model',
      routedEffort: 'max',
      decisionModel: `claude:${'a'.repeat(121)}`,
      proposalConfidence: 0.75,
      routingSource: 'pin',
    });
  });

  it('uses telemetry only when the adapter has no session state', async () => {
    expect(await writeOutcome({ observedModel: 'telemetry-model', routeFacts })).toMatchObject({
      resolvedModel: 'telemetry-model',
      resolvedModelProvenance: 'native',
      resolvedEffort: null,
      resolvedEffortProvenance: 'unknown',
      routingSource: 'model',
    });
    expect(await writeOutcome({
      observedModel: 'telemetry-model',
      reportedSession: { model: null, effort: null, efforts: { provenance: 'unknown' } },
    })).toMatchObject({
      resolvedModel: null,
      resolvedModelProvenance: 'unknown',
      resolvedEffort: null,
      resolvedEffortProvenance: 'unknown',
    });
  });

  it('records unknown resolved values and null facts when neither source reports them', async () => {
    expect(await writeOutcome({})).toMatchObject({
      modelSource: null,
      resolvedModel: null,
      resolvedModelProvenance: 'unknown',
      requestedEffort: null,
      effort: null,
      effortSource: null,
      effortProvenance: null,
      effortDisposition: null,
      resolvedEffort: null,
      resolvedEffortProvenance: 'unknown',
      routedModel: null,
      routedEffort: null,
      decisionModel: null,
      proposalConfidence: null,
      routingSource: 'not-routed',
    });
  });
});

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
    const phasedInfo: AgentProcessInfo = { ...info, phaseKind: 'implement' };
    recordLaneUsageOutcome(sink, logger, phasedInfo, '2026-11-08T00:01:00.000Z', {
      inputTokens: 1, outputTokens: 1,
    });
    expect(records[0]).toMatchObject({ executorType: 'lane', phaseKind: 'implement' });
  });

  it('keys the contribution by the workspace override when one is given', () => {
    const records: SessionUsageContribution[] = [];
    const sink: SessionUsageSink = { recordUsage: (value) => { records.push(value); } };
    recordLaneUsageOutcome(sink, logger, info, '2026-11-08T00:01:00.000Z', {
      inputTokens: 1, outputTokens: 1,
    }, null, undefined, undefined, 'D:/review-root');
    expect(records).toHaveLength(1);
    expect(records[0].workspaceKey).toBe('D:/review-root');
  });

  it('keys the contribution by the working directory without an override', () => {
    const records: SessionUsageContribution[] = [];
    const sink: SessionUsageSink = { recordUsage: (value) => { records.push(value); } };
    recordLaneUsageOutcome(sink, logger, info, '2026-11-08T00:01:00.000Z', {
      inputTokens: 1, outputTokens: 1,
    });
    expect(records).toHaveLength(1);
    expect(records[0].workspaceKey).toBe('C:/workspace');
  });
});
