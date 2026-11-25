import { TestBed } from '@angular/core/testing';
import type {
  ModelPair,
  SkillJudgeCandidate,
  SkillJudgeItem,
  SkillJudgeResult,
  SkillRecommendation,
  SkillShEntry,
  StackSummaryItem,
  WizardRecommendAnalysisSkillsResult,
} from '@ptah-extension/shared';
import {
  buildJudgedStackCoverage,
  buildStackCoverage,
  canonicalCandidateId,
  coverageSummaryText,
  coverageVerdictLabel,
  deriveCoverageVerdict,
  formatInstallCount,
  skillSelectionKey,
  splitStackEvidence,
} from './stack-coverage';
import {
  DRAFT_BLOCKED_BY_CONSENT_REASON,
  INSTALL_BLOCKED_BY_DRAFT_REASON,
  StackSkillStore,
} from './stack-skill.store';

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
const rxjsItem: StackSummaryItem = {
  name: 'RxJS',
  kind: 'library',
  evidence: 'package.json',
  sourcePhase: 'analysis',
};
const nxItem: StackSummaryItem = {
  name: 'Nx',
  kind: 'pattern',
  evidence: 'nx.json',
  sourcePhase: 'analysis',
};
const tailwindItem: StackSummaryItem = {
  name: 'Tailwind CSS',
  kind: 'library',
  evidence: 'tailwind.config.js',
  sourcePhase: 'analysis',
};

const skillOne: SkillShEntry = {
  source: 'Acme/Repo',
  skillId: 'One',
  name: 'One',
  description: 'Angular and RxJS guidance',
  installs: 12400,
  isInstalled: true,
};
const skillDeprecated: SkillShEntry = {
  source: 'acme/repo',
  skillId: 'legacy-ng',
  name: 'Legacy Angular',
  description: 'Deprecated Angular helper',
  installs: 200,
  isInstalled: false,
};
const skillRejected: SkillShEntry = {
  source: 'other/org',
  skillId: 'generic-js',
  name: 'Generic JS',
  description: 'Too broad',
  installs: 500,
  isInstalled: false,
};
const skillNotJudged: SkillShEntry = {
  source: 'community/skills',
  skillId: 'nx-monorepo',
  name: 'Nx Monorepo',
  description: 'Nx workspace helper',
  installs: 800,
  isInstalled: false,
};
const manualSkill: SkillShEntry = {
  source: 'Manual/Org',
  skillId: 'Jest-Tips',
  name: 'Jest Tips',
  description: 'Manual search result for Jest',
  installs: 42,
  isInstalled: false,
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

function makeCandidate(
  skill: SkillShEntry,
  deprecated = false,
): SkillJudgeCandidate {
  const selectionKey = skillSelectionKey(skill);
  return {
    candidateId: canonicalCandidateId(selectionKey),
    selectionKey,
    skill,
    deprecated,
  };
}

function makeJudgeFixture(
  overrides?: Partial<SkillJudgeResult>,
): SkillJudgeResult {
  const items: SkillJudgeItem[] = [
    {
      itemId: 'framework:angular',
      item: { ...angular },
      registry: 'matched',
      candidateIds: ['acme/repo/one', 'acme/repo/legacy-ng', 'other/org/generic-js'],
      candidateAssessments: [
        { candidateId: 'acme/repo/one', eligible: true },
        {
          candidateId: 'acme/repo/legacy-ng',
          eligible: false,
          rejection: { reason: 'Marked deprecated', stage: 'decision' },
        },
        {
          candidateId: 'other/org/generic-js',
          eligible: true,
          rejection: { reason: 'Too generic for Angular', stage: 'normal' },
        },
      ],
      outcomes: [
        {
          verdict: 'install',
          candidateId: 'acme/repo/one',
          reason: 'Covers Angular signals and DI',
          stage: 'decision',
        },
        {
          verdict: 'install',
          candidateId: 'acme/repo/legacy-ng',
          reason: 'Deprecated candidate should not preselect',
          stage: 'decision',
        },
        {
          verdict: 'build',
          proposalId: 'prop-angular-app',
          reason: 'Add repo-specific conventions',
          stage: 'normal',
        },
      ],
      judgedBy: 'normal',
    },
    {
      itemId: 'library:rxjs',
      item: rxjsItem,
      registry: 'matched',
      candidateIds: ['acme/repo/one'],
      candidateAssessments: [{ candidateId: 'acme/repo/one', eligible: true }],
      outcomes: [
        {
          verdict: 'install',
          candidateId: 'acme/repo/one',
          reason: 'Shared Angular+RxJS skill',
          stage: 'decision',
        },
      ],
      judgedBy: 'decision',
    },
    {
      itemId: 'test-tool:jest',
      item: jestItem,
      registry: 'search-failed',
      registryFailure: { kind: 'timed-out', reason: 'timeout' },
      candidateIds: [],
      candidateAssessments: [],
      outcomes: [
        {
          verdict: 'build',
          proposalId: 'prop-angular-app',
          reason: 'Capture Jest config conventions',
          stage: 'normal',
        },
      ],
      judgedBy: 'normal',
    },
    {
      itemId: 'library:tailwind',
      item: tailwindItem,
      registry: 'no-match',
      candidateIds: [],
      candidateAssessments: [],
      outcomes: [
        {
          verdict: 'no-skill',
          reason: 'Standard CSS utility usage needs no skill',
          stage: 'decision',
        },
      ],
      judgedBy: 'decision',
    },
    {
      itemId: 'pattern:nx',
      item: nxItem,
      registry: 'matched',
      candidateIds: ['community/skills/nx-monorepo'],
      candidateAssessments: [
        { candidateId: 'community/skills/nx-monorepo', eligible: true },
      ],
      outcomes: [],
      judgedBy: 'none',
    },
  ];

  return {
    method: 'mixed',
    counts: { decision: 2, normal: 2, notJudged: 1 },
    items,
    candidates: [
      makeCandidate(skillOne, false),
      makeCandidate(skillDeprecated, true),
      makeCandidate(skillRejected, false),
      makeCandidate(skillNotJudged, false),
    ],
    proposals: [
      {
        proposalId: 'prop-angular-app',
        name: 'Angular App Guide',
        description: 'Repo conventions for Angular and Jest',
        itemIds: ['framework:angular', 'test-tool:jest'],
      },
    ],
    stages: [
      {
        stage: 'decision',
        status: 'used',
        pairConfigured: { provider: 'openai', model: 'gpt-4.1-mini' },
        pairAttempted: { provider: 'openai', model: 'gpt-4.1-mini' },
        pairUsed: { provider: 'openai', model: 'gpt-4.1-mini' },
        itemsJudged: 2,
        invalidItemIds: [],
      },
      {
        stage: 'normal',
        status: 'used',
        pairConfigured: { provider: 'anthropic', model: 'claude-sonnet-4' },
        pairAttempted: { provider: 'anthropic', model: 'claude-sonnet-4' },
        pairUsed: { provider: 'anthropic', model: 'claude-sonnet-4' },
        itemsJudged: 2,
        invalidItemIds: [],
      },
    ],
    ...overrides,
  };
}

function makeRecommendResult(
  judge: SkillJudgeResult = makeJudgeFixture(),
  analysisPair: ModelPair | null = {
    provider: 'anthropic',
    model: 'claude-opus-4',
  },
): WizardRecommendAnalysisSkillsResult {
  return {
    skills: [row],
    judge,
    analysisPair,
    detectedItems: judge.items.map((entry) => entry.item),
    unmatchedItems: [],
    searchFailures: [{ item: 'Jest', reason: 'timeout' }],
    summarySource: 'structured',
  };
}

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
      new Set(['Acme/Repo/One']),
    );
    expect(
      items.map((item) => [item.state, item.selectedCount, item.totalCount]),
    ).toEqual([
      ['covered', 1, 1],
      ['covered', 1, 1],
    ]);
  });

  it('deduplicates candidates case-insensitively and preserves failure precedence across multiple items', () => {
    const upperVariant: SkillRecommendation = {
      ...row,
      skill: { ...row.skill, source: 'ACME/REPO', skillId: 'ONE' },
      evidence: 'Angular, Jest',
    };
    const items = buildStackCoverage(
      [angular, jestItem, rxjsItem],
      [],
      [{ item: 'Jest', reason: 'timeout' }],
      [row, upperVariant],
      new Set(['acme/repo/one']),
    );
    expect(
      items.map((item) => [
        item.name,
        item.state,
        item.selectedCount,
        item.totalCount,
        Boolean(item.originalSearchFailed),
      ]),
    ).toEqual([
      ['Angular', 'covered', 1, 1, false],
      ['Jest', 'covered', 1, 1, true],
      ['RxJS', 'none', 0, 0, false],
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
      ).map((item) => [item.state, Boolean(item.originalSearchFailed)]),
    ).toEqual([
      ['none', false],
      ['failed', true],
    ]);
  });

  it('marks a failed-search item with selected coverage as covered while preserving originalSearchFailed (R19)', () => {
    const item = buildStackCoverage(
      [angular],
      [],
      [{ item: 'Angular', reason: 'timeout' }],
      [row],
      new Set(['acme/repo/one']),
    )[0];
    expect(item).toMatchObject({
      state: 'covered',
      originalSearchFailed: true,
      selectedCount: 1,
    });
    expect(coverageSummaryText(item)).toBe('Covered - original search failed');
  });

  it('builds judged stack coverage with verdict status words, registry facts, and R19 manual coverage', () => {
    const judge = makeJudgeFixture();
    const selectedByItem = new Map<string, ReadonlySet<string>>([
      ['framework:angular', new Set(['acme/repo/one'])],
      ['library:rxjs', new Set(['acme/repo/one'])],
      ['test-tool:jest', new Set(['manual/org/jest-tips'])],
      ['library:tailwind', new Set()],
      ['pattern:nx', new Set()],
    ]);
    const manualByItem = new Map<string, ReadonlySet<string>>([
      ['test-tool:jest', new Set(['manual/org/jest-tips'])],
    ]);

    const coverage = buildJudgedStackCoverage(
      judge,
      selectedByItem,
      manualByItem,
    );

    expect(
      coverage.map((c) => ({
        itemId: c.itemId,
        state: c.state,
        verdict: c.verdict,
        summary: coverageSummaryText(c),
        verdictLabel: c.verdict ? coverageVerdictLabel(c.verdict) : null,
        failed: Boolean(c.originalSearchFailed),
      })),
    ).toEqual([
      {
        itemId: 'framework:angular',
        state: 'covered',
        verdict: 'install-and-build',
        summary: '1 selected',
        verdictLabel: 'Install + Build',
        failed: false,
      },
      {
        itemId: 'library:rxjs',
        state: 'covered',
        verdict: 'install',
        summary: '1 selected',
        verdictLabel: 'Install',
        failed: false,
      },
      {
        itemId: 'test-tool:jest',
        state: 'covered',
        verdict: 'build',
        summary: 'Covered - original search failed',
        verdictLabel: 'Build',
        failed: true,
      },
      {
        itemId: 'library:tailwind',
        state: 'none',
        verdict: 'no-skill',
        summary: 'no match',
        verdictLabel: 'No skill needed',
        failed: false,
      },
      {
        itemId: 'pattern:nx',
        state: 'available',
        verdict: 'not-judged',
        summary: '1 available',
        verdictLabel: 'Not judged',
        failed: false,
      },
    ]);

    expect(
      coverageSummaryText({
        name: 'Vitest',
        kind: 'test-tool',
        evidence: '',
        state: 'none',
        registry: 'not-searched',
        selectedCount: 0,
        totalCount: 0,
      }),
    ).toBe('not searched');

    expect(deriveCoverageVerdict({ outcomes: [], judgedBy: 'decision' })).toBe(
      'not-judged',
    );
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

describe('StackSkillStore', () => {
  let store: StackSkillStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = TestBed.inject(StackSkillStore);
    store.reset();
  });

  it('keeps analysisPair and judge immutable, pre-selects valid non-deprecated Install verdicts only, and preserves analysisPair on Re-run', () => {
    const pair: ModelPair = { provider: 'anthropic', model: 'claude-opus-4' };
    const judge = makeJudgeFixture();
    const first = makeRecommendResult(judge, pair);

    expect(store.applyRecommendationResult(first)).toEqual({ status: 'ok' });

    // Mutate caller inputs after applying
    pair.model = 'mutated-model';
    judge.items[0].item.name = 'Mutated';

    expect(store.analysisPair()).toEqual({
      provider: 'anthropic',
      model: 'claude-opus-4',
    });
    expect(Object.isFrozen(store.analysisPair())).toBe(true);
    expect(store.judge()?.items[0].item.name).toBe('Angular');

    // Only non-deprecated install candidate is pre-selected (D5)
    expect([...store.selectedCandidateIds()]).toEqual(['acme/repo/one']);
    // Mapped to original-case selectionKey at the consent boundary
    expect([...store.selectedIds()]).toEqual(['Acme/Repo/One']);
    expect(store.selectedSelectionKeys()).toEqual(['Acme/Repo/One']);

    // Re-run with a different analysisPair does not overwrite the recorded analysisPair (R14)
    const rerun = makeRecommendResult(
      makeJudgeFixture({ method: 'none' }),
      { provider: 'openai', model: 'gpt-4.1' },
    );
    expect(store.applyRecommendationResult(rerun)).toEqual({ status: 'ok' });
    expect(store.analysisPair()).toEqual({
      provider: 'anthropic',
      model: 'claude-opus-4',
    });
    // method === 'none' pre-selects nothing (TD 4.2)
    expect(store.selectedCandidateIds().size).toBe(0);
  });

  it('clears prior-run search cards, totals, and available counts on Re-run', () => {
    const result = makeRecommendResult();
    const itemId = 'library:tailwind';
    store.applyRecommendationResult(result);
    const initialTotal = store.selectionKeyByCandidateId().size;
    const currentSearchSkill = { ...manualSkill, skillId: 'current-result' };
    const generalSearchSkill = { ...manualSkill, skillId: 'general-result' };
    store.setItemSearchResults(itemId, [manualSkill]);
    store.setSearchResults([generalSearchSkill]);
    store.setSelectedIds(new Set([
      'Manual/Org/Jest-Tips',
      'Manual/Org/general-result',
      'Manual/Org/custom',
    ]));
    store.setSearchResults([]);
    store.setItemSearchResults(itemId, [currentSearchSkill]);
    store.setSelectedCandidateIds(new Set());

    const itemRow = () => store.visibleItemRows().find((row) => row.itemId === itemId);
    const coverage = () => store.stackCoverage().find((item) => item.itemId === itemId);
    expect(itemRow()?.manualCandidates).toEqual([manualSkill, currentSearchSkill]);
    expect(store.selectionKeyByCandidateId().size).toBe(initialTotal + 4);
    expect(coverage()).toMatchObject({ state: 'available', totalCount: 2 });

    expect(store.applyRecommendationResult(result)).toEqual({ status: 'ok' });
    expect(store.itemSearchResultsByItemId().size).toBe(0);
    expect(store.retainedItemSearchResultsByItemId().size).toBe(0);
    expect(store.retainedSearchResults()).toEqual([]);
    expect(store.selectionKeyByCandidateId().size).toBe(initialTotal);
    expect(itemRow()?.manualCandidates).toEqual([]);
    expect(coverage()).toMatchObject({ state: 'none', totalCount: 0 });
  });

  it('keeps the current recommendation and dirty draft until discard is confirmed', () => {
    store.applyRecommendationResult(makeRecommendResult());
    store.setItemSearchResults('library:tailwind', [manualSkill]);
    store.openManualDraft('library:tailwind');
    store.updateDraftFields({ body: '# Keep these edits' });
    store.setVerdictFilter('no-skill');
    store.setActiveItemId('library:tailwind');
    const draft = store.openDraft();
    const judge = store.judge();
    const recommendations = store.recommendations();
    const selection = store.selectedCandidateIds();
    const rerun = makeRecommendResult(makeJudgeFixture({ method: 'none' }));

    expect(store.applyRecommendationResult(rerun)).toEqual({ status: 'confirm-dirty' });
    expect(store.openDraft()).toBe(draft);
    expect(store.judge()).toBe(judge);
    expect(store.recommendations()).toBe(recommendations);
    expect(store.selectedCandidateIds()).toBe(selection);
    expect(store.itemSearchResultsByItemId().get('library:tailwind')).toEqual([manualSkill]);
    expect(store.verdictFilter()).toBe('no-skill');
    expect(store.activeItemId()).toBe('library:tailwind');

    expect(store.applyRecommendationResult(rerun, { discardDirtyDraft: true }))
      .toEqual({ status: 'ok' });
    expect(store.openDraft()).toBeNull();
    expect(store.judge()?.method).toBe('none');
    expect(store.verdictFilter()).toBe('all');
    expect(store.activeItemId()).toBeNull();
  });

  it('rejects recommendation replacement during preview generation or Create', () => {
    store.applyRecommendationResult(makeRecommendResult());
    const judge = store.judge();
    const rerun = makeRecommendResult(makeJudgeFixture({ method: 'none' }));
    const opened = store.openProposalDraft('prop-angular-app');
    if (opened.status !== 'ok') throw new Error('Expected an open proposal draft');

    expect(store.openDraft()?.previewLoading).toBe(true);
    expect(store.applyRecommendationResult(rerun, { discardDirtyDraft: true }))
      .toEqual({ status: 'busy' });
    expect(store.judge()).toBe(judge);
    expect(store.openDraft()).toBe(opened.draft);
    expect(store.applyDraftPreviewError(opened.draft, 'Preview failed')).toBe(true);

    store.updateDraftFields({ body: '# Keep these edits' });
    const submission = store.beginCreateDraft();
    if (!submission) throw new Error('Expected a draft Create submission');
    const submittedDraft = store.openDraft();
    expect(store.applyRecommendationResult(rerun, { discardDirtyDraft: true }))
      .toEqual({ status: 'busy' });
    expect(store.judge()).toBe(judge);
    expect(store.openDraft()).toBe(submittedDraft);
    expect(store.completeCreateDraft(submission.revision, '/workspace/SKILL.md'))
      .toBe('/workspace/SKILL.md');
  });

  it('toggles repeated candidates under one canonical ID and drives unified R19 coverage across strip and rail', () => {
    store.applyRecommendationResult(makeRecommendResult());

    // Angular and RxJS are both covered by the single shared Install candidate
    expect(store.coveredItemCount()).toBe(2);
    expect(
      [...(store.selectedCandidateIdsByItemId().get('framework:angular') ?? [])],
    ).toEqual(['acme/repo/one']);
    expect(
      [...(store.selectedCandidateIdsByItemId().get('library:rxjs') ?? [])],
    ).toEqual(['acme/repo/one']);

    // Manual per-item search result covers the search-failed Jest item (R19)
    store.setItemSearchResults('test-tool:jest', [manualSkill]);
    store.toggle('Manual/Org/Jest-Tips');
    expect(store.coveredItemCount()).toBe(3);
    const jestCoverage = store
      .stackCoverage()
      .find((entry) => entry.itemId === 'test-tool:jest');
    expect(jestCoverage).toMatchObject({
      state: 'covered',
      originalSearchFailed: true,
      selectedCount: 1,
    });

    // Toggling with different casing unselects the same canonical ID
    store.toggle('ACME/REPO/ONE');
    expect(store.isCandidateSelected('acme/repo/one')).toBe(false);
    expect(store.coveredItemCount()).toBe(1);
  });

  it('computes R16 item rows, residual Other candidates predicate, and F28 hidden pool counts', () => {
    store.applyRecommendationResult(makeRecommendResult());

    // Under 'all': acme/repo/one (install), acme/repo/legacy-ng (install outcome),
    // and community/skills/nx-monorepo (not-judged row) are shown; other/org/generic-js is residual.
    expect(store.showOtherCandidatesSection()).toBe(true);
    expect(store.residualCandidates()).toEqual([
      expect.objectContaining({
        candidate: expect.objectContaining({ candidateId: 'other/org/generic-js' }),
        rejections: [
          { itemId: 'framework:angular', itemName: 'Angular', reason: 'Too generic for Angular' },
        ],
      }),
    ]);
    expect(store.hiddenPoolCandidateCount()).toBe(0);
    expect(store.verdictFilterOptions()).toEqual([
      { value: 'all', count: 5 },
      { value: 'install', count: 2 },
      { value: 'build', count: 2 },
      { value: 'no-skill', count: 1 },
      { value: 'not-judged', count: 1 },
    ]);

    // Under 'install' filter: Other candidates section hides; F28 counts all hidden distinct pool candidates
    store.setVerdictFilter('install');
    expect(store.showOtherCandidatesSection()).toBe(false);
    // Pool has 4 distinct candidates; 2 are install outcomes (one + legacy-ng), so 2 are hidden (generic-js + nx-monorepo)
    expect(store.hiddenPoolCandidateCount()).toBe(2);

    // Under 'build' filter: all 4 pool candidates are hidden
    store.setVerdictFilter('build');
    expect(store.hiddenPoolCandidateCount()).toBe(4);

    // Under 'not-judged' filter: only nx-monorepo is shown, so 3 are hidden
    store.setVerdictFilter('not-judged');
    expect(store.hiddenPoolCandidateCount()).toBe(3);

    // Under method === 'none' (no-judge / both-failed): Other candidates is never shown
    store.applyRecommendationResult(
      makeRecommendResult(makeJudgeFixture({ method: 'none' })),
    );
    expect(store.showOtherCandidatesSection()).toBe(false);
    expect(store.residualCandidates()).toEqual([]);
  });

  it('counts a candidate hidden when the selected item rejected it and another item installs it', () => {
    const sharedInstall = makeCandidate(skillOne, false);
    const residualOnly = makeCandidate(skillRejected, false);
    const sharedOnlyJudge: SkillJudgeResult = {
      method: 'decision',
      counts: { decision: 2, normal: 0, notJudged: 0 },
      items: [
        {
          itemId: 'item-a',
          item: { ...angular },
          registry: 'matched',
          candidateIds: [sharedInstall.candidateId],
          candidateAssessments: [
            {
              candidateId: sharedInstall.candidateId,
              eligible: true,
              rejection: { reason: 'Not for item A', stage: 'decision' },
            },
          ],
          outcomes: [
            { verdict: 'no-skill', reason: 'Not needed for A', stage: 'decision' },
          ],
          judgedBy: 'decision',
        },
        {
          itemId: 'item-b',
          item: { ...rxjsItem },
          registry: 'matched',
          candidateIds: [sharedInstall.candidateId],
          candidateAssessments: [
            { candidateId: sharedInstall.candidateId, eligible: true },
          ],
          outcomes: [
            {
              verdict: 'install',
              candidateId: sharedInstall.candidateId,
              reason: 'Install for B',
              stage: 'decision',
            },
          ],
          judgedBy: 'decision',
        },
      ],
      candidates: [sharedInstall],
      proposals: [],
      stages: [],
    };
    store.applyRecommendationResult(makeRecommendResult(sharedOnlyJudge));
    expect(store.hiddenPoolCandidateCount()).toBe(0);

    // Selecting item A hides item B's Install card and residualCandidates excludes sharedInstall.
    store.setActiveItemId('item-a');
    expect(store.residualCandidates()).toEqual([]);
    expect(store.hiddenPoolCandidateCount()).toBe(1);

    // When a second residual-only candidate is also in the pool, it stays visible in Other candidates,
    // so only sharedInstall is hidden.
    store.applyRecommendationResult(
      makeRecommendResult({
        ...sharedOnlyJudge,
        candidates: [sharedInstall, residualOnly],
      }),
    );
    store.setActiveItemId('item-a');
    expect(store.showOtherCandidatesSection()).toBe(true);
    expect(store.hiddenPoolCandidateCount()).toBe(1);
  });

  it('excludes candidates already rendered through a pinned draft row from the hidden count', () => {
    const sharedInstall = makeCandidate(skillOne, false);
    const sharedOnlyJudge: SkillJudgeResult = {
      method: 'decision',
      counts: { decision: 2, normal: 0, notJudged: 0 },
      items: [
        {
          itemId: 'item-a',
          item: { ...angular },
          registry: 'matched',
          candidateIds: [sharedInstall.candidateId],
          candidateAssessments: [
            {
              candidateId: sharedInstall.candidateId,
              eligible: true,
              rejection: { reason: 'Not for item A', stage: 'decision' },
            },
          ],
          outcomes: [
            { verdict: 'no-skill', reason: 'Not needed for A', stage: 'decision' },
          ],
          judgedBy: 'decision',
        },
        {
          itemId: 'item-b',
          item: { ...rxjsItem },
          registry: 'matched',
          candidateIds: [sharedInstall.candidateId],
          candidateAssessments: [
            { candidateId: sharedInstall.candidateId, eligible: true },
          ],
          outcomes: [
            {
              verdict: 'install',
              candidateId: sharedInstall.candidateId,
              reason: 'Install for B',
              stage: 'decision',
            },
          ],
          judgedBy: 'decision',
        },
      ],
      candidates: [sharedInstall],
      proposals: [],
      stages: [],
    };
    store.applyRecommendationResult(makeRecommendResult(sharedOnlyJudge));

    // Open B's manual draft so B stays pinned when filtering to A under All.
    expect(store.openManualDraft('item-b').status).toBe('ok');
    store.setActiveItemId('item-a');
    expect(store.visibleItemRows().map((entry) => entry.itemId)).toEqual([
      'item-a',
      'item-b',
    ]);
    expect(store.hiddenPoolCandidateCount()).toBe(0);

    // Switching to Build hides the Install section even though B remains pinned.
    store.setVerdictFilter('build');
    expect(store.hiddenPoolCandidateCount()).toBe(1);

    // Returning to All and closing B's draft unpins B, so the sole Install card is now hidden.
    store.setVerdictFilter('all');
    expect(store.hiddenPoolCandidateCount()).toBe(0);
    expect(store.closeDraft().status).toBe('closed');
    expect(store.hiddenPoolCandidateCount()).toBe(1);
  });

  it('tracks visible row manualCandidates against the pool in hiddenPoolCandidateCount', () => {
    const sharedInstall = makeCandidate(skillOne, false);
    const sharedOnlyJudge: SkillJudgeResult = {
      method: 'decision',
      counts: { decision: 2, normal: 0, notJudged: 0 },
      items: [
        {
          itemId: 'item-a',
          item: { ...angular },
          registry: 'matched',
          candidateIds: [sharedInstall.candidateId],
          candidateAssessments: [
            {
              candidateId: sharedInstall.candidateId,
              eligible: true,
              rejection: { reason: 'Not for item A', stage: 'decision' },
            },
          ],
          outcomes: [
            { verdict: 'no-skill', reason: 'Not needed for A', stage: 'decision' },
          ],
          judgedBy: 'decision',
        },
        {
          itemId: 'item-b',
          item: { ...rxjsItem },
          registry: 'matched',
          candidateIds: [sharedInstall.candidateId],
          candidateAssessments: [
            { candidateId: sharedInstall.candidateId, eligible: true },
          ],
          outcomes: [
            {
              verdict: 'install',
              candidateId: sharedInstall.candidateId,
              reason: 'Install for B',
              stage: 'decision',
            },
          ],
          judgedBy: 'decision',
        },
      ],
      candidates: [sharedInstall],
      proposals: [],
      stages: [],
    };
    store.applyRecommendationResult(makeRecommendResult(sharedOnlyJudge));
    store.setActiveItemId('item-a');
    expect(store.hiddenPoolCandidateCount()).toBe(1);

    // (b) A manual search result outside the pool does not change the hidden count.
    store.setItemSearchResults('item-a', [manualSkill]);
    expect(store.hiddenPoolCandidateCount()).toBe(1);

    // (a) A manual search result matching the pool candidate (canonical ID) makes it visible -> count 0.
    store.setItemSearchResults('item-a', [
      { ...skillOne, source: 'ACME/REPO', skillId: 'ONE' },
    ]);
    expect(store.hiddenPoolCandidateCount()).toBe(0);

    // (c) Clearing the per-item search result hides the pool candidate again -> count 1.
    store.clearItemSearchResults('item-a');
    expect(store.hiddenPoolCandidateCount()).toBe(1);
  });

  it('enforces F29/R17 mutual exclusion in both orders and clears consent on selection toggle', () => {
    store.applyRecommendationResult(makeRecommendResult());

    // Order 1: Draft open -> Consent blocked
    const opened = store.openProposalDraft('prop-angular-app');
    expect(opened.status).toBe('ok');
    expect(store.draftOpen()).toBe(true);
    expect(store.installBlockedReason()).toBe(INSTALL_BLOCKED_BY_DRAFT_REASON);
    expect(store.openConsent([])).toBe(false);
    store.setStage('consent');
    expect(store.stage()).not.toBe('consent');
    store.setPreviewing(true);
    expect(store.previewing()).toBe(false);

    store.closeDraft();
    expect(store.installBlockedReason()).toBeNull();

    // Order 2: Consent open -> Draft blocked
    const consented = store.openConsent([
      {
        skillName: 'Acme/Repo/One',
        contentHash: 'hash-1',
        hasScripts: true,
        scriptFiles: ['setup.sh'],
        files: ['SKILL.md', 'setup.sh'],
      },
    ]);
    expect(consented).toBe(true);
    store.approve('Acme/Repo/One');
    expect(store.consentOpen()).toBe(true);
    expect(store.draftBlockedReason()).toBe(DRAFT_BLOCKED_BY_CONSENT_REASON);
    expect(store.openProposalDraft('prop-angular-app')).toEqual({
      status: 'blocked',
      reason: DRAFT_BLOCKED_BY_CONSENT_REASON,
    });
    expect(store.openManualDraft('library:tailwind')).toEqual({
      status: 'blocked',
      reason: DRAFT_BLOCKED_BY_CONSENT_REASON,
    });

    // Selection toggle clears consent preview, approvals, and closes consent
    store.toggle('Acme/Repo/One');
    expect(store.preview()).toEqual([]);
    expect(store.approvedIds().size).toBe(0);
    expect(store.stage()).toBe('review');
    expect(store.draftBlockedReason()).toBeNull();
  });

  it('pins open draft across filter changes (F30), enforces R18 dirty guards on all 4 triggers, guards stale previews, and tracks C5 createdSkillSlugs', () => {
    store.applyRecommendationResult(makeRecommendResult());

    // Manual draft opener works for any detected item (TD 3.8)
    const manual = store.openManualDraft('library:tailwind');
    expect(manual.status).toBe('ok');
    if (manual.status === 'ok') {
      expect(manual.draft.mode).toBe('edit');
      expect(manual.draft.name).toBe('tailwind-css');
      expect(manual.draft.body).toContain('## Project evidence');
      expect(manual.draft.body).not.toContain('Describe how to work with');
    }

    // F30: filtering to 'install' keeps the pinned manual draft row visible
    store.setVerdictFilter('install');
    expect(
      store.visibleItemRows().some((row) => row.itemId === 'library:tailwind' && row.pinned),
    ).toBe(true);
    store.resetFilters();

    // Dirty manual draft triggers R18 confirm-dirty on all 4 triggers
    store.updateDraftFields({ body: '## Project evidence\n\nCustom user edits' });
    expect(store.openProposalDraft('prop-angular-app')).toEqual({
      status: 'confirm-dirty',
      trigger: 'preview-draft',
    });
    expect(store.openManualDraft('pattern:nx')).toEqual({
      status: 'confirm-dirty',
      trigger: 'manual-draft',
    });
    expect(store.requestCloseDraftForItemSearch()).toEqual({
      status: 'confirm-dirty',
      trigger: 'item-search',
    });

    // Force-discarding opens proposal draft with previewRequestSeq
    const proposalOpen = store.openProposalDraft('prop-angular-app', {
      forceDiscardDirty: true,
    });
    expect(proposalOpen.status).toBe('ok');
    if (proposalOpen.status !== 'ok') return;
    const firstReq = {
      revision: proposalOpen.draft.revision,
      previewRequestSeq: proposalOpen.draft.previewRequestSeq,
    };

    // F30: proposal stays pinned under 'no-skill' filter
    store.setVerdictFilter('no-skill');
    expect(
      store.visibleProposals().map((p) => p.proposalId),
    ).toEqual(['prop-angular-app']);
    store.resetFilters();

    // Generation failure opens edit mode with deterministic Project evidence + linked Build reasons
    expect(
      store.applyDraftPreviewResult(firstReq, {
        ok: false,
        category: 'timed-out',
        message: 'Draft timed out',
      }),
    ).toBe(true);
    expect(store.openDraft()?.mode).toBe('edit');
    expect(store.openDraft()?.generationError).toEqual({
      category: 'timed-out',
      message: 'Draft timed out',
      retryable: true,
    });
    expect(store.openDraft()?.body).toContain('Add repo-specific conventions');
    expect(store.openDraft()?.body).toContain('Capture Jest config conventions');

    // Editing makes draft dirty -> R18 trigger 4 (retry-generation) requires confirm
    store.updateDraftFields({ body: '# My custom guide\n\nKeep this.' });
    expect(store.beginRetryDraftGeneration()).toEqual({
      status: 'confirm-dirty',
      trigger: 'retry-generation',
    });

    const retried = store.beginRetryDraftGeneration({ forceDiscardDirty: true });
    expect(retried.status).toBe('ok');
    if (retried.status !== 'ok') return;

    // Late response for firstReq is dropped (stale Preview guard)
    expect(
      store.applyDraftPreviewResult(firstReq, {
        ok: true,
        name: 'stale-name',
        description: 'stale',
        body: 'stale',
        content: 'stale',
        destinationSlug: 'stale-name',
        pairUsed: { provider: 'openai', model: 'gpt-4.1' },
      }),
    ).toBe(false);

    // Current request succeeds
    expect(
      store.applyDraftPreviewResult(
        {
          revision: retried.draft.revision,
          previewRequestSeq: retried.draft.previewRequestSeq,
        },
        {
          ok: true,
          name: 'Angular App Guide',
          description: 'Repo conventions',
          body: '# Angular App Guide\n\nRules.',
          content: '---\nname: "angular-app-guide"\n---',
          destinationSlug: 'angular-app-guide',
          pairUsed: { provider: 'anthropic', model: 'claude-sonnet-4' },
        },
      ),
    ).toBe(true);
    expect(store.openDraft()?.mode).toBe('preview');

    // Begin Create freezes submitted snapshot & busy blocks mode/edit/close/replace without dialog (F30)
    const submission = store.beginCreateDraft();
    expect(submission?.submitted.slug).toBe('angular-app-guide');
    if (!submission) return;
    expect(store.beginCreateDraft()).toBeNull();
    expect(store.setDraftMode('edit')).toBe(false);
    expect(store.updateDraftFields({ name: 'changed' })).toBe(false);
    expect(store.closeDraft({ forceDiscardDirty: true })).toEqual({
      status: 'busy',
    });
    expect(store.openManualDraft('pattern:nx', { forceDiscardDirty: true })).toEqual({
      status: 'busy',
    });

    // Failed Create keeps open draft & edits intact and clears busy/submitted
    expect(
      store.failCreateDraft(submission.revision, 'Disk write failed'),
    ).toBe(true);
    expect(store.openDraft()?.busy).toBe(false);
    expect(store.openDraft()?.submitted).toBeNull();
    expect(store.openDraft()?.createError).toBe('Disk write failed');

    // A valid receipt closes the draft, blocks duplicate Create (F25), and records C5 createdSkillSlugs
    const secondSubmission = store.beginCreateDraft();
    expect(secondSubmission).not.toBeNull();
    if (!secondSubmission) return;
    const receiptPath = '/workspace/skills/angular-app-guide/SKILL.md';
    const createdPath = store.completeCreateDraft(
      secondSubmission.revision,
      receiptPath,
    );
    expect(createdPath).toBe(receiptPath);
    expect(store.openDraft()).toBeNull();
    expect(store.createdPathFor('proposal:prop-angular-app')).toBe(createdPath);
    expect(store.createdSkillSlugs()).toEqual(['angular-app-guide']);
    expect(store.openProposalDraft('prop-angular-app')).toEqual({
      status: 'already-created',
      path: createdPath,
    });

    // Reset clears C5 createdSkillSlugs and judged state
    store.reset();
    expect(store.createdSkillSlugs()).toEqual([]);
    expect(store.judge()).toBeNull();
    expect(store.analysisPair()).toBeNull();
  });

  it('restores the proposal defaults when a retry fails after confirming Discard edits', () => {
    store.applyRecommendationResult(makeRecommendResult());
    const opened = store.openProposalDraft('prop-angular-app');
    if (opened.status !== 'ok') throw new Error('Expected the proposal draft to open');
    const failure = { ok: false, category: 'timed-out', message: 'Draft timed out' } as const;
    expect(store.applyDraftPreviewResult(opened.draft, failure)).toBe(true);
    const fallbackBody = store.openDraft()?.body;
    expect(fallbackBody).toContain('Add repo-specific conventions');
    const edits = { name: 'my-name', description: 'My description', body: 'My custom guide' };
    store.updateDraftFields(edits);

    expect(store.beginRetryDraftGeneration()).toEqual({
      status: 'confirm-dirty',
      trigger: 'retry-generation',
    });
    expect(store.openDraft()).toMatchObject({ ...edits, dirty: true });

    const retried = store.beginRetryDraftGeneration({ forceDiscardDirty: true });
    if (retried.status !== 'ok') throw new Error('Expected draft generation to retry');
    const defaults = { name: opened.draft.name, description: opened.draft.description };
    expect(retried.draft).toMatchObject({ ...defaults, body: '', dirty: false });
    expect(store.applyDraftPreviewResult(retried.draft, failure)).toBe(true);
    expect(store.openDraft()).toMatchObject({ ...defaults, body: fallbackBody, dirty: false, mode: 'edit' });
  });

  it.each([undefined, '   '])('keeps edits when the Create receipt path is %p', (path) => {
    store.openBlankManualDraft();
    const fields = {
      name: 'edited-skill',
      description: 'Edited description',
      body: '# Edited skill',
    };
    store.updateDraftFields(fields);
    const submission = store.beginCreateDraft();
    if (!submission) throw new Error('Expected a draft Create submission');

    expect(store.completeCreateDraft(submission.revision, path)).toBeNull();
    expect(store.createdPathsByKey().size).toBe(0);
    expect(store.createdSkillSlugs()).toEqual([]);
    expect(store.openDraft()).toMatchObject({
      ...fields,
      dirty: true,
      busy: false,
      submitted: null,
      createError: expect.stringContaining('did not return a path'),
    });
  });

  it('preserves unjudged team-builder path compatibility', () => {
    expect(store.judgedMode()).toBe(false);
    store.setIntent('Build an Angular team');
    store.setStage('review');
    store.setSelectedIds(new Set(['Acme/Repo/One']));
    store.setSearchResults([skillOne]);
    store.setSearchResults([skillNotJudged]);
    expect(store.retainedSearchResults().map((s) => s.skillId)).toEqual(['One']);
    store.setPreview([
      {
        skillName: 'Acme/Repo/One',
        contentHash: 'abc',
        hasScripts: true,
        scriptFiles: ['a.sh'],
        files: ['SKILL.md'],
      },
    ]);
    expect(store.previewScriptCount()).toBe(1);
    store.approve('Acme/Repo/One');
    expect(store.approvedIds().has('Acme/Repo/One')).toBe(true);
  });
});
