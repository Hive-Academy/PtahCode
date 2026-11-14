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
    expect(text).toContain('Budget warning: this lane passed its warning threshold; its next accounted turn stops it.');
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
      expect(text).toContain('Stopped by Ptah (agent budget), not by the user');
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
