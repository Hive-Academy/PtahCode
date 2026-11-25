import type { IStateStorage } from '@ptah-extension/platform-core';
import type { CliDetectionResult } from '@ptah-extension/shared';
import type { LaneModelEntry, LaneModelListing } from '../lane-model-listing.port';
import type { LaneRoutingLogger } from '../lane-routing-logger';
import {
  CATALOG_REFRESH_AGE_MS,
  CATALOG_REFRESH_TIMEOUT_MS,
  CATALOG_RETRY_AFTER_MS,
  CATALOG_STORAGE_KEY,
} from '../routing-constants';
import { LaneCatalogStore } from './lane-catalog.store';

const row: CliDetectionResult = { cli: 'claude', installed: true, messagingMode: 'none' };
const model = { id: 'Sonnet', provenance: 'reported' } as const;
const withUnknown = { ...model, efforts: { provenance: 'unknown' } };

function setup(raw?: unknown) {
  const values = new Map([[CATALOG_STORAGE_KEY, raw]]);
  const storage = {
    get<T>(key: string): T | undefined {
      return values.get(key) as T | undefined;
    },
    update: jest.fn(async (key: string, value: unknown) => {
      values.set(key, value);
    }),
    keys: jest.fn(() => [...values.keys()]),
  } satisfies IStateStorage;
  const logger = {
    debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
  } satisfies LaneRoutingLogger;
  const listing: jest.Mocked<LaneModelListing> = { list: jest.fn().mockResolvedValue([model]) };
  const get = jest.spyOn(storage, 'get');
  const store = new LaneCatalogStore(storage, listing, logger);
  return { storage, get, logger, listing, store };
}

describe('LaneCatalogStore', () => {
  afterEach(() => jest.restoreAllMocks());

  it('copies exact model and effort strings, dropping only blank ids and non-string efforts', async () => {
    const { storage, get, logger, listing, store } = setup();
    const supported = [' MEDIUM ', '', 'low', ' MEDIUM '];
    const native = {
      id: ' Vendor.Model ',
      auto: false,
      provenance: 'configured',
      efforts: {
        provenance: 'native',
        supported: [...supported, 42 as unknown as string],
        default: ' HIGH ',
      },
    } as const;
    const fallback = {
      id: model.id,
      provenance: 'fallback',
      efforts: { provenance: 'ptah-fallback', supported: ['Balanced'], default: null },
    } as const;
    const empty = {
      id: 'no-effort',
      provenance: 'reported',
      efforts: { provenance: 'native', supported: [], default: null },
    } as const;
    listing.list.mockResolvedValue([
      native, { id: ' \t', provenance: 'reported' }, model, fallback, empty,
    ]);

    const entry = await store.refresh(row, 100);
    expect(entry).toEqual({
      laneId: 'claude',
      models: [{ ...native, efforts: { ...native.efforts, supported } }, withUnknown, fallback, empty],
      status: 'ok',
      fetchedAt: 100,
      lastOkAt: 100,
    });
    expect(storage.update).toHaveBeenCalledWith(CATALOG_STORAGE_KEY, { version: 1, entries: [entry] });
    const reloaded = new LaneCatalogStore(storage, listing, logger);
    get.mockClear();
    expect(reloaded.get('claude')).toEqual(entry);
    expect(reloaded.entries()).toEqual([entry]);
    expect(get).not.toHaveBeenCalled();
  });

  it('keeps only the last good models after an error or an empty result', async () => {
    const { storage, logger, listing, store } = setup();
    await store.refresh(row, 100);
    listing.list.mockRejectedValueOnce(new TypeError('private hostname and stderr'));
    const failed = await store.refresh(row, 200);
    expect(failed).toEqual({
      laneId: 'claude', models: [withUnknown], status: 'error', fetchedAt: 200, lastOkAt: 100,
    });
    expect(logger.warn.mock.calls).toEqual([[
      '[lane-routing] catalog refresh failed',
      { laneId: 'claude', status: 'error', errorClass: 'TypeError' },
    ]]);

    listing.list.mockResolvedValueOnce([{ ...model, id: '' }]);
    const empty = await store.refresh(row, 300);
    expect(empty).toEqual({ ...failed, status: 'empty', fetchedAt: 300 });
    const reloaded = new LaneCatalogStore(storage, listing, logger);
    expect(reloaded.get('claude')).toEqual(empty);

    listing.list.mockResolvedValueOnce([{ ...model, id: 'new-list' }]);
    expect(await store.refresh(row, 400)).toEqual({
      ...failed,
      status: 'ok',
      fetchedAt: 400,
      lastOkAt: 400,
      models: [{ ...withUnknown, id: 'new-list' }],
    });
  });

  it('triggers only when due and shares a flight per lane', async () => {
    const { listing, store } = setup();
    const start = 100;
    expect(store.refreshIfDue(row, start)).toBeUndefined();
    const initial = store.refresh(row, start + 1);
    expect(store.refresh(row, start + 2)).toBe(initial);
    await initial;

    const stale = start + CATALOG_REFRESH_AGE_MS;
    store.refreshIfDue(row, stale - 1);
    await Promise.resolve();
    expect(listing.list).toHaveBeenCalledTimes(1);

    listing.list.mockRejectedValueOnce(new Error('read failed'));
    store.refreshIfDue(row, stale);
    expect((await store.refresh(row, stale)).status).toBe('error');
    const retry = stale + CATALOG_RETRY_AFTER_MS;
    store.refreshIfDue(row, retry - 1);
    await Promise.resolve();
    expect(listing.list).toHaveBeenCalledTimes(2);
    store.refreshIfDue(row, retry);
    expect((await store.refresh(row, retry)).status).toBe('ok');
    expect(listing.list).toHaveBeenCalledTimes(3);
  });

  it('times out an uncooperative listing and ignores its late result', async () => {
    const { listing, logger, store } = setup();
    await store.refresh(row, 100);
    const deadline = new AbortController();
    const timeout = jest.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
    let finish!: (models: readonly LaneModelEntry[]) => void;
    listing.list.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));

    const pending = store.refresh(row, 200);
    await Promise.resolve();
    await Promise.resolve();
    expect(timeout).toHaveBeenCalledWith(CATALOG_REFRESH_TIMEOUT_MS);
    expect(listing.list).toHaveBeenLastCalledWith(row, deadline.signal);
    deadline.abort(new DOMException('private timeout text', 'TimeoutError'));
    const entry = await pending;

    expect(entry).toEqual({
      laneId: 'claude', models: [withUnknown], status: 'timeout', fetchedAt: 200, lastOkAt: 100,
    });
    expect(logger.warn.mock.calls).toEqual([[
      '[lane-routing] catalog refresh failed',
      { laneId: 'claude', status: 'timeout', errorClass: 'DOMException' },
    ]]);
    finish([{ ...model, id: 'late' }]);
    await Promise.resolve();
    expect(store.get('claude')).toBe(entry);
  });

  it('drops an invalid document with one warning and keeps reads free of I/O', () => {
    const { logger, get, store } = setup({
      version: 1,
      entries: [{ laneId: 'private host text', models: [model], status: 'ok', fetchedAt: 1, lastOkAt: 1 }],
    });
    expect(store.entries()).toEqual([]);
    expect(store.get('private host text')).toBeUndefined();
    expect(get).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls).toEqual([[
      '[lane-routing] catalog snapshot is invalid', { status: 'error' },
    ]]);
  });

  it('serializes persistence for separate lanes and keeps the snapshot after a write failure', async () => {
    const { storage, logger, listing, store } = setup();
    storage.update.mockRejectedValueOnce(new Error('private storage path'));
    const secondRow: CliDetectionResult = { ...row, cli: 'ptah-cli', ptahCliId: 'custom' };
    const [first, second] = await Promise.all([store.refresh(row, 100), store.refresh(secondRow, 100)]);
    expect(first.status).toBe('ok');
    expect(second.laneId).toBe('custom');
    expect(new LaneCatalogStore(storage, listing, logger).entries()).toEqual([first, second]);
    expect(logger.warn.mock.calls).toEqual([[
      '[lane-routing] catalog snapshot write failed',
      { laneId: 'claude', status: 'error', errorClass: 'Error' },
    ]]);
  });
});
