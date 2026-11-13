import { buildLaneCompletionResult, buildSessionCompletionResult } from './lane-completion-result';

describe('executor completion result', () => {
  it('keeps a phase-free lane verdict and parent signal', () => {
    const result = buildLaneCompletionResult({
      signal: { verdict: 'unverified', deliverables: [] },
      executorId: 'claude', phaseKind: null, parentSignal: 'existing envelope',
    });
    expect(result).toEqual({
      phaseKind: null, executorId: 'claude', deliverableCheck: [],
      verdict: 'unverified', parentSignal: 'existing envelope', toolProfileAdapter: null,
    });
  });

  it('attributes a phased child and records the missing built-in deny channel', () => {
    const result = buildSessionCompletionResult({
      executorId: 'session', phaseKind: 'implement', deliverableCheck: [],
      verdict: 'unverified', parentSignal: 'child envelope',
      disallowedTools: ['Read'],
    });
    expect(result).toMatchObject({
      phaseKind: 'implement', executorId: 'session', deliverableCheck: [],
      verdict: 'unverified', parentSignal: 'child envelope',
      toolProfileAdapter: { executorId: 'session', toolProfileStatus: 'unfiltered' },
    });
  });
});
