import 'reflect-metadata';
import type {
  ProviderSession,
  ProviderSessionEvent,
  ProviderSessionOpenRequest,
} from '@ptah-extension/provider-session-contracts';
import type { ProviderSessionProfileId } from '@ptah-extension/shared';
import {
  PROVIDER_SESSION_CLOSE_TIMEOUT_MS,
  PROVIDER_SESSION_HISTORY_TIMEOUT_MS,
  PROVIDER_SESSION_IDLE_CLOSE_MS,
  PROVIDER_SESSION_SWEEP_INTERVAL_MS,
  ProviderSessionHistoryError,
  ProviderSessionPool,
  type ProviderSessionPoolOpenContext,
  type ProviderSessionPoolRequest,
} from './provider-session-pool';

const PROFILE = 'grok' as ProviderSessionProfileId;

interface FakeSession extends ProviderSession {
  running: boolean;
  pid: number | undefined;
  close: jest.Mock<Promise<void>, []>;
}

function fakeSession(id: string, replay: ProviderSessionEvent[] = []): FakeSession {
  const session = {
    nativeSessionId: id,
    processGeneration: 1,
    restoredContext: replay.length > 0,
    replay,
    running: false,
    pid: undefined as number | undefined,
    capabilities: () => ({
      steer: false,
      interrupt: true,
      setModel: true,
      setMode: true,
      images: false,
      resume: true,
      load: true,
      modes: [],
    }),
    listModels: async () => [],
    events: async function* () {
      yield* [];
    },
    prompt: async () => ({ turnId: 't' }),
    interrupt: async () => true,
    setModel: async () => ({}) as never,
    setEffort: async () => ({}) as never,
    setPermission: async () => ({}) as never,
    isTurnRunning: () => session.running,
    getPid: () => session.pid,
    close: jest.fn(async () => undefined),
  };
  return session as FakeSession;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let nextPid = 100;

/** The pool's per-open credential subject of a session id (`<id>#<n>`). */
const subjectOf = (sessionId: string) => expect.stringMatching(new RegExp(`^${sessionId}#[0-9]+$`));

function harness(options: { load?: boolean } = {}) {
  const opened: { request: ProviderSessionOpenRequest; signal?: AbortSignal }[] = [];
  const sessions: FakeSession[] = [];
  /** Set to hold the next open until the spec settles it. */
  const pending: Deferred<FakeSession>[] = [];
  const open = jest.fn(async (request: ProviderSessionOpenRequest, signal?: AbortSignal) => {
    opened.push({ request, signal });
    const gate = pending.shift();
    if (gate) return gate.promise;
    const session = fakeSession(request.attach?.nativeSessionId ?? `native-${opened.length}`);
    session.pid = nextPid++;
    sessions.push(session);
    return session;
  });
  const credentials = {
    issue: jest.fn((_binding: unknown, subject: string) => `token-${subject}`),
    revokeSubject: jest.fn(),
  };
  const pidLedger = { record: jest.fn(), remove: jest.fn() };
  const logger = { debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const pool = new ProviderSessionPool({
    runtimeFor: (profile) =>
      profile === PROFILE ? { runtime: { open }, load: options.load ?? true } : undefined,
    credentials,
    pidLedger,
    logger: logger as never,
  });
  const contexts: ProviderSessionPoolOpenContext[] = [];
  const request = (nativeSessionId?: string): ProviderSessionPoolRequest => ({
    profile: PROFILE,
    workspaceRoot: 'D:/work',
    ...(nativeSessionId ? { nativeSessionId } : {}),
    build: (context) => {
      contexts.push(context);
      return { attach: context.attach } as ProviderSessionOpenRequest;
    },
  });
  return { pool, open, opened, sessions, pending, credentials, pidLedger, logger, request, contexts };
}

const replayEvents = (sessionId: string): ProviderSessionEvent[] => [
  { contextId: 'c', processGeneration: 1, sessionId, turnId: `${sessionId}:replay:1`, sequence: 1, replayed: true, type: 'userText', itemId: 'u1', text: 'hello' },
  { contextId: 'c', processGeneration: 1, sessionId, turnId: `${sessionId}:replay:1`, sequence: 2, replayed: true, type: 'textDelta', itemId: 'a1', delta: 'OK' },
];

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('ProviderSessionPool acquire', () => {
  it('opens once, reuses the live entry, mints the Codex-shaped credential and records the pid', async () => {
    const h = harness();
    const first = await h.pool.acquire('s1', h.request());
    const again = await h.pool.acquire('s1', h.request());

    expect(again).toBe(first);
    expect(h.open).toHaveBeenCalledTimes(1);
    expect(h.contexts[0]).toEqual({ mcpToken: 'token-s1#1', attach: undefined });
    expect(h.credentials.issue).toHaveBeenCalledWith(
      { kind: 'session', sessionId: 's1', workspaceRoot: 'D:/work', capability: 'privileged' },
      subjectOf('s1'),
      7 * 24 * 60 * 60 * 1000,
    );
    expect(h.pidLedger.record).toHaveBeenCalledTimes(1);
    expect(h.pidLedger.record).toHaveBeenCalledWith({
      pid: h.sessions[0].pid,
      profile: PROFILE,
      startedAt: expect.any(Number),
    });
    await h.pool.dispose();
  });

  it('holds a session only while it is the live entry of its id', async () => {
    const h = harness();
    const session = await h.pool.acquire('s1', h.request());
    expect(h.pool.holds('s1', session)).toBe(true);
    expect(h.pool.holds('other', session)).toBe(false);
    await h.pool.release('s1', 'tab-closed');
    expect(h.pool.holds('s1', session)).toBe(false);
    await h.pool.dispose();
  });

  it('attaches a stored native id with resume and onFailure error', async () => {
    const h = harness();
    await h.pool.acquire('s1', h.request('native-old'));
    expect(h.contexts[0].attach).toEqual({
      nativeSessionId: 'native-old',
      method: 'resume',
      onFailure: 'error',
    });
    await h.pool.dispose();
  });

  it('serialises concurrent acquires of one id into one open', async () => {
    const h = harness();
    const gate = deferred<FakeSession>();
    h.pending.push(gate);
    const a = h.pool.acquire('s1', h.request());
    const b = h.pool.acquire('s1', h.request());
    await jest.advanceTimersByTimeAsync(0);
    expect(h.open).toHaveBeenCalledTimes(1);
    const session = fakeSession('n');
    gate.resolve(session);
    await expect(a).resolves.toBe(session);
    await expect(b).resolves.toBe(session);
    expect(h.open).toHaveBeenCalledTimes(1);
    await h.pool.dispose();
  });

  it('refuses an unbound profile as unavailable', async () => {
    const h = harness();
    await expect(
      h.pool.acquire('s1', { ...h.request(), profile: 'other' as ProviderSessionProfileId }),
    ).rejects.toMatchObject({ code: 'unavailable' });
    expect(h.open).not.toHaveBeenCalled();
  });

  it('releases the mutex and leaves no entry when the open fails, and revokes the credential', async () => {
    const h = harness();
    const gate = deferred<FakeSession>();
    h.pending.push(gate);
    const failed = h.pool.acquire('s1', h.request());
    await jest.advanceTimersByTimeAsync(0);
    gate.reject(new Error('spawn failed'));
    await expect(failed).rejects.toThrow('spawn failed');
    expect(h.credentials.revokeSubject).toHaveBeenCalledWith(subjectOf('s1'));
    expect(h.pidLedger.record).not.toHaveBeenCalled();

    const session = await h.pool.acquire('s1', h.request());
    expect(session).toBe(h.sessions[0]);
    expect(h.open).toHaveBeenCalledTimes(2);
    await h.pool.dispose();
  });
});

describe('ProviderSessionPool cap', () => {
  it('evicts the least recently used idle entry on overflow', async () => {
    const h = harness();
    await h.pool.acquire('a', h.request());
    await h.pool.acquire('b', h.request());
    await h.pool.acquire('c', h.request());
    await h.pool.acquire('a', h.request()); // touch: b is now the LRU

    await h.pool.acquire('d', h.request());
    const [a, b, c] = h.sessions;
    expect(b.close).toHaveBeenCalledTimes(1);
    expect(a.close).not.toHaveBeenCalled();
    expect(c.close).not.toHaveBeenCalled();
    expect(h.credentials.revokeSubject).toHaveBeenCalledWith(subjectOf('b'));
    expect(h.pidLedger.remove).toHaveBeenCalledWith(b.pid);
    await h.pool.dispose();
  });

  it('skips a busy LRU entry and refuses with limit when every entry is busy', async () => {
    const h = harness();
    await h.pool.acquire('a', h.request());
    await h.pool.acquire('b', h.request());
    await h.pool.acquire('c', h.request());
    h.sessions[0].running = true;
    await h.pool.acquire('d', h.request());
    expect(h.sessions[0].close).not.toHaveBeenCalled();
    expect(h.sessions[1].close).toHaveBeenCalledTimes(1);

    for (const session of h.sessions) session.running = true;
    await expect(h.pool.acquire('e', h.request())).rejects.toMatchObject({
      name: 'ProviderSessionChatAdapterError',
      code: 'limit',
    });
    expect(h.open).toHaveBeenCalledTimes(4);
    for (const session of h.sessions) session.running = false;
    await h.pool.dispose();
  });
});

describe('ProviderSessionPool idle close', () => {
  it('closes an entry idle for 10 minutes on the 60 s sweep and keeps a running one', async () => {
    const h = harness();
    await h.pool.acquire('idle', h.request());
    await h.pool.acquire('busy', h.request());
    h.sessions[1].running = true;

    await jest.advanceTimersByTimeAsync(PROVIDER_SESSION_IDLE_CLOSE_MS - PROVIDER_SESSION_SWEEP_INTERVAL_MS);
    expect(h.sessions[0].close).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(PROVIDER_SESSION_SWEEP_INTERVAL_MS);
    expect(h.sessions[0].close).toHaveBeenCalledTimes(1);
    expect(h.sessions[1].close).not.toHaveBeenCalled();
    expect(h.credentials.revokeSubject).toHaveBeenCalledWith(subjectOf('idle'));
    expect(jest.getTimerCount()).toBe(1);

    // The next send re-opens by native id.
    await h.pool.acquire('idle', h.request('native-1'));
    expect(h.open).toHaveBeenCalledTimes(3);
    h.sessions[1].running = false;
    await h.pool.dispose();
  });

  it('each turn acquire resets the idle clock (S-2)', async () => {
    const h = harness();
    await h.pool.acquire('chat', h.request());
    await jest.advanceTimersByTimeAsync(PROVIDER_SESSION_IDLE_CLOSE_MS - PROVIDER_SESSION_SWEEP_INTERVAL_MS);
    // The adapter acquires through the pool before every turn.
    await h.pool.acquire('chat', h.request());
    await jest.advanceTimersByTimeAsync(2 * PROVIDER_SESSION_SWEEP_INTERVAL_MS);
    expect(h.sessions[0].close).not.toHaveBeenCalled();
    expect(h.open).toHaveBeenCalledTimes(1);
    await h.pool.dispose();
  });

  it('a slow idle close revokes only its own credential, never the reopened one (S-3)', async () => {
    const h = harness();
    await h.pool.acquire('idle', h.request());
    const closing = deferred<void>();
    h.sessions[0].close.mockReturnValue(closing.promise);
    await jest.advanceTimersByTimeAsync(PROVIDER_SESSION_IDLE_CLOSE_MS);
    expect(h.sessions[0].close).toHaveBeenCalledTimes(1);

    // A send arrives while the old process is still closing.
    await h.pool.acquire('idle', h.request('native-1'));
    const [oldSubject, newSubject] = h.credentials.issue.mock.calls.map(([, subject]) => subject);
    expect(newSubject).not.toBe(oldSubject);
    closing.resolve();
    await jest.advanceTimersByTimeAsync(0);
    expect(h.credentials.revokeSubject).toHaveBeenCalledWith(oldSubject);
    expect(h.credentials.revokeSubject).not.toHaveBeenCalledWith(newSubject);
    await h.pool.dispose();
    expect(h.credentials.revokeSubject).toHaveBeenCalledWith(newSubject);
  });

  it('runs one sweep timer per pool and releases it when the pool empties or disposes', async () => {
    const h = harness();
    await h.pool.acquire('a', h.request());
    await h.pool.acquire('b', h.request());
    expect(jest.getTimerCount()).toBe(1);
    await h.pool.release('a', 'tab-closed');
    expect(jest.getTimerCount()).toBe(1);
    await h.pool.dispose();
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('ProviderSessionPool history', () => {
  it('opens with load, projects the replay and adopts the session for the next send', async () => {
    const h = harness();
    const replayed = fakeSession('native-old', replayEvents('native-old'));
    const gate = deferred<FakeSession>();
    h.pending.push(gate);
    gate.resolve(replayed);

    const history = await h.pool.acquireForHistory('s1', h.request('native-old'));
    expect(h.contexts[0].attach).toEqual({
      nativeSessionId: 'native-old',
      method: 'load',
      onFailure: 'error',
    });
    expect(history.events.length).toBeGreaterThan(0);
    expect(history.events.every((event) => event.source === 'history')).toBe(true);
    expect(history.events.map((event) => event.eventType)).toContain('text_delta');

    await expect(h.pool.acquire('s1', h.request('native-old'))).resolves.toBe(replayed);
    // A second read of a load-opened entry returns the stored replay without a spawn.
    const again = await h.pool.acquireForHistory('s1', h.request('native-old'));
    expect(again.events.length).toBe(history.events.length);
    expect(h.open).toHaveBeenCalledTimes(1);
    await h.pool.dispose();
  });

  it('reopens an adopted history entry whose open options differ, revoking only the old credential', async () => {
    const h = harness();
    const keyed = (key: string): ProviderSessionPoolRequest => ({
      ...h.request('native-old'),
      openOptionsKey: key,
    });
    await h.pool.acquireForHistory('s1', keyed('ptah-only'));
    const loaded = h.sessions[0];
    const oldSubject = h.credentials.issue.mock.calls[0]?.[1];

    const sent = await h.pool.acquire('s1', keyed('ptah+user-servers'));

    expect(sent).not.toBe(loaded);
    expect(loaded.close).toHaveBeenCalledTimes(1);
    expect(h.contexts[1].attach).toEqual({
      nativeSessionId: 'native-old',
      method: 'resume',
      onFailure: 'error',
    });
    const newSubject = h.credentials.issue.mock.calls[1]?.[1];
    expect(h.credentials.revokeSubject).toHaveBeenCalledWith(oldSubject);
    expect(h.credentials.revokeSubject).not.toHaveBeenCalledWith(newSubject);
    // Same options again: the reopened process is reused.
    await expect(h.pool.acquire('s1', keyed('ptah+user-servers'))).resolves.toBe(sent);
    expect(h.open).toHaveBeenCalledTimes(2);
    await h.pool.dispose();
  });

  it('keeps an adopted entry when the options match, a turn runs, or no native id can resume', async () => {
    const h = harness();
    const keyed = (key: string, native?: string): ProviderSessionPoolRequest => ({
      ...h.request(native),
      openOptionsKey: key,
    });
    await h.pool.acquireForHistory('s1', keyed('k', 'native-old'));
    const loaded = h.sessions[0];
    await expect(h.pool.acquire('s1', keyed('k', 'native-old'))).resolves.toBe(loaded);
    loaded.running = true;
    await expect(h.pool.acquire('s1', keyed('other', 'native-old'))).resolves.toBe(loaded);
    loaded.running = false;
    await expect(h.pool.acquire('s1', keyed('other'))).resolves.toBe(loaded);
    expect(h.open).toHaveBeenCalledTimes(1);
    await h.pool.dispose();
  });

  it('returns history-unavailable without load support or a native id, without an open', async () => {
    const h = harness({ load: false });
    await expect(h.pool.acquireForHistory('s1', h.request('native-old'))).rejects.toEqual(
      new ProviderSessionHistoryError('history-unavailable'),
    );
    const g = harness();
    await expect(g.pool.acquireForHistory('s1', g.request())).rejects.toMatchObject({
      reason: 'history-unavailable',
    });
    expect(h.open).not.toHaveBeenCalled();
    expect(g.open).not.toHaveBeenCalled();
  });

  it('refuses a read while a turn runs on a resume-opened entry', async () => {
    const h = harness();
    await h.pool.acquire('s1', h.request('native-old'));
    h.sessions[0].running = true;
    await expect(h.pool.acquireForHistory('s1', h.request('native-old'))).rejects.toMatchObject({
      reason: 'busy',
    });
    expect(h.sessions[0].close).not.toHaveBeenCalled();
    h.sessions[0].running = false;
    await h.pool.dispose();
  });

  it('closes an idle resume-opened entry and reopens it with load', async () => {
    const h = harness();
    await h.pool.acquire('s1', h.request('native-old'));
    const history = await h.pool.acquireForHistory('s1', h.request('native-old'));
    expect(history.events).toEqual([]);
    expect(h.sessions[0].close).toHaveBeenCalledTimes(1);
    expect(h.contexts[1].attach?.method).toBe('load');
    expect(h.credentials.revokeSubject).toHaveBeenCalledTimes(1);
    expect(h.credentials.issue).toHaveBeenCalledTimes(2);
    await expect(h.pool.acquire('s1', h.request('native-old'))).resolves.toBe(h.sessions[1]);
    await h.pool.dispose();
  });

  it('times out after 90 s, aborts the open and closes the late process', async () => {
    const h = harness();
    const gate = deferred<FakeSession>();
    h.pending.push(gate);
    const read = h.pool.acquireForHistory('s1', h.request('native-old'));
    const assertion = expect(read).rejects.toMatchObject({ reason: 'timeout' });
    await jest.advanceTimersByTimeAsync(PROVIDER_SESSION_HISTORY_TIMEOUT_MS);
    await assertion;
    expect(h.opened[0].signal?.aborted).toBe(true);
    expect(h.credentials.revokeSubject).toHaveBeenCalledWith(subjectOf('s1'));

    const late = fakeSession('native-old');
    gate.resolve(late);
    await jest.advanceTimersByTimeAsync(0);
    expect(late.close).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('ProviderSessionPool close paths', () => {
  it.each(['tab-closed', 'session-ended', 'broken', 'reset', 'deleted', 'crashed'] as const)(
    'release(%s) closes, removes the pid and revokes the credential',
    async (reason) => {
      const h = harness();
      await h.pool.acquire('s1', h.request());
      await h.pool.release('s1', reason);
      expect(h.sessions[0].close).toHaveBeenCalledTimes(1);
      expect(h.pidLedger.remove).toHaveBeenCalledWith(h.sessions[0].pid);
      expect(h.credentials.revokeSubject).toHaveBeenCalledWith(subjectOf('s1'));
      await h.pool.release('s1', reason);
      expect(h.sessions[0].close).toHaveBeenCalledTimes(1);
    },
  );

  it('releaseAll closes every entry and keeps the pool usable', async () => {
    const h = harness();
    await h.pool.acquire('a', h.request());
    await h.pool.acquire('b', h.request());
    await h.pool.releaseAll();
    expect(h.credentials.revokeSubject.mock.calls.map(([id]) => id.split('#')[0]).sort()).toEqual(['a', 'b']);
    await h.pool.acquire('a', h.request());
    expect(h.open).toHaveBeenCalledTimes(3);
    await h.pool.dispose();
  });

  it('dispose bounds a hung close at 5 s, still revokes, and refuses later acquires', async () => {
    const h = harness();
    await h.pool.acquire('hung', h.request());
    await h.pool.acquire('broken', h.request());
    h.sessions[0].close.mockReturnValue(new Promise(() => undefined));
    h.sessions[1].close.mockRejectedValue(new Error('close failed'));

    const disposing = h.pool.dispose();
    await jest.advanceTimersByTimeAsync(PROVIDER_SESSION_CLOSE_TIMEOUT_MS);
    await disposing;
    expect(h.credentials.revokeSubject).toHaveBeenCalledWith(subjectOf('hung'));
    expect(h.credentials.revokeSubject).toHaveBeenCalledWith(subjectOf('broken'));
    expect(h.logger.error).toHaveBeenCalledWith('Provider-session close failed.', expect.any(Error));
    // Neither exit is confirmed: both rows stay for the next start's sweep (S1).
    expect(h.pidLedger.remove).not.toHaveBeenCalled();
    expect(h.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('stays in the ledger'),
      expect.objectContaining({ reason: 'shutdown' }),
    );
    expect(jest.getTimerCount()).toBe(0);

    await expect(h.pool.acquire('x', h.request())).rejects.toMatchObject({ code: 'unavailable' });
    await expect(h.pool.acquireForHistory('x', h.request('n'))).rejects.toMatchObject({
      reason: 'history-unavailable',
    });
  });

  it('opens without a token when the credential port throws', async () => {
    const h = harness();
    h.credentials.issue.mockImplementation(() => {
      throw new Error('registry down');
    });
    await h.pool.acquire('s1', h.request());
    expect(h.contexts[0].mcpToken).toBeUndefined();
    expect(h.logger.warn).toHaveBeenCalled();
    await h.pool.dispose();
  });
});

describe('ProviderSessionPool pid ledger', () => {
  it('replaces the recorded pid when the session respawned its process', async () => {
    const h = harness();
    await h.pool.acquire('s1', h.request());
    const first = h.sessions[0].pid;
    h.sessions[0].pid = 999;
    await h.pool.acquire('s1', h.request());
    expect(h.pidLedger.remove).toHaveBeenCalledWith(first);
    expect(h.pidLedger.record).toHaveBeenLastCalledWith(expect.objectContaining({ pid: 999 }));
    await h.pool.release('s1', 'tab-closed');
    expect(h.pidLedger.remove).toHaveBeenLastCalledWith(999);
  });
});

describe('ProviderSessionPool pid ledger with spawn reports (S1, S3)', () => {
  /** A runtime that reports its spawn first, then holds the open until the spec settles it. */
  function spawningHarness() {
    const h = harness();
    const exits: Deferred<void>[] = [];
    const gates: Deferred<FakeSession>[] = [];
    h.open.mockImplementation(async (request: ProviderSessionOpenRequest, signal?: AbortSignal) => {
      h.opened.push({ request, signal });
      const exit = deferred<void>();
      exits.push(exit);
      const pid = nextPid++;
      request.onSpawn?.({ pid, exited: exit.promise });
      const gate = deferred<FakeSession>();
      gates.push(gate);
      signal?.addEventListener('abort', () => {
        // The runtime stops the process on abort; its exit follows.
        exit.resolve();
        gate.reject(new Error('cancelled'));
      });
      const session = await gate.promise;
      session.pid = pid;
      h.sessions.push(session);
      return session;
    });
    return { ...h, exits, gates };
  }

  it('records the pid at spawn, before the open resolves', async () => {
    const h = spawningHarness();
    const acquiring = h.pool.acquire('s1', h.request());
    await jest.advanceTimersByTimeAsync(0);
    expect(h.pidLedger.record).toHaveBeenCalledTimes(1);
    const pid = h.pidLedger.record.mock.calls[0][0].pid;
    // Spawn-time rows qualify for the orphan sweep's start-time window.
    expect(h.pidLedger.record.mock.calls[0][0].atSpawn).toBe(true);
    h.gates[0].resolve(fakeSession('native-1'));
    await acquiring;
    // The open does not record the same process again.
    expect(h.pidLedger.record).toHaveBeenCalledTimes(1);
    await h.pool.acquire('s1', h.request());
    expect(h.pidLedger.record).toHaveBeenCalledTimes(1);
    expect(h.pidLedger.record).toHaveBeenCalledWith(expect.objectContaining({ pid }));
    const releasing = h.pool.release('s1', 'tab-closed');
    h.exits[0].resolve();
    await releasing;
  });

  it('keeps the row through a close that times out and removes it when the exit is observed', async () => {
    const h = spawningHarness();
    const acquiring = h.pool.acquire('s1', h.request());
    await jest.advanceTimersByTimeAsync(0);
    h.gates[0].resolve(fakeSession('native-1'));
    const session = await acquiring;
    const pid = h.pidLedger.record.mock.calls[0][0].pid;
    (session.close as jest.Mock).mockReturnValue(new Promise(() => undefined));
    const releasing = h.pool.release('s1', 'tab-closed');
    await jest.advanceTimersByTimeAsync(PROVIDER_SESSION_CLOSE_TIMEOUT_MS);
    await releasing;
    expect(h.pidLedger.remove).not.toHaveBeenCalled();
    h.exits[0].resolve();
    await jest.advanceTimersByTimeAsync(0);
    expect(h.pidLedger.remove).toHaveBeenCalledWith(pid);
  });

  it('dispose aborts an open in flight; its process stays tracked until it exits', async () => {
    const h = spawningHarness();
    const acquiring = h.pool.acquire('s1', h.request());
    const rejected = expect(acquiring).rejects.toMatchObject({ code: 'unavailable' });
    await jest.advanceTimersByTimeAsync(0);
    const pid = h.pidLedger.record.mock.calls[0][0].pid;
    expect(h.pidLedger.remove).not.toHaveBeenCalled();
    await h.pool.dispose();
    await rejected;
    expect(h.opened[0].signal?.aborted).toBe(true);
    expect(h.pidLedger.remove).toHaveBeenCalledWith(pid);
    expect(h.credentials.revokeSubject).toHaveBeenCalledWith(subjectOf('s1'));
    expect(jest.getTimerCount()).toBe(0);
  });

  it('dispose closes a session that resolves after the abort', async () => {
    const h = harness();
    const gate = deferred<FakeSession>();
    h.pending.push(gate);
    const acquiring = h.pool.acquire('s1', h.request());
    const rejected = expect(acquiring).rejects.toMatchObject({ code: 'unavailable' });
    await jest.advanceTimersByTimeAsync(0);
    const disposing = h.pool.dispose();
    await rejected;
    expect(h.opened[0].signal?.aborted).toBe(true);
    const late = fakeSession('native-late');
    gate.resolve(late);
    await disposing;
    await jest.advanceTimersByTimeAsync(0);
    expect(late.close).toHaveBeenCalledTimes(1);
  });
});

describe('ProviderSessionPool open request build (N-3, MCP profile)', () => {
  it('builds only when it opens: a live entry is reused without a build', async () => {
    const h = harness();
    const build = jest.fn(async (context: ProviderSessionPoolOpenContext) => ({
      attach: context.attach,
    }) as ProviderSessionOpenRequest);
    const request: ProviderSessionPoolRequest = { profile: PROFILE, workspaceRoot: 'D:/work', build };
    await h.pool.acquire('s1', request);
    await h.pool.acquire('s1', request);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('a refused build (CLI gone) takes no slot, evicts nobody and revokes its credential', async () => {
    const h = harness();
    await h.pool.acquire('s1', h.request());
    await h.pool.acquire('s2', h.request());
    await h.pool.acquire('s3', h.request());
    const refused: ProviderSessionPoolRequest = {
      profile: PROFILE,
      workspaceRoot: 'D:/work',
      build: async () => {
        throw new Error('unavailable');
      },
    };
    await expect(h.pool.acquire('s4', refused)).rejects.toThrow('unavailable');
    expect(h.sessions.every((session) => session.close.mock.calls.length === 0)).toBe(true);
    expect(h.credentials.revokeSubject).toHaveBeenCalledWith(subjectOf('s4'));
    // The cap counts no phantom open: one eviction makes room for s5.
    await h.pool.acquire('s5', h.request());
    expect(h.sessions[0].close).toHaveBeenCalledTimes(1);
  });

  it('mints no credential for a session without Ptah MCP', async () => {
    const h = harness();
    await h.pool.acquire('s1', { ...h.request(), ptahMcp: false });
    expect(h.credentials.issue).not.toHaveBeenCalled();
    expect(h.contexts[0].mcpToken).toBeUndefined();
  });

  it('binds the apps tool profile into the credential', async () => {
    const h = harness();
    await h.pool.acquire('s1', { ...h.request(), toolProfile: 'apps' });
    expect(h.credentials.issue).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'session', sessionId: 's1', toolProfile: 'apps' }),
      subjectOf('s1'),
      expect.any(Number),
    );
  });
});
