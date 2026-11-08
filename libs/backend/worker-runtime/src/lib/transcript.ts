import { randomUUID } from 'node:crypto';
import type {
  ISessionDriverLock,
  DriverHolder,
} from '@ptah-extension/platform-core';
import {
  FlatStreamEventSchema,
  type HistoryMark,
  type WorkerMethodResult,
} from '@ptah-extension/worker-protocol';
import type { z } from 'zod';
import {
  SessionEventLog,
  TranscriptUnavailableError,
} from './session-event-log';
import { SessionLogWriter } from './session-log-writer';

type HistoryEvent = z.infer<typeof FlatStreamEventSchema>;
export interface HistoryReader {
  readForResume(sessionId: string): Promise<{ events: HistoryEvent[] }>;
}
export type AttachResult = WorkerMethodResult<'session.attach'>;

export class DriverLockUnavailableError extends Error {
  readonly code = 'DRIVER_LOCK_UNAVAILABLE';
  constructor() {
    super('The session driver lock is unavailable.');
  }
}

export function historyMark(events: readonly HistoryEvent[]): HistoryMark {
  const last = events.at(-1) as { id?: unknown } | undefined;
  return {
    count: events.length,
    lastEventId: typeof last?.id === 'string' && last.id ? last.id : null,
  };
}

function sameMark(a: HistoryMark | null, b: HistoryMark): boolean {
  return !!a && a.count === b.count && a.lastEventId === b.lastEventId;
}

/**
 * A history read during an attach refresh that takes longer fails closed
 * (TRANSCRIPT_UNAVAILABLE). Kept well under the client's per-call timeout
 * (`callTimeoutMs`, 30 s, worker-protocol `frames.ts`) so that answer reaches
 * the client before it gives up with CALL_TIMEOUT.
 */
const REFRESH_READ_TIMEOUT_MS = 20_000;

/**
 * The per-acquire ownership token of a refresh lock. A symbol key survives the
 * lock's owner copies (`{ ...owner }`) and `held()`, and never reaches JSON, so
 * no other process sees it. A lock that drops it fails closed (no release).
 */
const REFRESH_TOKEN = Symbol('transcript.refreshToken');
type TokenedHolder = DriverHolder & { [REFRESH_TOKEN]?: string };

export interface TranscriptOptions {
  /** Bound of one history read during an attach refresh. */
  readonly refreshReadTimeoutMs?: number;
}

/**
 * Session ID → the refresh in flight, settled either way. Process-wide, so
 * every `Transcript` of this process refreshes one session at a time and a
 * `refresh` lock entry of this process that appears during an acquire cannot
 * be another transcript's.
 */
const refreshing = new Map<string, Promise<void>>();

/**
 * Settles with `work`, or fails with TRANSCRIPT_UNAVAILABLE at `deadline`
 * (epoch ms). A `work` that loses the race never rejects unobserved.
 */
async function beforeDeadline<T>(
  work: Promise<T>,
  deadline: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new TranscriptUnavailableError()),
      Math.max(0, deadline - Date.now()),
    );
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
    work.then(
      () => undefined,
      () => undefined,
    );
  }
}

export class Transcript {
  private readonly refreshReadTimeoutMs: number;
  constructor(
    private readonly history: HistoryReader,
    private readonly lock: ISessionDriverLock,
    private readonly owner: DriverHolder,
    options: TranscriptOptions = {},
  ) {
    this.refreshReadTimeoutMs =
      options.refreshReadTimeoutMs ?? REFRESH_READ_TIMEOUT_MS;
  }

  async baseline(sessionId: string, writer: SessionLogWriter): Promise<void> {
    const { events } = await this.read(sessionId);
    await writer.enqueue('worker:baseline', {
      events,
      historyMark: historyMark(events),
    });
  }

  async mark(
    sessionId: string,
    turnId: string,
    writer: SessionLogWriter,
  ): Promise<void> {
    const { events } = await this.read(sessionId);
    await writer.enqueue('worker:history-mark', {
      historyMark: historyMark(events),
      turnId,
    });
  }

  async attach(
    sessionId: string,
    log: SessionEventLog | null,
    writer: SessionLogWriter | null,
    afterSeq?: number,
    driving = false,
    forceSnapshot = false,
  ): Promise<AttachResult> {
    if (!log || !writer || !log.latestMark || forceSnapshot) {
      return {
        mode: 'snapshot',
        events: (await this.read(sessionId)).events,
        live: false,
      };
    }
    if (!driving) {
      const snapshot = await this.refreshSerial(sessionId, log, writer);
      if (snapshot) return snapshot;
    }
    const baseline = log
      .replay()
      .filter((frame) => frame.type === 'worker:baseline')
      .at(-1);
    if (!baseline) throw new TranscriptUnavailableError();
    return {
      mode: 'log',
      epoch: log.epoch,
      fromSeq:
        afterSeq === undefined || afterSeq < baseline.seq
          ? baseline.seq - 1
          : afterSeq,
      headSeq: log.head,
    };
  }

  /**
   * One history refresh per session at a time: an attach that arrives while
   * another one refreshes waits for it, then refreshes itself, so it never
   * replays the head from before the other one's new baseline.
   *
   * One deadline, set when the attach arrives, bounds both the wait for the
   * previous refresh and this attach's history read, so a queued attach also
   * fails with TRANSCRIPT_UNAVAILABLE before the client's call timeout.
   */
  private async refreshSerial(
    sessionId: string,
    log: SessionEventLog,
    writer: SessionLogWriter,
  ): Promise<AttachResult | null> {
    const deadline = Date.now() + this.refreshReadTimeoutMs;
    // The stored promise never rejects; each attach reports its own refresh.
    const previous = refreshing.get(sessionId) ?? Promise.resolve();
    const current = beforeDeadline(previous, deadline).then(() => {
      // Its wait used up the bound: give up before a lock is taken.
      if (Date.now() >= deadline) throw new TranscriptUnavailableError();
      return this.refresh(sessionId, log, writer, deadline);
    });
    // The next attach waits for this refresh and for the previous one, so a
    // queued attach that gave up early never lets two refreshes overlap. The
    // attach that owns this refresh rethrows its error below; a waiting
    // attach then refreshes itself.
    const settled = Promise.allSettled([previous, current]).then(
      () => undefined,
    );
    refreshing.set(sessionId, settled);
    try {
      return await current;
    } finally {
      if (refreshing.get(sessionId) === settled) refreshing.delete(sessionId);
    }
  }

  /**
   * Re-reads history under the session's lock and appends a new baseline when
   * it changed. Returns a labelled snapshot while another process drives.
   */
  private async refresh(
    sessionId: string,
    log: SessionEventLog,
    writer: SessionLogWriter,
    deadline: number,
  ): Promise<AttachResult | null> {
    const own = this.lock.held().find((held) => held.sessionId === sessionId);
    if (own) {
      // A held drive lock of this process is the engine's own record of the
      // session (it stays bound while the session idles between turns). It
      // is borrowed: refresh under it and never release its nonce. Any other
      // in-process entry (a refresh this class did not start, a release in
      // progress, a stranded lock) fails closed.
      if (own.purpose !== 'drive' || own.state !== 'held')
        throw new DriverLockUnavailableError();
      await this.rebaseline(sessionId, log, writer, deadline);
      return null;
    }
    // A unique token carried in the owner proves which entry this acquire
    // created: an in-process acquire is re-entrant and also answers with
    // another caller's pending acquisition.
    const token = randomUUID();
    const stamp: TokenedHolder = {
      ...this.owner,
      acquiredAt: new Date().toISOString(),
      [REFRESH_TOKEN]: token,
    };
    let acquisition;
    try {
      acquisition = await this.lock.acquire(sessionId, stamp, 'refresh');
    } catch {
      throw new DriverLockUnavailableError();
    }
    if (!acquisition.ok) {
      if ('unavailable' in acquisition) throw new DriverLockUnavailableError();
      return {
        mode: 'snapshot',
        events: (await this.read(sessionId)).events,
        live: false,
        drivenBy: acquisition.holder.label,
      };
    }
    const { nonce } = acquisition;
    const entry = this.lock
      .held()
      .find((held) => held.sessionId === sessionId && held.nonce === nonce);
    if (entry?.purpose === 'drive' && entry.state === 'held') {
      // A drive lock bound in the meantime (the engine's record) answered:
      // borrowed, so refresh under it and keep its nonce.
      await this.rebaseline(sessionId, log, writer, deadline);
      return null;
    }
    const ours =
      entry !== undefined &&
      entry.purpose === 'refresh' &&
      entry.state === 'held' &&
      (entry.owner as TokenedHolder)[REFRESH_TOKEN] === token;
    // Never release a nonce this acquire cannot prove it created.
    if (!ours) throw new DriverLockUnavailableError();
    // Release the lock on every path; an error from the refresh itself
    // takes priority over a failed release.
    let refreshError: unknown;
    let refreshFailed = false;
    try {
      await this.rebaseline(sessionId, log, writer, deadline);
    } catch (error) {
      refreshFailed = true;
      refreshError = error;
    }
    const released = await this.lock.release(sessionId, nonce);
    if (refreshFailed) throw refreshError;
    if (released !== 'released') throw new DriverLockUnavailableError();
    return null;
  }

  private async rebaseline(
    sessionId: string,
    log: SessionEventLog,
    writer: SessionLogWriter,
    deadline: number,
  ): Promise<void> {
    // A history read that hangs past the attach's deadline fails this attach
    // (TRANSCRIPT_UNAVAILABLE), which frees the per-session refresh chain and
    // releases a lock this refresh created; its late result is discarded.
    const { events } = await beforeDeadline(this.read(sessionId), deadline);
    if (!sameMark(log.latestMark, historyMark(events)))
      await writer.enqueue('worker:baseline', {
        events,
        historyMark: historyMark(events),
      });
  }

  private async read(sessionId: string): Promise<{ events: HistoryEvent[] }> {
    try {
      return await this.history.readForResume(sessionId);
    } catch {
      throw new TranscriptUnavailableError();
    }
  }
}
