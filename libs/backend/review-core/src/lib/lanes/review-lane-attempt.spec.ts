import type { ReviewLaneCatalog, ReviewLaneSettings } from '@ptah-extension/review-contracts';
import {
  REVIEW_CATALOG_TIMEOUT_MS,
  ReviewLaneAttempt,
  ReviewLaneSettingsUnavailableError,
  catalogLaneIds,
} from './review-lane-attempt';
import type { IReviewLaneClock } from './review-lane-admission.service';
import type { ReviewLaneSource } from './review-lane-selection';
import type { ReviewLaneCandidate } from './review-lane-list';

const lane = (id: string, family: string, limitState: ReviewLaneCandidate['limitState'] = 'confirmed-room'): ReviewLaneCandidate =>
  ({ id, label: id, family, limitState });
const catalog = (models: string[]): ReviewLaneCatalog => ({ status: 'read', models, truncated: false, verifiable: true });

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

class FakeClock implements IReviewLaneClock {
  private next = 1;
  readonly timers = new Map<number, { callback: () => void; ms: number }>();
  now(): number { return 0; }
  setTimeout(callback: () => void, ms: number): ReturnType<typeof setTimeout> {
    const id = this.next++;
    this.timers.set(id, { callback, ms });
    return id as unknown as ReturnType<typeof setTimeout>;
  }
  clearTimeout(handle: ReturnType<typeof setTimeout>): void { this.timers.delete(handle as unknown as number); }
  fire(): void { for (const [id, timer] of [...this.timers]) { this.timers.delete(id); timer.callback(); } }
}

function setup(options: { settings?: ReviewLaneSettings | Error; lanes?: ReviewLaneCandidate[][]; signal?: AbortSignal } = {}) {
  const lists = options.lanes ?? [[lane('a', 'fa'), lane('b', 'fb')]];
  let call = 0;
  const source = {
    list: jest.fn(async () => ({ lanes: lists[Math.min(call++, lists.length - 1)], maxConcurrentAgents: 4 })),
    listModels: jest.fn<Promise<Record<string, ReviewLaneCatalog>>, [readonly string[], AbortSignal]>(async () => ({})),
    modelBlocked: jest.fn((model: string) => model === 'blocked'),
  } satisfies ReviewLaneSource;
  const settingsValue = options.settings ?? { pool: [], pins: {} };
  const store = {
    get: jest.fn(async () => { if (settingsValue instanceof Error) throw settingsValue; return settingsValue; }),
    update: jest.fn(),
  };
  const clock = new FakeClock();
  const logger = { warn: jest.fn() };
  const attempt = new ReviewLaneAttempt({ source, settings: store, clock, logger, ...(options.signal ? { signal: options.signal } : {}) });
  return { attempt, source, store, clock, logger };
}

describe('ReviewLaneAttempt', () => {
  it('makes no catalog read with empty settings and returns maxConcurrentAgents from the same list', async () => {
    const { attempt, source } = setup();
    await expect(attempt.choose({ kind: 'triage' })).resolves.toEqual({
      choice: { lane: lane('a', 'fa'), model: null }, fallback: [], maxConcurrentAgents: 4,
    });
    expect(source.listModels).not.toHaveBeenCalled();
    expect(source.list).toHaveBeenCalledTimes(1);
  });

  it('reads settings and catalogs once per attempt and the lane list fresh for every role (Req 2.8, A12)', async () => {
    const settings: ReviewLaneSettings = {
      pool: [{ lane: 'a', model: 'm1' }, { lane: 'b', model: null }],
      pins: { verifier: { lane: 'c', model: 'm3' }, triage: { lane: 'a', model: 'm1' } },
    };
    const { attempt, source, store, clock } = setup({
      settings,
      lanes: [[lane('a', 'fa'), lane('b', 'fb'), lane('c', 'fc')], [lane('a', 'fa', 'at-limit'), lane('b', 'fb'), lane('c', 'fc')]],
    });
    source.listModels.mockResolvedValue({ a: catalog(['m1']), c: catalog(['m3']) });
    await expect(attempt.choose({ kind: 'triage' })).resolves.toMatchObject({ choice: { lane: { id: 'a' }, model: 'm1' } });
    const second = await attempt.choose({ kind: 'correctness-lifecycle' });
    expect(second.choice?.lane.id).toBe('b');
    expect(second.fallback).toEqual([{ source: 'pool', lane: 'a', model: 'm1', reason: 'at-limit' }]);
    expect(store.get).toHaveBeenCalledTimes(1);
    expect(source.listModels).toHaveBeenCalledTimes(1);
    expect(source.listModels.mock.calls[0][0]).toEqual(['a', 'c']);
    expect(source.list).toHaveBeenCalledTimes(2);
    expect(clock.timers.size).toBe(0);
  });

  it('treats a catalog timeout as unchecked, logs it, and clears the timer', async () => {
    const { attempt, source, clock, logger } = setup({ settings: { pool: [{ lane: 'a', model: 'not-in-catalog' }], pins: {} } });
    let seenSignal: AbortSignal | undefined;
    source.listModels.mockImplementation((_ids, signal) => { seenSignal = signal; return new Promise(() => undefined); });
    const pending = attempt.choose({ kind: 'triage' });
    await flush();
    expect([...clock.timers.values()].map((timer) => timer.ms)).toEqual([REVIEW_CATALOG_TIMEOUT_MS]);
    clock.fire();
    await expect(pending).resolves.toMatchObject({ choice: { lane: { id: 'a' }, model: 'not-in-catalog' }, fallback: [] });
    expect(seenSignal?.aborted).toBe(true);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][1]).toMatchObject({ timedOut: true });
    await attempt.choose({ kind: 'verifier' });
    expect(source.listModels).toHaveBeenCalledTimes(1);
  });

  it('treats a rejected or malformed catalog read as unchecked', async () => {
    const settings: ReviewLaneSettings = { pool: [{ lane: 'a', model: 'not-in-catalog' }], pins: {} };
    const rejected = setup({ settings });
    rejected.source.listModels.mockRejectedValue(new Error('boom'));
    await expect(rejected.attempt.choose({ kind: 'triage' })).resolves.toMatchObject({ choice: { model: 'not-in-catalog' } });
    expect(rejected.logger.warn).toHaveBeenCalledTimes(1);
    expect(rejected.clock.timers.size).toBe(0);

    const malformed = setup({ settings });
    malformed.source.listModels.mockResolvedValue({ a: { status: 'read', models: 'nope' } as unknown as ReviewLaneCatalog });
    await expect(malformed.attempt.choose({ kind: 'triage' })).resolves.toMatchObject({ choice: { model: 'not-in-catalog' } });
  });

  it('marks a model not offered only from a valid catalog', async () => {
    const { attempt, source } = setup({ settings: { pool: [{ lane: 'a', model: 'gone' }, { lane: 'b', model: null }], pins: {} } });
    source.listModels.mockResolvedValue({ a: catalog(['other']) });
    await expect(attempt.choose({ kind: 'triage' })).resolves.toMatchObject({
      choice: { lane: { id: 'b' } }, fallback: [{ source: 'pool', lane: 'a', model: 'gone', reason: 'model-not-offered' }],
    });
  });

  it('skips the catalog read when the attempt is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const { attempt, source } = setup({ settings: { pool: [{ lane: 'a', model: 'm' }], pins: {} }, signal: controller.signal });
    await attempt.choose({ kind: 'triage' });
    expect(source.listModels).not.toHaveBeenCalled();
  });

  it('stops the catalog read when the attempt aborts', async () => {
    const controller = new AbortController();
    const { attempt, source, logger } = setup({ settings: { pool: [{ lane: 'a', model: 'm' }], pins: {} }, signal: controller.signal });
    source.listModels.mockImplementation(() => new Promise(() => undefined));
    const pending = attempt.choose({ kind: 'triage' });
    await flush();
    controller.abort();
    await expect(pending).resolves.toMatchObject({ choice: { lane: { id: 'a' } } });
    expect(logger.warn.mock.calls[0][1]).toMatchObject({ timedOut: false });
  });

  it('passes blocked models through the source check', async () => {
    const { attempt } = setup({ settings: { pool: [{ lane: 'a', model: 'blocked' }, { lane: 'b', model: null }], pins: {} } });
    await expect(attempt.choose({ kind: 'triage' })).resolves.toMatchObject({
      choice: { lane: { id: 'b' } }, fallback: [{ reason: 'model-blocked' }],
    });
  });

  it('counts used families and available pins of later lenses towards diversity (Req 2.7, 3.2)', async () => {
    const lanes = [lane('a', 'fa'), lane('b', 'fb'), lane('c', 'fc')];
    const pinned = setup({ settings: { pool: [], pins: { 'host-di-config': { lane: 'b', model: null } } }, lanes: [lanes] });
    const choice = await pinned.attempt.choose({ kind: 'contracts-callers', usedFamilies: ['fa'], laterLenses: ['security-privacy', 'host-di-config'] });
    expect(choice.choice?.lane.id).toBe('c');

    const unavailablePin = setup({
      settings: { pool: [], pins: { 'host-di-config': { lane: 'b', model: null } } },
      lanes: [[lane('a', 'fa'), lane('b', 'fb', 'at-limit'), lane('c', 'fc')]],
    });
    const next = await unavailablePin.attempt.choose({ kind: 'contracts-callers', laterLenses: ['host-di-config'] });
    expect(next.choice?.lane.id).toBe('a');
  });

  it('uses author family counts for the verifier', async () => {
    const { attempt } = setup({ lanes: [[lane('a', 'fa'), lane('b', 'fb')]] });
    const choice = await attempt.choose({ kind: 'verifier', authorFamilyCounts: { fa: 2, fb: 1 } });
    expect(choice.choice?.lane.id).toBe('b');
  });

  it('fails every role with a typed error when settings cannot be read, without a lane list read', async () => {
    const { attempt, source, store } = setup({ settings: new Error('storage down') });
    await expect(attempt.choose({ kind: 'triage' })).rejects.toBeInstanceOf(ReviewLaneSettingsUnavailableError);
    await expect(attempt.choose({ kind: 'verifier' })).rejects.toThrow('lane-settings-unavailable');
    expect(store.get).toHaveBeenCalledTimes(1);
    expect(source.list).not.toHaveBeenCalled();
  });

  it('propagates a lane list failure', async () => {
    const failing = setup();
    failing.source.list.mockRejectedValue(new Error('list down'));
    await expect(failing.attempt.choose({ kind: 'triage' })).rejects.toThrow('list down');
  });

  it('drops an invalid lane row with a warn log and chooses among the others (M5)', async () => {
    const { attempt, source, logger } = setup();
    source.list.mockResolvedValue({ lanes: [
      { id: 'a', family: 'fa', limitState: 'unknown' } as ReviewLaneCandidate,
      { ...lane('../bad', 'fx') },
      lane('b', 'fb'),
    ], maxConcurrentAgents: 1 });
    await expect(attempt.choose({ kind: 'triage' })).resolves.toEqual({
      choice: { lane: lane('b', 'fb'), model: null }, fallback: [], maxConcurrentAgents: 1,
    });
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('left out'), { dropped: 2 });
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('../bad');
  });

  it('skips a lane whose default model is blocked, and records it for a pool entry (M3)', async () => {
    const blockedDefault = { ...lane('a', 'fa'), defaultModelBlocked: true };
    const unpinned = setup({ lanes: [[blockedDefault, lane('b', 'fb')]] });
    expect((await unpinned.attempt.choose({ kind: 'triage' })).choice?.lane.id).toBe('b');
    const pooled = setup({ lanes: [[blockedDefault, lane('b', 'fb')]],
      settings: { pool: [{ lane: 'a', model: null }, { lane: 'b', model: null }], pins: {} } });
    await expect(pooled.attempt.choose({ kind: 'triage' })).resolves.toEqual(expect.objectContaining({
      choice: { lane: lane('b', 'fb'), model: null },
      fallback: [{ source: 'pool', lane: 'a', model: null, reason: 'model-blocked' }],
    }));
  });

  it('rejects a list that is not the gateway shape', async () => {
    const invalid = setup();
    invalid.source.list.mockResolvedValue({ lanes: 'none', maxConcurrentAgents: 1 } as unknown as Awaited<ReturnType<ReviewLaneSource['list']>>);
    await expect(invalid.attempt.choose({ kind: 'triage' })).rejects.toThrow();
  });

  it('lists catalog lanes once each, only for entries with a model', () => {
    expect(catalogLaneIds({
      pool: [{ lane: 'a', model: 'm' }, { lane: 'a', model: 'n' }, { lane: 'b', model: null }],
      pins: { verifier: { lane: 'c', model: 'm' }, triage: { lane: 'd', model: null } },
    })).toEqual(['a', 'c']);
  });
});
