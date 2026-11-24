import type { ReviewLaneCatalog, ReviewLaneRole, ReviewLaneSettings } from '@ptah-extension/review-contracts';
import {
  isVerifiableCatalog,
  selectReviewLane,
  type ReviewLaneSelectionInput,
} from './review-lane-selection';
import type { ReviewLaneCandidate } from './review-lane-list';

const lane = (id: string, family: string, limitState: ReviewLaneCandidate['limitState'] = 'confirmed-room'): ReviewLaneCandidate =>
  ({ id, label: id, family, limitState });
const catalog = (models: string[], extra: Partial<ReviewLaneCatalog> = {}): ReviewLaneCatalog =>
  ({ status: 'read', models, truncated: false, verifiable: true, ...extra });
const empty: ReviewLaneSettings = { pool: [], pins: {} };

function select(partial: Partial<ReviewLaneSelectionInput> & { kind: ReviewLaneRole; lanes: ReviewLaneCandidate[] }) {
  return selectReviewLane({
    settings: empty, catalog: {}, blocked: () => false, avoidFamilies: new Set(), ...partial,
  });
}

/** Runs the four lenses in order, as the lens stage will, carrying the families used so far. */
function runLenses(lanes: ReviewLaneCandidate[], settings: ReviewLaneSettings = empty): string[] {
  const used = new Set<string>();
  const families: string[] = [];
  for (const kind of ['correctness-lifecycle', 'contracts-callers', 'security-privacy', 'host-di-config'] as const) {
    const choice = select({ kind, lanes, settings, avoidFamilies: new Set(used) }).choice;
    if (!choice) throw new Error('no lane');
    used.add(choice.lane.family);
    families.push(choice.lane.family);
  }
  return families;
}

describe('selectReviewLane', () => {
  describe('empty settings (Req 2.1, 2.2, D6)', () => {
    it('uses the gateway order, skips at-limit lanes silently and sends no model', () => {
      const result = select({ kind: 'triage', lanes: [lane('a', 'fa', 'at-limit'), lane('b', 'fb', 'unknown'), lane('c', 'fc')] });
      expect(result).toEqual({ choice: { lane: lane('b', 'fb', 'unknown'), model: null }, fallback: [] });
    });

    it('spreads the four lenses over at least two families when two are available (#1481)', () => {
      const families = runLenses([lane('claude', 'anthropic'), lane('claude-2', 'anthropic'), lane('codex', 'openai')]);
      expect(new Set(families).size).toBe(2);
      expect(families).toEqual(['anthropic', 'openai', 'anthropic', 'anthropic']);
    });

    it('returns no choice when every lane is at limit (Req 4.5)', () => {
      expect(select({ kind: 'triage', lanes: [lane('a', 'fa', 'at-limit')] })).toEqual({ choice: null, fallback: [] });
    });
  });

  describe('pool (Req 2.3-2.6)', () => {
    it('uses min(N, 4) families in pool order', () => {
      const settings: ReviewLaneSettings = {
        pool: [{ lane: 'a1', model: null }, { lane: 'a2', model: null }, { lane: 'b', model: null }, { lane: 'c', model: null }],
        pins: {},
      };
      const lanes = [lane('c', 'fc'), lane('b', 'fb'), lane('a2', 'fa'), lane('a1', 'fa'), lane('outside', 'fz')];
      expect(runLenses(lanes, settings)).toEqual(['fa', 'fb', 'fc', 'fa']);
    });

    it('keeps every lens on one family when the pool has one family', () => {
      const settings: ReviewLaneSettings = { pool: [{ lane: 'a1', model: null }, { lane: 'a2', model: 'm2' }], pins: {} };
      expect(runLenses([lane('a1', 'fa'), lane('a2', 'fa'), lane('b', 'fb')], settings)).toEqual(['fa', 'fa', 'fa', 'fa']);
    });

    it('passes the pool entry model to the choice (Req 2.5)', () => {
      const settings: ReviewLaneSettings = { pool: [{ lane: 'a', model: 'gpt-5.3-codex' }], pins: {} };
      expect(select({ kind: 'triage', lanes: [lane('a', 'fa')], settings }).choice).toEqual({ lane: lane('a', 'fa'), model: 'gpt-5.3-codex' });
    });

    it('never uses a lane outside a set pool (Req 2.6, A11)', () => {
      const settings: ReviewLaneSettings = { pool: [{ lane: 'a', model: null }], pins: {} };
      expect(select({ kind: 'triage', lanes: [lane('a', 'fa', 'at-limit'), lane('b', 'fb')], settings })).toEqual({
        choice: null, fallback: [{ source: 'pool', lane: 'a', model: null, reason: 'at-limit' }],
      });
    });
  });

  describe('availability and skip notes (Req 4.1-4.4)', () => {
    const settings: ReviewLaneSettings = {
      pool: [
        { lane: 'gone', model: null },
        { lane: 'busy', model: null },
        { lane: 'x', model: 'blocked-model' },
        { lane: 'x', model: 'missing-model' },
        { lane: 'x', model: 'ok-model' },
        { lane: 'y', model: null },
      ],
      pins: {},
    };
    const lanes = [lane('busy', 'fb', 'at-limit'), lane('x', 'fx'), lane('y', 'fy')];

    it('records each unavailable pool entry before the choice, in order, with its reason', () => {
      const result = select({ kind: 'triage', lanes, settings, catalog: { x: catalog(['ok-model']) }, blocked: (model) => model === 'blocked-model' });
      expect(result.choice).toEqual({ lane: lane('x', 'fx'), model: 'ok-model' });
      expect(result.fallback).toEqual([
        { source: 'pool', lane: 'gone', model: null, reason: 'lane-not-listed' },
        { source: 'pool', lane: 'busy', model: null, reason: 'at-limit' },
        { source: 'pool', lane: 'x', model: 'blocked-model', reason: 'model-blocked' },
        { source: 'pool', lane: 'x', model: 'missing-model', reason: 'model-not-offered' },
      ]);
    });

    it.each([
      ['no catalog read', {}],
      ['a failed read', { x: catalog([], { status: 'failed', verifiable: false }) }],
      ['an empty read', { x: catalog([], { status: 'empty', verifiable: false }) }],
      ['a truncated read', { x: catalog(['other'], { truncated: true }) }],
      ['a config-only read', { x: catalog(['other'], { verifiable: false }) }],
    ])('passes a saved model unchecked after %s (Req 4.2, A5)', (_label, catalogs) => {
      const pool: ReviewLaneSettings = { pool: [{ lane: 'x', model: 'missing-model' }], pins: {} };
      expect(select({ kind: 'triage', lanes, settings: pool, catalog: catalogs }).choice?.model).toBe('missing-model');
    });

    it('does not treat a truncated catalog as verifiable even when the producer says so', () => {
      expect(isVerifiableCatalog(catalog(['a'], { truncated: true }))).toBe(false);
      expect(isVerifiableCatalog(catalog(['a'], { status: 'failed' }))).toBe(false);
      expect(isVerifiableCatalog(catalog(['a']))).toBe(true);
      expect(isVerifiableCatalog(undefined)).toBe(false);
    });

    it('blocks a model even when its catalog was not read', () => {
      const pool: ReviewLaneSettings = { pool: [{ lane: 'x', model: 'blocked-model' }], pins: {} };
      expect(select({ kind: 'triage', lanes, settings: pool, blocked: () => true })).toEqual({
        choice: null, fallback: [{ source: 'pool', lane: 'x', model: 'blocked-model', reason: 'model-blocked' }],
      });
    });
  });

  describe('blocked lane default model (M3)', () => {
    const blockedDefault = { ...lane('a', 'fa'), defaultModelBlocked: true };
    it('skips a lane default entry, records a pin or pool skip, and keeps a named model on that lane', () => {
      const lanes = [blockedDefault, lane('b', 'fb')];
      expect(select({ kind: 'triage', lanes }).choice?.lane.id).toBe('b');
      expect(select({ kind: 'verifier', lanes, settings: { pool: [], pins: { verifier: { lane: 'a', model: null } } } })).toEqual({
        choice: { lane: lane('b', 'fb'), model: null },
        fallback: [{ source: 'pin', lane: 'a', model: null, reason: 'model-blocked' }],
      });
      expect(select({ kind: 'triage', lanes, settings: { pool: [{ lane: 'a', model: 'ok-model' }], pins: {} } }).choice)
        .toEqual({ lane: blockedDefault, model: 'ok-model' });
    });
  });

  describe('pins (Req 3.1, 3.5, 4.3)', () => {
    it('honours an available pin over pool order and diversity, without skip notes', () => {
      const settings: ReviewLaneSettings = {
        pool: [{ lane: 'b', model: null }],
        pins: { 'security-privacy': { lane: 'a', model: 'm' } },
      };
      const result = select({ kind: 'security-privacy', lanes: [lane('a', 'fa'), lane('b', 'fb')], settings, avoidFamilies: new Set(['fa']) });
      expect(result).toEqual({ choice: { lane: lane('a', 'fa'), model: 'm' }, fallback: [] });
    });

    it('honours a verifier pin on a lens author family', () => {
      const settings: ReviewLaneSettings = { pool: [], pins: { verifier: { lane: 'a', model: null } } };
      const result = select({ kind: 'verifier', lanes: [lane('a', 'fa'), lane('b', 'fb')], settings, authorFamilyCounts: new Map([['fa', 3]]) });
      expect(result.choice?.lane.id).toBe('a');
    });

    it('records an unavailable pin and runs on what the pool would choose', () => {
      const settings: ReviewLaneSettings = {
        pool: [{ lane: 'b', model: null }],
        pins: { triage: { lane: 'a', model: 'm' } },
      };
      const result = select({ kind: 'triage', lanes: [lane('a', 'fa', 'at-limit'), lane('b', 'fb')], settings });
      expect(result).toEqual({
        choice: { lane: lane('b', 'fb'), model: null },
        fallback: [{ source: 'pin', lane: 'a', model: 'm', reason: 'at-limit' }],
      });
    });

    it('falls back to the global order for an unavailable pin when no pool is set', () => {
      const settings: ReviewLaneSettings = { pool: [], pins: { triage: { lane: 'gone', model: null } } };
      const result = select({ kind: 'triage', lanes: [lane('a', 'fa')], settings });
      expect(result).toEqual({
        choice: { lane: lane('a', 'fa'), model: null },
        fallback: [{ source: 'pin', lane: 'gone', model: null, reason: 'lane-not-listed' }],
      });
    });

    it('ignores pins of other roles', () => {
      const settings: ReviewLaneSettings = { pool: [], pins: { verifier: { lane: 'b', model: null } } };
      expect(select({ kind: 'triage', lanes: [lane('a', 'fa'), lane('b', 'fb')], settings }).choice?.lane.id).toBe('a');
    });
  });

  describe('verifier family (Req 3.3, 3.4)', () => {
    const lanes = [lane('a', 'fa'), lane('b', 'fb'), lane('c', 'fc')];

    it('prefers a family that authored none of the candidates', () => {
      const result = select({ kind: 'verifier', lanes, authorFamilyCounts: new Map([['fa', 2], ['fb', 1]]) });
      expect(result.choice?.lane.family).toBe('fc');
    });

    it('chooses the family with the fewest candidates when every family authored some', () => {
      const result = select({ kind: 'verifier', lanes, authorFamilyCounts: new Map([['fa', 2], ['fb', 1], ['fc', 3]]) });
      expect(result.choice?.lane.family).toBe('fb');
    });

    it('breaks ties by pool order, then by the global order without a pool', () => {
      const counts = new Map([['fa', 1], ['fb', 1], ['fc', 1]]);
      expect(select({ kind: 'verifier', lanes, authorFamilyCounts: counts }).choice?.lane.id).toBe('a');
      const settings: ReviewLaneSettings = { pool: [{ lane: 'c', model: null }, { lane: 'b', model: null }], pins: {} };
      expect(select({ kind: 'verifier', lanes, settings, authorFamilyCounts: counts }).choice?.lane.id).toBe('c');
    });

    it('ignores lens diversity input for the verifier', () => {
      const result = select({ kind: 'verifier', lanes, avoidFamilies: new Set(['fa']), authorFamilyCounts: new Map() });
      expect(result.choice?.lane.id).toBe('a');
    });
  });

  it('ignores lens diversity for triage', () => {
    expect(select({ kind: 'triage', lanes: [lane('a', 'fa'), lane('b', 'fb')], avoidFamilies: new Set(['fa']) }).choice?.lane.id).toBe('a');
  });

  it('lets a lens record a skipped pool entry it would otherwise have preferred', () => {
    const settings: ReviewLaneSettings = { pool: [{ lane: 'a', model: null }, { lane: 'b', model: null }, { lane: 'c', model: null }], pins: {} };
    const result = select({
      kind: 'contracts-callers', lanes: [lane('a', 'fa'), lane('b', 'fb', 'at-limit'), lane('c', 'fc')], settings, avoidFamilies: new Set(['fa']),
    });
    expect(result).toEqual({
      choice: { lane: lane('c', 'fc'), model: null },
      fallback: [{ source: 'pool', lane: 'b', model: null, reason: 'at-limit' }],
    });
  });
});
