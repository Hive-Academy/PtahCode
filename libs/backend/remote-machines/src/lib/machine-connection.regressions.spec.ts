import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type WebSocket from 'ws';
import {
  WorkerClient,
  WorkerClientError,
  WORKER_LIMITS,
  type EventFrame,
} from '@ptah-extension/worker-protocol';
import {
  MachineConnection,
  type MachineConnectionOptions,
} from './machine-connection';

type Call = { method: string; params: unknown };
type Callbacks = {
  onEvent(frame: EventFrame): void;
  onClose(code: number): void;
};
const hello = {
  protocol: 1,
  worker: { machineId: 'worker', displayName: 'host', ptahVersion: '1' },
};
const auth = {
  role: 'client',
  tokenId: 't',
  grant: { machineId: 'worker', workspaceIds: [] },
};
const attachResult = { mode: 'log', epoch: 'e', fromSeq: 0, headSeq: 0 };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function harness(
  overrides: Partial<MachineConnectionOptions> = {},
  respond?: (
    method: string,
    params: unknown,
    index: number,
    callbacks: Callbacks,
  ) => Promise<unknown>,
) {
  const callbacks: Callbacks[] = [];
  const calls: Call[] = [];
  const delays: number[] = [];
  const cancelled: unknown[] = [];
  const clients: Array<{ close: jest.Mock; connect: jest.Mock }> = [];
  const connection = new MachineConnection({
    machineId: 'local',
    alias: 'host',
    token: 'secret',
    workerMachineId: 'worker',
    ptahVersion: '1',
    random: () => 0.5,
    setTimer: (_callback, delay) => {
      delays.push(delay);
      return { delay } as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer: (timer) => {
      cancelled.push(timer);
    },
    createClient: (cb) => {
      const index = callbacks.push(cb) - 1;
      const fake = {
        connect: jest.fn(async () => undefined),
        close: jest.fn(() => cb.onClose(1000)),
        call: jest.fn(async (method: string, params: unknown) => {
          calls.push({ method, params });
          if (respond) return respond(method, params, index, cb);
          if (method === 'hello') return hello;
          if (method === 'auth') return auth;
          return attachResult;
        }),
      };
      clients.push(fake);
      return fake as unknown as WorkerClient;
    },
    ...overrides,
  });
  return { connection, callbacks, calls, delays, cancelled, clients };
}
function frame(seq: number): EventFrame {
  return {
    v: 1,
    kind: 'evt',
    sessionId: 's',
    epoch: 'e',
    seq,
    type: 'chat:chunk',
    ts: Date.now(),
    payload: {},
  } as EventFrame;
}

it('L1 drops a failed reattach and keeps the connection without another retry', async () => {
  const h = harness({}, async (method, _params, index) => {
    if (method === 'session.attach' && index === 1)
      throw new WorkerClientError('NOT_FOUND_OR_FORBIDDEN');
    return method === 'hello' ? hello : method === 'auth' ? auth : attachResult;
  });
  await h.connection.connect();
  await h.connection.attach('s');
  h.callbacks[0].onClose(1006);
  expect(h.delays).toEqual([1000]);
  await h.connection.retry();
  expect(h.connection.state).toBe('connected');
  expect(h.delays).toEqual([1000]);
  h.callbacks[1].onClose(1006);
  await h.connection.retry();
  expect(
    h.calls.filter((call) => call.method === 'session.attach'),
  ).toHaveLength(2);
  h.connection.dispose();
});

it('pushes session-reattach-failed when an auto re-attach is refused, then clears it', async () => {
  const states: unknown[] = [];
  const h = harness(
    { onState: (state) => states.push(state) },
    async (method, _params, index) => {
      if (method === 'session.attach' && index === 1)
        throw new WorkerClientError('NOT_FOUND_OR_FORBIDDEN');
      return method === 'hello'
        ? hello
        : method === 'auth'
          ? auth
          : attachResult;
    },
  );
  await h.connection.connect();
  await h.connection.attach('s');
  h.callbacks[0].onClose(1006);
  expect(h.connection.reason).toBeUndefined();
  await h.connection.retry();
  expect(states.at(-1)).toMatchObject({
    state: 'connected',
    reason: 'session-reattach-failed',
  });
  h.callbacks[1].onClose(1006);
  expect(states.at(-1)).toMatchObject({ state: 'offline' });
  expect(states.at(-1)).not.toHaveProperty('reason');
  h.connection.dispose();
});

it('keeps the tracked cursor when an explicit re-attach fails, so reconnect re-attaches', async () => {
  const states: unknown[] = [];
  let refuse = false;
  const h = harness(
    { onState: (state) => states.push(state) },
    async (method) => {
      if (method === 'session.attach' && refuse)
        throw new WorkerClientError('INTERNAL');
      return method === 'hello'
        ? hello
        : method === 'auth'
          ? auth
          : attachResult;
    },
  );
  await h.connection.connect();
  await h.connection.attach('s');
  h.callbacks[0].onEvent(frame(4));
  refuse = true;
  await expect(h.connection.attach('s', 2)).rejects.toThrow();
  expect(states.at(-1)).toMatchObject({
    state: 'connected',
    reason: 'session-reattach-failed',
  });
  refuse = false;
  h.callbacks[0].onClose(1006);
  await h.connection.retry();
  const attaches = h.calls.filter((call) => call.method === 'session.attach');
  expect(attaches.at(-1)?.params).toEqual({
    sessionId: 's',
    afterSeq: 4,
    epoch: 'e',
  });
  expect(h.connection.state).toBe('connected');
  expect(h.connection.reason).toBeUndefined();
  h.connection.dispose();
});

it('forgets a first attach that fails and pushes no reason', async () => {
  const states: unknown[] = [];
  const h = harness(
    { onState: (state) => states.push(state) },
    async (method) => {
      if (method === 'session.attach')
        throw new WorkerClientError('NOT_FOUND_OR_FORBIDDEN');
      return method === 'hello' ? hello : auth;
    },
  );
  await h.connection.connect();
  const pushed = states.length;
  await expect(h.connection.attach('s')).rejects.toThrow();
  expect(states).toHaveLength(pushed);
  h.callbacks[0].onClose(1006);
  await h.connection.retry();
  expect(
    h.calls.filter((call) => call.method === 'session.attach'),
  ).toHaveLength(1);
  h.connection.dispose();
});

it('pushes worker-identity-changed when another worker answers on the alias', async () => {
  const states: unknown[] = [];
  const h = harness(
    { onState: (state) => states.push(state) },
    async (method) =>
      method === 'hello'
        ? { ...hello, worker: { ...hello.worker, machineId: 'other' } }
        : auth,
  );
  await expect(h.connection.connect()).rejects.toThrow();
  expect(states.at(-1)).toMatchObject({
    state: 'unpaired',
    reason: 'worker-identity-changed',
  });
  expect(h.calls.map((call) => call.method)).toEqual(['hello']);
  h.connection.dispose();
});

it('L2 advances backoff once when failed open closes its own client', async () => {
  const h = harness({}, async () => {
    throw new Error('offline');
  });
  for (let i = 0; i < 6; i++)
    await expect(h.connection.connect()).rejects.toThrow('offline');
  expect(h.delays).toEqual([1000, 2000, 5000, 10000, 30000, 30000]);
  expect(
    h.clients.every((client) => client.close.mock.calls.length === 1),
  ).toBe(true);
  h.connection.dispose();
});

it('restores the next backoff retry when pairing fails on an offline paired machine', async () => {
  const h = harness({}, async (method) => {
    if (method === 'hello') return hello;
    throw new Error('offline');
  });
  await expect(h.connection.connect()).rejects.toThrow('offline');
  expect(h.delays).toEqual([1000]);
  await expect(h.connection.exchange('code')).rejects.toThrow('offline');
  expect(h.cancelled).toHaveLength(1);
  expect(h.delays).toEqual([1000, 2000]);
  expect(h.connection.nextRetryAt).toBeDefined();
  h.connection.dispose();
});

it('L6 counts early replay and suppresses duplicate frames before reconnect', async () => {
  const delivered = jest.fn();
  const h = harness(
    { onEvent: delivered },
    async (method, _params, index, cb) => {
      if (method === 'session.attach' && index === 0) {
        cb.onEvent(frame(7));
        cb.onEvent(frame(7));
        cb.onEvent(frame(6));
      }
      return method === 'hello'
        ? hello
        : method === 'auth'
          ? auth
          : attachResult;
    },
  );
  await h.connection.connect();
  await h.connection.attach('s');
  expect(delivered).toHaveBeenCalledTimes(1);
  h.callbacks[0].onClose(1006);
  await h.connection.retry();
  expect(
    h.calls.filter((call) => call.method === 'session.attach').at(-1)?.params,
  ).toMatchObject({ afterSeq: 7, epoch: 'e' });
  h.connection.dispose();
});

it('L8 keeps one in-flight promise and emits nothing after disposal', async () => {
  const gate = deferred<void>();
  const states = jest.fn();
  const h = harness({ onState: states });
  h.clients.length = 0;
  const original = h.connection;
  const delayed = harness({
    onState: states,
    createClient: (cb) =>
      ({
        connect: () => gate.promise,
        close: () => cb.onClose(1000),
        call: jest.fn(),
      }) as unknown as WorkerClient,
  });
  original.dispose();
  const pending = delayed.connection.connect();
  const count = states.mock.calls.length;
  expect(delayed.connection.retry()).toBe(pending);
  expect(delayed.connection.state).toBe('reconnecting');
  expect(states).toHaveBeenCalledTimes(count);
  delayed.connection.dispose();
  const afterDispose = states.mock.calls.length;
  gate.resolve();
  await pending;
  expect(states).toHaveBeenCalledTimes(afterDispose);
  expect(delayed.connection.state).not.toBe('connected');
});

it('L11 retains local version after hello version rejection', async () => {
  const h = harness({}, async (method) => {
    if (method === 'hello') throw new WorkerClientError('VERSION_MISMATCH');
    return auth;
  });
  await expect(h.connection.connect()).rejects.toMatchObject({
    code: 'VERSION_MISMATCH',
  });
  expect(h.connection.state).toBe('version-mismatch');
  expect(h.connection.versions?.local.ptahVersion).toBe('1');
  expect(h.delays).toHaveLength(0);
  h.connection.dispose();
});

it.each([4401, 4410])(
  'L12 clears rejected token and stored token on close %i',
  async (code) => {
    const deleteToken = jest.fn(async () => undefined);
    const h = harness({ onTokenRejected: deleteToken });
    await h.connection.connect();
    h.callbacks[0].onClose(code);
    await Promise.resolve();
    expect(h.connection.state).toBe('unpaired');
    expect(h.connection.reason).toBe('re-pair-required');
    expect(deleteToken).toHaveBeenCalledTimes(1);
    await h.connection.retry();
    expect(h.clients).toHaveLength(1);
    expect(h.delays).toHaveLength(0);
    h.connection.dispose();
  },
);

it('L7 ignores an old socket close and error after a newer retry begins; S7 caps ws payload', async () => {
  const sockets: Array<
    EventEmitter & { send: jest.Mock; close: jest.Mock; ping: jest.Mock }
  > = [];
  const transports: PassThrough[] = [];
  const delays: number[] = [];
  const connection = new MachineConnection({
    machineId: 'local',
    alias: 'host',
    token: 'secret',
    workerMachineId: 'worker',
    ptahVersion: '1',
    createTransport: () => {
      const stream = new PassThrough();
      transports.push(stream);
      return stream;
    },
    createWebSocket: (_url, options) => {
      expect(options.maxPayload).toBe(WORKER_LIMITS.maxPayloadBytes);
      const socket = new EventEmitter() as EventEmitter & {
        send: jest.Mock;
        close: jest.Mock;
        ping: jest.Mock;
      };
      socket.send = jest.fn((data: string) => {
        const request = JSON.parse(data) as { id: string; method: string };
        const result = request.method === 'hello' ? hello : auth;
        queueMicrotask(() =>
          socket.emit(
            'message',
            Buffer.from(
              JSON.stringify({
                v: 1,
                kind: 'res',
                id: request.id,
                ok: true,
                result,
              }),
            ),
          ),
        );
      });
      socket.close = jest.fn(() => socket.emit('close', 1000, Buffer.alloc(0)));
      socket.ping = jest.fn();
      sockets.push(socket);
      queueMicrotask(() => socket.emit('open'));
      return socket as unknown as WebSocket;
    },
    setTimer: (_cb, delay) => {
      delays.push(delay);
      return { delay } as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer: () => undefined,
  });
  await connection.connect();
  sockets[0].emit('close', 1006, Buffer.alloc(0));
  await connection.retry();
  expect(connection.state).toBe('connected');
  const scheduled = delays.length;
  sockets[0].emit('error', new Error('old'));
  sockets[0].emit('close', 1006, Buffer.alloc(0));
  expect(transports[1].destroyed).toBe(false);
  expect(delays).toHaveLength(scheduled);
  connection.dispose();
});

it('retry on a connected machine preserves the live client', async () => {
  const h = harness();
  await h.connection.connect();
  await h.connection.retry();
  expect(h.clients).toHaveLength(1);
  expect(h.clients[0].close).not.toHaveBeenCalled();
  expect(h.connection.state).toBe('connected');
  h.connection.dispose();
});

it('does not open a new connection while a pairing exchange is in flight', async () => {
  const gate = deferred<unknown>();
  const h = harness({}, async (method) => {
    if (method === 'hello') return hello;
    if (method === 'pair.exchange') return gate.promise;
    return auth;
  });
  const exchange = h.connection.exchange('code');
  await Promise.resolve();
  await Promise.resolve();
  await h.connection.retry();
  expect(h.clients).toHaveLength(1);
  gate.resolve({
    token: 'new-token',
    grant: { machineId: 'worker', workspaceIds: [] },
  });
  await exchange;
  expect(h.clients[0].close).toHaveBeenCalledTimes(1);
  h.connection.dispose();
});

function frameIn(epoch: string, seq: number): EventFrame {
  return { ...frame(seq), epoch };
}

it('delivers a new epoch from its start on reconnect when the old sequence is past the new head', async () => {
  const delivered = jest.fn();
  const h = harness(
    { onEvent: delivered },
    async (method, params, index, cb) => {
      if (method === 'hello') return hello;
      if (method === 'auth') return auth;
      if (index === 0)
        return { mode: 'log', epoch: 'e', fromSeq: 0, headSeq: 0 };
      // The worker recreated the log: another epoch answers from its start.
      expect(params).toEqual({ sessionId: 's', afterSeq: 100, epoch: 'e' });
      queueMicrotask(() => {
        for (const seq of [1, 2, 3]) cb.onEvent(frameIn('e2', seq));
      });
      return { mode: 'log', epoch: 'e2', fromSeq: 0, headSeq: 3 };
    },
  );
  await h.connection.connect();
  await h.connection.attach('s');
  h.callbacks[0].onEvent(frame(100));
  h.callbacks[0].onClose(1006);
  await h.connection.retry();
  await Promise.resolve();
  expect(
    delivered.mock.calls.map(([event]) => [event.epoch, event.seq]),
  ).toEqual([
    ['e', 100],
    ['e2', 1],
    ['e2', 2],
    ['e2', 3],
  ]);
  h.callbacks[1].onClose(1006);
  await h.connection.retry();
  expect(
    h.calls.filter((call) => call.method === 'session.attach').at(-1)?.params,
  ).toEqual({ sessionId: 's', afterSeq: 3, epoch: 'e2' });
  h.connection.dispose();
});

it('moves an explicit re-attach to the new epoch origin instead of the old cursor', async () => {
  const delivered = jest.fn();
  let attaches = 0;
  const h = harness(
    { onEvent: delivered },
    async (method, params, _index, cb) => {
      if (method === 'hello') return hello;
      if (method === 'auth') return auth;
      if (attaches++ === 0)
        return { mode: 'log', epoch: 'e', fromSeq: 0, headSeq: 0 };
      expect(params).toEqual({ sessionId: 's', afterSeq: 50, epoch: 'e' });
      queueMicrotask(() => cb.onEvent(frameIn('e2', 1)));
      return { mode: 'log', epoch: 'e2', fromSeq: 0, headSeq: 1 };
    },
  );
  await h.connection.connect();
  await h.connection.attach('s');
  h.callbacks[0].onEvent(frame(50));
  await h.connection.attach('s', 50);
  await Promise.resolve();
  expect(delivered.mock.calls.at(-1)?.[0]).toMatchObject({
    epoch: 'e2',
    seq: 1,
  });
  h.connection.dispose();
});

it('re-attaches from the start when the cursor is past the head of an untracked epoch', async () => {
  const h = harness({}, async (method, params) => {
    if (method === 'hello') return hello;
    if (method === 'auth') return auth;
    const { afterSeq } = params as { afterSeq: number };
    return afterSeq === 0
      ? { mode: 'log', epoch: 'e2', fromSeq: 0, headSeq: 3 }
      : { mode: 'log', epoch: 'e2', fromSeq: afterSeq, headSeq: 3 };
  });
  await h.connection.connect();
  await expect(h.connection.attach('s', 100)).resolves.toMatchObject({
    epoch: 'e2',
    fromSeq: 0,
  });
  expect(
    h.calls
      .filter((call) => call.method === 'session.attach')
      .map((call) => call.params),
  ).toEqual([
    { sessionId: 's', afterSeq: 100 },
    { sessionId: 's', afterSeq: 0, epoch: 'e2' },
  ]);
  h.connection.dispose();
});

it('keeps a cursor advanced by events while a failed explicit re-attach was in flight', async () => {
  let refuse = false;
  const h = harness({}, async (method, _params, _index, cb) => {
    if (method === 'hello') return hello;
    if (method === 'auth') return auth;
    if (refuse) {
      cb.onEvent(frame(9));
      throw new WorkerClientError('INTERNAL');
    }
    return attachResult;
  });
  await h.connection.connect();
  await h.connection.attach('s');
  h.callbacks[0].onEvent(frame(4));
  refuse = true;
  await expect(h.connection.attach('s', 2)).rejects.toThrow();
  refuse = false;
  h.callbacks[0].onClose(1006);
  await h.connection.retry();
  expect(
    h.calls.filter((call) => call.method === 'session.attach').at(-1)?.params,
  ).toEqual({ sessionId: 's', afterSeq: 9, epoch: 'e' });
  h.connection.dispose();
});
