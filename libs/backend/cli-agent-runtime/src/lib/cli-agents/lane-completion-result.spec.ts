import { AgentId, type AgentProcessInfo } from '@ptah-extension/shared';
import { buildLaneCompletionResult, buildSessionCompletionResult, phaseKindFromAgentInfo } from './lane-completion-result';

describe('executor completion result', () => {
  it('reads the typed phase from a stored lane record', () => {
    const info: AgentProcessInfo = {
      agentId: AgentId.create(), cli: 'claude', task: 'task',
      workingDirectory: '/workspace', status: 'completed',
      startedAt: '2026-11-08T00:00:00.000Z', phaseKind: 'implement',
    };
    expect(phaseKindFromAgentInfo({ ...info })).toBe('implement');
    expect(phaseKindFromAgentInfo({ ...info, phaseKind: undefined })).toBeNull();
  });
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
  it('reports filtering only with explicit SDK option evidence', () => {
    const base = {
      executorId: 'session', phaseKind: 'implement' as const,
      deliverableCheck: [], verdict: 'unverified' as const,
      parentSignal: 'child envelope', disallowedTools: ['Read'],
    };
    expect(buildSessionCompletionResult({ ...base, toolProfileApplied: true }).toolProfileAdapter)
      .toEqual({ executorId: 'session', toolProfileStatus: 'filtered' });
    expect(buildSessionCompletionResult({ ...base, toolProfileApplied: false }).toolProfileAdapter)
      .toEqual({ executorId: 'session', toolProfileStatus: 'unfiltered' });
    expect(buildSessionCompletionResult({ ...base, disallowedTools: [] }).toolProfileAdapter)
      .toBeNull();
  });
});

it('carries a pause notice alongside the existing completion verdict', () => {
  const notice = {
    actor: 'ptah-budget', action: 'paused', reason: 'runtime-cap', nextStep: 'review-live-agent',
  } as const;
  const receipt = {
    id: 'completion-receipt', agentId: AgentId.create(), state: 'settled',
    mode: 'queue-next-turn', delivery: 'queue', createdAt: 1, updatedAt: 2,
  } as const;
  expect(buildLaneCompletionResult({
    signal: { verdict: 'unverified', deliverables: [], notice, receipt },
    executorId: 'claude', phaseKind: null, parentSignal: 'lane result',
  })).toMatchObject({ notice, receipt, verdict: 'unverified' });
  expect(buildSessionCompletionResult({
    notice, deliverableCheck: [], verdict: 'unverified',
    executorId: 'session', phaseKind: null, parentSignal: 'child result',
  })).toMatchObject({ notice, verdict: 'unverified' });
});
