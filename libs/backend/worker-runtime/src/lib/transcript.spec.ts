import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  NullSessionDriverLock,
  type ISessionDriverLock,
} from '@ptah-extension/platform-core';
import { workerPaths } from './paths';
import { SessionEventLog } from './session-event-log';
import { SessionFanOut } from './fan-out';
import { SessionLogWriter } from './session-log-writer';
import {
  Transcript,
  DriverLockUnavailableError,
  type TranscriptOptions,
} from './transcript';
import { TranscriptUnavailableError } from './session-event-log';

const owner = {
  kind: 'worker' as const,
  hostname: 'host',
  pid: 1,
  label: 'worker',
  acquiredAt: '',
  responding: true,
};
let home: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'ptah-transcript-'));
});
afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

it('A3 / R-K fixture JSONL refreshes after an intervening desktop turn and replays its new baseline', async () => {
  const log = await SessionEventLog.open(workerPaths(home), 'session_1');
  const writer = new SessionLogWriter(log, new SessionFanOut(), {
    onAppendFailed: jest.fn(),
  });
  const history = {
    readForResume: jest.fn().mockResolvedValue({ events: [] }),
  };
  const lock = inProcessLock().lock as unknown as ISessionDriverLock;
  const transcript = new Transcript(history, lock, owner);
  await transcript.baseline('session_1', writer);
  await writer.enqueue('worker:turn.begin', { turnId: 't1' });
  await writer.enqueue('worker:turn.end', { turnId: 't1' });
  await transcript.mark('session_1', 't1', writer);
  const oldHead = log.head;
  expect(log.replay(oldHead - 1)[0].type).toBe('worker:history-mark');
  history.readForResume.mockResolvedValue({
    events: [
      {
        id: 'desktop-event',
        eventType: 'text_delta',
        timestamp: 1_700_000_000_000,
        sessionId: 'session_1',
        messageId: 'm1',
        delta: 'desktop',
        blockIndex: 0,
      },
    ],
  });
  const attached = await transcript.attach('session_1', log, writer, oldHead);
  expect(attached).toMatchObject({ mode: 'log', fromSeq: oldHead });
  expect(log.replay(oldHead).map((frame) => frame.type)).toEqual([
    'worker:baseline',
  ]);
  expect(log.latestMark).toEqual({ count: 1, lastEventId: 'desktop-event' });
  await transcript.attach('session_1', log, writer);
  expect(log.head).toBe(oldHead + 1);
  await log.close();
});

it('returns a labelled snapshot while another process holds the lock and fails closed when unavailable', async () => {
  const log = await SessionEventLog.open(workerPaths(home), 'session_1');
  const writer = new SessionLogWriter(log, new SessionFanOut(), {
    onAppendFailed: jest.fn(),
  });
  const history = {
    readForResume: jest.fn().mockResolvedValue({ events: [] }),
  };
  const acquire = jest
    .fn()
    .mockResolvedValue({ ok: false, holder: { label: 'Desktop' } });
  const lock = { acquire, held: () => [] } as unknown as ISessionDriverLock;
  const transcript = new Transcript(history, lock, owner);
  await transcript.baseline('session_1', writer);
  expect(await transcript.attach('session_1', log, writer)).toMatchObject({
    mode: 'snapshot',
    drivenBy: 'Desktop',
  });
  acquire.mockResolvedValue({ ok: false, unavailable: 'failed' });
  await expect(
    transcript.attach('session_1', log, writer),
  ).rejects.toBeInstanceOf(DriverLockUnavailableError);
  await log.close();
});

const desktopEvent = {
  id: 'desktop-event',
  eventType: 'text_delta',
  timestamp: 1_700_000_000_000,
  sessionId: 'session_1',
  messageId: 'm1',
  delta: 'desktop',
  blockIndex: 0,
};
type Entry = {
  sessionId: string;
  nonce: string;
  purpose: string;
  state: string;
  owner?: typeof owner;
};

/** A session log with one ended turn and its mark, over an empty history. */
async function endedTurnLog(
  lock: ISessionDriverLock,
  options: TranscriptOptions = {},
) {
  const log = await SessionEventLog.open(workerPaths(home), 'session_1');
  const writer = new SessionLogWriter(log, new SessionFanOut(), {
    onAppendFailed: jest.fn(),
  });
  const history = {
    readForResume: jest.fn().mockResolvedValue({ events: [] }),
  };
  const transcript = new Transcript(history, lock, owner, options);
  await transcript.baseline('session_1', writer);
  await writer.enqueue('worker:turn.begin', { turnId: 't1' });
  await writer.enqueue('worker:turn.end', { turnId: 't1' });
  await transcript.mark('session_1', 't1', writer);
  return { log, writer, history, transcript };
}

/**
 * An in-process kernel lock: acquire is re-entrant and answers an existing
 * entry's nonce; a new entry keeps a copy of the owner it was acquired with.
 */
function inProcessLock(entries: Entry[] = []) {
  let next = 0;
  const lock = {
    held: jest.fn(() =>
      entries.map((entry) => ({ ...entry, owner: entry.owner ?? owner })),
    ),
    acquire: jest.fn(async (sessionId: string, holder: typeof owner) => {
      const own = entries.find((entry) => entry.sessionId === sessionId);
      if (own) return { ok: true, nonce: own.nonce };
      const nonce = `refresh-nonce-${++next}`;
      entries.push({
        sessionId,
        nonce,
        purpose: 'refresh',
        state: 'held',
        owner: { ...holder, responding: true },
      });
      return { ok: true, nonce };
    }),
    release: jest.fn(async (sessionId: string, nonce: string) => {
      const index = entries.findIndex(
        (entry) => entry.sessionId === sessionId && entry.nonce === nonce,
      );
      if (index >= 0) entries.splice(index, 1);
      return 'released';
    }),
  };
  return { lock, entries };
}

it('refreshes under the idle engine record of this process without acquiring or releasing its drive lock', async () => {
  // The engine's record keeps the session's lock after its turn ended.
  const { lock, entries } = inProcessLock([
    {
      sessionId: 'session_1',
      nonce: 'engine',
      purpose: 'drive',
      state: 'held',
    },
  ]);
  const { log, writer, history, transcript } = await endedTurnLog(
    lock as unknown as ISessionDriverLock,
  );
  const head = log.head;
  expect(await transcript.attach('session_1', log, writer)).toMatchObject({
    mode: 'log',
    headSeq: head,
  });
  // History changed under the borrowed lock: a new baseline, still no release.
  history.readForResume.mockResolvedValue({ events: [desktopEvent] });
  expect(await transcript.attach('session_1', log, writer)).toMatchObject({
    mode: 'log',
    headSeq: head + 1,
  });
  expect(log.replay(head).map((frame) => frame.type)).toEqual([
    'worker:baseline',
  ]);
  expect(lock.acquire).not.toHaveBeenCalled();
  expect(lock.release).not.toHaveBeenCalled();
  expect(entries).toHaveLength(1);
  await log.close();
});

it('makes a second attach wait for an in-flight refresh, so it never replays the old head', async () => {
  const { lock } = inProcessLock();
  const { log, writer, history, transcript } = await endedTurnLog(
    lock as unknown as ISessionDriverLock,
  );
  const oldHead = log.head;
  let finishRead: (value: { events: unknown[] }) => void = () => undefined;
  history.readForResume
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRead = resolve;
        }),
    )
    .mockResolvedValue({ events: [desktopEvent] });
  const first = transcript.attach('session_1', log, writer);
  await new Promise((resolve) => setImmediate(resolve));
  // A holds its refresh lock and waits in the history read.
  expect(lock.acquire).toHaveBeenCalledTimes(1);
  const second = transcript.attach('session_1', log, writer);
  await new Promise((resolve) => setImmediate(resolve));
  expect(lock.acquire).toHaveBeenCalledTimes(1);
  finishRead({ events: [desktopEvent] });
  const [a, b] = await Promise.all([first, second]);
  expect(a).toMatchObject({ mode: 'log', headSeq: oldHead + 1 });
  expect(b).toMatchObject({ mode: 'log', headSeq: oldHead + 1 });
  expect(lock.acquire).toHaveBeenCalledTimes(2);
  expect(lock.release).toHaveBeenCalledTimes(2);
  await log.close();
});

it.each([
  [{ purpose: 'refresh', state: 'held' }],
  [{ purpose: 'drive', state: 'releasing' }],
  [{ purpose: 'drive', state: 'stranded' }],
])(
  'fails closed on an in-process lock held as %o and releases nothing',
  async (entry) => {
    const { lock } = inProcessLock([
      { sessionId: 'session_1', nonce: 'other', ...entry },
    ]);
    const { log, writer, transcript } = await endedTurnLog(
      lock as unknown as ISessionDriverLock,
    );
    await expect(
      transcript.attach('session_1', log, writer),
    ).rejects.toBeInstanceOf(DriverLockUnavailableError);
    expect(lock.acquire).not.toHaveBeenCalled();
    expect(lock.release).not.toHaveBeenCalled();
    await log.close();
  },
);

it('never releases a drive lock that an in-process acquire answered with', async () => {
  const { lock, entries } = inProcessLock();
  const { log, writer, transcript } = await endedTurnLog(
    lock as unknown as ISessionDriverLock,
  );
  // The engine binds its drive lock between the check and the acquire.
  lock.held.mockImplementationOnce(() => []);
  entries.push({
    sessionId: 'session_1',
    nonce: 'engine',
    purpose: 'drive',
    state: 'held',
  });
  expect(await transcript.attach('session_1', log, writer)).toMatchObject({
    mode: 'log',
  });
  expect(lock.acquire).toHaveBeenCalledTimes(1);
  expect(lock.release).not.toHaveBeenCalled();
  expect(entries).toHaveLength(1);
  await log.close();
});

it.each([
  ['re-entrant: answers with its existing nonce', true],
  ['pending: shares its new acquisition', false],
])(
  'never releases a foreign in-process refresh that enters between the check and the acquire (%s)',
  async (_case, reentrant) => {
    const { lock, entries } = inProcessLock();
    const { log, writer, transcript } = await endedTurnLog(
      lock as unknown as ISessionDriverLock,
    );
    const foreign = {
      ...owner,
      label: 'another refresh',
      acquiredAt: '2026-01-01T00:00:00.000Z',
    };
    lock.acquire.mockImplementationOnce(async (sessionId: string) => {
      if (reentrant) {
        // The foreign entry is bound before this acquire answers.
        entries.push({
          sessionId,
          nonce: 'foreign',
          purpose: 'refresh',
          state: 'held',
          owner: foreign,
        });
        return { ok: true, nonce: 'foreign' };
      }
      // The foreign acquisition was pending; both callers get its nonce.
      await new Promise((resolve) => setImmediate(resolve));
      entries.push({
        sessionId,
        nonce: 'foreign',
        purpose: 'refresh',
        state: 'held',
        owner: foreign,
      });
      return { ok: true, nonce: 'foreign' };
    });
    await expect(
      transcript.attach('session_1', log, writer),
    ).rejects.toBeInstanceOf(DriverLockUnavailableError);
    expect(lock.release).not.toHaveBeenCalled();
    expect(entries.map((entry) => entry.nonce)).toEqual(['foreign']);
    await log.close();
  },
);

it('fails an attach whose history read hangs, releases its own refresh lock and frees later attaches', async () => {
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
  try {
    const { lock, entries } = inProcessLock();
    const { log, writer, history, transcript } = await endedTurnLog(
      lock as unknown as ISessionDriverLock,
      { refreshReadTimeoutMs: 1_000 },
    );
    const head = log.head;
    // The first refresh read never settles.
    history.readForResume.mockImplementationOnce(
      () => new Promise(() => undefined),
    );
    const hung = transcript.attach('session_1', log, writer);
    const hungResult = expect(hung).rejects.toBeInstanceOf(
      TranscriptUnavailableError,
    );
    await new Promise((resolve) => setImmediate(resolve));
    // Arrives mid-way, so its own deadline (1.5 s) outlasts the hung read.
    await jest.advanceTimersByTimeAsync(500);
    const later = transcript.attach('session_1', log, writer);
    await jest.advanceTimersByTimeAsync(500);
    await hungResult;
    // Its own refresh lock went; nothing was appended.
    expect(lock.release).toHaveBeenNthCalledWith(
      1,
      'session_1',
      'refresh-nonce-1',
    );
    // The later attach was not blocked: it refreshed under its own lock.
    expect(await later).toMatchObject({ mode: 'log', headSeq: head });
    expect(lock.acquire).toHaveBeenCalledTimes(2);
    expect(lock.release).toHaveBeenLastCalledWith(
      'session_1',
      'refresh-nonce-2',
    );
    expect(entries).toHaveLength(0);
    await log.close();
  } finally {
    jest.useRealTimers();
  }
});

it('fails a queued attach within its own deadline when every history read hangs', async () => {
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
  try {
    const { lock, entries } = inProcessLock();
    const { log, writer, history, transcript } = await endedTurnLog(
      lock as unknown as ISessionDriverLock,
      { refreshReadTimeoutMs: 1_000 },
    );
    history.readForResume.mockImplementation(
      () => new Promise(() => undefined),
    );
    const first = transcript.attach('session_1', log, writer);
    const firstResult = expect(first).rejects.toBeInstanceOf(
      TranscriptUnavailableError,
    );
    await new Promise((resolve) => setImmediate(resolve));
    const queued = transcript.attach('session_1', log, writer);
    const queuedResult = expect(queued).rejects.toBeInstanceOf(
      TranscriptUnavailableError,
    );
    // Both fail at the bound, not at twice the bound, so the client gets
    // TRANSCRIPT_UNAVAILABLE before its own call timeout.
    await jest.advanceTimersByTimeAsync(1_000);
    await firstResult;
    await queuedResult;
    // The queued attach gave up while it waited: it never took a lock.
    expect(lock.acquire).toHaveBeenCalledTimes(1);
    expect(entries).toHaveLength(0);
    await log.close();
  } finally {
    jest.useRealTimers();
  }
});

it('never releases a foreign pending refresh whose owner fields and acquiredAt collide with its own', async () => {
  const { lock, entries } = inProcessLock();
  const { log, writer, transcript } = await endedTurnLog(
    lock as unknown as ISessionDriverLock,
  );
  // The foreign acquisition was pending with the same worker owner fields in
  // the same millisecond; the shared promise answers with its new nonce.
  lock.acquire.mockImplementationOnce(
    async (sessionId: string, holder: typeof owner) => {
      await new Promise((resolve) => setImmediate(resolve));
      entries.push({
        sessionId,
        nonce: 'foreign',
        purpose: 'refresh',
        state: 'held',
        owner: {
          kind: holder.kind,
          hostname: holder.hostname,
          pid: holder.pid,
          label: holder.label,
          acquiredAt: holder.acquiredAt,
          responding: true,
        },
      });
      return { ok: true, nonce: 'foreign' };
    },
  );
  await expect(
    transcript.attach('session_1', log, writer),
  ).rejects.toBeInstanceOf(DriverLockUnavailableError);
  expect(lock.release).not.toHaveBeenCalled();
  expect(entries.map((entry) => entry.nonce)).toEqual(['foreign']);
  await log.close();
});

it('proves and releases its own refresh lock on the real in-process lock', async () => {
  const lock = new NullSessionDriverLock();
  const release = jest.spyOn(lock, 'release');
  const { log, writer, history, transcript } = await endedTurnLog(lock);
  const head = log.head;
  history.readForResume.mockResolvedValue({ events: [desktopEvent] });
  expect(await transcript.attach('session_1', log, writer)).toMatchObject({
    mode: 'log',
    headSeq: head + 1,
  });
  expect(release).toHaveBeenCalledTimes(1);
  expect(lock.held()).toEqual([]);
  await log.close();
});
