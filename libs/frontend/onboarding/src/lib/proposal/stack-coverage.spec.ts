import type {
  SkillRecommendation,
  StackSummaryItem,
} from '@ptah-extension/shared';
import {
  buildStackCoverage,
  formatInstallCount,
  splitStackEvidence,
} from './stack-coverage';
const angular: StackSummaryItem = {
  name: 'Angular',
  kind: 'framework',
  evidence: 'package.json',
  sourcePhase: 'analysis',
};
const jestItem: StackSummaryItem = {
  ...angular,
  name: 'Jest',
  kind: 'test-tool',
};
const row: SkillRecommendation = {
  skill: {
    source: 'acme/repo',
    skillId: 'one',
    name: 'One',
    description: '',
    installs: 12400,
    isInstalled: true,
  },
  evidence: ' angular , Jest ',
  score: 1,
};
describe('stack coverage', () => {
  it('splits several items, preserves detected spelling, deduplicates and falls back to raw text', () => {
    expect(
      splitStackEvidence(' angular , Jest, Angular ', [angular, jestItem]),
    ).toEqual({ coveredItems: ['Angular', 'Jest'], rawEvidence: null });
    expect(splitStackEvidence('Angular tooling', [angular])).toEqual({
      coveredItems: [],
      rawEvidence: 'Angular tooling',
    });
    expect(splitStackEvidence('', [])).toEqual({
      coveredItems: [],
      rawEvidence: null,
    });
  });
  it('counts an installed selected skill for every matched item without duplicates', () => {
    const items = buildStackCoverage(
      [angular, jestItem],
      [],
      [],
      [row, row],
      new Set(['acme/repo/one']),
    );
    expect(
      items.map((item) => [item.state, item.selectedCount, item.totalCount]),
    ).toEqual([
      ['covered', 1, 1],
      ['covered', 1, 1],
    ]);
  });
  it('distinguishes available, unmatched and failed items and keeps stack evidence', () => {
    expect(
      buildStackCoverage([angular], [], [], [row], new Set())[0],
    ).toMatchObject({ state: 'available', evidence: 'package.json' });
    expect(
      buildStackCoverage(
        [angular],
        [angular, jestItem],
        [{ item: 'jest', reason: 'timeout' }],
        [],
        new Set(),
      ).map((item) => item.state),
    ).toEqual(['none', 'failed']);
  });
  it('surfaces a search failure even with prior recommendations', () => {
    expect(
      buildStackCoverage(
        [angular],
        [],
        [{ item: 'Angular', reason: 'timeout' }],
        [row],
        new Set(['acme/repo/one']),
      )[0],
    ).toMatchObject({ state: 'failed', selectedCount: 1 });
  });
  it.each([
    [0, 'New'],
    [312, '312'],
    [1240, '1.2k'],
    [12400, '12.4k'],
    [1200000, '1.2m'],
  ])('formats %s installs', (count, expected) =>
    expect(formatInstallCount(Number(count))).toBe(expected),
  );
});

describe('ambiguous stack names', () => {
  it('matches comma names before prefixes, with trimmed case-insensitive names', () => {
    const comma = { ...jestItem, name: ' Jest, Vitest ' };
    const spaced = { ...angular, name: 'Angular Material' };
    const detected = [jestItem, comma, angular, spaced];
    expect(
      splitStackEvidence('jest, vitest, ANGULAR MATERIAL', detected)
        .coveredItems,
    ).toEqual(['Angular Material', ' Jest, Vitest ']);
    const coverage = buildStackCoverage(
      detected,
      [],
      [],
      [{ ...row, evidence: 'JEST, VITEST' }],
      new Set(['acme/repo/one']),
    );
    expect(coverage.map((item) => item.state)).toEqual([
      'none',
      'covered',
      'none',
      'none',
    ]);
  });
});
