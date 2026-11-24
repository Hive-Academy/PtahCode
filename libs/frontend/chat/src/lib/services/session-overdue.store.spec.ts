import { TestBed } from '@angular/core/testing';
import type { SessionActivityOverduePayload } from '@ptah-extension/shared';
import { MAX_OVERDUE_SESSIONS, SessionOverdueStore } from './session-overdue.store';

function payload(
  overrides: Partial<SessionActivityOverduePayload> = {},
): SessionActivityOverduePayload {
  return {
    sessionId: 'session-1',
    tabId: 'tab-1',
    overdue: true,
    operations: ['Bash'],
    text: 'Ptah: this session has shown no activity for 10 minutes.',
    ...overrides,
  };
}

describe('SessionOverdueStore', () => {
  let store: SessionOverdueStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = TestBed.inject(SessionOverdueStore);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('returns null when nothing is overdue', () => {
    expect(store.noticeFor('session-1', 'tab-1')).toBeNull();
  });

  it('matches an overdue session by session id', () => {
    store.apply(payload());
    expect(store.noticeFor('session-1', null)?.text).toContain('no activity');
  });

  it('matches by tab id when the view has no session id yet', () => {
    store.apply(payload());
    expect(store.noticeFor(null, 'tab-1')?.sessionId).toBe('session-1');
    expect(store.noticeFor(null, 'tab-2')).toBeNull();
  });

  it('keeps one entry for repeated overdue reports and shows the latest text', () => {
    store.apply(payload({ text: 'first' }));
    store.apply(payload({ text: 'second' }));
    expect(store.noticeFor('session-1', null)?.text).toBe('second');
  });

  it('clears the session on overdue:false', () => {
    store.apply(payload());
    store.apply(payload({ overdue: false }));
    expect(store.noticeFor('session-1', 'tab-1')).toBeNull();
  });

  it('clears an entry shown under another session id when the tab matches', () => {
    store.apply(payload({ sessionId: 'tab-1-placeholder' }));
    store.apply(payload({ sessionId: 'real-session', overdue: false }));
    expect(store.noticeFor(null, 'tab-1')).toBeNull();
  });

  it('keeps an entry of another tab on a clear', () => {
    store.apply(payload({ sessionId: 'a', tabId: 'tab-a' }));
    store.apply(payload({ sessionId: 'b', tabId: 'tab-b', overdue: false }));
    expect(store.noticeFor('a', 'tab-a')).not.toBeNull();
  });

  it('ignores a clear for an unknown session', () => {
    store.apply(payload({ sessionId: 'other', overdue: false }));
    expect(store.noticeFor('other', null)).toBeNull();
  });

  it(`keeps at most ${MAX_OVERDUE_SESSIONS} sessions, dropping the oldest`, () => {
    for (let i = 0; i <= MAX_OVERDUE_SESSIONS; i++) {
      store.apply(payload({ sessionId: `s-${i}`, tabId: undefined }));
    }
    expect(store.noticeFor('s-0', null)).toBeNull();
    expect(store.noticeFor('s-1', null)).not.toBeNull();
    expect(store.noticeFor(`s-${MAX_OVERDUE_SESSIONS}`, null)).not.toBeNull();
  });
});
