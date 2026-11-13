import { resolve } from 'node:path';
import {
  SESSION_CHILD_HANDOFF_FILE,
  renderRuntimeCapWarning,
  renderSuccessorTask,
  runtimeWarnDelayMs,
  routeSessionEndCause,
  sessionChildHandoffPath,
  successionEndReason,
} from './session-child-succession';

describe('session child succession helpers', () => {
  it('resolves a handoff in the task folder or worktree', () => {
    const worktreePath = resolve('/worktree');
    expect(sessionChildHandoffPath({ worktreePath })).toBe(resolve(worktreePath, SESSION_CHILD_HANDOFF_FILE));
    expect(sessionChildHandoffPath({ worktreePath, taskFolder: resolve(worktreePath, 'task') }))
      .toBe(resolve(worktreePath, 'task', SESSION_CHILD_HANDOFF_FILE));
    expect(sessionChildHandoffPath({ worktreePath, taskFolder: 'task' }))
      .toBe(resolve(worktreePath, 'task', SESSION_CHILD_HANDOFF_FILE));
  });

  it('calculates a nonnegative warning delay', () => {
    expect(runtimeWarnDelayMs({ maxRuntimeMinutes: 120, runtimeWarnLeadMinutes: 10 })).toBe(110 * 60_000);
    expect(runtimeWarnDelayMs({ maxRuntimeMinutes: 5, runtimeWarnLeadMinutes: 10 })).toBe(0);
  });

  it('tells a child exactly how to hand off at the cap', () => {
    const text = renderRuntimeCapWarning({ minutesLeft: 10, graceMinutes: 15, handoffPath: '/worktree/HANDOFF.md' });
    for (const part of ['10 minutes', 'not interrupted now', 'do not start a new one',
      'Commit verified work', 'leave other work uncommitted', '/worktree/HANDOFF.md',
      'running lanes', 'agent ids', 'verification state', 'open decisions',
      'ptah_session_handoff', 'same worktree and branch', '15 minutes after the cap']) {
      expect(text).toContain(part);
    }
  });

  const base = {
    predecessorId: 'child-a',
    cause: 'child-handoff' as const,
    originalTask: 'Fix the parser',
    handoffPath: '/worktree/HANDOFF.md',
    handoffExists: true,
    adoptedLanes: ['lane-1'],
    prompt: 'Continue parsing',
  };

  it('renders a child handoff with a file, prompt and adopted lanes', () => {
    const text = renderSuccessorTask(base);
    expect(text.startsWith('You continue the work of child session child-a (child handoff)')).toBe(true);
    for (const part of ['same', 'uncommitted work', 'Never revert, restore, stash or clean',
      'Read /worktree/HANDOFF.md first', 'lane-1', 'completion signals now arrive in this session',
      'Do not call ptah_session_handoff_ack', 'Continuation prompt from the previous session:',
      'Continue parsing', 'Original task:', 'Fix the parser']) expect(text).toContain(part);
  });

  it('renders host-driven succession without a handoff', () => {
    const text = renderSuccessorTask({ ...base, cause: 'runtime-cap', handoffExists: false,
      adoptedLanes: [], prompt: undefined });
    expect(text).toContain('runtime cap');
    expect(text).toContain('No handoff file exists: inspect git status, git diff and the task folder');
    expect(text).toContain('There are no adopted lanes');
    expect(text).not.toContain('Continuation prompt from the previous session:');
  });

  it('warns that an interrupted turn may need a command repeated', () => {
    const text = renderSuccessorTask({ ...base, cause: 'runtime-cap-interrupted' });
    expect(text).toContain('interrupted mid-step');
    expect(text).toContain('last command may need to run again');
  });

  it('marks an existing handoff file as possibly stale only for a host-started successor', () => {
    const stale = 'can be older than the latest work';
    const done = 'already complete, say so in one short turn and stop';
    expect(renderSuccessorTask(base)).not.toContain(stale);
    expect(renderSuccessorTask(base)).not.toContain(done);
    const hostStarted = renderSuccessorTask({ ...base, cause: 'runtime-cap-interrupted' });
    expect(hostStarted).toContain(stale);
    expect(hostStarted).toContain(done);
    const ended = renderSuccessorTask({ ...base, cause: 'session-ended', handoffExists: false });
    expect(ended).not.toContain(stale);
    expect(ended).toContain(done);
  });

  it.each(['child-handoff', 'runtime-cap', 'runtime-cap-interrupted'] as const)(
    'records the successor and cause for %s', (cause) => {
      expect(successionEndReason('child-b', cause)).toContain('handed off to child session child-b');
      expect(successionEndReason('child-b', cause)).toContain('work continues in the same worktree');
    },
  );

  it.each([
    'user-stop',
    'tab-close',
    'internal-abort',
    'parent-stop',
    'workspace-close',
    'host-shutdown',
  ])(
    'keeps %s as a stop', (cause) => expect(routeSessionEndCause(cause)).toBe('stop'),
  );
  it.each(['stream-exit', 'provider-error', 'config-reinit', 'compaction-abort', 'unknown'])(
    'routes %s to succession', (cause) => expect(routeSessionEndCause(cause)).toBe('succeed'),
  );
  it('renders unexpected session end recovery', () => {
    expect(renderSuccessorTask({ ...base, cause: 'session-ended', endCause: 'provider-error',
      handoffExists: false })).toContain('previous session ended unexpectedly (provider-error)');
  });
});
