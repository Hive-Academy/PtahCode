import { TestBed } from '@angular/core/testing';
import { RpcResult } from '@ptah-extension/core';
import {
  MESSAGE_TYPES,
  type MachineSummary,
  type MachinesEventPayload,
  type MachinesSessionAttachResult,
  type MachinesStatePayload,
  type RpcUserErrorCode,
} from '@ptah-extension/shared';
import { MachinesApi } from './machines-api';
import { MachinesFeed } from './machines-feed';
import { MachinesStore, type RemoteSessionView } from './machines-store';
import { toTranscriptEvents } from './transcript-events';
import {
  HISTORY_MESSAGE,
  LIVE_MESSAGE,
  MACHINE_ID,
  SESSION_ID,
  baseline,
  chunk,
  referenceLog,
} from './testing/machines-fixtures';

const HORUS: MachineSummary = {
  machineId: MACHINE_ID,
  alias: 'horus',
  displayName: 'Horus',
  state: 'connected',
  lastSeenAt: 100,
};

const ok = <T>(data: T): RpcResult<T> => new RpcResult(true, data);
const fail = <T>(error: string, code?: RpcUserErrorCode): RpcResult<T> =>
  new RpcResult<T>(false, undefined, error, code);

const logAttach = (
  fromSeq: number,
  headSeq: number,
  epoch = 'e1',
): RpcResult<MachinesSessionAttachResult> =>
  ok({ mode: 'log', epoch, fromSeq, headSeq });

/** Let pending promise callbacks (RPC answers) run. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function setup() {
  TestBed.resetTestingModule();
  const api = {
    list: jest.fn().mockResolvedValue(ok({ machines: [HORUS] })),
    workspaces: jest
      .fn()
      .mockResolvedValue(
        ok({
          workspaces: [{ workspaceId: 'w1', name: 'app', path: '/srv/app' }],
        }),
      ),
    sessions: jest.fn().mockResolvedValue(
      ok({
        sessions: [
          {
            sessionId: SESSION_ID,
            title: 'Fix bug',
            state: 'running',
            updatedAt: 1,
            provider: 'claude',
            logged: true,
          },
        ],
      }),
    ),
    attach: jest.fn().mockResolvedValue(logAttach(1, 0)),
    replay: jest.fn().mockResolvedValue(fail('no replay expected')),
    detach: jest.fn().mockResolvedValue(ok({ detached: true })),
    continue: jest.fn().mockResolvedValue(ok({ turnId: 't2' })),
    stop: jest.fn().mockResolvedValue(ok({ stopped: true })),
    respondPermission: jest.fn().mockResolvedValue(ok({ applied: true })),
  };
  TestBed.configureTestingModule({
    providers: [{ provide: MachinesApi, useValue: api }],
  });
  const store = TestBed.inject(MachinesStore);
  const feed = TestBed.inject(MachinesFeed);
  const push = (event: MachinesEventPayload): void =>
    feed.handleMessage({ type: MESSAGE_TYPES.MACHINES_EVENT, payload: event });
  const pushAll = (events: readonly MachinesEventPayload[]): void =>
    events.forEach(push);
  const pushState = (state: Omit<MachinesStatePayload, 'machineId'>): void =>
    feed.handleMessage({
      type: MESSAGE_TYPES.MACHINES_STATE,
      payload: { machineId: MACHINE_ID, ...state },
    });
  const view = (): RemoteSessionView | null =>
    store.sessionView(MACHINE_ID, SESSION_ID)();
  return { api, store, push, pushAll, pushState, view };
}

async function openedSession() {
  const ctx = setup();
  await ctx.store.loadMachines();
  await ctx.store.openSession(MACHINE_ID, SESSION_ID);
  return ctx;
}

/** The view a client that never disconnected ends with. */
async function referenceView(): Promise<RemoteSessionView | null> {
  const { pushAll, view } = await openedSession();
  pushAll(referenceLog());
  return view();
}

describe('MachinesStore', () => {
  it('4.2: duplicates and a gap across a reconnect render equal to no disconnect', async () => {
    const expected = await referenceView();
    const log = referenceLog();
    const { api, push, pushAll, pushState, view } = await openedSession();

    pushAll(log.slice(0, 5)); // seq 1..5
    pushState({ state: 'offline', nextRetryAt: 500 });
    // seq 6 and 7 are lost while the link is down.
    pushState({ state: 'reconnecting' });
    pushState({ state: 'connected', lastSeenAt: 600 });
    // Electron main re-attached from its own older cursor (3): duplicates.
    pushAll(log.slice(3, 7)); // seq 4..7
    // A live event overtakes seq 8: a gap.
    api.replay.mockResolvedValueOnce(logAttach(8, 9));
    push(log[8]); // seq 9
    expect(view()?.catchingUp).toBe(true);
    expect(api.replay).toHaveBeenCalledWith(MACHINE_ID, SESSION_ID, 7);
    await flush();
    pushAll([log[7], log[8], log[9]]); // seq 8, 9 again, 10

    expect(expected?.last).toBe(10);
    expect(view()).toEqual(expected);
    expect(view()?.catchingUp).toBe(false);
  });

  it('4.2: a failed re-attach in main makes the store replay from its cursor', async () => {
    const expected = await referenceView();
    const log = referenceLog();
    const { api, pushAll, pushState, view } = await openedSession();
    api.replay.mockResolvedValue(logAttach(6, 10));

    pushAll(log.slice(0, 5));
    pushState({ state: 'offline' });
    pushState({ state: 'connected', reason: 'session-reattach-failed' });
    expect(api.replay).toHaveBeenCalledWith(MACHINE_ID, SESSION_ID, 5);
    await flush();
    pushAll(log.slice(3)); // seq 4..10, 4 and 5 duplicates

    expect(view()).toEqual(expected);
  });

  it('re-attaches a session opened while offline once the machine reconnects', async () => {
    const { api, store, pushState, view } = setup();
    await store.loadMachines();
    pushState({ state: 'offline' });
    api.attach.mockResolvedValueOnce(fail('Horus is offline'));
    await store.openSession(MACHINE_ID, SESSION_ID);
    expect(view()?.error?.message).toBe('Horus is offline');
    await expect(
      store.sendPrompt(MACHINE_ID, SESSION_ID, 'hi'),
    ).resolves.toEqual({ ok: false, refused: 'not-open' });

    pushState({ state: 'connected' });
    expect(api.attach).toHaveBeenCalledTimes(2);
    await flush();
    expect(view()?.error).toBeNull();
    await expect(
      store.sendPrompt(MACHINE_ID, SESSION_ID, 'hi'),
    ).resolves.toEqual({ ok: true, value: undefined });
  });

  it('a failed attach while connected does not attach again until a reconnect', async () => {
    const { api, store, pushState } = setup();
    await store.loadMachines();
    pushState({ state: 'offline' });
    api.attach.mockResolvedValue(fail('refused'));
    await store.openSession(MACHINE_ID, SESSION_ID);
    pushState({ state: 'connected' });
    await flush();
    expect(api.attach).toHaveBeenCalledTimes(2);

    // Still detached while connected: further pushes start no attach.
    pushState({ state: 'connected', lastSeenAt: 700 });
    pushState({ state: 'connected', reason: 'session-reattach-failed' });
    await flush();
    expect(api.attach).toHaveBeenCalledTimes(2);
    expect(api.replay).not.toHaveBeenCalled();

    // The next reconnect tries once more.
    pushState({ state: 'offline' });
    pushState({ state: 'connected' });
    await flush();
    expect(api.attach).toHaveBeenCalledTimes(3);
  });

  it('A5: history and live events of the same message are idempotent', async () => {
    const { pushAll, view } = await openedSession();
    pushAll([
      baseline(1, HISTORY_MESSAGE),
      ...LIVE_MESSAGE.map((event, index) => chunk(index + 2, event)),
    ]);
    expect(view()?.last).toBe(LIVE_MESSAGE.length + 1);
    expect(view()?.events).toEqual(toTranscriptEvents(HISTORY_MESSAGE));
  });

  it('a new epoch resets the session cursor and replays from 0', async () => {
    const { api, pushAll, view } = await openedSession();
    api.replay.mockResolvedValue(logAttach(1, 4, 'e2'));
    pushAll(referenceLog());
    pushAll([referenceLog('e2')[3]]); // seq 4 of e2
    expect(view()?.epoch).toBe('e2');
    expect(view()?.events).toEqual([]);
    expect(api.replay).toHaveBeenCalledWith(MACHINE_ID, SESSION_ID, 0);
    await flush();
    pushAll(referenceLog('e2').slice(0, 3));
    expect(view()?.last).toBe(4);
  });

  it('a machine going offline never marks its sessions failed', async () => {
    const { api, store, pushAll, pushState, view } = await openedSession();
    await store.loadWorkspaces(MACHINE_ID);
    await store.loadSessions(MACHINE_ID, 'w1');
    pushAll(referenceLog().slice(0, 7)); // mid-turn, permission pending
    const before = view();

    pushState({ state: 'offline', nextRetryAt: 900 });

    const after = view();
    expect(after?.stale).toBe(true);
    expect(after?.machineState).toBe('offline');
    expect(after?.turnId).toBe('t1');
    expect(after?.events).toBe(before?.events);
    expect(after?.pendingPermissions).toEqual(before?.pendingPermissions);
    expect(store.sessionsByWorkspace(MACHINE_ID)()[0].sessions[0].state).toBe(
      'running',
    );
    expect(store.machine(MACHINE_ID)()).toMatchObject({
      state: 'offline',
      nextRetryAt: 900,
      lastSeenAt: 100,
    });
    expect(store.pendingApprovalCount()).toBe(1);
    expect(api.replay).not.toHaveBeenCalled();
    await expect(
      store.sendPrompt(MACHINE_ID, SESSION_ID, 'hi'),
    ).resolves.toEqual({ ok: false, refused: 'not-connected' });
  });

  it('a waiting approval carries the answer mode of its session', async () => {
    const { api, store, pushAll } = await openedSession();
    pushAll(referenceLog().slice(0, 7)); // mid-turn, permission pending
    const waiting = () =>
      store.pendingApprovalRequestsByMachine().get(MACHINE_ID) ?? [];

    expect(waiting()).toHaveLength(1);
    expect(waiting()[0]).toMatchObject({
      sessionId: SESSION_ID,
      mode: 'answerable',
    });

    // The lock check failed: the request is from a cached view now.
    api.continue.mockResolvedValue(
      fail('Lock unavailable', 'SESSION_DRIVER_LOCK_UNAVAILABLE'),
    );
    await store.sendPrompt(MACHINE_ID, SESSION_ID, 'hi');
    expect(waiting()).toHaveLength(1);
    expect(waiting()[0].mode).toBe('cached');
    await expect(
      store.respondPermission(
        MACHINE_ID,
        SESSION_ID,
        waiting()[0].request.id,
        'allow',
      ),
    ).resolves.toEqual({ ok: false, refused: 'watch-only' });
    expect(api.respondPermission).not.toHaveBeenCalled();
  });

  it('keeps the machine state reason from the push', async () => {
    const { store, pushState } = setup();
    await store.loadMachines();
    pushState({ state: 'unpaired', reason: 'worker-identity-changed' });
    expect(store.machine(MACHINE_ID)()?.reason).toBe('worker-identity-changed');
    pushState({ state: 'connected' });
    expect(store.machine(MACHINE_ID)()?.reason).toBeUndefined();
  });

  describe('watch-only (design 4.9, Q1 (a))', () => {
    it('a snapshot attach shows the saved transcript and refuses every action', async () => {
      const ctx = setup();
      ctx.api.attach.mockResolvedValue(
        ok({
          mode: 'snapshot',
          events: HISTORY_MESSAGE,
          live: false,
          drivenBy: 'Horus keyboard',
        }),
      );
      await ctx.store.loadMachines();
      await ctx.store.openSession(MACHINE_ID, SESSION_ID);
      ctx.pushAll(referenceLog());

      expect(ctx.view()).toMatchObject({
        mode: 'snapshot',
        watchOnly: true,
        drivenBy: 'Horus keyboard',
        events: toTranscriptEvents(HISTORY_MESSAGE),
      });
      const refused = { ok: false, refused: 'watch-only' };
      await expect(
        ctx.store.sendPrompt(MACHINE_ID, SESSION_ID, 'hi'),
      ).resolves.toEqual(refused);
      await expect(
        ctx.store.stopSession(MACHINE_ID, SESSION_ID),
      ).resolves.toEqual(refused);
      await expect(
        ctx.store.respondPermission(MACHINE_ID, SESSION_ID, 'p1', 'allow'),
      ).resolves.toEqual(refused);
      expect(ctx.api.continue).not.toHaveBeenCalled();
      expect(ctx.api.stop).not.toHaveBeenCalled();
      expect(ctx.api.respondPermission).not.toHaveBeenCalled();
    });

    it('a send refused with SESSION_DRIVEN_ELSEWHERE re-attaches to show the holder', async () => {
      const ctx = await openedSession();
      ctx.api.continue.mockResolvedValue(
        fail('Driven elsewhere', 'SESSION_DRIVEN_ELSEWHERE'),
      );
      ctx.api.attach.mockResolvedValue(
        ok({ mode: 'snapshot', events: [], live: false, drivenBy: 'CLI' }),
      );
      const outcome = await ctx.store.sendPrompt(MACHINE_ID, SESSION_ID, 'hi');
      await flush();
      expect(outcome).toMatchObject({
        ok: false,
        error: { code: 'SESSION_DRIVEN_ELSEWHERE' },
      });
      expect(ctx.api.attach).toHaveBeenCalledTimes(2);
      expect(ctx.view()).toMatchObject({ watchOnly: true, drivenBy: 'CLI' });
    });

    it('a lock check failure is watch-only and keeps the cached transcript', async () => {
      const ctx = await openedSession();
      ctx.pushAll(referenceLog());
      const cached = ctx.view()?.events;
      ctx.api.attach.mockResolvedValue(
        fail('lock', 'SESSION_DRIVER_LOCK_UNAVAILABLE'),
      );
      await ctx.store.openSession(MACHINE_ID, SESSION_ID);
      expect(ctx.view()).toMatchObject({
        lockUnavailable: true,
        watchOnly: true,
        drivenBy: null,
      });
      expect(ctx.view()?.events).toBe(cached);

      // Refresh succeeds: the session is available again.
      ctx.api.attach.mockResolvedValue(logAttach(1, 10));
      await ctx.store.openSession(MACHINE_ID, SESSION_ID);
      expect(ctx.view()).toMatchObject({
        lockUnavailable: false,
        watchOnly: false,
      });
    });
  });

  it('sends, stops and answers permissions on a live session', async () => {
    const { api, store } = await openedSession();
    await expect(
      store.sendPrompt(MACHINE_ID, SESSION_ID, 'hi'),
    ).resolves.toEqual({
      ok: true,
      value: undefined,
    });
    await store.stopSession(MACHINE_ID, SESSION_ID);
    await store.respondPermission(MACHINE_ID, SESSION_ID, 'p1', 'deny');
    expect(api.continue).toHaveBeenCalledWith(MACHINE_ID, SESSION_ID, 'hi');
    expect(api.stop).toHaveBeenCalledWith(MACHINE_ID, SESSION_ID);
    expect(api.respondPermission).toHaveBeenCalledWith({
      machineId: MACHINE_ID,
      sessionId: SESSION_ID,
      requestId: 'p1',
      decision: 'deny',
    });
  });

  it('ignores an attach answer superseded by a newer one', async () => {
    const ctx = setup();
    await ctx.store.loadMachines();
    let answerFirst: (
      value: RpcResult<MachinesSessionAttachResult>,
    ) => void = () => undefined;
    ctx.api.attach.mockReturnValueOnce(
      new Promise((resolve) => {
        answerFirst = resolve;
      }),
    );
    const first = ctx.store.openSession(MACHINE_ID, SESSION_ID);
    ctx.api.attach.mockResolvedValueOnce(
      ok({ mode: 'snapshot', events: [], live: false }),
    );
    await ctx.store.openSession(MACHINE_ID, SESSION_ID);
    answerFirst(logAttach(1, 0));
    await first;
    expect(ctx.view()?.mode).toBe('snapshot');
  });

  it('closing a session detaches and drops its events', async () => {
    const { api, store, push, view } = await openedSession();
    await store.closeSession(MACHINE_ID, SESSION_ID);
    push(referenceLog()[0]);
    expect(view()).toBeNull();
    expect(api.detach).toHaveBeenCalledWith(MACHINE_ID, SESSION_ID);
  });
});
