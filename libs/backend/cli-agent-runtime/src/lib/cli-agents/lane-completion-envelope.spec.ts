import type { LaneCompletionSignal } from '@ptah-extension/shared';
import { buildLaneCompletionEnvelope } from './lane-completion-envelope';
import { buildLaneCompletionResult } from './lane-completion-result';

const base: LaneCompletionSignal = {
  agentId: 'agent-1', cli: 'claude', agentLabel: 'worker',
  status: 'stopped', startedAt: '2026-11-08T00:00:00.000Z',
  completedAt: '2026-11-08T00:00:01.000Z', durationMs: 1000,
  taskHeadline: 'do work', deliverables: [], verdict: 'unverified',
  reportsDelivered: 0, cliSessionId: 'real-cli-session',
};

describe('lane completion envelope budget stops', () => {
  it('tells the parent about a held warning when the lane ends', () => {
    const text = buildLaneCompletionEnvelope({ ...base, status: 'completed', heldBudgetWarning: true });
    expect(text).toContain('Budget warning: Ptah budget monitor asked this lane for a handoff, but the request had not reached the lane when it returned.');
    expect(text).not.toContain('next accounted turn');
  });

  it('omits the held warning once a budget stop is reported', () => {
    const text = buildLaneCompletionEnvelope({ ...base, stopReason: 'budget', heldBudgetWarning: true });
    expect(text).toContain('Stopped by Ptah (agent budget)');
    expect(text).not.toContain('passed its warning threshold');
  });

  it('keeps the envelope unchanged after a warning was delivered', () => {
    const text = buildLaneCompletionEnvelope({ ...base, status: 'completed' });
    expect(text).not.toContain('passed its warning threshold');
  });
  it.each(['budget', 'duration', 'telemetry-unavailable'] as const)(
    'explains %s and provides a bounded progress pointer', (stopReason) => {
      const text = buildLaneCompletionEnvelope({ ...base, stopReason,
        budgetLimit: '100 weighted tokens', progressPointer: 'ptah_agent_read agent_id=agent-1 tail=200' });
      expect(text).toContain(`stop-reason="${stopReason}"`);
      expect(text).toContain('Stopped by Ptah (agent budget), not by the caller');
      expect(text).toContain('limit: 100 weighted tokens');
      expect(text).toContain('CLI Session ID: real-cli-session');
      expect(text).toContain('Progress pointer: ptah_agent_read');
      expect(text).toContain('resume is refused');
      expect(text).not.toContain('pass it as resume_session_id');
      if (stopReason === 'budget') expect(text).toContain('Budget warning: finish current work');
    },
  );

  it('keeps the previous repeat-call envelope unchanged', () => {
    const envelope = buildLaneCompletionEnvelope({ ...base, stopReason: 'repeat-call', repeatedCalls: 3 });
    expect(buildLaneCompletionResult({
      signal: base, executorId: 'claude', phaseKind: null, parentSignal: envelope,
    }).parentSignal).toBe(envelope);
    expect(envelope)
       .toMatchSnapshot();
  });
  it('includes a concrete progress file and the true CLI session on budget stop', () => {
    const text = buildLaneCompletionEnvelope({ ...base, stopReason: 'budget', progressPointer: '/work/.ptah/progress.md' });
    expect(text).toContain('Progress pointer: /work/.ptah/progress.md');
    expect(text).toContain('CLI Session ID: real-cli-session');
  });
});

describe('lane completion envelope action notice', () => {
  const notice = { actor: 'ptah-budget', action: 'paused', reason: 'context-budget',
    nextStep: 'review-live-agent', measured: 120_000, limit: 100_000, unit: 'tokens' } as const;

  it('adds one Ptah notice context line for a lane that returned normally after a pause', () => {
    const plain = buildLaneCompletionEnvelope({ ...base, status: 'completed', verdict: 'delivered' });
    const text = buildLaneCompletionEnvelope({ ...base, status: 'completed', verdict: 'delivered', actionNotice: notice });
    const line = text.split('\n').filter((l) => l.startsWith('Ptah notice: '));
    expect(line).toEqual(['Ptah notice: Ptah budget monitor paused new work for agent-1 because context reached 120000 of 100000 tokens. The lane has since returned. A resume of this CLI session starts a fresh lane instead.']);
    expect(line[0]).not.toContain('remains live');
    expect(text.replace(`${line[0]}\n`, '')).toBe(plain);
    expect(text).not.toContain('the user');
    expect(text).toContain('pass it as resume_session_id');
  });

  it('tells the parent a repeat pause ended with the lane, with the trigger and actor', () => {
    const repeat = { actor: 'ptah-budget', action: 'paused', reason: 'repeat-call',
      nextStep: 'review-live-agent', measured: 7, limit: 6, unit: 'calls' } as const;
    const text = buildLaneCompletionEnvelope({ ...base, status: 'completed', actionNotice: repeat });
    expect(text).toContain('Ptah notice: Ptah budget monitor paused new work for agent-1 because the same tool call repeated 7 times in one turn. The lane has since returned. Review its report before you resume it.');
    expect(text).not.toContain('remains live');
  });

  it('reports an ask in the past tense', () => {
    const ask = { actor: 'ptah-watchdog', action: 'asked-handoff', reason: 'lane-inactive',
      nextStep: 'return-report' } as const;
    const text = buildLaneCompletionEnvelope({ ...base, status: 'completed', actionNotice: ask });
    expect(text).toContain('Ptah notice: Ptah watchdog asked agent-1 for a handoff because the configured lane output wait expired. The lane has since returned;');
  });

  it('keeps the envelope byte-identical without a notice', () => {
    const text = buildLaneCompletionEnvelope({ ...base, status: 'completed' });
    expect(text).not.toContain('Ptah notice:');
  });
});
