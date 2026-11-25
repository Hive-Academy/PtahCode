import {
  EMPTY_REVIEW_LANE_SETTINGS,
  LensSchema,
  REVIEW_LANE_BLOCKED_MODELS_MAX,
  REVIEW_LANE_CATALOG_MAX,
  REVIEW_LANE_ERROR_MESSAGES,
  REVIEW_LANE_POOL_MAX,
  ReviewLaneCatalogSchema,
  ReviewLaneErrorCode,
  ReviewLaneFallbackSchema,
  ReviewLaneIdSchema,
  ReviewLaneListingSchema,
  ReviewLanePinsSchema,
  ReviewLaneRoleSchema,
  ReviewLaneSettingsSchema,
  ReviewModelIdSchema,
  StageRecordSchema,
  duplicatePoolEntryIndex,
} from '../index';

const ptahCliLane = 'ptah-cli:pc-0b5f7c1e-3d2a-4f6b-9a8c-1e2d3c4b5a69';

describe('review lane and model ids', () => {
  it('accepts system and Ptah CLI lane ids, trimmed', () => {
    expect(ptahCliLane).toHaveLength(48);
    for (const id of ['codex', 'claude', 'gemini', ptahCliLane]) {
      expect(ReviewLaneIdSchema.parse(id)).toBe(id);
    }
    expect(ReviewLaneIdSchema.parse('  codex  ')).toBe('codex');
  });

  it('rejects empty, over-long and malformed lane ids', () => {
    for (const id of ['', '   ', 'a'.repeat(129), '-codex', 'co dex', 'codex/x', '../x']) {
      expect(ReviewLaneIdSchema.safeParse(id).success).toBe(false);
    }
    expect(ReviewLaneIdSchema.safeParse('a'.repeat(128)).success).toBe(true);
  });

  it('accepts real model id shapes from live catalogs', () => {
    const ids = [
      'gpt-5.3-codex',
      'gpt-6.1-sol',
      'claude-opus-4.6',
      'claude-sonnet-5-5',
      'provider/model',
      'openrouter/meta-llama/llama-4:free',
      'claude-opus-5-5[1m]',
      'model@2026-01-01',
      'org+team/model',
    ];
    for (const id of ids) expect(ReviewModelIdSchema.parse(id)).toBe(id);
  });

  it('rejects empty, over-long and malformed model ids', () => {
    for (const id of ['', '  ', 'a'.repeat(201), '/model', 'Notice: models updated', 'model\nx']) {
      expect(ReviewModelIdSchema.safeParse(id).success).toBe(false);
    }
    expect(ReviewModelIdSchema.safeParse('a'.repeat(200)).success).toBe(true);
  });
});

describe('review lane settings', () => {
  const settings = {
    pool: [
      { lane: 'codex', model: 'gpt-5.3-codex' },
      { lane: 'claude', model: null },
      { lane: 'codex', model: null },
      { lane: 'codex', model: 'gpt-6.1-sol' },
    ],
    pins: { triage: { lane: 'claude', model: null }, verifier: { lane: ptahCliLane, model: 'provider/model' } },
  };

  it('round-trips pool order and pins unchanged', () => {
    expect(ReviewLaneSettingsSchema.parse(settings)).toEqual(settings);
    expect(ReviewLaneSettingsSchema.parse(EMPTY_REVIEW_LANE_SETTINGS)).toEqual({ pool: [], pins: {} });
  });

  it('covers every role with an optional pin', () => {
    expect(ReviewLaneRoleSchema.options).toEqual(['triage', ...LensSchema.options, 'verifier']);
    const allPins = Object.fromEntries(ReviewLaneRoleSchema.options.map((role) => [role, { lane: 'codex', model: null }]));
    expect(Object.keys(ReviewLanePinsSchema.parse(allPins)).sort()).toEqual([...ReviewLaneRoleSchema.options].sort());
    // Every lens is a pin key, so a lens added to LensSchema can be pinned with no change here.
    for (const lens of LensSchema.options)
      expect(ReviewLanePinsSchema.safeParse({ [lens]: { lane: 'codex', model: null } }).success).toBe(true);
    expect(ReviewLanePinsSchema.safeParse({ triage: undefined }).success).toBe(true);
  });

  it('rejects an unknown role key and unknown keys', () => {
    expect(ReviewLaneSettingsSchema.safeParse({ pool: [], pins: { reviewer: { lane: 'codex', model: null } } }).success).toBe(false);
    expect(ReviewLaneSettingsSchema.safeParse({ pool: [], pins: {}, extra: true }).success).toBe(false);
    expect(ReviewLaneSettingsSchema.safeParse({ pool: [{ lane: 'codex', model: null, tier: 'x' }], pins: {} }).success).toBe(false);
    expect(ReviewLaneSettingsSchema.safeParse({ pool: [] }).success).toBe(false);
  });

  it('rejects entries with empty or over-long lane or model', () => {
    for (const entry of [
      { lane: '', model: null },
      { lane: 'a'.repeat(129), model: null },
      { lane: 'codex', model: '' },
      { lane: 'codex', model: 'a'.repeat(201) },
      { lane: 'codex' },
    ]) {
      expect(ReviewLaneSettingsSchema.safeParse({ pool: [entry], pins: {} }).success).toBe(false);
      expect(ReviewLaneSettingsSchema.safeParse({ pool: [], pins: { triage: entry } }).success).toBe(false);
    }
  });

  it('rejects a duplicate lane and model at the repeated index', () => {
    const result = ReviewLaneSettingsSchema.safeParse({
      pool: [
        { lane: 'codex', model: null },
        { lane: 'claude', model: null },
        { lane: 'codex', model: null },
      ],
      pins: {},
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ['pool', 2], message: 'Duplicate review lane entry' }),
    ]);
  });

  it('accepts a pool of the maximum size and rejects one more', () => {
    expect(REVIEW_LANE_POOL_MAX).toBe(12);
    const pool = (count: number) => Array.from({ length: count }, (_, index) => ({ lane: `lane-${index}`, model: null }));
    expect(ReviewLaneSettingsSchema.safeParse({ pool: pool(12), pins: {} }).success).toBe(true);
    expect(ReviewLaneSettingsSchema.safeParse({ pool: pool(13), pins: {} }).success).toBe(false);
  });
});

describe('duplicatePoolEntryIndex', () => {
  it('returns null for distinct entries and compares models exactly', () => {
    expect(duplicatePoolEntryIndex([])).toBeNull();
    expect(
      duplicatePoolEntryIndex([
        { lane: 'codex', model: null },
        { lane: 'codex', model: 'gpt-5' },
        { lane: 'codex', model: 'GPT-5' },
        { lane: 'claude', model: 'gpt-5' },
      ]),
    ).toBeNull();
  });

  it('returns the index of the second matching entry', () => {
    expect(
      duplicatePoolEntryIndex([
        { lane: 'codex', model: 'gpt-5' },
        { lane: 'claude', model: null },
        { lane: 'claude', model: null },
        { lane: 'codex', model: 'gpt-5' },
      ]),
    ).toBe(2);
  });
});

describe('review lane listing', () => {
  const catalog = { status: 'read', models: ['gpt-5.3-codex'], truncated: false, verifiable: true };
  const lane = { id: 'codex', label: 'codex', family: 'openai', limitState: 'confirmed-room', catalog };

  it('accepts a listing with catalogs and blocked models', () => {
    const listing = { lanes: [lane, { ...lane, id: ptahCliLane, label: 'My CLI', catalog: { status: 'failed', models: [], truncated: false, verifiable: false } }], blockedModels: ['gpt-old'] };
    expect(ReviewLaneListingSchema.parse(listing)).toEqual(listing);
  });

  it('accepts an optional default-model block flag and rejects a non-boolean one', () => {
    expect(ReviewLaneListingSchema.parse({ lanes: [lane], blockedModels: [] }).lanes[0].defaultModelBlocked).toBeUndefined();
    const flagged = { lanes: [{ ...lane, defaultModelBlocked: true }, { ...lane, id: 'claude', defaultModelBlocked: false }], blockedModels: [] };
    expect(ReviewLaneListingSchema.parse(flagged)).toEqual(flagged);
    expect(ReviewLaneListingSchema.safeParse({ lanes: [{ ...lane, defaultModelBlocked: 'yes' }], blockedModels: [] }).success).toBe(false);
  });

  it('bounds the catalog and rejects unknown states and keys', () => {
    expect(REVIEW_LANE_CATALOG_MAX).toBe(500);
    const models = (count: number) => Array.from({ length: count }, (_, index) => `model-${index}`);
    expect(ReviewLaneCatalogSchema.safeParse({ ...catalog, models: models(500), truncated: true }).success).toBe(true);
    expect(ReviewLaneCatalogSchema.safeParse({ ...catalog, models: models(501) }).success).toBe(false);
    expect(ReviewLaneCatalogSchema.safeParse({ ...catalog, status: 'stale' }).success).toBe(false);
    expect(ReviewLaneListingSchema.safeParse({ lanes: [{ ...lane, limitState: 'busy' }], blockedModels: [] }).success).toBe(false);
    expect(ReviewLaneListingSchema.safeParse({ lanes: [{ ...lane, extra: 1 }], blockedModels: [] }).success).toBe(false);
    expect(ReviewLaneListingSchema.safeParse({ lanes: [{ ...lane, label: '' }], blockedModels: [] }).success).toBe(false);
    expect(ReviewLaneListingSchema.safeParse({ lanes: [], blockedModels: models(REVIEW_LANE_BLOCKED_MODELS_MAX + 1) }).success).toBe(false);
  });
});

describe('stage record lane fields', () => {
  const stage = { name: 'lenses', status: 'succeeded', family: null, scope: null, durationMs: 10, error: null, artifactPath: null };

  it('parses an old stage record without lane keys', () => {
    expect(StageRecordSchema.parse(stage)).toEqual(stage);
  });

  it('parses lane, model and fallback, and accepts nulls', () => {
    const withLane = {
      ...stage,
      family: 'openai',
      lane: 'codex',
      model: 'gpt-5.3-codex',
      fallback: [{ source: 'pin', lane: 'claude', model: null, reason: 'at-limit' }],
    };
    expect(StageRecordSchema.parse(withLane)).toEqual(withLane);
    expect(StageRecordSchema.safeParse({ ...stage, lane: null, model: null, fallback: null }).success).toBe(true);
  });

  it('rejects unknown fallback reasons and an over-long fallback list', () => {
    const skip = { source: 'pool', lane: 'codex', model: null, reason: 'model-not-offered' };
    expect(ReviewLaneFallbackSchema.safeParse({ ...skip, reason: 'disabled' }).success).toBe(false);
    expect(ReviewLaneFallbackSchema.safeParse({ ...skip, source: 'global' }).success).toBe(false);
    expect(StageRecordSchema.safeParse({ ...stage, fallback: Array(REVIEW_LANE_POOL_MAX + 1).fill(skip) }).success).toBe(true);
    expect(StageRecordSchema.safeParse({ ...stage, fallback: Array(REVIEW_LANE_POOL_MAX + 2).fill(skip) }).success).toBe(false);
  });
});

describe('review lane error codes', () => {
  it('keeps one message per code, unchanged from the English messages', () => {
    expect(ReviewLaneErrorCode).toEqual({ Invalid: 'REVIEW_LANES_INVALID', NotSaved: 'REVIEW_LANES_NOT_SAVED' });
    expect(REVIEW_LANE_ERROR_MESSAGES).toEqual({
      REVIEW_LANES_INVALID: 'Review lanes were not saved: the lane settings are invalid',
      REVIEW_LANES_NOT_SAVED: 'Review lanes were not saved',
    });
  });

  it('bounds blocked models by the pool plus one pin per role', () => {
    expect(REVIEW_LANE_BLOCKED_MODELS_MAX).toBe(REVIEW_LANE_POOL_MAX + ReviewLaneRoleSchema.options.length);
  });
});
