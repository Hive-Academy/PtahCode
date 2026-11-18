import { handoffMessage, stopNotice, type HandoffUsage } from './subagent-handoff-message';

const subject = { agentType: 'Explore', taskId: 'task-1' };
const base: HandoffUsage = {
  reason: 'handoff', contextTokens: 150_000, weightedUsed: 150_000,
  handoffTokens: 150_000, stopWeightedTokens: 3_000_000, warnRatio: 0.85,
};

describe('subagent stop threshold messages', () => {
  it.each([
    { name: 'warning threshold (85%', usage: { ...base, contextTokens: 127_500 } },
    { name: 'handoff threshold (100%', usage: base },
    { name: 'safety policy', usage: { ...base, reason: 'safety' as const, weightedUsed: 3_000_000 } },
    { name: 'warning threshold (80%', usage: { ...base, contextTokens: 120_000, warnRatio: 0.8 } },
  ])('names the $name in the stop notice and parent handoff', ({ name, usage }) => {
    const texts = [stopNotice(subject, usage), handoffMessage(subject, usage, undefined, {
      taskSaved: false, notesWritten: false, unavailable: true,
    })];
    for (const text of texts) {
      expect(text).toContain(name);
      expect(text).not.toContain('2x handoff');
      if (usage.contextTokens < usage.handoffTokens) {
        expect(text).not.toContain('handoff threshold (100%');
      }
    }
  });
});
