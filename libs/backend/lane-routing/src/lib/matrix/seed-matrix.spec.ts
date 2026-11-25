import {
  ANTHROPIC_PROVIDERS,
  OUTCOME_TASK_KINDS,
  SUBAGENT_FAMILY,
  SYSTEM_CLI_TYPES,
} from '@ptah-extension/shared';
import { STALENESS_AGE_MS } from '../routing-constants';
import {
  CapabilityMatrixSchema,
  MatrixCellSchema,
  MatrixCellsSchema,
} from './matrix.schema';
import { FAMILY_PROFILE_MODEL } from './matrix.types';
import {
  SEED_NOTE,
  SEED_SOURCE_REF,
  SEED_SOURCE_ROWS,
  buildSeedMatrix,
  isStale,
} from './seed-matrix';
import { SEED_ALIASES } from './seed-aliases';
import { compileSeed } from './seed-source';

const NOW = Date.parse('2026-10-15T00:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function isProviderFamily(providerId: string): boolean {
  return ANTHROPIC_PROVIDERS.some((provider) => provider.id === providerId);
}

const unknownCells = {
  plan: { kind: 'unknown' },
  implement: { kind: 'unknown' },
  review: { kind: 'unknown' },
  research: { kind: 'unknown' },
  tests: { kind: 'unknown' },
  docs: { kind: 'unknown' },
};

const seedCell = {
  kind: 'value',
  score: 80,
  source: 'seed',
  sourceRef: SEED_SOURCE_REF,
  asOf: '2026-02-17',
  stale: true,
  note: SEED_NOTE,
  sourceId: 'swe-bench-verified',
  licenseId: 'NOASSERTION',
  fetchedAt: '2026-10-14',
  sourceRow: 'GLM-5 high',
};

function matrixWith(...profiles: unknown[]) {
  return { version: 1, profiles };
}

describe('seed matrix', () => {
  it('validates against the matrix schema', () => {
    const result = CapabilityMatrixSchema.safeParse(buildSeedMatrix(NOW));
    expect(result.success).toBe(true);
  });

  it('seeds at least one profile', () => {
    expect(buildSeedMatrix(NOW).profiles.length).toBeGreaterThan(0);
  });

  it('holds unknown in every non-implement cell (Req 6.3)', () => {
    for (const profile of buildSeedMatrix(NOW).profiles) {
      for (const kind of OUTCOME_TASK_KINDS) {
        if (kind === 'implement') continue;
        expect({
          profile: profile.model,
          kind,
          cell: profile.cells[kind],
        }).toEqual({ profile: profile.model, kind, cell: { kind: 'unknown' } });
      }
    }
  });

  // Model lists are live-only, so a row's model id is not checked against a
  // shipped list; only its lane family must exist.
  it('keys every profile by a lane family and a model id', () => {
    const systemClis: readonly string[] = SYSTEM_CLI_TYPES;
    for (const profile of buildSeedMatrix(NOW).profiles) {
      expect(profile.model).not.toBe(FAMILY_PROFILE_MODEL);
      const knownFamily =
        isProviderFamily(profile.family) ||
        systemClis.includes(profile.family) ||
        profile.family === SUBAGENT_FAMILY;
      expect({ family: profile.family, knownFamily }).toEqual({
        family: profile.family,
        knownFamily: true,
      });
    }
  });

  it('marks a seed value stale once asOf is older than the staleness age', () => {
    for (const profile of buildSeedMatrix(NOW).profiles) {
      const cell = profile.cells.implement;
      if (cell.kind !== 'value') throw new Error('implement must be seeded');
      expect(cell.stale).toBe(true);
    }
    const freshNow = Date.parse(SEED_SOURCE_ROWS[0].asOf) + DAY_MS;
    for (const profile of buildSeedMatrix(freshNow).profiles) {
      expect(profile.cells.implement).toMatchObject({ stale: false });
    }
  });

  it('returns fresh objects on every call', () => {
    const first = buildSeedMatrix(NOW);
    const second = buildSeedMatrix(NOW);
    expect(second).toEqual(first);
    expect(second.profiles[0]).not.toBe(first.profiles[0]);
  });
});

describe('shipped seed', () => {
  it("keeps today's GLM-5 value with zero dropped rows", () => {
    const result = compileSeed(SEED_SOURCE_ROWS, SEED_ALIASES, NOW);
    expect(result.dropped).toEqual({ noAlias: 0, duplicate: 0, invalid: 0 });
    expect(buildSeedMatrix(NOW)).toEqual(result.matrix);
    expect(result.matrix.profiles).toContainEqual({
      family: 'z-ai',
      model: 'glm-5',
      cells: { ...unknownCells, implement: seedCell },
    });
  });

  it('exports aliases as data only', () => {
    expect(Array.isArray(SEED_ALIASES)).toBe(true);
  });
});

describe('compileSeed', () => {
  const row = SEED_SOURCE_ROWS[0];
  const alias = SEED_ALIASES[0];

  it('drops a row with no exact alias match', () => {
    const result = compileSeed(
      [{ ...row, benchmarkModel: 'glm-5 high' }],
      SEED_ALIASES,
      NOW,
    );
    expect(result.dropped.noAlias).toBe(1);
    expect(result.matrix.profiles).toHaveLength(0);
  });

  it('drops an invalid row', () => {
    const result = compileSeed([{ ...row, licenseId: ' ' }], SEED_ALIASES, NOW);
    expect(result.dropped.invalid).toBe(1);
  });

  it('keeps the first of two rows for the same key', () => {
    const second = { ...row, value: { score: 10 } };
    const result = compileSeed([row, second], SEED_ALIASES, NOW);
    expect(result.dropped.duplicate).toBe(1);
    expect(result.matrix.profiles[0].cells.implement).toMatchObject({
      score: 80,
    });
  });

  it('counts an occupied target while filling a new target from the same row', () => {
    const second = { ...row, benchmarkModel: 'another model', value: { score: 55 } };
    const targets = [alias.targets[0], { ...alias.targets[0], effort: 'high' }];
    const result = compileSeed(
      [row, second],
      [alias, { ...alias, benchmarkModel: second.benchmarkModel, targets }],
      NOW,
    );
    expect(result.dropped).toEqual({ noAlias: 0, duplicate: 1, invalid: 0 });
    expect(result.matrix.profiles).toMatchObject([
      { cells: { implement: { score: 80 } } },
      { effort: 'high', cells: { implement: { score: 55 } } },
    ]);
  });

  it('fills one kind per row and keeps effort buckets apart', () => {
    const aliases = [
      {
        ...alias,
        targets: [{ ...alias.targets[0], effort: 'high' }, ...alias.targets],
      },
    ];
    const result = compileSeed(
      [row, { ...row, taskKind: 'review', value: { score: 55 } }],
      aliases,
      NOW,
    );
    expect(result.dropped).toEqual({ noAlias: 0, duplicate: 0, invalid: 0 });
    expect(result.matrix.profiles).toHaveLength(2);
    expect(CapabilityMatrixSchema.safeParse(result.matrix).success).toBe(true);
    for (const profile of result.matrix.profiles) {
      expect(profile.cells.review).toMatchObject({ score: 55 });
      expect(profile.cells.plan).toEqual({ kind: 'unknown' });
    }
  });
});

describe('isStale', () => {
  const asOf = '2026-02-17';
  const asOfMs = Date.parse(asOf);

  it('is not stale at exactly the staleness age', () => {
    expect(isStale(asOf, asOfMs + STALENESS_AGE_MS)).toBe(false);
  });

  it('is stale one millisecond past the staleness age', () => {
    expect(isStale(asOf, asOfMs + STALENESS_AGE_MS + 1)).toBe(true);
  });

  it('accepts an ISO date-time', () => {
    expect(isStale('2026-10-01T12:00:00.000Z', NOW)).toBe(false);
  });

  it('treats an unparseable date as stale', () => {
    expect(isStale('not a date', NOW)).toBe(true);
  });
});

describe('matrix schema', () => {
  it('has exactly one cell key per outcome task kind', () => {
    expect(Object.keys(MatrixCellsSchema.shape).sort()).toEqual(
      [...OUTCOME_TASK_KINDS].sort(),
    );
  });

  it('accepts a family-level profile with user and local cells', () => {
    const result = CapabilityMatrixSchema.safeParse(
      matrixWith({
        family: 'codex',
        model: FAMILY_PROFILE_MODEL,
        cells: {
          ...unknownCells,
          review: {
            kind: 'value',
            score: 70,
            source: 'user',
            asOf: '2026-10-01',
            stale: false,
          },
          tests: {
            kind: 'value',
            score: 60,
            source: 'local',
            asOf: '2026-10-10T08:30:00.000Z',
            stale: false,
            sampleCount: 5,
          },
        },
      }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects a missing task kind and names the entry', () => {
    const withoutDocs = Object.fromEntries(
      Object.entries(unknownCells).filter(([kind]) => kind !== 'docs'),
    );
    const result = CapabilityMatrixSchema.safeParse(
      matrixWith({ family: 'codex', model: '*', cells: withoutDocs }),
    );
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual([
      'profiles',
      0,
      'cells',
      'docs',
    ]);
  });

  it('rejects an unknown task kind', () => {
    const result = CapabilityMatrixSchema.safeParse(
      matrixWith({
        family: 'codex',
        model: '*',
        cells: { ...unknownCells, architecture: { kind: 'unknown' } },
      }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects a duplicate profile key and names the entry', () => {
    const profile = {
      family: 'codex',
      model: 'future-codex-model',
      cells: unknownCells,
    };
    const result = CapabilityMatrixSchema.safeParse(
      matrixWith(profile, profile),
    );
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['profiles', 1, 'model']);
  });

  it('keeps profiles with the same model in different families apart', () => {
    const result = CapabilityMatrixSchema.safeParse(
      matrixWith(
        { family: 'z-ai', model: 'glm-5', cells: unknownCells },
        { family: 'ollama-cloud', model: 'glm-5', cells: unknownCells },
      ),
    );
    expect(result.success).toBe(true);
  });

  it('keeps profiles with different effort apart', () => {
    const base = { family: 'z-ai', model: 'glm-5', cells: unknownCells };
    const result = CapabilityMatrixSchema.safeParse(
      matrixWith(base, { ...base, effort: 'high' }, { ...base, effort: 'high' }),
    );
    expect(result.success).toBe(false);
    expect(result.error?.issues).toHaveLength(1);
    expect(result.error?.issues[0]?.path).toEqual(['profiles', 2, 'model']);
  });

  it('rejects a blank family or model', () => {
    expect(
      CapabilityMatrixSchema.safeParse(
        matrixWith({ family: ' ', model: '*', cells: unknownCells }),
      ).success,
    ).toBe(false);
    expect(
      CapabilityMatrixSchema.safeParse(
        matrixWith({ family: 'codex', model: '', cells: unknownCells }),
      ).success,
    ).toBe(false);
  });

  it('rejects an unsupported version', () => {
    expect(
      CapabilityMatrixSchema.safeParse({ version: 2, profiles: [] }).success,
    ).toBe(false);
  });

  it.each([
    ['a fractional score', { ...seedCell, score: 72.5 }],
    ['a score above the scale', { ...seedCell, score: 101 }],
    ['a negative score', { ...seedCell, score: -1 }],
    ['a seed value without a source', { ...seedCell, sourceRef: undefined }],
    ['a seed value without a note', { ...seedCell, note: undefined }],
    ['a seed value without a source id', { ...seedCell, sourceId: undefined }],
    ['a seed value without a license', { ...seedCell, licenseId: undefined }],
    ['a seed value without fetchedAt', { ...seedCell, fetchedAt: undefined }],
    ['a seed value without a source row', { ...seedCell, sourceRow: undefined }],
    [
      'a user value with a seed-only field',
      { ...seedCell, source: 'user' },
    ],
    ['a seed value with a sample count', { ...seedCell, sampleCount: 9 }],
    [
      'a user value with a sample count',
      { ...seedCell, source: 'user', sampleCount: 9 },
    ],
    [
      'a local value without a sample count',
      { ...seedCell, source: 'local', sourceRef: undefined },
    ],
    [
      'a local value below the minimum sample count',
      {
        ...seedCell,
        source: 'local',
        sourceRef: undefined,
        sampleCount: 0,
      },
    ],
    [
      'a local value with an external source',
      { ...seedCell, source: 'local', sampleCount: 5 },
    ],
    ['an unknown source', { ...seedCell, source: 'vendor' }],
    ['a malformed asOf', { ...seedCell, asOf: '17/02/2026' }],
    ['a missing stale flag', { ...seedCell, stale: undefined }],
    ['an extra field', { ...seedCell, label: 'strong' }],
    ['an unknown cell with a score', { kind: 'unknown', score: 50 }],
    ['an unknown kind', { kind: 'guess' }],
  ])('rejects %s', (_name, cell) => {
    expect(MatrixCellSchema.safeParse(cell).success).toBe(false);
  });

  it('accepts a well-formed seed cell', () => {
    expect(MatrixCellSchema.safeParse(seedCell).success).toBe(true);
  });
});
