import { adviseSubagentResume, buildBudgetResumeRefusal } from './subagent-resume-advice';

describe('buildBudgetResumeRefusal', () => {
  const state = { contextTokens: 849, handoffTokens: 1000, warningRatio: 0.85, stopped: false, stopState: 'none' as const };
  it('allows unknown and below-limit usage, and preserves the budget refusal wording', () => {
    expect(buildBudgetResumeRefusal(state)).toBeNull();
    expect(buildBudgetResumeRefusal({ ...state, contextTokens: null })).toBeNull();
    expect(buildBudgetResumeRefusal({ ...state, contextTokens: 850, recordPath: 'handoff.md' }))
      .toBe("Ptah's budget monitor refuses this resume at the 85% budget warning (current: 850 context tokens; handoff limit: 1000 tokens) (handoff record: handoff.md). Start a new agent with a short brief from the handoff record.");
  });

  it('keeps the earlier wording for an explicit stop', () => {
    expect(buildBudgetResumeRefusal({ ...state, contextTokens: null, stopped: true, stopState: 'stopped' }))
      .toContain('stopped this agent');
  });

  it('routes a completed handoff to a successor without saying it was stopped', () => {
    const refusal = buildBudgetResumeRefusal(
      { ...state, contextTokens: 900, stopped: true, running: false, recordPath: 'handoff.md' }, 'agent-1');
    expect(refusal).toBe('agent-1 already returned its handoff to Ptah (current: 900 context tokens; handoff limit: 1000 tokens) (handoff record: handoff.md). Start a new agent with a short brief from the handoff record.');
    expect(refusal).not.toMatch(/stopped|interrupted|the user/i);
  });

  it('refuses new work for a paused live agent non-interruptingly with the shared pause copy', () => {
    const paused = {
      ...state, running: true, lifecycle: 'paused' as const, contextTokens: 1200,
      pauseNotice: { actor: 'ptah-budget', action: 'paused', reason: 'telemetry-unavailable', nextStep: 'review-live-agent' } as const,
    };
    const refusal = buildBudgetResumeRefusal(paused, 'agent-2') ?? '';
    expect(refusal).toContain('Ptah budget monitor paused new work for agent-2 because');
    expect(refusal).toMatch(/telemetry/i);
    expect(refusal).toContain('The execution remains live. Review its progress and decide how it should continue.');
    expect(buildBudgetResumeRefusal({ ...paused, pauseNotice: undefined }, 'agent-2')).toContain('paused new work for agent-2.');
    expect(refusal).not.toMatch(/stopped|interrupted|the user/i);
  });

  it('permits steering a running agent that was only asked for a handoff admission phase', () => {
    expect(buildBudgetResumeRefusal({ ...state, running: true, lifecycle: 'asked', warned: true, contextTokens: 900 })).toBeNull();
  });
  it('reports a handoff in progress while it is being finalized', () => {
    expect(buildBudgetResumeRefusal({ ...state, stopped: true, lifecycle: 'finalizing', stopState: 'pending' }))
      .toContain('is returning its handoff');
  });

  it('reports the configured warning ratio without implying a context limit for a weighted warning', () => {
    const refusal = buildBudgetResumeRefusal({ ...state, warned: true, warningRatio: 0.7, contextTokens: 100 });
    expect(refusal).toContain('70% budget warning');
    expect(refusal).not.toContain('handoff limit');
  });

  it('allows steering a running agent and never invents a handoff record', () => {
    expect(buildBudgetResumeRefusal({ ...state, contextTokens: 900, running: true })).toBeNull();
    const refusal = buildBudgetResumeRefusal({ ...state, contextTokens: 900 });
    expect(refusal).toContain('available context');
    expect(refusal).not.toContain('handoff record');
  });
});

describe('adviseSubagentResume', () => {
  const base = {
    stopped: false,
    cacheState: 'warm' as const,
    handoffTokens: 1000,
    budgetReached: false,
  };

  it.each([
    [849, 'resume'],
    [850, 'fresh'],
    [1000, 'fresh'],
    [undefined, 'resume'],
  ] as const)('returns %s for %s tokens', (contextTokens, expected) => {
    expect(adviseSubagentResume({ ...base, contextTokens })).toBe(expected);
  });

  it('refuses a stopped agent even without usage', () => {
    expect(adviseSubagentResume({ ...base, stopped: true, contextTokens: undefined })).toBe('fresh');
  });
});
