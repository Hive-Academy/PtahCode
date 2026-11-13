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

  it('drops poison events and advances the cursor after Zod rollback', async () => {
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
    expect(store.commit).toHaveBeenCalledTimes(4);
    expect(store.commit).toHaveBeenLastCalledWith(cursor, []);
    expect(logger.warn).toHaveBeenCalledWith('Usage reconciliation dropped 1 invalid events');
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
