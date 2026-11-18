import 'reflect-metadata';
import type { Logger } from '@ptah-extension/vscode-core';
import type { SkillShEntry } from '@ptah-extension/shared';
import type { SkillRankingService } from './skill-ranking.service';
import { SkillRecommendationService } from './skill-recommendation.service';

const entry: SkillShEntry = {
  source: 'owner/repo',
  skillId: 'angular',
  name: 'Angular',
  description: 'Angular patterns',
  installs: 10,
  isInstalled: false,
};
const logger = { warn: jest.fn(), debug: jest.fn() } as Pick<
  Logger,
  'warn' | 'debug'
>;
const service = new SkillRecommendationService(logger as Logger);

describe('SkillRecommendationService.recommendAnalysis', () => {
  const item = {
    kind: 'framework' as const,
    name: 'Angular',
    evidence: 'package.json',
    sourcePhase: 'project-profile',
  };

  it.each([
    ['Node.js 24.x', 'nodejs'],
    ['Angular ~22.2', 'angular'],
    ['TypeScript 6.0.3 (exact pin)', 'typescript'],
    ['Python 3.12rc1', 'python'],
    ['C++ 20', 'cpp'],
    ['Astro 7 + Starlight', 'astro'],
    ['ESLint 10 + typescript-eslint', 'eslint'],
    ['better-sqlite3 + sqlite-vec', 'bettersqlite3'],
    ['Slack Bolt / discord.js / grammY', 'slackbolt'],
    ['D3', 'd3'],
    ['Vue 3', 'vue'],
    ['Nx 24.0.0', 'nx'],
    ['Tailwind CSS 3.4', 'tailwindcss'],
  ])('normalizes %s to %s for search and matching', async (name, query) => {
    const search = jest.fn(async () => [
      { ...entry, name: query === 'cpp' ? 'C++' : query, skillId: query },
    ]);
    const result = await service.recommendAnalysis({
      items: [{ ...item, name }],
      summarySource: 'structured',
      search,
    });
    expect(search).toHaveBeenCalledWith(query);
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].evidence).toBe(name);
  });

  it('deduplicates scoped packages with their technology before querying', async () => {
    const search = jest.fn(async () => [
      { ...entry, name: 'Nx', skillId: 'nx' },
    ]);
    const result = await service.recommendAnalysis({
      items: [
        { ...item, name: 'Nx 24.0.0' },
        { ...item, name: '@nx/angular' },
      ],
      summarySource: 'structured',
      search,
    });
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith('nx');
    expect(result.skills).toHaveLength(1);
  });

  it.each([8, 0])(
    'keeps matches beyond the enriched top %s of 50 registry rows',
    async (described) => {
      const rows = Array.from({ length: 50 }, (_, index) => ({
        ...entry,
        skillId: index === 9 ? 'nx-workspace' : `other-${index}`,
        name: index === 9 ? 'Nx workspace' : `Other ${index}`,
        description: index < described ? 'Registry description' : '',
      }));
      const result = await service.recommendAnalysis({
        items: [{ ...item, name: 'Nx' }],
        summarySource: 'structured',
        search: async () => rows,
      });
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].skill.description).toBe(
        'owner/repo - 10 installs',
      );
      expect(result.unmatchedItems).toEqual([]);
      expect(result.searchFailures).toEqual([]);
    },
  );

  it('prefers a described match and logs invalid identity rows', async () => {
    const result = await service.recommendAnalysis({
      items: [item],
      summarySource: 'structured',
      search: async () => [
        { ...entry, description: '', installs: 10000 },
        { ...entry, skillId: 'angular-guide', installs: 1 },
        { ...entry, source: '' },
      ],
    });
    expect(result.skills[0].skill.skillId).toBe('angular-guide');
    expect(logger.debug).toHaveBeenCalledWith(
      '[SkillRecommendation] Invalid registry row dropped',
      { item: 'Angular' },
    );
  });

  it('preserves optional registry fields on both recommendation paths', async () => {
    const full = {
      ...entry,
      id: 'canonical',
      slug: 'angular',
      sourceType: 'github',
      url: 'https://skills.sh/owner/repo/angular',
      installUrl: 'https://skills.sh/install/angular',
    };
    const search = async () => [full];
    const analysisResult = await service.recommendAnalysis({
      items: [item],
      summarySource: 'structured',
      search,
    });
    const dependencyResult = await service.recommend({
      analysis: { projectType: 'x', frameworks: [] },
      dependencies: ['angular'],
      search,
    });
    expect(analysisResult.skills[0].skill).toEqual(full);
    expect(dependencyResult[0].skill).toEqual(full);
  });

  it.each(['name', 'source', 'skillId'])(
    'rejects a blank %s before returning recommendations',
    async (field) => {
      const result = await service.recommendAnalysis({
        items: [item],
        summarySource: 'structured',
        search: async () => [{ ...entry, [field]: '  ' }],
      });
      expect(result.skills).toEqual([]);
      expect(result.unmatchedItems).toEqual([item]);
    },
  );

  it.each(['Angular', 'Playwright'])(
    'chooses one best %s skill independent of registry ordering',
    async (name) => {
      const candidates = [
        {
          ...entry,
          name: `${name} guide`,
          skillId: `${name.toLowerCase()}-guide`,
          installs: 5,
        },
        {
          ...entry,
          name: `${name} testing`,
          skillId: `${name.toLowerCase()}-testing`,
          installs: 100,
        },
        {
          ...entry,
          source: 'other/repo',
          name: `${name} testing`,
          skillId: `${name.toLowerCase()}-testing`,
          installs: 100,
        },
      ];
      for (const hits of [candidates, [...candidates].reverse()]) {
        const result = await service.recommendAnalysis({
          items: [
            { ...item, name },
            { ...item, name: `${name} 24.0.0` },
          ],
          summarySource: 'structured',
          search: async () => hits,
        });
        expect(
          result.skills.map(({ skill }) => `${skill.source}/${skill.skillId}`),
        ).toEqual([`other/repo/${name.toLowerCase()}-testing`]);
      }
    },
  );

  it('queries Nx without its version and keeps its hit after many earlier registry hits', async () => {
    const nx = { ...entry, name: 'Nx monorepo', skillId: 'nx-monorepo' };
    const search = jest.fn(async (query: string) =>
      query === 'nx'
        ? [nx]
        : Array.from({ length: 40 }, (_, index) => ({
            ...entry,
            skillId: `angular-${index}`,
          })),
    );
    const result = await service.recommendAnalysis({
      items: [item, { ...item, name: 'Nx 24.0.0' }],
      summarySource: 'structured',
      search,
    });
    expect(search).toHaveBeenCalledWith('nx');
    expect(result.skills.map(({ skill }) => skill.skillId)).toContain(
      'nx-monorepo',
    );
    expect(result.unmatchedItems).toEqual([]);
  });

  it('does not repeat the same name or install source across queries', async () => {
    const shared = {
      ...entry,
      skillId: 'angular-playwright',
      name: 'Angular Playwright',
    };
    const result = await service.recommendAnalysis({
      items: [item, { ...item, name: 'Playwright' }],
      summarySource: 'structured',
      search: async () => [shared, { ...shared, source: 'other/repo' }],
    });
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].evidence).toBe('Angular, Playwright');
    expect(result.unmatchedItems).toEqual([]);
  });

  it.each([false, true])(
    'records shared coverage for Angular SSR in either item order (reversed: %s)',
    async (reversed) => {
      const items = [item, { ...item, name: 'Angular SSR' }];
      if (reversed) items.reverse();
      const result = await service.recommendAnalysis({
        items,
        summarySource: 'structured',
        search: async () => [
          {
            ...entry,
            name: 'Angular SSR',
            skillId: 'angular-ssr',
            installs: 5000,
          },
        ],
      });
      expect(result.skills).toHaveLength(1);
      for (const detected of items)
        expect(result.skills[0].evidence).toContain(detected.name);
      expect(result.unmatchedItems).toEqual([]);
      expect(result.searchFailures).toEqual([]);
    },
  );

  it('falls back to the next free candidate when an earlier item took the best one', async () => {
    const shared = {
      ...entry,
      skillId: 'angular-playwright',
      name: 'Angular Playwright',
      installs: 1000,
    };
    const own = {
      ...entry,
      skillId: 'playwright-testing',
      name: 'Playwright testing',
      installs: 5,
    };
    const result = await service.recommendAnalysis({
      items: [item, { ...item, name: 'Playwright' }],
      summarySource: 'structured',
      search: async (query) =>
        query === 'playwright' ? [shared, own] : [shared],
    });
    expect(result.skills.map(({ skill }) => skill.skillId)).toEqual([
      'angular-playwright',
      'playwright-testing',
    ]);
    expect(result.skills.map(({ evidence }) => evidence)).toEqual([
      'Angular',
      'Playwright',
    ]);
    expect(result.unmatchedItems).toEqual([]);
  });

  it('matches, deduplicates, and carries the detected name as evidence', async () => {
    const result = await service.recommendAnalysis({
      items: [item, item],
      summarySource: 'structured',
      search: async () => [entry],
    });
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].evidence).toBe('Angular');
    expect(result.unmatchedItems).toEqual([]);
  });

  it('separates a search failure from an unmatched term', async () => {
    const result = await service.recommendAnalysis({
      items: [item],
      summarySource: 'legacy',
      search: async () => {
        throw new Error('offline');
      },
    });
    expect(result.searchFailures).toEqual([
      { item: 'Angular', reason: 'Search failed' },
    ]);
    expect(result.unmatchedItems).toEqual([]);
  });

  it('leaves one-character terms unmatched and requires a full token for two-character terms', async () => {
    const items = [
      { ...item, name: 'R' },
      { ...item, name: 'Go' },
    ];
    const result = await service.recommendAnalysis({
      items,
      summarySource: 'structured',
      search: async () => [{ ...entry, skillId: 'gopher', name: 'Gopher' }],
    });
    expect(result.skills).toEqual([]);
    expect(result.unmatchedItems).toEqual(items);
  });

  it('matches a two-character term when it is a full token', async () => {
    const result = await service.recommendAnalysis({
      items: [{ ...item, name: 'Go' }],
      summarySource: 'structured',
      search: async () => [
        { ...entry, skillId: 'go-patterns', name: 'Go patterns' },
      ],
    });
    expect(result.skills).toHaveLength(1);
    expect(result.unmatchedItems).toEqual([]);
  });

  it('matches a complete normalized multiword name', async () => {
    const result = await service.recommendAnalysis({
      items: [{ ...item, name: 'Domain Driven Design' }],
      summarySource: 'structured',
      search: async () => [
        {
          ...entry,
          skillId: 'domain-driven-design',
          name: 'Domain Driven Design',
        },
      ],
    });
    expect(result.skills).toHaveLength(1);
    expect(result.unmatchedItems).toEqual([]);
  });
});

describe('SkillRecommendationService ranking integration', () => {
  const workspaceRoot = 'D:\\fake-workspace';
  const items = [
    {
      kind: 'framework' as const,
      name: 'Angular',
      evidence: 'private evidence',
      sourcePhase: 'project-profile',
    },
    {
      kind: 'language' as const,
      name: 'TypeScript',
      evidence: 'private evidence',
      sourcePhase: 'project-profile',
    },
  ];
  const shared = {
    ...entry,
    name: 'Angular TypeScript',
    skillId: 'angular-typescript',
    installs: 100,
  };
  const angular = {
    ...entry,
    name: 'Angular alternative',
    skillId: 'angular-alternative',
    installs: 1,
  };
  const typescript = {
    ...entry,
    name: 'TypeScript alternative',
    skillId: 'typescript-alternative',
    installs: 1,
  };
  const search = async (query: string) => [
    shared,
    query === 'angular' ? angular : typescript,
  ];

  it('preserves selection when the optional ranker is explicitly undefined', async () => {
    const input = {
      workspaceRoot,
      items,
      search,
      summarySource: 'structured' as const,
    };
    const baseline = await service.recommendAnalysis(input);
    const result = await new SkillRecommendationService(
      logger as Logger,
      undefined,
    ).recommendAnalysis(input);
    expect(result).toEqual(baseline);
    expect(result.skills.map((skill) => skill.skill.skillId)).toEqual([
      'angular-typescript',
      'typescript-alternative',
    ]);
    expect(result.skills.map((skill) => skill.rank)).toEqual([1, 2]);
    expect(result.skills.every((skill) => skill.rankedBy === 'heuristic')).toBe(
      true,
    );
  });
  it.each(['decision-model', 'session-model', 'heuristic'] as const)(
    'uses %s order and chooses one best free candidate per item',
    async (rankedBy) => {
      const rank = jest.fn().mockResolvedValue({
        rankedBy,
        items: {
          '0': {
            order: ['1', '0'],
            rankedBy,
            reason: 'More relevant Angular guidance',
          },
          '1': {
            order: ['1', '0'],
            rankedBy,
            reason: 'More relevant TypeScript guidance',
          },
        },
      });
      const subject = new SkillRecommendationService(
        logger as Logger,
        { rank } as unknown as SkillRankingService,
      );
      const result = await subject.recommendAnalysis({
        workspaceRoot,
        items,
        search,
        summarySource: 'structured',
      });
      expect(result.skills).toHaveLength(2);
      expect(result.skills.map((skill) => skill.skill.skillId).sort()).toEqual([
        'angular-alternative',
        'typescript-alternative',
      ]);
      expect(result.rankedBy).toBe(rankedBy);
      for (const [index, recommendation] of result.skills.entries()) {
        expect(recommendation.rank).toBe(index + 1);
        expect(recommendation.rankedBy).toBe(rankedBy);
        expect(['decision-model', 'session-model', 'heuristic']).toContain(
          recommendation.rankedBy,
        );
        if (rankedBy !== 'heuristic') {
          expect(recommendation.reason).toBeTruthy();
          expect(recommendation.reason?.length).toBeLessThan(140);
        }
      }
    },
  );
  it('skips an already selected candidate and picks the next free candidate', async () => {
    const rank = jest.fn().mockResolvedValue({
      rankedBy: 'decision-model',
      items: {
        '0': {
          order: ['0', '1'],
          rankedBy: 'decision-model',
          reason: 'Best match',
        },
        '1': {
          order: ['0', '1'],
          rankedBy: 'decision-model',
          reason: 'Best match',
        },
      },
    });
    const subject = new SkillRecommendationService(
      logger as Logger,
      { rank } as unknown as SkillRankingService,
    );
    const result = await subject.recommendAnalysis({
      workspaceRoot,
      items,
      search,
      summarySource: 'structured',
    });
    expect(result.skills.map((skill) => skill.skill.skillId)).toEqual([
      'angular-typescript',
      'typescript-alternative',
    ]);
    expect(
      new Set(result.skills.map((skill) => skill.skill.skillId)).size,
    ).toBe(2);
    expect(result.skills[0].reason).toBe('Best match');
    expect(result.skills[1]).not.toHaveProperty('reason');
    expect(result.skills[1].rankedBy).toBe('decision-model');
  });
});
