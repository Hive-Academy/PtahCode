import {
  formatAgentActionNotice,
  formatAgentActionReason,
  formatBudgetAskReadOnly,
  formatBudgetAskWritable,
  formatBudgetCeilingDeny,
  formatBudgetPauseNotice,
  formatBudgetReadOnlyCeilingDeny,
  formatExplicitUserStopContext,
  formatHandoffNormalReturn,
  formatHandoffNotesDelay,
  formatHandoffRecordFailure,
  formatPermissionExpired,
  formatPermissionTeardown,
  formatUnattachedLaneIdentity,
  type AgentActionNotice,
  type AgentActionReason,
} from './agent-action.types';

const notice = (reason: AgentActionReason, extra: Partial<AgentActionNotice> = {}): AgentActionNotice => ({
  actor: 'ptah-budget',
  action: 'asked-handoff',
  reason,
  nextStep: 'write-notes-and-return',
  ...extra,
});

describe('formatAgentActionReason', () => {
  it.each([
    [notice('context-budget', { measured: 127_500, limit: 150_000, unit: 'tokens' }), 'context reached 127500 of 150000 tokens'],
    [notice('weighted-budget', { measured: 5, limit: 10, unit: 'tokens' }), 'weighted lifetime usage reached 5 of 10 tokens'],
    [notice('raw-budget', { measured: 5, limit: 10, unit: 'tokens' }), 'raw lifetime usage reached 5 of 10 tokens'],
    [notice('duration', { measured: 5_400_000, unit: 'milliseconds' }), 'runtime reached 90 minutes'],
    [notice('runtime-cap', { measured: 7_200_000, unit: 'milliseconds' }), 'runtime reached 120 minutes'],
    [notice('telemetry-unavailable', { measured: 3, unit: 'turns' }), 'usage telemetry was unavailable for 3 consecutive turns'],
    [notice('repeat-call', { measured: 20, unit: 'calls' }), 'the same tool call repeated 20 times in one turn'],
    [notice('lane-inactive', { measured: 3_600_000, unit: 'milliseconds' }), 'the lane produced no output for 60 minutes'],
    [notice('lane-inactive'), 'the configured lane output wait expired'],
    [notice('succession-limit'), 'the succession allowance is exhausted'],
    [notice('successor-start-failed'), 'the successor could not start'],
  ])('renders the planned fragment %#', (input, expected) => {
    expect(formatAgentActionReason(input)).toBe(expected);
  });

  it('falls back to a number-free fragment when the measurement is missing or not finite', () => {
    expect(formatAgentActionReason(notice('context-budget'))).toBe('context reached its token limit');
    expect(formatAgentActionReason(notice('weighted-budget', { measured: Number.NaN }))).toBe('weighted lifetime usage reached its token limit');
    expect(formatAgentActionReason(notice('raw-budget', { measured: 7 }))).toBe('raw lifetime usage reached 7 tokens');
    expect(formatAgentActionReason(notice('duration'))).toBe('runtime reached its limit');
    expect(formatAgentActionReason(notice('telemetry-unavailable'))).toBe('usage telemetry was unavailable');
  });

  it('has a fragment for every reason', () => {
    const reasons: AgentActionReason[] = [
      'context-budget', 'weighted-budget', 'raw-budget', 'duration', 'telemetry-unavailable', 'notes-overdue',
      'handoff-record-unavailable', 'runtime-cap', 'succession-limit', 'successor-start-failed', 'session-budget',
      'handoff-complete', 'repeat-call', 'lane-inactive', 'tool-gate-unavailable', 'provider-no-response',
      'provider-input-closed', 'compaction-overdue', 'permission-cancelled', 'permission-timeout',
      'identity-unavailable', 'user-stop', 'host-shutdown',
    ];
    for (const reason of reasons) expect(formatAgentActionReason(notice(reason)).length).toBeGreaterThan(0);
  });
});

describe('message builders', () => {
  const context = notice('context-budget', { measured: 128_000, limit: 150_000, unit: 'tokens' });
  const because = 'context reached 128000 of 150000 tokens';

  it('formats the exact budget ask texts', () => {
    expect(formatBudgetAskWritable(context, '.ptah/notes/a.md')).toBe(
      `Ptah budget monitor asked for a handoff because ${because}. Finish the current step, write progress and remaining work to .ptah/notes/a.md, then return normally.`,
    );
    expect(formatBudgetAskReadOnly(context)).toBe(
      `Ptah budget monitor asked for a handoff because ${because}. Finish the current step and return your progress, findings, and remaining work in your final report.`,
    );
  });

  it('formats the exact ceiling deny and pause texts', () => {
    expect(formatBudgetCeilingDeny(context)).toBe(
      `Ptah budget monitor paused new work tools because ${because}. Use only the permitted handoff tools, then return normally.`,
    );
    expect(formatBudgetReadOnlyCeilingDeny(context)).toBe(
      `Ptah budget monitor paused new work tools because ${because}. You may use your permitted Read, Grep, and Glob tools and return your findings in your final report.`,
    );
    expect(formatBudgetPauseNotice(context, 'agent-1')).toBe(
      `Ptah budget monitor paused new work for agent-1 because ${because}. The execution remains live. Review its progress and decide how it should continue.`,
    );
  });

  it('formats the exact notes delay, return and record failure texts', () => {
    expect(formatHandoffNotesDelay('agent-1')).toBe(
      'Ptah budget monitor is still waiting for agent-1 to return its handoff after 10 minutes. The execution remains live. Review its progress.',
    );
    expect(formatHandoffNormalReturn('agent-1', 'the handoff record')).toBe(
      'agent-1 returned normally after a Ptah budget monitor handoff request. Continue from the handoff record.',
    );
    expect(formatHandoffRecordFailure('agent-1')).toBe(
      'Ptah could not save the handoff record for agent-1. Continue from its final report in the execution transcript.',
    );
  });

  it('formats the exact permission and stop texts', () => {
    expect(formatPermissionTeardown('Bash', notice('host-shutdown', { action: 'ended' }))).toBe(
      'Ptah host closed the permission request for Bash because the host is shutting down. Review the session state before retrying.',
    );
    expect(formatPermissionExpired('Bash')).toBe(
      'Ptah host denied Bash because its permission request expired. Request permission again if the tool is still needed.',
    );
    expect(formatUnattachedLaneIdentity('Bash')).toBe(
      'Ptah host denied Bash because the lane identity was unavailable before the permission deadline. Return a report if the tool remains unavailable.',
    );
    expect(formatExplicitUserStopContext()).toBe(
      'Ptah recorded an explicit user stop for the previous turn. Review the current state before repeating any interrupted work.',
    );
  });

  it('keeps every template plain ASCII', () => {
    const all = [
      formatBudgetAskWritable(context, 'n.md'), formatBudgetAskReadOnly(context), formatBudgetCeilingDeny(context),
      formatBudgetReadOnlyCeilingDeny(context), formatBudgetPauseNotice(context, 'a'), formatHandoffNotesDelay('a'),
      formatHandoffNormalReturn('a', 'p'), formatHandoffRecordFailure('a'), formatPermissionExpired('t'),
      formatUnattachedLaneIdentity('t'), formatExplicitUserStopContext(),
    ];
    for (const text of all) expect(text).toMatch(/^[\x20-\x7e]+$/);
  });
});

describe('formatAgentActionNotice', () => {
  const ask = notice('weighted-budget', { measured: 2_550_000, limit: 3_000_000, unit: 'tokens' });
  const pause = notice('weighted-budget', { action: 'paused', measured: 6_000_000, limit: 3_000_000, unit: 'tokens', nextStep: 'return-report' });

  it('selects the writable ask only when a notes path is available and the role may write', () => {
    expect(formatAgentActionNotice(ask, { notesPath: 'n.md' })).toBe(formatBudgetAskWritable(ask, 'n.md'));
    expect(formatAgentActionNotice(ask)).toBe(formatBudgetAskReadOnly(ask));
    expect(formatAgentActionNotice(ask, { notesPath: 'n.md', readOnly: true })).toBe(formatBudgetAskReadOnly(ask));
  });

  it('selects the pause copy by audience and role', () => {
    expect(formatAgentActionNotice(pause)).toBe(formatBudgetCeilingDeny(pause));
    expect(formatAgentActionNotice(pause, { readOnly: true })).toBe(formatBudgetReadOnlyCeilingDeny(pause));
    expect(formatAgentActionNotice(pause, { audience: 'parent', id: 'agent-1' })).toBe(formatBudgetPauseNotice(pause, 'agent-1'));
  });

  it('routes lifecycle reasons to their own templates', () => {
    expect(formatAgentActionNotice(notice('notes-overdue'), { id: 'a' })).toBe(formatHandoffNotesDelay('a'));
    expect(formatAgentActionNotice(notice('handoff-record-unavailable', { action: 'ended' }), { id: 'a' })).toBe(formatHandoffRecordFailure('a'));
    expect(formatAgentActionNotice(notice('handoff-complete', { action: 'ended' }), { id: 'a', pointer: 'p' })).toBe(formatHandoffNormalReturn('a', 'p'));
    expect(formatAgentActionNotice(notice('permission-timeout', { action: 'ended' }), { tool: 'Bash' })).toBe(formatPermissionExpired('Bash'));
    expect(formatAgentActionNotice(notice('identity-unavailable', { action: 'ended' }), { tool: 'Bash' })).toBe(formatUnattachedLaneIdentity('Bash'));
    expect(formatAgentActionNotice(notice('permission-cancelled', { action: 'ended' }), { tool: 'Bash' })).toBe(
      formatPermissionTeardown('Bash', notice('permission-cancelled', { action: 'ended' })),
    );
    expect(formatAgentActionNotice(notice('user-stop', { actor: 'user', action: 'ended' }))).toBe(formatExplicitUserStopContext());
  });

  it('uses neutral fallbacks for missing context values', () => {
    expect(formatAgentActionNotice(notice('notes-overdue'))).toContain('waiting for the agent to return');
    expect(formatAgentActionNotice(notice('permission-timeout', { action: 'ended' }))).toContain('denied the tool because');
  });
});
