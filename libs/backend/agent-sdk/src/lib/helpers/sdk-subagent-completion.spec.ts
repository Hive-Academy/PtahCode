import { buildSdkSubagentCompletion } from './sdk-subagent-completion';

describe('SDK subagent completion', () => {
  it('returns an unverified verdict with no phase or deliverables', () => {
    const result = buildSdkSubagentCompletion({
      agentId: 'agent-1', agentType: null, parentSessionId: null,
    });
    expect(result).toMatchObject({
      phaseKind: null, executorId: 'sdk-subagent', deliverableCheck: [],
      verdict: 'unverified', toolProfileAdapter: null,
    });
    expect(result.parentSignal).toContain('SDK subagent agent-1 finished: unverified.');
  });

  it('reports a phased failure and the filtered SDK profile', () => {
    const result = buildSdkSubagentCompletion({
      agentId: 'agent-2', agentType: 'review', parentSessionId: 'parent',
      phaseKind: 'review', failed: true, disallowedTools: ['Write'],
    });
    expect(result).toMatchObject({
      phaseKind: 'review', verdict: 'failed', deliverableCheck: [],
      toolProfileAdapter: { executorId: 'sdk-subagent', toolProfileStatus: 'filtered' },
    });
  });
});
