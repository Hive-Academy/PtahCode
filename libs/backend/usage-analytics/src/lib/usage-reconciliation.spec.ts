import 'reflect-metadata';
import { ZodError } from 'zod';
import { UsageReconciliationService, type ReconciliationCollector, type ReconciliationCursor, type ReconciliationCursorStore, type ReconciliationSources } from './usage-reconciliation.service';

const cursor: ReconciliationCursor = {
  sourceId: 'claude-jsonl', sourcePath: '/synthetic/usage.jsonl', fingerprint: 'abc',
  mtimeMs: 1, byteOffset: 8, lastEventKey: null,
};

function fixture() {
  const collector: ReconciliationCollector = {
    sourceId: 'claude-jsonl', collect: jest.fn().mockResolvedValue({ events: [], next: cursor, more: false }),
  };
  const codex: ReconciliationCollector = {
    sourceId: 'codex-rollout', collect: jest.fn().mockResolvedValue({ events: [], next: { ...cursor, sourceId: 'codex-rollout' }, more: false }),
  };
  const sources: ReconciliationSources = {
    listClaudeRoots: jest.fn().mockResolvedValue(['/synthetic']),
    listCodexRoots: jest.fn().mockResolvedValue([]),
    async *listClaudeFiles() { yield '/synthetic/usage.jsonl'; },
    async *listCodexFiles() { /* no synthetic rollout */ },
    realpath: jest.fn().mockImplementation(async (path: string) => path),
  };
  const store: ReconciliationCursorStore = {
    load: jest.fn().mockResolvedValue(null),
    commit: jest.fn().mockResolvedValue(undefined),
  };
  const logger = { debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const service = new UsageReconciliationService(collector, codex, sources, store, logger);
  return { service, collector, sources, store, logger };
}

const { setImmediate: realImmediate } = jest.requireActual<typeof import('node:timers')>('node:timers');

/** The service yields with real immediates, so drain a few event-loop turns too. */
async function flush(): Promise<void> {
  for (let turn = 0; turn < 5; turn++) {
    await jest.advanceTimersByTimeAsync(0);
    await new Promise<void>((resolve) => realImmediate(resolve));
  }
}

describe('usage reconciliation', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('defers startup and scans once after a producer trigger debounce', async () => {
    const { service, collector, store } = fixture();
    expect(collector.collect).not.toHaveBeenCalled();
    service.start();
    expect(collector.collect).not.toHaveBeenCalled();
    await flush();
    expect(collector.collect).toHaveBeenCalledTimes(1);
    service.enqueue({ kind: 'turn-settled', sessionId: 'synthetic', providerId: 'claude', occurredAtMs: 1 });
    await jest.advanceTimersByTimeAsync(1_999);
    expect(collector.collect).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(collector.collect).toHaveBeenCalledTimes(2);
    expect(collector.collect).toHaveBeenCalledWith(cursor.sourcePath, null, 1_048_576);
    expect(store.commit).toHaveBeenCalledTimes(2);
    service.stop();
  });

  it('backs off quiet scans and releases timers on stop', async () => {
    const { service, collector } = fixture();
    service.start();
    await flush();
    expect(collector.collect).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(15 * 60_000);
    expect(collector.collect).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(60 * 60_000);
    expect(collector.collect).toHaveBeenCalledTimes(3);
    service.stop();
    await jest.advanceTimersByTimeAsync(60 * 60_000);
    expect(collector.collect).toHaveBeenCalledTimes(3);
  });

  it('keeps the cursor before a rejected event and logs its path and offset', async () => {
    const { service, collector, store, logger } = fixture();
    const valid = { eventKey: 'valid' } as never;
    const invalid = { eventKey: 'invalid' } as never;
    jest.mocked(collector.collect).mockResolvedValue({ events: [valid, invalid], next: cursor, more: false });
    const error = new ZodError([{
      code: 'custom', path: [], message: 'invalid synthetic contribution',
    }]);
    jest.mocked(store.commit).mockImplementation(async (_next, events) => {
      if (events.includes(invalid)) throw error;
    });
    service.start();
    await flush();
    expect(store.commit).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      'Usage reconciliation file scan failed at /synthetic/usage.jsonl:0', error);
    service.stop();
  });

  it('stops after the file budget and resumes from the next file on a later pass', async () => {
    const { service, collector, sources, store } = fixture();
    store.loadDiscoveryKey = jest.fn().mockResolvedValue(null);
    store.saveDiscoveryKey = jest.fn().mockResolvedValue(undefined);
    sources.listClaudeFiles = async function* (_root, startAfter) {
      for (let index = 19; index >= 0; index--) {
        const file = `/synthetic/${String(index).padStart(2, '0')}.jsonl`;
        if (!startAfter || file < startAfter) yield file;
      }
    };
    service.start();
    await flush();
    await flush();
    expect(collector.collect).toHaveBeenCalledTimes(16);
    expect(store.saveDiscoveryKey).toHaveBeenCalledWith(JSON.stringify({ source: 0, root: '/synthetic', file: '/synthetic/04.jsonl' }));
    service.enqueue({ kind: 'turn-settled', sessionId: 'synthetic', providerId: 'claude', occurredAtMs: 1 });
    await jest.advanceTimersByTimeAsync(2_000);
    await flush();
    await flush();
    expect(collector.collect).toHaveBeenCalledTimes(20);
    expect(store.saveDiscoveryKey).toHaveBeenCalledWith(null);
    service.stop();
  });

  it('continues a budget-limited scan without waiting for the idle interval', async () => {
    const { service, collector, sources } = fixture();
    sources.listClaudeFiles = async function* (_root, startAfter) {
      for (let index = 19; index >= 0; index--) {
        const file = `/synthetic/${String(index).padStart(2, '0')}.jsonl`;
        if (!startAfter || file < startAfter) yield file;
      }
    };
    service.start();
    await flush();
    await flush();
    expect(collector.collect).toHaveBeenCalledTimes(16);
    await jest.advanceTimersByTimeAsync(2_001);
    await flush();
    expect(collector.collect).toHaveBeenCalledTimes(20);
    service.stop();
  });

  it('resumes a file past the 4 MiB cap on the next pass', async () => {
    const { service, collector, store } = fixture();
    store.saveDiscoveryKey = jest.fn().mockResolvedValue(undefined);
    store.load = jest.fn().mockImplementation(async () => {
      const calls = jest.mocked(collector.collect).mock.calls.length;
      return calls ? { ...cursor, byteOffset: calls * 1_048_576 } : null;
    });
    jest.mocked(collector.collect).mockImplementation(async (_file, previous) => ({
      events: [], next: { ...cursor, byteOffset: (previous?.byteOffset ?? 0) + 1_048_576 },
      more: (previous?.byteOffset ?? 0) < 4 * 1_048_576,
    }));
    service.start();
    await flush();
    expect(collector.collect).toHaveBeenCalledTimes(4);
    expect(store.saveDiscoveryKey).toHaveBeenCalledWith(JSON.stringify({ source: 0, root: '/synthetic', file: cursor.sourcePath, pending: true, pendingPasses: 1 }));
    service.enqueue({ kind: 'turn-settled', sessionId: 'synthetic', providerId: 'claude', occurredAtMs: 1 });
    await jest.advanceTimersByTimeAsync(2_000);
    await flush();
    expect(collector.collect).toHaveBeenCalledTimes(5);
    expect(jest.mocked(collector.collect).mock.calls[4][0]).toBe(cursor.sourcePath);
    service.stop();
  });

  it('rotates a continuously growing file and revisits it after scanning the next file', async () => {
    const { service, collector, sources, store } = fixture();
    const growing = '/synthetic/usage.jsonl';
    const other = '/synthetic/other.jsonl';
    const offsets = new Map<string, number>();
    store.loadDiscoveryKey = jest.fn().mockResolvedValue(null);
    store.saveDiscoveryKey = jest.fn().mockResolvedValue(undefined);
    store.load = jest.fn().mockImplementation(async (_sourceId: string, file: string) => {
      const byteOffset = offsets.get(file);
      return byteOffset === undefined ? null : { ...cursor, sourcePath: file, byteOffset };
    });
    store.commit = jest.fn().mockImplementation(async (next: ReconciliationCursor) => {
      offsets.set(next.sourcePath, next.byteOffset);
    });
    sources.listClaudeFiles = async function* (_root, startAfter) {
      for (const file of [growing, other]) if (!startAfter || file < startAfter) yield file;
    };
    jest.mocked(collector.collect).mockImplementation(async (file, previous) => ({
      events: [],
      next: { ...cursor, sourcePath: file, byteOffset: (previous?.byteOffset ?? 0) + (file === growing ? 1_048_576 : 8) },
      more: file === growing,
    }));
    const nextPass = async (pass: number) => {
      service.enqueue({ kind: 'turn-settled', sessionId: 'synthetic', providerId: 'claude', occurredAtMs: pass });
      await jest.advanceTimersByTimeAsync(2_000);
      await flush();
    };
    service.start();
    await flush();
    for (let pass = 1; pass <= 4; pass++) await nextPass(pass);
    expect(jest.mocked(collector.collect).mock.calls.map(([file]) => file)).toContain(other);
    expect(offsets.get(growing)).toBe(16 * 1_048_576);
    await nextPass(5);
    expect(offsets.get(growing)).toBe(20 * 1_048_576);
    service.stop();
  });

  it('loads a legacy pending key without a pass counter', async () => {
    const { service, collector, store } = fixture();
    store.loadDiscoveryKey = jest.fn().mockResolvedValue(JSON.stringify({
      source: 0, root: '/synthetic', file: cursor.sourcePath, pending: true,
    }));
    store.saveDiscoveryKey = jest.fn().mockResolvedValue(undefined);
    service.start();
    await flush();
    expect(collector.collect).toHaveBeenCalledWith(cursor.sourcePath, null, 1_048_576);
    expect(store.saveDiscoveryKey).toHaveBeenCalledWith(JSON.stringify({
      source: 0, root: '/synthetic', file: cursor.sourcePath,
    }));
    service.stop();
  });

  it('continues discovery soon after a pending file completes', async () => {
    const { service, collector, sources, store } = fixture();
    store.loadDiscoveryKey = jest.fn().mockResolvedValue(JSON.stringify({
      source: 0, root: '/synthetic', file: cursor.sourcePath, pending: true, pendingPasses: 1,
    }));
    store.saveDiscoveryKey = jest.fn().mockResolvedValue(undefined);
    sources.listClaudeFiles = async function* (_root, startAfter) {
      expect(startAfter).toBe(cursor.sourcePath);
      yield '/synthetic/next.jsonl';
    };
    service.start();
    await flush();
    expect(collector.collect).not.toHaveBeenCalledWith('/synthetic/next.jsonl', null, 1_048_576);
    await jest.advanceTimersByTimeAsync(2_001);
    await flush();
    expect(collector.collect).toHaveBeenCalledWith('/synthetic/next.jsonl', null, 1_048_576);
    service.stop();
  });

  it('clears a deleted pending file and continues after its path', async () => {
    const { service, collector, sources, store } = fixture();
    store.loadDiscoveryKey = jest.fn().mockResolvedValue(JSON.stringify({
      source: 0, root: '/synthetic', file: '/synthetic/missing.jsonl', pending: true, pendingPasses: 2,
    }));
    store.saveDiscoveryKey = jest.fn().mockResolvedValue(undefined);
    sources.realpath = jest.fn().mockImplementation(async (file: string) => {
      if (file.endsWith('missing.jsonl')) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return file;
    });
    sources.listClaudeFiles = async function* (_root, startAfter) {
      expect(startAfter).toBe('/synthetic/missing.jsonl');
      yield '/synthetic/other.jsonl';
    };
    service.start();
    await flush();
    expect(store.saveDiscoveryKey).toHaveBeenCalledWith(JSON.stringify({
      source: 0, root: '/synthetic', file: '/synthetic/missing.jsonl',
    }));
    service.enqueue({ kind: 'turn-settled', sessionId: 'synthetic', providerId: 'claude', occurredAtMs: 1 });
    await jest.advanceTimersByTimeAsync(2_000);
    await flush();
    expect(collector.collect).toHaveBeenCalledWith('/synthetic/other.jsonl', null, 1_048_576);
    service.stop();
  });

  it('continues by path through insertion and deletion at the boundary', async () => {
    const { service, collector, sources, store } = fixture();
    let files = Array.from({ length: 20 }, (_, index) => `/synthetic/${String(index).padStart(2, '0')}.jsonl`);
    store.loadDiscoveryKey = jest.fn().mockResolvedValue(null);
    store.saveDiscoveryKey = jest.fn().mockResolvedValue(undefined);
    sources.listClaudeFiles = async function* (_root, startAfter) {
      for (const file of [...files].sort().reverse()) if (!startAfter || file < startAfter) yield file;
    };
    service.start();
    await flush();
    await flush();
    files = files.filter((file) => file !== '/synthetic/04.jsonl');
    files.push('/synthetic/20.jsonl', '/synthetic/02a.jsonl');
    service.enqueue({ kind: 'turn-settled', sessionId: 'synthetic', providerId: 'claude', occurredAtMs: 1 });
    await jest.advanceTimersByTimeAsync(2_000);
    await flush();
    expect(jest.mocked(collector.collect).mock.calls.slice(16).map(([file]) => file))
      .toEqual(['/synthetic/03.jsonl', '/synthetic/02a.jsonl', '/synthetic/02.jsonl', '/synthetic/01.jsonl', '/synthetic/00.jsonl']);
    service.enqueue({ kind: 'turn-settled', sessionId: 'synthetic', providerId: 'claude', occurredAtMs: 2 });
    await jest.advanceTimersByTimeAsync(2_000);
    await flush();
    expect(jest.mocked(collector.collect).mock.calls.map(([file]) => file)).toContain('/synthetic/20.jsonl');
    service.stop();
  });

  it('passes the continuation into discovery and limits yielded entries', async () => {
    const { service, sources, store } = fixture();
    const key = { source: 0, root: '/synthetic', file: '/synthetic/0500.jsonl' };
    store.loadDiscoveryKey = jest.fn().mockResolvedValue(JSON.stringify(key));
    store.saveDiscoveryKey = jest.fn().mockResolvedValue(undefined);
    let yielded = 0;
    sources.listClaudeFiles = async function* (_root, startAfter) {
      expect(startAfter).toBe(key.file);
      for (let index = 499; index >= 0; index--) {
        yielded++;
        yield `/synthetic/${String(index).padStart(4, '0')}.jsonl`;
      }
    };
    service.start();
    await flush();
    await flush();
    expect(yielded).toBeLessThanOrEqual(17);
    service.stop();
  });

  it('retries a changed file on a later pass and runs the after-pass hook', async () => {
    const { service, collector, logger } = fixture();
    jest.mocked(collector.collect).mockRejectedValueOnce(new Error('File changed'));
    const hook = jest.fn().mockResolvedValue(undefined);
    service.setAfterPass(hook);
    service.start();
    await flush();
    expect(logger.debug).toHaveBeenCalled();
    expect(hook).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(15 * 60_000);
    expect(collector.collect).toHaveBeenCalledTimes(2);
    service.stop();
  });
});
