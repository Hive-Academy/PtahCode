import {
  REVIEW_LANE_POOL_MAX,
  type ReviewLaneListing,
  type ReviewLaneListingEntry,
} from '@ptah-extension/review-contracts';
import {
  allCatalogsFailed,
  announce,
  duplicateEntryIndexes,
  entryState,
  laneLabel,
  laneOptions,
  modelOptions,
  NO_CHOICE,
  pinLaneOptions,
  poolFull,
  REVIEW_LANE_ROLES,
  toModel,
  usableListing,
} from './review-lane-options';

function lane(overrides: Partial<ReviewLaneListingEntry> & { id: string }): ReviewLaneListingEntry {
  return {
    label: overrides.id.toUpperCase(),
    family: 'openai',
    limitState: 'confirmed-room',
    catalog: { status: 'read', models: ['m-1', 'm-2'], truncated: false, verifiable: true },
    ...overrides,
  };
}

function listing(lanes: ReviewLaneListingEntry[], blockedModels: string[] = []): ReviewLaneListing {
  return { lanes, blockedModels };
}

describe('review lane options', () => {
  it('builds lane options with family and each limit state', () => {
    const options = laneOptions(
      listing([
        lane({ id: 'a', label: 'Lane A' }),
        lane({ id: 'b', label: 'Lane B', family: 'anthropic', limitState: 'at-limit' }),
        lane({ id: 'c', label: 'Lane C', limitState: 'unknown' }),
      ]),
    );
    expect(options.map((o) => [o.value, o.label, o.description])).toEqual([
      ['a', 'Lane A', 'openai · room available'],
      ['b', 'Lane B', 'anthropic · at limit'],
      ['c', 'Lane C', 'openai · limit unknown'],
    ]);
    expect(laneOptions(null)).toEqual([]);
  });

  it('offers Lane default first and the catalog models of the lane', () => {
    const options = modelOptions(listing([lane({ id: 'a' })]), 'a', null);
    expect(options[0]).toEqual({ value: NO_CHOICE, label: 'Lane default', description: 'No model is sent' });
    expect(options.slice(1).map((o) => o.value)).toEqual(['m-1', 'm-2']);
  });

  it('keeps a saved model the verifiable catalog does not offer, marked not offered', () => {
    const saved = modelOptions(listing([lane({ id: 'a' })]), 'a', 'gone')[3];
    expect(saved).toEqual({ value: 'gone', label: 'gone (not offered)', description: 'Kept until you change it.' });
  });

  it('keeps a saved model unchecked when the catalog is not verifiable', () => {
    const failed = lane({ id: 'a', catalog: { status: 'failed', models: [], truncated: false, verifiable: false } });
    const options = modelOptions(listing([failed]), 'a', 'm-9');
    expect(options.map((o) => o.value)).toEqual([NO_CHOICE, 'm-9']);
    expect(options[1]).toEqual({ value: 'm-9', label: 'm-9', description: 'Saved. Not checked.' });
    expect(modelOptions(null, 'a', 'm-9')[1].description).toBe('Saved. Not checked.');
  });

  it('never offers a blocked model and labels a saved blocked model', () => {
    const options = modelOptions(listing([lane({ id: 'a' })], ['m-1']), 'a', 'm-1');
    expect(options.map((o) => o.label)).toEqual(['Lane default', 'm-2', 'm-1 (blocked)']);
  });

  it('marks nothing when the listing is unusable: Status unknown', () => {
    expect(usableListing(listing([lane({ id: 'a' })]), 'error')).toBeNull();
    expect(entryState(null, { lane: 'a', model: 'x' }, 'pool')).toEqual({
      unavailable: false,
      marks: [{ status: 'pending', label: 'Status unknown' }],
      reason: null,
      hints: [],
    });
  });

  it('gives a usable entry no marks and no reason', () => {
    expect(entryState(listing([lane({ id: 'a' })]), { lane: 'a', model: 'm-1' }, 'pool')).toEqual({
      unavailable: false,
      marks: [],
      reason: null,
      hints: [],
    });
  });

  it('reports a missing lane with the pool and pin copy', () => {
    const state = entryState(listing([]), { lane: 'gone', model: null }, 'pool');
    expect(state.unavailable).toBe(true);
    expect(state.marks).toEqual([{ status: 'warning', label: 'Unavailable' }]);
    expect(state.reason).toBe(
      'Lane not listed. It may be uninstalled or disabled in global settings. Reviews skip it and say so.',
    );
    expect(entryState(listing([]), { lane: 'gone', model: null }, 'pin').reason).toBe(
      'Lane not listed. It may be uninstalled or disabled in global settings. Reviews use the pool order and say so.',
    );
  });

  it('reports a lane at its limit with the At limit mark', () => {
    const state = entryState(listing([lane({ id: 'a', limitState: 'at-limit' })]), { lane: 'a', model: null }, 'pool');
    expect(state.marks).toEqual([{ status: 'warning', label: 'At limit' }]);
    expect(state.reason).toBe('At its usage limit. Reviews skip it and say so.');
    expect(state.unavailable).toBe(true);
  });

  it('shows Limit unknown without tint', () => {
    const state = entryState(listing([lane({ id: 'a', limitState: 'unknown' })]), { lane: 'a', model: null }, 'pool');
    expect(state).toEqual({
      unavailable: false,
      marks: [{ status: 'pending', label: 'Limit unknown' }],
      reason: null,
      hints: [],
    });
  });

  it('reports a blocked model even when the catalog is unreadable', () => {
    const failed = lane({ id: 'a', catalog: { status: 'failed', models: [], truncated: false, verifiable: false } });
    const state = entryState(listing([failed, lane({ id: 'b' })], ['m-1']), { lane: 'a', model: 'm-1' }, 'pin');
    expect(state.unavailable).toBe(true);
    expect(state.marks).toEqual([{ status: 'warning', label: 'Unavailable' }]);
    expect(state.reason).toBe('Model blocked for review lanes. Reviews use the pool order and say so.');
    expect(state.hints).toEqual(['Models for this lane could not be read. The saved model is kept.']);
  });

  it('reports a model the verifiable catalog does not offer', () => {
    const state = entryState(listing([lane({ id: 'a' })]), { lane: 'a', model: 'gone' }, 'pool');
    expect(state.reason).toBe('Model not offered by this lane. Reviews skip it and say so.');
    expect(state.unavailable).toBe(true);
  });

  it('never marks not offered on a truncated or unverifiable catalog', () => {
    const truncated = lane({ id: 'a', catalog: { status: 'read', models: ['m-1'], truncated: true, verifiable: false } });
    const state = entryState(listing([truncated]), { lane: 'a', model: 'gone' }, 'pool');
    expect(state.unavailable).toBe(false);
    expect(state.hints).toEqual(['Only the first 500 models are listed.']);
    expect(modelOptions(listing([truncated]), 'a', 'gone')[2].label).toBe('gone');
  });

  it('hints an empty catalog, and suppresses the per-lane read hint when every read failed', () => {
    const empty = lane({ id: 'a', catalog: { status: 'empty', models: [], truncated: false, verifiable: false } });
    expect(entryState(listing([empty]), { lane: 'a', model: null }, 'pool').hints).toEqual([
      'This lane lists no models.',
    ]);
    const failed = lane({ id: 'b', catalog: { status: 'failed', models: [], truncated: false, verifiable: false } });
    const all = listing([failed]);
    expect(allCatalogsFailed(all)).toBe(true);
    expect(allCatalogsFailed(listing([failed, lane({ id: 'c' })]))).toBe(false);
    expect(allCatalogsFailed(listing([]))).toBe(false);
    expect(entryState(all, { lane: 'b', model: null }, 'pool').hints).toEqual([]);
  });

  it('adds Follow the pool and a stale pinned lane to the pin lane options', () => {
    const options = pinLaneOptions(listing([lane({ id: 'a', label: 'Lane A' })]), 'gone');
    expect(options.map((o) => [o.value, o.label])).toEqual([
      [NO_CHOICE, 'Follow the pool'],
      ['a', 'Lane A'],
      ['gone', 'gone (unavailable)'],
    ]);
    expect(options[0].description).toBe('No pin');
    expect(pinLaneOptions(null, 'gone').at(-1)?.label).toBe('gone');
  });

  it('finds duplicates by lane and model, and the pool bound from the schema', () => {
    expect([...duplicateEntryIndexes([
      { lane: 'a', model: null },
      { lane: 'a', model: 'x' },
      { lane: 'a', model: null },
    ])]).toEqual([2]);
    const entries = Array.from({ length: REVIEW_LANE_POOL_MAX }, (_, i) => ({ lane: `l${i}`, model: null }));
    expect(poolFull(entries)).toBe(true);
    expect(poolFull(entries.slice(1))).toBe(false);
  });

  it('builds the announcement texts', () => {
    expect(announce.moved('Codex', 'up', 1, 3)).toBe('Codex moved up to position 1 of 3');
    expect(announce.removed('Codex', 2)).toBe('Codex removed. 2 in pool');
    expect(announce.added('Codex', 4)).toBe('Codex added at position 4');
    expect(announce.pinned('verifier', 'Codex')).toBe('Verifier pinned to Codex');
    expect(announce.pinCleared('security-privacy')).toBe('security-privacy pin cleared');
  });

  it('maps helper values', () => {
    expect(REVIEW_LANE_ROLES).toEqual([
      'triage',
      'correctness-lifecycle',
      'contracts-callers',
      'security-privacy',
      'host-di-config',
      'verifier',
    ]);
    expect(toModel(NO_CHOICE)).toBeNull();
    expect(toModel('m-1')).toBe('m-1');
    expect(laneLabel(null, 'raw-id')).toBe('raw-id');
  });
});
