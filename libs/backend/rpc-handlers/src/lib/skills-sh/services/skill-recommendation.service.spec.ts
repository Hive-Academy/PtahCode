import 'reflect-metadata';
import { container as rootContainer } from 'tsyringe';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { SDK_TOKENS } from '@ptah-extension/agent-sdk';
import type {
  InternalQueryConfig,
  InternalQueryHandle,
  InternalQueryService,
  IWorkspaceLlmResolver,
  ResolvedSetupSnapshot,
} from '@ptah-extension/agent-sdk';
import type { SkillRankingCallerService } from '@ptah-extension/lane-routing';
import type { SkillShEntry, StackSummaryItem } from '@ptah-extension/shared';
import { TOKENS } from '@ptah-extension/vscode-core';
import type { Logger } from '@ptah-extension/vscode-core';
import { registerSkillServices } from '../../di/register';
import {
  SKILL_DRAFT_GENERATION_SERVICE,
  SKILL_JUDGE_SERVICE,
  SKILL_RECOMMENDATION_SERVICE,
} from '../../di/tokens';
import { HarnessLlmRunner } from '../../harness/ai/harness-llm-runner.service';
import type { HarnessStreamBroadcaster } from '../../harness/streaming/harness-stream-broadcaster.service';
import { HARNESS_TOKENS } from '../../harness/tokens';
import { SkillDraftGenerationService } from './skill-draft-generation.service';
import { SkillJudgeService } from './skill-judge.service';
import { SkillRecommendationService } from './skill-recommendation.service';

jest.mock('node:fs/promises', () => ({
  ...jest.requireActual<typeof import('node:fs/promises')>('node:fs/promises'),
}));

const fs = jest.requireMock<typeof import('node:fs/promises')>(
  'node:fs/promises',
);

const entry: SkillShEntry = {
  source: 'owner/repo',
  skillId: 'angular',
  name: 'Angular',
  description: 'Angular patterns',
  installs: 10,
  isInstalled: false,
};

const SETUP_SNAPSHOT: ResolvedSetupSnapshot = {
  providerId: 'setup-provider',
  model: 'setup-model',
  auth: { env: { ANTHROPIC_AUTH_TOKEN: 'setup-auth-fixture' } },
};

const SETUP_PAIR = {
  provider: SETUP_SNAPSHOT.providerId,
  model: SETUP_SNAPSHOT.model,
};

const DECISION_PAIR = {
  provider: 'decision-provider',
  model: 'decision-model',
};

const logger = { warn: jest.fn(), debug: jest.fn(), error: jest.fn() } as Pick<
  Logger,
  'warn' | 'debug' | 'error'
>;
const service = new SkillRecommendationService(logger as Logger);

function makeStream(...messages: SDKMessage[]): InternalQueryHandle {
  return {
    stream: (async function* () {
      yield* messages;
    })(),
    close: jest.fn(),
    abort: jest.fn(),
  };
}

function makeSuccessMessage(structuredOutput: unknown): SDKMessage {
  return {
    type: 'result',
    subtype: 'success',
    structured_output: structuredOutput,
    result: '',
    usage: { input_tokens: 1, output_tokens: 1 },
  } as SDKMessage;
}

describe('SkillRecommendationService.recommendAnalysis', () => {
  const item: StackSummaryItem = {
    kind: 'framework',
    name: 'Angular',
    evidence: 'package.json',
    sourcePhase: 'project-profile',
  };

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

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
    expect(result.judge.items.map(({ itemId }) => itemId)).toEqual([
      'framework:nx 24.0.0',
      'framework:@nx/angular',
    ]);
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
    expect(result.judge.items[0]).toMatchObject({
      registry: 'search-failed',
      registryFailure: { kind: 'registry-error', reason: 'Search failed' },
    });
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

describe('SkillRecommendationService judge assembly, identity, and deadlines', () => {
  const workspaceRoot = '/fake-workspace';

  function createJudgeHarness() {
    const localLogger = {
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    const execute = jest.fn<
      Promise<InternalQueryHandle>,
      [InternalQueryConfig]
    >();
    const rankSkillCandidates = jest
      .fn<
        ReturnType<SkillRankingCallerService['rankSkillCandidates']>,
        Parameters<SkillRankingCallerService['rankSkillCandidates']>
      >()
      .mockResolvedValue({
        status: 'skipped',
        category: 'not-configured',
        items: {},
        itemRejections: {},
      });
    const broadcaster = {
      createStreamEmitter: () => ({
        emitter: { emit: jest.fn() },
        operationId: 'judge',
      }),
      teeStreamWithFlatEvents: (output: AsyncIterable<SDKMessage>) => output,
      broadcastComplete: jest.fn(),
      broadcastFlatComplete: jest.fn(),
    } as unknown as HarnessStreamBroadcaster;
    const runner = new HarnessLlmRunner(
      localLogger as unknown as Logger,
      { execute } as unknown as InternalQueryService,
      broadcaster,
      {
        resolveForPath: jest.fn(),
        resolveSetup: jest.fn(),
      } as unknown as IWorkspaceLlmResolver,
    );
    const judgeService = new SkillJudgeService(
      localLogger as unknown as Logger,
      { rankSkillCandidates },
      runner,
    );
    const recommendationService = new SkillRecommendationService(
      localLogger as unknown as Logger,
      judgeService,
    );
    return {
      logger: localLogger,
      execute,
      rankSkillCandidates,
      judgeService,
      recommendationService,
    };
  }

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('preserves heuristic selection when the optional judge is explicitly undefined', async () => {
    const items: StackSummaryItem[] = [
      {
        kind: 'framework',
        name: 'Angular',
        evidence: 'package.json',
        sourcePhase: 'project-profile',
      },
      {
        kind: 'language',
        name: 'TypeScript',
        evidence: 'tsconfig.json',
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
    expect(result.judge.method).toBe('none');
    expect(result.analysisPair).toBeNull();
    expect(result.rankedBy).toBe('heuristic');
    expect(result.skills.map((skill) => skill.skill.skillId)).toEqual([
      'angular-typescript',
      'typescript-alternative',
    ]);
    expect(result.skills.map((skill) => skill.rank)).toEqual([1, 2]);
    expect(result.skills.every((skill) => skill.rankedBy === 'heuristic')).toBe(
      true,
    );
  });

  it('keeps full first-seen candidate pool and independent per-item assessments without cross-item truncation', async () => {
    const { recommendationService, execute } = createJudgeHarness();
    const sharedCandidate: SkillShEntry = {
      ...entry,
      source: 'Org/Shared',
      skillId: 'angular-playwright',
      name: 'Angular Playwright',
      installs: 1000,
    };
    const angularAlt: SkillShEntry = {
      ...entry,
      source: 'Org/Angular',
      skillId: 'angular-patterns',
      name: 'Angular patterns',
      installs: 50,
    };
    const deprecatedCandidate: SkillShEntry = {
      ...entry,
      source: 'Org/Old',
      skillId: 'playwright-legacy',
      name: 'Playwright legacy',
      description: 'Deprecated Playwright helper',
      installs: 500,
    };
    const playwrightAlt: SkillShEntry = {
      ...entry,
      source: 'Org/Playwright',
      skillId: 'playwright-e2e',
      name: 'Playwright e2e',
      installs: 20,
    };

    execute.mockImplementation(async (config) => {
      config.onProviderSubmit?.(SETUP_PAIR);
      return makeStream(
        makeSuccessMessage({
          items: [
            {
              itemId: 'framework:angular',
              outcomes: [
                {
                  verdict: 'install',
                  candidateId: 'org/angular/angular-patterns',
                  reason: 'Matches Angular components in workspace.',
                },
              ],
              rejections: [
                {
                  candidateId: 'org/shared/angular-playwright',
                  reason: 'Too broad for Angular-only work.',
                },
              ],
            },
            {
              itemId: 'test-tool:playwright',
              outcomes: [
                {
                  verdict: 'install',
                  candidateId: 'org/playwright/playwright-e2e',
                  reason: 'Focused on Playwright E2E coverage.',
                },
              ],
              rejections: [
                {
                  candidateId: 'org/shared/angular-playwright',
                  reason: 'Mixed Angular focus.',
                },
              ],
            },
          ],
        }),
      );
    });

    const savedPair = { provider: 'anthropic', model: 'claude-sonnet-4' };
    const result = await recommendationService.recommendAnalysis({
      workspaceRoot,
      resolved: SETUP_SNAPSHOT,
      analysisPair: savedPair,
      summarySource: 'structured',
      items: [
        {
          kind: 'framework',
          name: 'Angular',
          evidence: 'package.json declares @angular/core',
          sourcePhase: 'stack',
        },
        {
          kind: 'test-tool',
          name: 'Playwright',
          evidence: 'playwright.config.ts present',
          sourcePhase: 'stack',
        },
      ],
      search: async (query) =>
        query === 'angular'
          ? [sharedCandidate, angularAlt]
          : [sharedCandidate, deprecatedCandidate, playwrightAlt],
    });

    // Global candidate pool keeps all four candidates in first-seen order.
    expect(
      result.judge.candidates.map(({ candidateId }) => candidateId),
    ).toEqual([
      'org/shared/angular-playwright',
      'org/angular/angular-patterns',
      'org/old/playwright-legacy',
      'org/playwright/playwright-e2e',
    ]);
    // Both items retain the shared candidate independently in candidateIds.
    expect(result.judge.items[0].candidateIds).toEqual([
      'org/shared/angular-playwright',
      'org/angular/angular-patterns',
    ]);
    expect(result.judge.items[1].candidateIds).toEqual([
      'org/shared/angular-playwright',
      'org/old/playwright-legacy',
      'org/playwright/playwright-e2e',
    ]);
    expect(result.judge.items[1].candidateAssessments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          candidateId: 'org/old/playwright-legacy',
          eligible: false,
        }),
      ]),
    );
    expect(result.rankedBy).toBe('session-model');
    expect(result.skills.map(({ skill }) => skill.skillId)).toEqual([
      'angular-patterns',
      'playwright-e2e',
    ]);
    // Copied immutable analysisPair does not share reference with input.
    expect(result.analysisPair).toEqual(savedPair);
    expect(result.analysisPair).not.toBe(savedPair);
  });

  it('preserves equal-name/different-kind and duplicate item identity while coalescing searches and mapping failures', async () => {
    const { recommendationService, execute } = createJudgeHarness();
    const jestSkill: SkillShEntry = {
      ...entry,
      source: 'Org/Testing',
      skillId: 'jest-unit',
      name: 'Jest unit testing',
      installs: 200,
    };

    const search = jest.fn(async (query: string) => {
      if (query === 'jest') return [jestSkill];
      if (query === 'redis') throw new Error('network down');
      return [];
    });

    execute.mockImplementation(async (config) => {
      config.onProviderSubmit?.(SETUP_PAIR);
      return makeStream(
        makeSuccessMessage({
          items: [
            {
              itemId: 'framework:jest',
              outcomes: [
                {
                  verdict: 'no-skill',
                  reason: 'Not used as an app framework.',
                },
              ],
            },
            {
              itemId: 'test-tool:jest',
              outcomes: [
                {
                  verdict: 'install',
                  candidateId: 'org/testing/jest-unit',
                  reason: 'Runs unit tests in jest.config.ts.',
                },
              ],
            },
            {
              itemId: 'test-tool:jest#2',
              outcomes: [
                {
                  verdict: 'no-skill',
                  reason: 'Already covered by primary Jest test-tool entry.',
                },
              ],
            },
            {
              itemId: 'library:redis',
              outcomes: [
                {
                  verdict: 'build',
                  reason: 'Registry failed; project uses Redis queues.',
                  proposal: {
                    name: 'Redis Queue Conventions',
                    description: 'Local Redis queue patterns.',
                  },
                },
              ],
            },
            {
              itemId: 'pattern:redis',
              outcomes: [
                {
                  verdict: 'no-skill',
                  reason: 'No separate pattern skill needed.',
                },
              ],
            },
            {
              itemId: 'library:obscurelib',
              outcomes: [
                {
                  verdict: 'no-skill',
                  reason: 'Minimal usage.',
                },
              ],
            },
          ],
        }),
      );
    });

    const items: StackSummaryItem[] = [
      {
        kind: 'framework',
        name: 'Jest',
        evidence: 'jest.config.ts',
        sourcePhase: 'stack',
      },
      {
        kind: 'test-tool',
        name: 'Jest',
        evidence: 'package.json devDependencies.jest',
        sourcePhase: 'stack',
      },
      {
        kind: 'test-tool',
        name: 'Jest',
        evidence: 'apps/web/jest.config.ts',
        sourcePhase: 'arch',
      },
      {
        kind: 'library',
        name: 'Redis',
        evidence: 'package.json ioredis',
        sourcePhase: 'stack',
      },
      {
        kind: 'pattern',
        name: 'Redis',
        evidence: 'cache layer',
        sourcePhase: 'arch',
      },
      {
        kind: 'library',
        name: 'ObscureLib',
        evidence: 'package.json',
        sourcePhase: 'stack',
      },
    ];

    const result = await recommendationService.recommendAnalysis({
      workspaceRoot,
      resolved: SETUP_SNAPSHOT,
      analysisPair: null,
      summarySource: 'structured',
      items,
      search,
    });

    // Coalesced: 3 unique terms queried once each, mapped back to all 6 itemIds.
    expect(search).toHaveBeenCalledTimes(3);
    expect(result.judge.items.map(({ itemId }) => itemId)).toEqual([
      'framework:jest',
      'test-tool:jest',
      'test-tool:jest#2',
      'library:redis',
      'pattern:redis',
      'library:obscurelib',
    ]);
    expect(result.judge.items.map(({ registry }) => registry)).toEqual([
      'matched',
      'matched',
      'matched',
      'search-failed',
      'search-failed',
      'no-match',
    ]);
    // Both Redis items receive the mapped search failure.
    expect(result.searchFailures).toEqual([
      { item: 'Redis', reason: 'Search failed' },
      { item: 'Redis', reason: 'Search failed' },
    ]);
    // Only the zero-result successful search enters unmatchedItems.
    expect(result.unmatchedItems).toEqual([items[5]]);
    // Never substitutes live Setup when saved analysisPair is null.
    expect(result.analysisPair).toBeNull();
  });

  it('supports opposite per-item verdicts on a shared candidate and preserves case-sensitive consent keys', async () => {
    const { recommendationService, rankSkillCandidates, execute } =
      createJudgeHarness();

    const sharedCandidate: SkillShEntry = {
      source: 'AcmeOrg/SkillRepo',
      skillId: 'Angular-Signals',
      name: 'Angular Signals & Playwright',
      description: 'Angular signals and Playwright integration',
      installs: 420,
      isInstalled: false,
    };

    rankSkillCandidates.mockResolvedValue({
      status: 'used',
      pairConfigured: DECISION_PAIR,
      pairAttempted: DECISION_PAIR,
      pairUsed: DECISION_PAIR,
      items: {
        'framework:angular': {
          verdict: 'install',
          candidateId: 'acmeorg/skillrepo/angular-signals',
          reason: 'Angular signals are used in core components.',
          stage: 'decision',
          order: ['acmeorg/skillrepo/angular-signals'],
          rejections: {},
        },
      },
      itemRejections: {},
    });

    execute.mockImplementation(async (config) => {
      config.onProviderSubmit?.(SETUP_PAIR);
      return makeStream(
        makeSuccessMessage({
          items: [
            {
              itemId: 'test-tool:playwright',
              outcomes: [
                {
                  verdict: 'build',
                  reason: 'Playwright suite uses custom Electron fixtures.',
                  proposal: {
                    name: 'Electron Playwright Fixtures',
                    description: 'Guide for Electron Playwright tests.',
                  },
                },
              ],
              rejections: [
                {
                  candidateId: 'acmeorg/skillrepo/angular-signals',
                  reason:
                    'Mostly Angular signals; does not cover Electron fixtures.',
                },
              ],
            },
          ],
        }),
      );
    });

    const result = await recommendationService.recommendAnalysis({
      workspaceRoot,
      resolved: SETUP_SNAPSHOT,
      summarySource: 'structured',
      items: [
        {
          kind: 'framework',
          name: 'Angular',
          evidence: 'package.json @angular/core',
          sourcePhase: 'stack',
        },
        {
          kind: 'test-tool',
          name: 'Playwright',
          evidence: 'e2e/playwright.config.ts',
          sourcePhase: 'stack',
        },
      ],
      search: async () => [sharedCandidate],
    });

    // Mixed stage attribution maps legacy rankedBy to decision-model.
    expect(result.judge.method).toBe('mixed');
    expect(result.rankedBy).toBe('decision-model');

    // Case-preserving consent key vs canonical lowercase candidateId.
    expect(result.judge.candidates).toHaveLength(1);
    expect(result.judge.candidates[0]).toMatchObject({
      candidateId: 'acmeorg/skillrepo/angular-signals',
      selectionKey: 'AcmeOrg/SkillRepo/Angular-Signals',
    });

    // Opposite verdicts on the same shared candidate stay independent per item.
    const [angularItem, playwrightItem] = result.judge.items;
    expect(angularItem.outcomes).toEqual([
      {
        verdict: 'install',
        candidateId: 'acmeorg/skillrepo/angular-signals',
        reason: 'Angular signals are used in core components.',
        stage: 'decision',
      },
    ]);
    expect(angularItem.candidateAssessments[0].rejection).toBeUndefined();
    expect(playwrightItem.outcomes[0]).toMatchObject({
      verdict: 'build',
      stage: 'normal',
    });
    expect(playwrightItem.candidateAssessments[0].rejection).toEqual({
      reason: 'Mostly Angular signals; does not cover Electron fixtures.',
      stage: 'normal',
    });

    // skills[] only lists Install candidates with only the installing item's evidence,
    // and its source/skillId preserves the exact consent selectionKey.
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0]).toMatchObject({
      evidence: 'Angular',
      rankedBy: 'decision-model',
      reason: 'Angular signals are used in core components.',
      rank: 1,
    });
    expect(
      `${result.skills[0].skill.source}/${result.skills[0].skill.skillId}`,
    ).toBe('AcmeOrg/SkillRepo/Angular-Signals');
  });

  it('handles 30-item deadline regression: 2s pre-search, +26s search cap, 500ms assembly, 3s Decision, queued/late Normal with >=30s budget settled by 70s', async () => {
    jest.useFakeTimers({ now: new Date('2026-06-01T12:00:00.000Z') });
    const rpcEntry = Date.now();

    // Keep Normal's scratch I/O on the same schedule as the fake clock.
    jest.spyOn(fs, 'mkdtemp').mockResolvedValue('/tmp/ptah-skill-judge-test');
    jest.spyOn(fs, 'rm').mockResolvedValue(undefined);

    // 2 s pre-search latency (Setup resolution + saved-analysis load).
    await jest.advanceTimersByTimeAsync(2_000);

    const { judgeService, rankSkillCandidates, execute, logger: localLogger } =
      createJudgeHarness();

    // 30 distinct stack items.
    const thirtyItems: StackSummaryItem[] = Array.from(
      { length: 30 },
      (_, index) => ({
        kind: 'library' as const,
        name: `Tech${String(index + 1).padStart(2, '0')}`,
        evidence: `package.json dependency tech${index + 1}`,
        sourcePhase: 'stack',
      }),
    );

    const lateResolvers: Array<() => void> = [];
    const search = jest.fn((query: string): Promise<SkillShEntry[]> => {
      const num = Number(query.replace('tech', ''));
      const hit: SkillShEntry = {
        source: 'Org/Repo',
        skillId: `${query}-guide`,
        name: `${query} guide`,
        description: `Guide for ${query}`,
        installs: 100 + num,
        isInstalled: false,
      };
      // Items 1..12 succeed in 6s per wave (3 waves * 4 workers: +2s -> +20s).
      if (num <= 12) {
        return new Promise((resolve) => {
          setTimeout(() => resolve([hit]), 6_000);
        });
      }
      // Items 13..16 start at +20s and hang past +26s (aborted at +26s; resolve late at +30s).
      return new Promise((resolve) => {
        lateResolvers.push(() => resolve([hit]));
        setTimeout(() => resolve([hit]), 10_000);
      });
    });

    // Inject 500 ms assembly overhead before calling the real SkillJudgeService.
    const assemblyTimedJudge: Pick<SkillJudgeService, 'judge'> = {
      judge: async (req) => {
        await new Promise<void>((resolve) => setTimeout(resolve, 500));
        return judgeService.judge(req);
      },
    };

    const recommendationService = new SkillRecommendationService(
      localLogger as unknown as Logger,
      assemblyTimedJudge,
    );

    // 3 s Decision stage judging the first 4 matched items.
    rankSkillCandidates.mockImplementation(async (decisionItems) => {
      await new Promise<void>((resolve) => setTimeout(resolve, 3_000));
      const answered = Object.fromEntries(
        decisionItems.slice(0, 4).map((decisionItem) => [
          decisionItem.key,
          {
            verdict: 'install' as const,
            candidateId: decisionItem.candidates[0].label,
            reason: `Decision matched ${decisionItem.name} from package.json.`,
            stage: 'decision' as const,
            order: [decisionItem.candidates[0].label],
            rejections: {},
          },
        ]),
      );
      return {
        status: 'used',
        pairConfigured: DECISION_PAIR,
        pairAttempted: DECISION_PAIR,
        pairUsed: DECISION_PAIR,
        items: answered,
        itemRejections: {},
      };
    });

    // Queued/late Normal provider: capture remaining budget at dispatch, queue 5s, submit, then stall past +65s.
    let normalRemainingAtDispatch = -1;
    let normalRemainingAtSubmit = -1;
    let normalConfig: InternalQueryConfig | undefined;
    let resolveLateNormal!: (handle: InternalQueryHandle) => void;
    const lateNormalHandle = new Promise<InternalQueryHandle>((resolve) => {
      resolveLateNormal = resolve;
    });

    execute.mockImplementation(async (config) => {
      normalConfig = config;
      normalRemainingAtDispatch = rpcEntry + 65_000 - Date.now();
      // Queued for 5 s before provider submission.
      setTimeout(() => {
        if (!config.abortController?.signal.aborted) {
          normalRemainingAtSubmit = rpcEntry + 65_000 - Date.now();
          config.onProviderSubmit?.(SETUP_PAIR);
        }
      }, 5_000);
      return lateNormalHandle;
    });

    let elapsedMs: number | undefined;
    const pending = recommendationService
      .recommendAnalysis({
        workspaceRoot,
        rpcEntry,
        resolved: SETUP_SNAPSHOT,
        analysisPair: { provider: 'anthropic', model: 'claude-opus-4' },
        summarySource: 'structured',
        items: thirtyItems,
        search,
      })
      .then((result) => {
        elapsedMs = Date.now() - rpcEntry;
        return result;
      });

    // Advance through search cap (+2s -> +26s = 24s), assembly (500ms), Decision (3s) -> Normal dispatched at +29.5s.
    await jest.advanceTimersByTimeAsync(27_500);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(normalRemainingAtDispatch).toBeGreaterThanOrEqual(30_000);

    // Trigger any late search resolvers after +26s to verify the settled guard blocks late writes.
    for (const resolveLate of lateResolvers) resolveLate();
    await jest.advanceTimersByTimeAsync(0);

    // Advance through queued submission (+34.5s) and the Normal cap (+65s).
    await jest.advanceTimersByTimeAsync(40_500);
    expect(elapsedMs).toBeLessThanOrEqual(70_000);
    const result = await pending;

    // Registry search schedule: 12 matched, 4 timed-out at +26s, 14 unstarted not-searched.
    expect(search).toHaveBeenCalledTimes(16);
    const matched = result.judge.items.filter(
      ({ registry }) => registry === 'matched',
    );
    const failed = result.judge.items.filter(
      ({ registry }) => registry === 'search-failed',
    );
    const notSearched = result.judge.items.filter(
      ({ registry }) => registry === 'not-searched',
    );
    expect(matched).toHaveLength(12);
    expect(failed).toHaveLength(4);
    expect(notSearched).toHaveLength(14);
    for (const item of failed) {
      expect(item.registryFailure).toEqual({
        kind: 'timed-out',
        reason: 'Search timed out',
      });
    }
    for (const item of notSearched) {
      expect(item.registryFailure).toEqual({
        kind: 'budget-exceeded',
        reason: 'Search budget reached',
      });
    }
    expect(result.unmatchedItems).toEqual([]);
    expect(result.searchFailures).toHaveLength(4);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(normalRemainingAtSubmit).toBeGreaterThanOrEqual(30_000);
    expect(normalConfig?.abortController?.signal.aborted).toBe(true);

    // Decision verdicts preserved; Normal timed out with pairAttempted and without pairUsed.
    expect(result.judge.method).toBe('decision');
    expect(result.judge.counts).toEqual({
      decision: 4,
      normal: 0,
      notJudged: 26,
    });
    expect(result.rankedBy).toBe('decision-model');
    expect(result.skills).toHaveLength(4);
    expect(result.judge.stages[1]).toEqual({
      stage: 'normal',
      status: 'failed',
      category: 'timed-out',
      pairConfigured: SETUP_PAIR,
      pairAttempted: SETUP_PAIR,
      itemsJudged: 0,
      invalidItemIds: [],
    });

    // Late Normal stream arriving after settlement is closed and cannot mutate result.
    const lateStream = makeStream(
      makeSuccessMessage({
        items: [
          {
            itemId: 'library:tech05',
            outcomes: [{ verdict: 'no-skill', reason: 'Too late.' }],
          },
        ],
      }),
    );
    resolveLateNormal(lateStream);
    await jest.advanceTimersByTimeAsync(0);
    expect(lateStream.close).toHaveBeenCalledTimes(1);
    expect(result.judge.items[4].judgedBy).toBe('none');
  });

  it('labels Decision failed on hard-deadline and unexpected judge backstops while keeping pre-dispatch skipped', async () => {
    const stackItem: StackSummaryItem = {
      kind: 'framework',
      name: 'Angular',
      evidence: 'package.json',
      sourcePhase: 'stack',
    };
    const search = async () => [entry];

    // 1. Hard-deadline backstop (+70s) after judge() has been invoked.
    jest.useFakeTimers({ now: new Date('2026-06-01T12:00:00.000Z') });
    const rpcEntry = Date.now();
    const hangingJudge = {
      judge: jest.fn(() => new Promise<never>(() => undefined)),
    };
    const hangingService = new SkillRecommendationService(
      logger as Logger,
      hangingJudge,
    );
    const pending = hangingService.recommendAnalysis({
      workspaceRoot,
      rpcEntry,
      resolved: SETUP_SNAPSHOT,
      summarySource: 'structured',
      items: [stackItem],
      search,
    });
    await jest.advanceTimersByTimeAsync(70_000);
    const timedOutResult = await pending;
    jest.useRealTimers();

    expect(hangingJudge.judge).toHaveBeenCalledTimes(1);
    expect(timedOutResult.judge.method).toBe('none');
    expect(timedOutResult.judge.stages).toEqual([
      {
        stage: 'decision',
        status: 'failed',
        category: 'timed-out',
        itemsJudged: 0,
        invalidItemIds: [],
      },
      {
        stage: 'normal',
        status: 'failed',
        category: 'timed-out',
        pairConfigured: SETUP_PAIR,
        itemsJudged: 0,
        invalidItemIds: [],
      },
    ]);
    expect(timedOutResult.skills).toHaveLength(1);

    // 2. Unexpected throw backstop after judge() has been invoked.
    const throwingJudge = {
      judge: jest.fn().mockRejectedValue(new Error('raw-provider-secret')),
    };
    const throwingService = new SkillRecommendationService(
      logger as Logger,
      throwingJudge,
    );
    const failedResult = await throwingService.recommendAnalysis({
      workspaceRoot,
      resolved: SETUP_SNAPSHOT,
      summarySource: 'structured',
      items: [stackItem],
      search,
    });
    expect(failedResult.judge.method).toBe('none');
    expect(failedResult.judge.stages).toEqual([
      {
        stage: 'decision',
        status: 'failed',
        category: 'unavailable',
        itemsJudged: 0,
        invalidItemIds: [],
      },
      {
        stage: 'normal',
        status: 'failed',
        category: 'provider-error',
        pairConfigured: SETUP_PAIR,
        itemsJudged: 0,
        invalidItemIds: [],
      },
    ]);
    expect(JSON.stringify(failedResult)).not.toContain('raw-provider-secret');

    // 3. Pre-dispatch deadline exhaustion (judge() never invoked): Decision stays skipped.
    const neverCalledJudge = { judge: jest.fn() };
    const expiredService = new SkillRecommendationService(
      logger as Logger,
      neverCalledJudge,
    );
    const expiredResult = await expiredService.recommendAnalysis({
      workspaceRoot,
      rpcEntry: Date.now() - 75_000,
      resolved: SETUP_SNAPSHOT,
      summarySource: 'structured',
      items: [stackItem],
      search,
    });
    expect(neverCalledJudge.judge).not.toHaveBeenCalled();
    expect(expiredResult.judge.stages[0]).toEqual({
      stage: 'decision',
      status: 'skipped',
      category: 'timed-out',
      itemsJudged: 0,
      invalidItemIds: [],
    });
  });

  it('registers SKILL_JUDGE_SERVICE, SKILL_DRAFT_GENERATION_SERVICE, and SKILL_RECOMMENDATION_SERVICE in DI', () => {
    const child = rootContainer.createChildContainer();
    child.registerInstance(TOKENS.LOGGER, logger as Logger);
    child.registerInstance(SDK_TOKENS.SDK_WORKSPACE_LLM_RESOLVER, {
      resolveForPath: jest.fn(),
      resolveSetup: jest.fn(),
    } as unknown as IWorkspaceLlmResolver);
    child.registerInstance(HARNESS_TOKENS.LLM_RUNNER, {
      run: jest.fn(),
    } as unknown as HarnessLlmRunner);

    registerSkillServices(child);

    const judge = child.resolve<SkillJudgeService>(SKILL_JUDGE_SERVICE);
    const draft = child.resolve<SkillDraftGenerationService>(
      SKILL_DRAFT_GENERATION_SERVICE,
    );
    const recommendation = child.resolve<SkillRecommendationService>(
      SKILL_RECOMMENDATION_SERVICE,
    );

    expect(judge).toBeInstanceOf(SkillJudgeService);
    expect(draft).toBeInstanceOf(SkillDraftGenerationService);
    expect(recommendation).toBeInstanceOf(SkillRecommendationService);
    expect(child.resolve(SKILL_JUDGE_SERVICE)).toBe(judge);
    expect(child.resolve(SKILL_DRAFT_GENERATION_SERVICE)).toBe(draft);
  });
});
