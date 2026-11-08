import type * as WorkerRuntime from '@ptah-extension/worker-runtime';
import type {
  HistoryReader,
  SessionLogWriter,
  WorkerPeer,
  WorkspaceRegistry,
} from '@ptah-extension/worker-runtime';
import type { ISessionDriverLock } from '@ptah-extension/platform-core';
import type { ISdkPermissionHandler } from '@ptah-extension/shared';
import {
  createRemoteSessions,
  SESSION_NAME_MAX_LENGTH,
  sessionNameFromPrompt,
  type RemoteSessionDeps,
} from './remote-sessions';

type Message = { method: string; params: unknown; correlationId: string };
const param = (message: Message, key: string): unknown =>
  (message.params as Record<string, unknown>)[key];

// worker-runtime is lazy-loaded in worker-host (module boundaries), so the
// spec loads it the same way.
let runtime: typeof WorkerRuntime;
beforeAll(async () => {
  runtime = await import('@ptah-extension/worker-runtime');
});
const ok = (data: unknown = { success: true }) => ({ success: true, data });
const grant = { machineId: 'machine_1', workspaceIds: ['ws_1'] };
const peer: WorkerPeer = {
  id: 'peer-1',
  tokenId: 'tok-1',
  send: jest.fn(),
  afterReply: jest.fn(),
  onClose: jest.fn(),
  close: jest.fn(),
};

/** createRemoteSessions over fakes for the engine RPC, logs and lock. */
function setup(
  onCall: (message: Message, tap: Tap) => unknown,
  overrides: Partial<RemoteSessionDeps> = {},
) {
  const held = new Map<string, string>();
  /** Purpose and state of a held entry; a drive lock that is held by default. */
  const heldAs = new Map<string, { purpose: string; state: string }>();
  const lock = {
    held: jest.fn(() =>
      [...held].map(([sessionId, nonce]) => ({
        sessionId,
        nonce,
        purpose: 'drive',
        state: 'held',
        ...heldAs.get(sessionId),
      })),
    ),
    release: jest.fn(async (sessionId: string) => {
      held.delete(sessionId);
      return 'released' as const;
    }),
    holder: jest.fn(async () => null),
  };
  const writer = {
    enqueue: jest.fn(async () => ({ seq: 1 })),
    degraded: false,
  } as unknown as SessionLogWriter;
  const permissions = { handleResponse: jest.fn() };
  const requestRelease = jest.fn(async () => 'not-held');
  const log = jest.fn();
  let tap: Tap = () => undefined;
  const handleMessage = jest.fn(async (message: Message) => {
    if (message.method === 'session:list')
      // The engine lists its sessions whether or not this worker drives them.
      return ok({
        sessions: ['s1'].map((id) => ({
          id,
          name: id,
          messageCount: 1,
          createdAt: 1,
          lastActivityAt: 2,
          isActive: false,
        })),
        total: 1,
        hasMore: false,
      });
    return onCall(message, tap) ?? ok();
  });
  const deps: RemoteSessionDeps = {
    runtime,
    machineId: 'machine_1',
    maxActiveTurns: 4,
    registry: {
      list: () => [{ workspaceId: 'ws_1', path: '/w' }],
    } as unknown as WorkspaceRegistry,
    logs: {
      openSession: jest.fn(async () => writer),
      findWriter: jest.fn(() => writer),
    },
    rpc: { handleMessage },
    history: {
      readForResume: async () => ({ events: [] }),
    } as unknown as HistoryReader,
    metadata: { get: async () => null },
    permissions: permissions as unknown as ISdkPermissionHandler,
    lock: lock as unknown as ISessionDriverLock,
    workspaces: { addFolder: jest.fn() },
    providerReady: () => true,
    machineInfo: jest.fn(),
    revokedCloseCode: 4001,
    clientName: () => undefined,
    revokeToken: jest.fn(),
    requestRelease,
    log,
    resolveTimeoutMs: 20,
    ...overrides,
  };
  const sessions = createRemoteSessions(deps);
  tap = (type, payload) => sessions.tap(type, payload);
  return {
    sessions,
    held,
    heldAs,
    lock,
    permissions,
    requestRelease,
    log,
    tap,
    writer,
  };
}
type Tap = (type: string, payload: unknown) => void;
const settle = () => new Promise((resolve) => setImmediate(resolve));

it('keeps the driver lock of a turn whose chat:abort was refused at shutdown, until the engine ends it', async () => {
  let refuseAbort = false;
  const fake = setup((message, tap) => {
    if (message.method === 'chat:start') {
      fake.held.set('s1', 'nonce-s1');
      tap('session:id-resolved', {
        tabId: param(message, 'tabId'),
        realSessionId: 's1',
      });
    }
    if (message.method === 'chat:abort' && refuseAbort)
      return { success: false, error: 'refused' };
    return undefined;
  });
  await fake.sessions.handle(
    'session.start',
    { workspaceId: 'ws_1', prompt: 'long' },
    grant,
    peer,
  );
  refuseAbort = true;
  await fake.sessions.drain();
  await fake.sessions.releaseLocks();
  expect(fake.lock.release).not.toHaveBeenCalled();
  expect(fake.requestRelease).not.toHaveBeenCalled();
  expect(fake.held.has('s1')).toBe(true);
  expect(fake.log).toHaveBeenCalledWith(
    expect.stringContaining('kept the driver lock of 1 turn'),
  );
  // The engine confirms the turn ended: the lock may go now.
  fake.tap('session:turnEnded', { sessionId: 's1' });
  await settle();
  await fake.sessions.releaseLocks();
  expect(fake.lock.release).toHaveBeenCalledWith('s1', 'nonce-s1');
  expect(fake.held.size).toBe(0);
});

it('binds a held tab-only permission request on a session:id-resolved that arrives after the start timed out', async () => {
  let tabId = '';
  const fake = setup((message, tap) => {
    if (message.method === 'chat:start') {
      tabId = String(param(message, 'tabId'));
      fake.held.set('s1', 'nonce-s1');
      tap('permission:request', {
        id: 'req-tab',
        toolName: 'Bash',
        toolInput: {},
        tabId,
      });
    }
    return undefined;
  });
  await expect(
    fake.sessions.handle(
      'session.start',
      { workspaceId: 'ws_1', prompt: 'run' },
      grant,
      peer,
    ),
  ).rejects.toMatchObject({ code: 'INTERNAL' });
  fake.tap('session:id-resolved', { tabId, realSessionId: 's1' });
  await settle();
  await expect(
    fake.sessions.handle(
      'permission.respond',
      { sessionId: 's1', requestId: 'req-tab', decision: 'allow' },
      grant,
      peer,
    ),
  ).resolves.toEqual({ applied: true });
  expect(fake.permissions.handleResponse).toHaveBeenCalledWith('req-tab', {
    id: 'req-tab',
    decision: 'allow',
  });
});

it('keeps the lock of a start that never reported its session at shutdown and logs it', async () => {
  const fake = setup((message) => {
    // The engine bound the session's lock, but session:id-resolved is lost.
    if (message.method === 'chat:start') fake.held.set('s-new', 'nonce-new');
    return undefined;
  });
  await expect(
    fake.sessions.handle(
      'session.start',
      { workspaceId: 'ws_1', prompt: 'lost' },
      grant,
      peer,
    ),
  ).rejects.toMatchObject({ code: 'INTERNAL' });
  await fake.sessions.drain();
  await fake.sessions.releaseLocks();
  expect(fake.lock.release).not.toHaveBeenCalled();
  expect(fake.requestRelease).not.toHaveBeenCalled();
  expect(fake.held.has('s-new')).toBe(true);
  expect(fake.log).toHaveBeenCalledWith(
    expect.stringContaining(
      'kept 1 driver lock(s) that may belong to 1 start(s) that never reported a session',
    ),
  );
});

it('starts each session on a tab whose id is a plain UUID v4', async () => {
  // chat:start and permission requests validate tabId as a UUID v4; a
  // prefixed id made every remote session.start fail on a real worker.
  const UUID_V4 =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let tabId = '';
  const fake = setup((message, tap) => {
    if (message.method !== 'chat:start') return undefined;
    tabId = String(param(message, 'tabId'));
    fake.held.set('s1', 'nonce-s1');
    tap('session:id-resolved', { tabId, realSessionId: 's1' });
    return undefined;
  });
  await expect(
    fake.sessions.handle(
      'session.start',
      { workspaceId: 'ws_1', prompt: 'go' },
      grant,
      peer,
    ),
  ).resolves.toMatchObject({ sessionId: 's1' });
  expect(tabId).toMatch(UUID_V4);
});

it('continues a session this worker has no tab for on a plain UUID v4 tab', async () => {
  // After a worker restart tabsBySession is empty: continue makes a new tab.
  const UUID_V4 =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let tabId = '';
  const fake = setup((message) => {
    if (message.method !== 'chat:continue') return undefined;
    tabId = String(param(message, 'tabId'));
    fake.held.set('s1', 'nonce-s1');
    return undefined;
  });
  await expect(
    fake.sessions.handle(
      'session.continue',
      { sessionId: 's1', prompt: 'more' },
      grant,
      peer,
    ),
  ).resolves.toMatchObject({ turnId: expect.any(String) });
  expect(tabId).toMatch(UUID_V4);
});

it('frees the slot and the lock of a start that never reported its session on its tab-only terminal event, once', async () => {
  const tabs: string[] = [];
  const fake = setup(
    (message, tap) => {
      if (message.method !== 'chat:start') return undefined;
      const tabId = String(param(message, 'tabId'));
      tabs.push(tabId);
      if (tabs.length === 1) {
        // Bound in the engine, never reported to the worker.
        fake.held.set('s-new', 'nonce-new');
        return undefined;
      }
      const sessionId = `s-${tabs.length}`;
      fake.held.set(sessionId, `nonce-${sessionId}`);
      tap('session:id-resolved', { tabId, realSessionId: sessionId });
      return undefined;
    },
    { maxActiveTurns: 1 },
  );
  const start = () =>
    fake.sessions.handle(
      'session.start',
      { workspaceId: 'ws_1', prompt: 'go' },
      grant,
      peer,
    );
  await expect(start()).rejects.toMatchObject({ code: 'INTERNAL' });
  // Its engine turn may still run: the slot stays taken.
  await expect(start()).rejects.toMatchObject({ code: 'WORKER_BUSY' });
  expect(fake.held.has('s-new')).toBe(true);
  fake.tap('session:turnEnded', { tabId: tabs[0] });
  fake.tap('chat:sessionEnded', { tabId: tabs[0] });
  await settle();
  expect(fake.lock.release).toHaveBeenCalledTimes(1);
  expect(fake.lock.release).toHaveBeenCalledWith('s-new', 'nonce-new');
  expect(fake.requestRelease).toHaveBeenCalledTimes(1);
  expect(fake.held.has('s-new')).toBe(false);
  await expect(start()).resolves.toMatchObject({ sessionId: 's-2' });
});

describe('remote permission expiry (decision 27)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  const request = () => ({
    id: 'req-60',
    toolName: 'Bash',
    toolInput: {},
    description: 'run',
    sessionId: 's1',
    timestamp: Date.now(),
    timeoutAt: 0,
  });

  it('denies an unanswered request after 60 s, logs it and refuses a late answer', async () => {
    const fake = setup(() => undefined);
    fake.tap('permission:request', request());
    jest.advanceTimersByTime(runtime.REMOTE_PERMISSION_TIMEOUT_MS - 1);
    expect(fake.permissions.handleResponse).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(fake.permissions.handleResponse).toHaveBeenCalledWith('req-60', {
      id: 'req-60',
      decision: 'deny',
      reason: 'No answer from the controller within 60 s',
    });
    expect(fake.writer.enqueue).toHaveBeenCalledWith(
      'worker:permission.answered',
      { requestId: 'req-60', decision: 'deny', by: 'Worker timeout' },
    );
    await expect(
      fake.sessions.handle(
        'permission.respond',
        { sessionId: 's1', requestId: 'req-60', decision: 'allow' },
        grant,
        peer,
      ),
    ).rejects.toMatchObject({ code: 'ALREADY_ANSWERED' });
    expect(fake.permissions.handleResponse).toHaveBeenCalledTimes(1);
  });

  it('logs the forwarded request with the worker deadline as timeoutAt', () => {
    const fake = setup(() => undefined);
    const raised = request();
    fake.tap('permission:request', raised);
    expect(fake.writer.enqueue).toHaveBeenCalledWith(
      'permission:request',
      expect.objectContaining({
        id: 'req-60',
        timeoutAt: raised.timestamp + runtime.REMOTE_PERMISSION_TIMEOUT_MS,
      }),
    );
  });

  it('denies a held request at 60 s when its start never emits session:id-resolved', async () => {
    const fake = setup((message, tap) => {
      if (message.method === 'chat:start')
        tap('permission:request', {
          id: 'req-held',
          toolName: 'Bash',
          toolInput: {},
          tabId: String(param(message, 'tabId')),
          timestamp: Date.now(),
          timeoutAt: 0,
        });
      return undefined;
    });
    const started = fake.sessions.handle(
      'session.start',
      { workspaceId: 'ws_1', prompt: 'run' },
      grant,
      peer,
    );
    const outcome = expect(started).rejects.toMatchObject({
      code: 'INTERNAL',
    });
    await jest.advanceTimersByTimeAsync(
      runtime.REMOTE_PERMISSION_TIMEOUT_MS - 1,
    );
    await outcome;
    expect(fake.permissions.handleResponse).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(fake.permissions.handleResponse).toHaveBeenCalledWith('req-held', {
      id: 'req-held',
      decision: 'deny',
      reason: 'No answer from the controller within 60 s',
    });
    expect(fake.permissions.handleResponse).toHaveBeenCalledTimes(1);
  });

  it('denies a held request at once when the hold limit is full', async () => {
    const fake = setup((message, tap) => {
      if (message.method === 'chat:start')
        for (let index = 0; index <= 100; index++)
          tap('permission:request', {
            id: `req-${index}`,
            toolName: 'Bash',
            toolInput: {},
            tabId: String(param(message, 'tabId')),
            timestamp: Date.now(),
            timeoutAt: 0,
          });
      return undefined;
    });
    const started = fake.sessions.handle(
      'session.start',
      { workspaceId: 'ws_1', prompt: 'run' },
      grant,
      peer,
    );
    const outcome = expect(started).rejects.toMatchObject({
      code: 'INTERNAL',
    });
    await jest.advanceTimersByTimeAsync(0);
    expect(fake.permissions.handleResponse).toHaveBeenCalledTimes(1);
    expect(fake.permissions.handleResponse).toHaveBeenCalledWith('req-100', {
      id: 'req-100',
      decision: 'deny',
      reason: 'Too many remote permission requests are pending',
    });
    await jest.advanceTimersByTimeAsync(runtime.REMOTE_PERMISSION_TIMEOUT_MS);
    await outcome;
  });

  it('stops expiry timers when the worker drains', async () => {
    const fake = setup(() => undefined);
    fake.tap('permission:request', request());
    await fake.sessions.drain();
    jest.advanceTimersByTime(runtime.REMOTE_PERMISSION_TIMEOUT_MS);
    expect(fake.permissions.handleResponse).not.toHaveBeenCalled();
  });
});

/**
 * Starts s1, whose engine record keeps this process's drive lock, and lets
 * its only turn fail (401). `status` answers the engine's `session:status`.
 */
async function failedTurnSession(status: () => unknown) {
  const fake = setup((message, tap) => {
    if (message.method === 'chat:start') {
      fake.held.set('s1', 'nonce-s1');
      tap('session:id-resolved', {
        tabId: param(message, 'tabId'),
        realSessionId: 's1',
      });
    }
    if (message.method === 'session:status') return status();
    return undefined;
  });
  // The kernel lock answers with this process's engine record as the holder.
  fake.lock.holder.mockImplementation(async () =>
    fake.held.has('s1')
      ? ({ kind: 'cli', label: 'Ptah (host, PID 1)' } as never)
      : null,
  );
  await fake.sessions.handle(
    'session.start',
    { workspaceId: 'ws_1', prompt: 'hi' },
    grant,
    peer,
  );
  const list = async () =>
    (
      (await fake.sessions.handle(
        'sessions.list',
        { workspaceId: 'ws_1' },
        grant,
        peer,
      )) as Array<{ state: string; driver?: { label: string } }>
    )[0];
  expect(await list()).toMatchObject({ state: 'running' });
  fake.tap('session:turnFailed', {
    sessionId: 's1',
    error: 'authentication_failed',
  });
  await settle();
  expect(fake.held.has('s1')).toBe(true);
  return { fake, list };
}
const engineStatus = (
  phase?: string,
  isStreaming = false,
  pending: { backgroundTasks?: unknown[]; sessionCrons?: unknown[] } = {},
) =>
  ok({
    isActive: true,
    isStreaming,
    ...(phase
      ? {
          turnState: {
            phase,
            revision: 1,
            backgroundTasks: [],
            sessionCrons: [],
            ...pending,
          },
        }
      : {}),
  });

it.each(['failed', 'idle'])(
  'lists a session as idle after its turn ended while the engine record of this process keeps its lock (phase %s)',
  async (phase) => {
    const { list } = await failedTurnSession(() => engineStatus(phase));
    const summary = await list();
    expect(summary.state).toBe('idle');
    expect(summary.driver).toBeUndefined();
  },
);

it.each([
  [
    'the engine generates a turn admitted by another path',
    () => engineStatus('generating', true),
  ],
  [
    'the engine reports background work',
    () => engineStatus('awaiting-background'),
  ],
  [
    'a failed turn still owns background tasks',
    () =>
      engineStatus('failed', false, {
        backgroundTasks: [{ taskId: 'bg-1', status: 'running' }],
      }),
  ],
  [
    'a failed turn still has session crons',
    () =>
      engineStatus('failed', false, {
        sessionCrons: [{ id: 'cron-1' }],
      }),
  ],
  ['the engine has no turn state', () => engineStatus()],
  ['session:status is refused', () => ({ success: false, error: 'refused' })],
])(
  'keeps listing an attributable session as running when %s',
  async (_case, status) => {
    const { list } = await failedTurnSession(status);
    expect(await list()).toMatchObject({
      state: 'running',
      driver: { label: 'Ptah (host, PID 1)' },
    });
  },
);

it.each([
  [{ purpose: 'refresh', state: 'held' }],
  [{ purpose: 'drive', state: 'releasing' }],
])(
  'keeps listing an attributable session as running while its lock is held as %o',
  async (entry) => {
    const { fake, list } = await failedTurnSession(() =>
      engineStatus('failed'),
    );
    fake.heldAs.set('s1', entry);
    expect(await list()).toMatchObject({ state: 'running' });
  },
);

it('still lists a session held by another process as running', async () => {
  const fake = setup(() => undefined);
  fake.lock.holder.mockImplementation(
    async () => ({ kind: 'desktop', label: 'Desktop' }) as never,
  );
  const [summary] = (await fake.sessions.handle(
    'sessions.list',
    { workspaceId: 'ws_1' },
    grant,
    peer,
  )) as Array<{ state: string; driver?: { label: string } }>;
  expect(summary).toMatchObject({
    state: 'running',
    driver: { label: 'Desktop' },
  });
});

describe('a turn the SDK interrupted after a denied tool (finding K)', () => {
  /** The `chat:chunk` that carries the engine's turn state. */
  const turnState = (phase: string, revision: number, sessionId = 's1') => ({
    tabId: 'any-tab',
    sessionId,
    event: { eventType: 'turn_state', sessionId, phase, revision },
  });
  async function deniedTurn() {
    const fake = setup((message, tap) => {
      if (message.method === 'chat:start') {
        fake.held.set('s1', 'nonce-s1');
        tap('session:id-resolved', {
          tabId: param(message, 'tabId'),
          realSessionId: 's1',
        });
      }
      if (message.method === 'session:status')
        return engineStatus('idle', false);
      return undefined;
    });
    await fake.sessions.handle(
      'session.start',
      { workspaceId: 'ws_1', prompt: 'write a file' },
      grant,
      peer,
    );
    fake.tap('chat:chunk', turnState('generating', 2));
    fake.tap('permission:request', {
      id: 'req-w',
      toolName: 'Write',
      toolInput: {},
      description: 'write',
      sessionId: 's1',
      timestamp: Date.now(),
      timeoutAt: 0,
    });
    const list = async () =>
      (
        (await fake.sessions.handle(
          'sessions.list',
          { workspaceId: 'ws_1' },
          grant,
          peer,
        )) as Array<{ state: string }>
      )[0];
    return { fake, list };
  }
  const turnEnds = (fake: ReturnType<typeof setup>) =>
    (fake.writer.enqueue as jest.Mock).mock.calls.filter(
      ([type]) => type === 'worker:turn.end',
    ).length;

  it('ends the turn on the engine idle turn state that follows a remote Deny, with no session:turnEnded', async () => {
    const { fake, list } = await deniedTurn();
    expect(await list()).toMatchObject({ state: 'running' });
    await fake.sessions.handle(
      'permission.respond',
      { sessionId: 's1', requestId: 'req-w', decision: 'deny' },
      grant,
      peer,
    );
    // The SDK interrupts the turn: its result settles the turn state, and
    // the Stop hook (session:turnEnded) does not run.
    fake.tap('chat:chunk', turnState('idle', 3));
    await settle();
    expect(turnEnds(fake)).toBe(1);
    expect(await list()).toMatchObject({ state: 'idle' });
    // A second terminal signal writes no second end record.
    fake.tap('session:turnEnded', { sessionId: 's1' });
    await settle();
    expect(turnEnds(fake)).toBe(1);
  });

  it('ends the turn the same way after the 60 s auto-deny (decision 27)', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    try {
      const { fake, list } = await deniedTurn();
      jest.advanceTimersByTime(runtime.REMOTE_PERMISSION_TIMEOUT_MS);
      expect(fake.permissions.handleResponse).toHaveBeenCalledWith(
        'req-w',
        expect.objectContaining({ decision: 'deny' }),
      );
      fake.tap('chat:chunk', turnState('idle', 3));
      await settle();
      expect(turnEnds(fake)).toBe(1);
      expect(await list()).toMatchObject({ state: 'idle' });
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not end a turn on a terminal state older than its own generating state, nor on a retirement tick', async () => {
    const { fake, list } = await deniedTurn();
    // A trailing terminal state of an earlier turn.
    fake.tap('chat:chunk', turnState('idle', 1));
    fake.tap('chat:chunk', {
      sessionId: 's1',
      event: { ...turnState('idle', 5).event, retirementOnly: true },
    });
    await settle();
    expect(turnEnds(fake)).toBe(0);
    expect(await list()).toMatchObject({ state: 'running' });
  });
});

describe('session titles (finding D)', () => {
  it('names a started session after its first prompt, cleaned and capped', async () => {
    const names: unknown[] = [];
    const fake = setup((message, tap) => {
      if (message.method !== 'chat:start') return undefined;
      names.push(param(message, 'name'));
      tap('session:id-resolved', {
        tabId: param(message, 'tabId'),
        realSessionId: `s${names.length}`,
      });
      return undefined;
    });
    const start = (params: Record<string, unknown>) =>
      fake.sessions.handle(
        'session.start',
        { workspaceId: 'ws_1', ...params },
        grant,
        peer,
      );
    await start({ prompt: '  List\n\tthe   numbers‮ 1 to 25​ ' });
    expect(names).toEqual(['List the numbers 1 to 25']);
  });

  it('keeps an explicit name', async () => {
    let name: unknown;
    const fake = setup((message, tap) => {
      if (message.method !== 'chat:start') return undefined;
      name = param(message, 'name');
      tap('session:id-resolved', {
        tabId: param(message, 'tabId'),
        realSessionId: 's1',
      });
      return undefined;
    });
    await fake.sessions.handle(
      'session.start',
      { workspaceId: 'ws_1', prompt: 'go', name: 'Release notes' },
      grant,
      peer,
    );
    expect(name).toBe('Release notes');
  });

  it('cuts a long prompt at the protocol name limit with an ellipsis, and gives up on an empty one', () => {
    const name = sessionNameFromPrompt('x'.repeat(400));
    expect(Array.from(name ?? '')).toHaveLength(SESSION_NAME_MAX_LENGTH);
    expect(name?.endsWith('…')).toBe(true);
    expect(sessionNameFromPrompt(' \n​\t ')).toBeUndefined();
  });

  it('measures the limit in UTF-16 units like the session.start schema and never splits a surrogate pair', () => {
    const name = sessionNameFromPrompt('a' + '\u{1F600}'.repeat(300)) ?? '';
    expect(name.length).toBeLessThanOrEqual(SESSION_NAME_MAX_LENGTH);
    expect(name.endsWith('…')).toBe(true);
    // 'a' + 127 emoji (255 units) + the ellipsis: no lone surrogate.
    expect(name).toBe('a' + '\u{1F600}'.repeat(127) + '…');
  });
});
