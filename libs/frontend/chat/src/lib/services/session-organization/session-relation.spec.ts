import {
  SessionRelationFocus,
  describeSessionRelation,
  isRelatedSession,
  shortenParentLabel,
  type SessionRelationRow,
} from './session-relation';

const row = (
  sessionId: string,
  parentSessionId: string | null,
  running = false,
  label: string | null = sessionId,
): SessionRelationRow => ({ sessionId, label, parentSessionId, running });

describe('describeSessionRelation', () => {
  const rows = [
    row('p', null, false, 'coordinator'),
    row('c1', 'p', true),
    row('c2', 'p', false),
    row('succ', null, true),
  ];

  it('marks a child with its parent label', () => {
    expect(describeSessionRelation('c1', 'p', rows).childOf).toBe(
      'coordinator',
    );
  });

  it('counts live and finished children of a parent', () => {
    expect(describeSessionRelation('p', null, rows)).toEqual({
      childOf: null,
      childCount: 2,
      childRunning: 1,
    });
  });

  it('falls back to "agent session" when the parent is unknown', () => {
    expect(describeSessionRelation('c9', 'gone', rows).childOf).toBe(
      'agent session',
    );
  });

  it('does not mark a handoff successor (no parent link) as a child', () => {
    expect(describeSessionRelation('succ', null, rows).childOf).toBeNull();
  });
});

describe('shortenParentLabel', () => {
  it('truncates a long label and falls back on an empty one', () => {
    expect(shortenParentLabel('x'.repeat(50)).length).toBe(32);
    expect(shortenParentLabel('  ')).toBe('agent session');
  });
});

describe('isRelatedSession', () => {
  it('relates parent and child both ways, never a session to itself', () => {
    expect(isRelatedSession('p', null, 'c', 'p')).toBe(true);
    expect(isRelatedSession('c', 'p', 'p', null)).toBe(true);
    expect(isRelatedSession('p', null, 'p', null)).toBe(false);
    expect(isRelatedSession('a', null, 'b', null)).toBe(false);
  });
});

describe('SessionRelationFocus', () => {
  it('clears only for the focused id', () => {
    const focus = new SessionRelationFocus();
    focus.set('a', null);
    focus.clear('b');
    expect(focus.focused()?.id).toBe('a');
    focus.clear('a');
    expect(focus.focused()).toBeNull();
  });
});
