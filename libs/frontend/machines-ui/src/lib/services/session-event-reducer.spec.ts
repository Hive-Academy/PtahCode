import type { MachinesEventPayload } from '@ptah-extension/shared';
import { REMOTE_PERMISSION_TIMEOUT_BY } from '../utils/remote-session-copy';
import {
  MAX_HELD_EVENTS,
  initialSessionEventState,
  isCaughtUp,
  reduceSessionEvent,
  type SessionEventAction,
  type SessionEventState,
  type SessionEventStep,
} from './session-event-reducer';
import {
  HISTORY_MESSAGE,
  SESSION_ID,
  baseline,
  chunk,
  messageStart,
  permissionPayload,
  referenceLog,
  sessionEvent,
  textDelta,
} from './testing/machines-fixtures';

function attachedLog(
  fromSeq = 1,
  headSeq = 0,
  epoch = 'e1',
): SessionEventState {
  const started = reduceSessionEvent(initialSessionEventState(SESSION_ID), {
    kind: 'attach-started',
  }).state;
  return reduceSessionEvent(started, {
    kind: 'attach-succeeded',
    result: { mode: 'log', epoch, fromSeq, headSeq },
  }).state;
}

function run(
  state: SessionEventState,
  actions: readonly SessionEventAction[],
): { state: SessionEventState; steps: SessionEventStep[] } {
  const steps: SessionEventStep[] = [];
  let current = state;
  for (const action of actions) {
    const step = reduceSessionEvent(current, action);
    steps.push(step);
    current = step.state;
  }
  return { state: current, steps };
}

const events = (list: readonly MachinesEventPayload[]): SessionEventAction[] =>
  list.map((event) => ({ kind: 'event', event }));

describe('reduceSessionEvent', () => {
  it('applies a contiguous log', () => {
    const { state } = run(attachedLog(), events(referenceLog()));
    expect(state.last).toBe(10);
    expect(state.turnId).toBeNull();
    expect(state.pendingPermissions).toEqual([]);
    expect(isCaughtUp(state)).toBe(true);
  });

  it('drops duplicates by seq', () => {
    const log = referenceLog();
    const clean = run(attachedLog(), events(log)).state;
    const doubled = run(
      attachedLog(),
      events([...log.slice(0, 6), ...log.slice(2, 8), ...log, ...log.slice(8)]),
    ).state;
    expect(doubled).toEqual(clean);
  });

  it('holds events past a gap, asks for one replay from last, then drains', () => {
    const log = referenceLog();
    const { state, steps } = run(
      attachedLog(),
      events([log[0], log[1], log[4], log[5]]),
    );
    expect(state.last).toBe(2);
    expect(state.held.map((held) => held.seq)).toEqual([5, 6]);
    expect(state.recovery).toBe('requested');
    expect(steps.filter((step) => step.replay !== null)).toEqual([
      expect.objectContaining({ replay: { afterSeq: 2 } }),
    ]);

    const filled = run(state, [
      {
        kind: 'attach-succeeded',
        result: { mode: 'log', epoch: 'e1', fromSeq: 3, headSeq: 6 },
      },
      ...events([log[2], log[3]]),
    ]).state;
    expect(filled.last).toBe(6);
    expect(filled.held).toEqual([]);
    expect(filled.recovery).toBe('none');
  });

  it('a replay failure lets the next gap ask again', () => {
    const log = referenceLog();
    const { state } = run(attachedLog(), [
      ...events([log[0], log[3]]),
      { kind: 'replay-failed' },
    ]);
    expect(state.recovery).toBe('none');
    const again = reduceSessionEvent(state, { kind: 'event', event: log[4] });
    expect(again.replay).toEqual({ afterSeq: 1 });
  });

  it('a baseline applies past a gap and replaces the transcript', () => {
    const state = run(attachedLog(), [
      ...events([chunk(1, messageStart('x', 'old', 'stream'))]),
      ...events([baseline(5, HISTORY_MESSAGE)]),
    ]).state;
    expect(state.last).toBe(5);
    expect(state.events).toEqual(HISTORY_MESSAGE);
  });

  it('resets the cursor and transcript on a new epoch', () => {
    const before = run(attachedLog(), events(referenceLog())).state;
    const step = reduceSessionEvent(before, {
      kind: 'event',
      event: chunk(3, textDelta('n', 'msg-9', 'new', 'stream'), 'e2'),
    });
    expect(step.state.epoch).toBe('e2');
    expect(step.state.last).toBe(0);
    expect(step.state.events).toEqual([]);
    expect(step.replay).toEqual({ afterSeq: 0 });

    const fresh = run(before, events(referenceLog('e2'))).state;
    expect(fresh).toEqual({
      ...run(attachedLog(1, 0, 'e2'), events(referenceLog('e2'))).state,
    });
  });

  it('an attach of a new epoch resets the cursor to fromSeq - 1', () => {
    const before = run(attachedLog(), events(referenceLog())).state;
    const state = run(before, [
      { kind: 'attach-started' },
      {
        kind: 'attach-succeeded',
        result: { mode: 'log', epoch: 'e2', fromSeq: 4, headSeq: 7 },
      },
    ]).state;
    expect(state.epoch).toBe('e2');
    expect(state.last).toBe(3);
    expect(state.target).toBe(7);
    expect(state.events).toEqual([]);
  });

  it('holds events that arrive before the attach answers', () => {
    const log = referenceLog();
    const started = reduceSessionEvent(initialSessionEventState(SESSION_ID), {
      kind: 'attach-started',
    }).state;
    const { state } = run(started, [
      ...events([log[1], log[0]]),
      {
        kind: 'attach-succeeded',
        result: { mode: 'log', epoch: 'e1', fromSeq: 1, headSeq: 2 },
      },
    ]);
    expect(state.last).toBe(2);
    expect(state.held).toEqual([]);
  });

  it('bounds the held events', () => {
    let state = run(attachedLog(), events([referenceLog()[0]])).state;
    for (let seq = 3; seq < MAX_HELD_EVENTS + 10; seq += 1) {
      state = reduceSessionEvent(state, {
        kind: 'event',
        event: sessionEvent(seq, 'session:stats', {}),
      }).state;
    }
    expect(state.held).toHaveLength(MAX_HELD_EVENTS);
  });

  it('a snapshot is watch-only and ignores events until the next attach', () => {
    const state = run(initialSessionEventState(SESSION_ID), [
      { kind: 'attach-started' },
      {
        kind: 'attach-succeeded',
        result: {
          mode: 'snapshot',
          events: HISTORY_MESSAGE,
          live: false,
          drivenBy: 'Horus keyboard',
        },
      },
      ...events(referenceLog().slice(1)),
      { kind: 'connected', force: true },
    ]);
    expect(state.state.mode).toBe('snapshot');
    expect(state.state.drivenBy).toBe('Horus keyboard');
    expect(state.state.events).toEqual(HISTORY_MESSAGE);
    expect(state.steps.every((step) => step.replay === null)).toBe(true);
  });

  it('connected asks for a replay only when behind, or when forced', () => {
    const log = referenceLog();
    const caughtUp = run(attachedLog(), events(log)).state;
    expect(
      reduceSessionEvent(caughtUp, { kind: 'connected', force: false }).replay,
    ).toBeNull();
    expect(
      reduceSessionEvent(caughtUp, { kind: 'connected', force: true }).replay,
    ).toEqual({ afterSeq: 10 });

    const behind = run(attachedLog(1, 10), events(log.slice(0, 4))).state;
    expect(
      reduceSessionEvent(behind, { kind: 'connected', force: false }).replay,
    ).toEqual({ afterSeq: 4 });
  });

  it('a failed attach stops holding events and keeps the cached transcript', () => {
    const cached = run(attachedLog(), events(referenceLog())).state;
    const state = run(cached, [
      { kind: 'attach-started' },
      { kind: 'attach-failed' },
      ...events([sessionEvent(11, 'session:stats', {})]),
    ]).state;
    expect(state.mode).toBe('detached');
    expect(state.held).toEqual([]);
    expect(state.events).toEqual(cached.events);
  });

  it('tracks the turn in flight and pending permission requests', () => {
    const log = referenceLog();
    const midTurn = run(attachedLog(), events(log.slice(0, 7))).state;
    expect(midTurn.turnId).toBe('t1');
    expect(midTurn.pendingPermissions.map((request) => request.id)).toEqual([
      'p1',
    ]);
  });
  it('keeps a request the worker denied on timeout until the next turn', () => {
    const log = referenceLog();
    const request = sessionEvent(7, 'permission:request', permissionPayload());
    const timedOut = run(attachedLog(), [
      ...events(log.slice(0, 6)),
      ...events([
        request,
        sessionEvent(8, 'worker:permission.answered', {
          requestId: 'p1',
          decision: 'deny',
          by: REMOTE_PERMISSION_TIMEOUT_BY,
        }),
      ]),
    ]).state;
    expect(timedOut.pendingPermissions).toEqual([]);
    expect(timedOut.timedOutPermissions.map((r) => r.id)).toEqual(['p1']);

    const nextTurn = run(timedOut, [
      ...events([sessionEvent(9, 'worker:turn.begin', { turnId: 't2' })]),
    ]).state;
    expect(nextTurn.timedOutPermissions).toEqual([]);
  });

  it('an answer by someone else is not a timeout', () => {
    const answered = run(attachedLog(), events(referenceLog().slice(0, 8)))
      .state;
    expect(answered.pendingPermissions).toEqual([]);
    expect(answered.timedOutPermissions).toEqual([]);
  });
});

describe('reduceSessionEvent: permission request boundary', () => {
  const requestAt = (payload: Record<string, unknown>) =>
    run(attachedLog(), [
      ...events([sessionEvent(1, 'permission:request', payload)]),
    ]).state.pendingPermissions;

  it('builds the full request and drops fields it does not know', () => {
    expect(
      requestAt(permissionPayload({ toolUseId: 'tu1', extra: 'ignored' })),
    ).toEqual([
      {
        id: 'p1',
        toolName: 'Bash',
        toolInput: { command: 'ls' },
        timestamp: 1_700_000_000_000,
        description: 'Run ls',
        timeoutAt: 1_700_000_060_000,
        toolUseId: 'tu1',
      },
    ]);
  });

  it.each([
    ['timestamp missing', { timestamp: undefined }],
    ['timestamp not a number', { timestamp: '1700000000000' }],
    ['timeoutAt missing', { timeoutAt: undefined }],
    ['timeoutAt not finite', { timeoutAt: Number.POSITIVE_INFINITY }],
    ['timeoutAt negative', { timeoutAt: -1 }],
    ['description missing', { description: undefined }],
    ['id empty', { id: '' }],
    ['toolInput an array', { toolInput: ['ls'] }],
  ])('rejects a malformed request: %s', (_label, overrides) => {
    expect(requestAt(permissionPayload(overrides))).toEqual([]);
  });

  it('strips control and bidi characters from shown fields, not from the id', () => {
    const [request] = requestAt(
      permissionPayload({
        id: 'p\u200B1',
        toolName: 'Ba\u202Esh',
        description: 'Run\u0007 ls',
        toolInput: { 'com\u2066mand': 'rm\u202E -rf /\u0000' },
      }),
    );
    expect(request.id).toBe('p\u200B1');
    expect(request.toolName).toBe('Bash');
    expect(request.description).toBe('Run ls');
    expect(request.toolInput).toEqual({ command: 'rm -rf /' });
  });
});

describe('reduceSessionEvent: transcript display boundary (S6)', () => {
  // eslint-disable-next-line no-control-regex -- the spec asserts these are gone.
  const UNSAFE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/;

  it('removes bidi overrides from streamed text and keeps line breaks', () => {
    const { state } = run(attachedLog(), [
      ...events([
        chunk(1, messageStart('s', 'msg-9', 'stream')),
        chunk(2, textDelta('t', 'msg-9', 'invoice\u202Etxt.exe\nnext\u2067', 'stream')),
      ]),
    ]);
    const text = state.events[1];
    expect(text.eventType === 'text_delta' && text.delta).toBe(
      'invoicetxt.exe\nnext',
    );
  });

  it('keeps raw HTML as text for the sanitising renderer, without hidden characters', () => {
    const { state } = run(attachedLog(), [
      ...events([
        chunk(
          1,
          textDelta('t', 'msg-9', '<img src=x onerror=alert(1)>\u200B', 'stream'),
        ),
      ]),
    ]);
    const text = state.events[0];
    expect(text.eventType === 'text_delta' && text.delta).toBe(
      '<img src=x onerror=alert(1)>',
    );
  });

  it('cleans every string of a tool result, nested output included', () => {
    const { state } = run(attachedLog(), [
      ...events([
        chunk(1, {
          id: 'r',
          eventType: 'tool_result',
          timestamp: 1,
          messageId: 'msg-9',
          toolCallId: 'tc\u00001',
          output: { stdout: 'ok\u001B[31m red\u0007', lines: ['a\u202Eb'] },
          isError: false,
          source: 'stream',
        }),
      ]),
    ]);
    const result = state.events[0];
    expect(JSON.stringify(result)).not.toMatch(UNSAFE);
    expect(result.eventType === 'tool_result' && result.output).toEqual({
      stdout: 'ok[31m red',
      lines: ['ab'],
    });
  });

  it('applies the same boundary to a baseline and a snapshot', () => {
    const hostile = textDelta('h', 'msg-9', 'a\u202Eb', 'history');
    const fromBaseline = run(attachedLog(), [
      ...events([baseline(1, [hostile])]),
    ]).state.events;
    const fromSnapshot = reduceSessionEvent(
      initialSessionEventState(SESSION_ID),
      {
        kind: 'attach-succeeded',
        result: { mode: 'snapshot', events: [hostile], live: false },
      },
    ).state.events;
    for (const list of [fromBaseline, fromSnapshot]) {
      expect(list[0].eventType === 'text_delta' && list[0].delta).toBe('ab');
    }
  });
});
