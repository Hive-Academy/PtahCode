import { initialAgentBudgetSnapshot } from '@ptah-extension/shared';
import { describeStopCause, independentSafetyCause, type SubagentStopCauseKind } from './subagent-stop-cause';
import { handoffMessage, nearBudgetWarning, stopNotice, type HandoffUsage } from './subagent-handoff-message';

const settings = { warnRatio: 0.85, handoffContextTokens: 150_000, stopWeightedTokens: 3_000_000, maxDurationMin: 90 };
const subject = { agentType: 'reviewer', agentId: 'agent', taskId: 'task' };
const files = { taskSaved: false, notesWritten: false, notesInferred: false, unavailable: false };

describe('independent stop evidence and messages', () => {
  it('keeps real duration, raw and weighted safety independent of context handoff', () => {
    expect(independentSafetyCause(initialAgentBudgetSnapshot, 90 * 60_000, settings)).toMatchObject({ kind: 'duration', measured: 5_400_000, limit: 5_400_000 });
    expect(independentSafetyCause({ ...initialAgentBudgetSnapshot, rawTokens: 3_000_000 }, 0, settings)).toMatchObject({ kind: 'raw-budget', measured: 3_000_000 });
    expect(independentSafetyCause({ ...initialAgentBudgetSnapshot, weightedTokens: 3_000_000 }, 0, settings)).toMatchObject({ kind: 'weighted-budget', measured: 3_000_000 });
    expect(independentSafetyCause(initialAgentBudgetSnapshot, 0, settings)).toBeUndefined();
  });

  it.each<SubagentStopCauseKind>(['warning-notes-complete', 'warning-turn-ended', 'notes-timeout', 'context-handoff', 'context-ceiling', 'weighted-budget', 'raw-budget', 'duration', 'telemetry-unavailable'])('uses the same %s evidence in the user notice and durable handoff', (kind) => {
    const cause = { kind, quantity: 'milliseconds' as const, measured: 600_000, limit: 600_000, forced: kind !== 'warning-turn-ended' };
    const usage: HandoffUsage = { reason: kind.startsWith('warning') || kind === 'notes-timeout' ? 'handoff' : 'safety',
      contextTokens: 129_970, weightedUsed: 1_000, handoffTokens: 150_000, stopWeightedTokens: 3_000_000, cause };
    const evidence = describeStopCause(cause);
    for (const message of [stopNotice(subject, usage), handoffMessage(subject, usage, undefined, files)]) {
      expect(message).toContain(evidence);
      expect(message).not.toContain('weighted tokens reached');
    }
    expect(handoffMessage(subject, usage, undefined, files)).toContain(`Budget stop reason: ${usage.reason}`);
  });

  it('retains legacy messages when no additive evidence exists', () => {
    expect(stopNotice(subject, { reason: 'safety', contextTokens: 1, weightedUsed: 3_000_000, handoffTokens: 150_000, stopWeightedTokens: 3_000_000 })).toContain('weighted tokens reached the safety limit');
  });

  it('names every explicit permitted path and requests writing before ending the turn', () => {
    const warning = nearBudgetWarning(130_000, 150_000, '/ws/notes.md', 'task', ['/ws/notes.md', '/ws/worktree/review.md']);
    expect(warning).toContain('/ws/notes.md, /ws/worktree/review.md');
    expect(warning).toContain('Your turn ends immediately after the notes write');
    expect(warning).toContain('Read, Write or Edit these paths');
    expect(warning).toContain('Deliverables are optional');
    expect(warning).not.toContain('End your turn now');
  });
});


it('prints only the first twenty permitted paths in warning and handoff messages', () => {
  const paths = Array.from({ length: 25 }, (_, i) => `/ws/file-${i}.md`);
  const warning = nearBudgetWarning(130_000, 150_000, '/ws/notes.md', 'task', paths);
  const handoff = handoffMessage(subject, { reason: 'handoff', contextTokens: 130_000, weightedUsed: 130_000, handoffTokens: 150_000, stopWeightedTokens: 3_000_000 }, undefined, files, undefined,
    { permittedPaths: paths, filePaths: paths, toolCalls: [] });
  for (const text of [warning, handoff]) {
    expect(text).toContain('/ws/file-19.md, and 5 more');
    expect(text).not.toContain('/ws/file-20.md');
  }
});
