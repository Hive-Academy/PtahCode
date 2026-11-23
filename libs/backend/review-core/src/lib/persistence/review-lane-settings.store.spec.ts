import 'reflect-metadata';
import { createMockStateStorage } from '@ptah-extension/platform-core/testing';
import type { ReviewLaneSettings } from '@ptah-extension/review-contracts';
import {
  REVIEW_LANE_SETTINGS_KEY,
  ReviewLaneSettingsStore,
} from './review-lane-settings.store';

const settings: ReviewLaneSettings = {
  pool: [
    { lane: 'codex', model: 'gpt-5.3-codex' },
    { lane: 'ptah-cli:pc-0f8fad5b-d9cb-469f-a165-70867728950e', model: null },
    { lane: 'claude', model: 'claude-opus[1m]' },
  ],
  pins: { verifier: { lane: 'gemini', model: null }, 'security-privacy': { lane: 'codex', model: null } },
};

function setup(seed?: Record<string, unknown>) {
  const storage = createMockStateStorage(seed ? { seed } : undefined);
  const logger = { warn: jest.fn() };
  return { storage, logger, store: new ReviewLaneSettingsStore(storage, logger) };
}

describe('ReviewLaneSettingsStore', () => {
  it('returns empty settings when nothing was saved', async () => {
    const { store, logger } = setup();
    await expect(store.get()).resolves.toEqual({ pool: [], pins: {} });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('round trips pool and pins in order under the versioned key', async () => {
    const { store, storage } = setup();
    await expect(store.update(settings)).resolves.toEqual(settings);
    expect(storage.__state.entries.get(REVIEW_LANE_SETTINGS_KEY)).toEqual({ version: 1, ...settings });
    await expect(store.get()).resolves.toEqual(settings);
    expect((await store.get()).pool.map((entry) => entry.lane)).toEqual(settings.pool.map((entry) => entry.lane));
  });

  it.each([
    ['a wrong version', { version: 2, pool: [], pins: {} }],
    ['an unknown key', { version: 1, pool: [], pins: {}, extra: true }],
    ['an unknown role', { version: 1, pool: [], pins: { reviewer: { lane: 'codex', model: null } } }],
    ['a duplicate pool entry', { version: 1, pool: [{ lane: 'codex', model: null }, { lane: 'codex', model: null }], pins: {} }],
    ['a non-object', 'secret-looking-text'],
  ])('logs and returns empty settings for %s without logging values', async (_label, document) => {
    const { store, logger } = setup({ [REVIEW_LANE_SETTINGS_KEY]: document });
    await expect(store.get()).resolves.toEqual({ pool: [], pins: {} });
    await expect(store.read()).resolves.toEqual({ settings: { pool: [], pins: {} }, corrupt: true });
    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('secret-looking-text');
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('codex');
  });

  it('reports a missing or valid document as not corrupt', async () => {
    const { store } = setup();
    await expect(store.read()).resolves.toEqual({ settings: { pool: [], pins: {} }, corrupt: false });
    await store.update(settings);
    await expect(store.read()).resolves.toEqual({ settings, corrupt: false });
  });

  it('repairs a corrupt document on the next save (M1)', async () => {
    const { store } = setup({ [REVIEW_LANE_SETTINGS_KEY]: { version: 2 } });
    expect((await store.read()).corrupt).toBe(true);
    await store.update({ pool: [], pins: {} });
    await expect(store.read()).resolves.toEqual({ settings: { pool: [], pins: {} }, corrupt: false });
  });

  it('propagates a throwing state read', async () => {
    const storage = createMockStateStorage({ get: () => { throw new Error('storage down'); } });
    const failing = new ReviewLaneSettingsStore(storage, { warn: jest.fn() });
    await expect(failing.get()).rejects.toThrow('storage down');
  });

  it('rejects an invalid update and leaves the stored document unchanged', async () => {
    const { store, storage } = setup();
    await store.update(settings);
    const before = storage.__state.entries.get(REVIEW_LANE_SETTINGS_KEY);
    storage.update.mockClear();
    const duplicate = { pool: [{ lane: 'codex', model: null }, { lane: 'codex', model: null }], pins: {} };
    await expect(store.update(duplicate)).rejects.toThrow();
    const unknownRole = { pool: [], pins: { reviewer: { lane: 'codex', model: null } } } as unknown as ReviewLaneSettings;
    await expect(store.update(unknownRole)).rejects.toThrow();
    await expect(store.update({ pool: [{ lane: '', model: null }], pins: {} })).rejects.toThrow();
    expect(storage.update).not.toHaveBeenCalled();
    expect(storage.__state.entries.get(REVIEW_LANE_SETTINGS_KEY)).toEqual(before);
  });
});
