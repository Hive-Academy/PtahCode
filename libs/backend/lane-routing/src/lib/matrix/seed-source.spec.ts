import { STALENESS_AGE_MS } from '../routing-constants';
import { MatrixCellSchema } from './matrix.schema';
import { compileSeed, isStale, type SeedAlias, type SeedSourceRow } from './seed-source';

const row = {
  sourceId: 'fixture-board',
  licenseId: 'CC-BY-4.0',
  fetchedAt: '2026-10-14',
  sourceRow: 'review-results/17',
  benchmarkModel: 'Fixture Model',
  benchmarkEffort: 'Extended',
  taskKind: 'review',
  asOf: '2026-10-01',
  note: 'Review benchmark result',
  sourceRef: 'Fixture board',
  value: { label: 'good' },
} satisfies SeedSourceRow;

const target = { family: 'codex', model: 'fixture-model' };
const alias = {
  sourceId: row.sourceId,
  benchmarkModel: row.benchmarkModel,
  benchmarkEffort: row.benchmarkEffort,
  targets: [{ ...target, effort: 'high' }],
} satisfies SeedAlias;
const NOW = Date.parse('2026-10-15');

describe('compileSeed source rows', () => {
  it.each([
    ['a different source id', { sourceId: 'other-board' }],
    ['model whitespace', { benchmarkModel: 'Fixture Model ' }],
    ['effort case', { benchmarkEffort: 'extended' }],
    ['effort whitespace', { benchmarkEffort: ' Extended' }],
    ['a null effort', { benchmarkEffort: null }],
  ])('counts no alias for %s', (_name, mismatch) => {
    const result = compileSeed([{ ...row, ...mismatch }], [alias], NOW);

    expect(result.dropped).toEqual({ noAlias: 1, duplicate: 0, invalid: 0 });
    expect(result.matrix.profiles).toHaveLength(0);
  });

  it.each([
    ['strong', 80],
    ['good', 65],
    ['weak', 35],
  ] as const)('maps the %s label to %i', (label, score) => {
    const result = compileSeed([{ ...row, value: { label } }], [alias], NOW);

    expect(result.matrix.profiles[0]?.cells.review).toMatchObject({ score });
  });

  it('routes exact benchmark efforts to their configured buckets and tallies mixed drops', () => {
    const unratedEffortAlias = {
      ...alias,
      benchmarkEffort: null,
      targets: [target],
    };
    const result = compileSeed(
      [
        row,
        { ...row, sourceRow: 'review-results/18', value: { score: 23 } },
        { ...row, benchmarkEffort: null, value: { score: 72 } },
        { ...row, benchmarkEffort: 'Standard' },
        { ...row, value: { label: 'good', score: 72 } },
        { ...row, taskKind: ['review', 'tests'] },
      ],
      [alias, unratedEffortAlias],
      NOW,
    );

    expect(result.dropped).toEqual({ noAlias: 1, duplicate: 1, invalid: 2 });
    expect(result.matrix.profiles).toHaveLength(2);
    const effortProfile = result.matrix.profiles.find(({ effort }) => effort === 'high');
    const defaultProfile = result.matrix.profiles.find(({ effort }) => effort === undefined);
    expect(effortProfile).toMatchObject(target);
    expect(effortProfile?.cells.review).toEqual({
      kind: 'value',
      score: 65,
      source: 'seed',
      asOf: row.asOf,
      stale: false,
      note: row.note,
      sourceRef: row.sourceRef,
      sourceId: row.sourceId,
      licenseId: row.licenseId,
      fetchedAt: row.fetchedAt,
      sourceRow: row.sourceRow,
    });
    expect(effortProfile?.cells.tests).toEqual({ kind: 'unknown' });
    expect(defaultProfile).toMatchObject(target);
    expect(defaultProfile?.cells.review).toMatchObject({ score: 72 });
  });

  it('derives staleness from publication time even after a recent fetch', () => {
    const asOf = '2026-02-17';
    const staleNow = Date.parse(asOf) + STALENESS_AGE_MS + 1;
    const fetchedAt = new Date(staleNow).toISOString();
    const result = compileSeed([{ ...row, asOf, fetchedAt }], [alias], staleNow);

    expect(isStale(fetchedAt, staleNow)).toBe(false);
    expect(result.matrix.profiles[0]?.cells.review).toMatchObject({
      asOf,
      fetchedAt,
      stale: true,
    });
  });
});

describe('seed provenance issue paths', () => {
  const provenance = {
    sourceId: row.sourceId,
    licenseId: row.licenseId,
    fetchedAt: row.fetchedAt,
    sourceRow: row.sourceRow,
  };
  const baseCell = { kind: 'value', score: 65, asOf: row.asOf, stale: false };

  it.each(['sourceId', 'licenseId', 'fetchedAt', 'sourceRow'] as const)(
    'reports missing %s on a seed cell at its field path',
    (field) => {
      const result = MatrixCellSchema.safeParse({
        ...baseCell,
        source: 'seed',
        note: row.note,
        sourceRef: row.sourceRef,
        ...provenance,
        [field]: undefined,
      });

      expect(result.error?.issues.map(({ path }) => path)).toEqual([[field]]);
    },
  );

  it.each([
    ['user', {}],
    ['local', { sampleCount: 1 }],
  ] as const)('reports each seed-only field on a %s cell', (source, fields) => {
    const result = MatrixCellSchema.safeParse({
      ...baseCell,
      source,
      ...fields,
      ...provenance,
    });

    expect(result.error?.issues.map(({ path }) => path)).toEqual(
      Object.keys(provenance).map((field) => [field]),
    );
  });
});
