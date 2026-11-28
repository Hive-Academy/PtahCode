import { TestBed } from '@angular/core/testing';
import type {
  SkillJudgeCandidate,
  SkillJudgeResult,
  SkillShEntry,
  StackSummaryItem,
  WizardRecommendAnalysisSkillsResult,
} from '@ptah-extension/shared';
import { canonicalCandidateId, skillSelectionKey } from './stack-coverage';
import { StackSkillStore } from './stack-skill.store';

function makeSkill(
  skillId: string,
  installs: number,
  overrides: Partial<SkillShEntry> = {},
): SkillShEntry {
  return {
    source: 'owner/repo',
    skillId,
    name: skillId,
    description: `${skillId} description`,
    installs,
    isInstalled: false,
    ...overrides,
  };
}

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

function makeItem(name: string): StackSummaryItem {
  return {
    name,
    kind: 'framework',
    evidence: `${name}.json`,
    sourcePhase: 'analysis',
  };
}

function makeRecommendResult(
  judge: SkillJudgeResult,
): WizardRecommendAnalysisSkillsResult {
  return {
    skills: [],
    judge,
    analysisPair: { provider: 'openai', model: 'gpt-4.1' },
    detectedItems: judge.items.map((entry) => entry.item),
    unmatchedItems: [],
    searchFailures: [],
    summarySource: 'structured',
  };
}

describe('StackSkillStore download-count ordering', () => {
  let store: StackSkillStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = TestBed.inject(StackSkillStore);
    store.reset();
  });

  it('restores saved keys, including manual selections and an explicitly empty selection', () => {
    const result = makeRecommendResult({
      method: 'none',
      counts: { decision: 0, normal: 0, notJudged: 0 },
      candidates: [],
      items: [],
      proposals: [],
      stages: [],
    });
    const keys = ['Acme/Registry/manual'];
    expect(
      store.applyRecommendationResult(result, { selection: keys }),
    ).toEqual({
      status: 'ok',
    });
    expect(store.selectedSelectionKeys()).toEqual(keys);
    expect([...store.selectedCandidateIds()]).toEqual(['acme/registry/manual']);
    store.applyRecommendationResult(result, { selection: [] });
    expect(store.selectedSelectionKeys()).toEqual([]);
  });

  it('initializes selectedCandidateIds and selectedSelectionKeys ordered by installs descending regardless of stack-item order', () => {
    const low = makeCandidate(
      makeSkill('skill-low', 25, { source: 'Acme/Repo' }),
    );
    const mid = makeCandidate(
      makeSkill('skill-mid', 1200, { source: 'Acme/Repo' }),
    );
    const high = makeCandidate(
      makeSkill('skill-high', 9800, { source: 'Acme/Repo' }),
    );
    const tieA = makeCandidate(
      makeSkill('alpha-tie', 1200, { source: 'Acme/Repo' }),
    );
    const deprecated = makeCandidate(
      makeSkill('deprecated-huge', 50000, { source: 'Acme/Repo' }),
      true,
    );

    const judge: SkillJudgeResult = {
      method: 'decision',
      counts: { decision: 4, normal: 0, notJudged: 0 },
      items: [
        {
          itemId: 'item-1',
          item: makeItem('FirstStackItem'),
          registry: 'matched',
          candidateIds: [low.candidateId, deprecated.candidateId],
          candidateAssessments: [],
          outcomes: [
            {
              verdict: 'install',
              candidateId: low.candidateId,
              reason: 'Low installs first in stack',
              stage: 'decision',
            },
            {
              verdict: 'install',
              candidateId: deprecated.candidateId,
              reason: 'Deprecated should not preselect',
              stage: 'decision',
            },
          ],
          judgedBy: 'decision',
        },
        {
          itemId: 'item-2',
          item: makeItem('SecondStackItem'),
          registry: 'matched',
          candidateIds: [mid.candidateId],
          candidateAssessments: [],
          outcomes: [
            {
              verdict: 'install',
              candidateId: mid.candidateId,
              reason: 'Mid installs second',
              stage: 'decision',
            },
          ],
          judgedBy: 'decision',
        },
        {
          itemId: 'item-3',
          item: makeItem('ThirdStackItem'),
          registry: 'matched',
          candidateIds: [tieA.candidateId],
          candidateAssessments: [],
          outcomes: [
            {
              verdict: 'install',
              candidateId: tieA.candidateId,
              reason: 'Tied with mid installs, earlier skillId',
              stage: 'decision',
            },
          ],
          judgedBy: 'decision',
        },
        {
          itemId: 'item-4',
          item: makeItem('FourthStackItem'),
          registry: 'matched',
          candidateIds: [high.candidateId],
          candidateAssessments: [],
          outcomes: [
            {
              verdict: 'install',
              candidateId: high.candidateId,
              reason: 'Highest installs last in stack',
              stage: 'decision',
            },
          ],
          judgedBy: 'decision',
        },
      ],
      candidates: [low, mid, tieA, high, deprecated],
      proposals: [],
      stages: [],
    };

    expect(store.applyRecommendationResult(makeRecommendResult(judge))).toEqual(
      {
        status: 'ok',
      },
    );

    expect([...store.selectedCandidateIds()]).toEqual([
      'acme/repo/skill-high',
      'acme/repo/alpha-tie',
      'acme/repo/skill-mid',
      'acme/repo/skill-low',
    ]);
    expect(store.selectedSelectionKeys()).toEqual([
      'Acme/Repo/skill-high',
      'Acme/Repo/alpha-tie',
      'Acme/Repo/skill-mid',
      'Acme/Repo/skill-low',
    ]);
  });

  it('sorts global searchResults and retainedSearchResults by installs descending', () => {
    const low = makeSkill('search-low', 12);
    const high = makeSkill('search-high', 4400);
    const mid = makeSkill('search-mid', 350);
    const neg = makeSkill('search-neg', -5);

    store.setSearchResults([low, neg, high, mid]);
    expect(store.searchResults().map((s) => s.skillId)).toEqual([
      'search-high',
      'search-mid',
      'search-low',
      'search-neg',
    ]);

    store.setSelectedCandidateIds(
      new Set([canonicalCandidateId(low), canonicalCandidateId(high)]),
    );
    store.setSearchResults([
      makeSkill('next-low', 3),
      makeSkill('next-high', 90),
    ]);

    expect(store.retainedSearchResults().map((s) => s.skillId)).toEqual([
      'search-high',
      'search-low',
    ]);
    expect(store.searchResults().map((s) => s.skillId)).toEqual([
      'next-high',
      'next-low',
    ]);
  });

  it('sorts per-item searchResults, retainedItemSearchResults, row.candidates, row.manualCandidates, and residualCandidates by installs descending', () => {
    const notJudgedLow = makeCandidate(makeSkill('nj-low', 30));
    const notJudgedHigh = makeCandidate(makeSkill('nj-high', 6100));
    const notJudgedMid = makeCandidate(makeSkill('nj-mid', 410));
    const installed = makeCandidate(makeSkill('inst', 100));
    const resLow = makeCandidate(makeSkill('res-low', 5));
    const resHigh = makeCandidate(makeSkill('res-high', 2200));
    const resMid = makeCandidate(makeSkill('res-mid', 550));

    const judge: SkillJudgeResult = {
      method: 'mixed',
      counts: { decision: 1, normal: 0, notJudged: 1 },
      items: [
        {
          itemId: 'judged-item',
          item: makeItem('Angular'),
          registry: 'matched',
          candidateIds: [
            installed.candidateId,
            resLow.candidateId,
            resMid.candidateId,
            resHigh.candidateId,
          ],
          candidateAssessments: [],
          outcomes: [
            {
              verdict: 'install',
              candidateId: installed.candidateId,
              reason: 'Install',
              stage: 'decision',
            },
          ],
          judgedBy: 'decision',
        },
        {
          itemId: 'unjudged-item',
          item: makeItem('Nx'),
          registry: 'matched',
          candidateIds: [
            notJudgedLow.candidateId,
            notJudgedMid.candidateId,
            notJudgedHigh.candidateId,
          ],
          candidateAssessments: [],
          outcomes: [],
          judgedBy: 'none',
        },
      ],
      candidates: [
        installed,
        resLow,
        resMid,
        resHigh,
        notJudgedLow,
        notJudgedMid,
        notJudgedHigh,
      ],
      proposals: [],
      stages: [],
    };

    store.applyRecommendationResult(makeRecommendResult(judge));

    const retainedSmall = makeSkill('item-ret-small', 50);
    const retainedBig = makeSkill('item-ret-big', 3200);
    store.setItemSearchResults('unjudged-item', [retainedSmall, retainedBig]);
    expect(
      store
        .itemSearchResultsByItemId()
        .get('unjudged-item')
        ?.map((s) => s.skillId),
    ).toEqual(['item-ret-big', 'item-ret-small']);

    store.toggleCandidate(canonicalCandidateId(retainedSmall));
    store.toggleCandidate(canonicalCandidateId(retainedBig));

    const curMid = makeSkill('item-cur-mid', 700);
    const curTop = makeSkill('item-cur-top', 8100);
    store.setItemSearchResults('unjudged-item', [curMid, curTop]);

    expect(
      store
        .retainedItemSearchResultsByItemId()
        .get('unjudged-item')
        ?.map((s) => s.skillId),
    ).toEqual(['item-ret-big', 'item-ret-small']);
    expect(
      store
        .itemSearchResultsByItemId()
        .get('unjudged-item')
        ?.map((s) => s.skillId),
    ).toEqual(['item-cur-top', 'item-cur-mid']);

    const unjudgedRow = store
      .visibleItemRows()
      .find((row) => row.itemId === 'unjudged-item');
    expect(
      unjudgedRow?.candidates.map((entry) => entry.candidate.skill.skillId),
    ).toEqual(['nj-high', 'nj-mid', 'nj-low']);
    expect(unjudgedRow?.manualCandidates.map((s) => s.skillId)).toEqual([
      'item-cur-top',
      'item-ret-big',
      'item-cur-mid',
      'item-ret-small',
    ]);
    expect(
      store.residualCandidates().map((entry) => entry.candidate.skill.skillId),
    ).toEqual(['res-high', 'res-mid', 'res-low']);
  });
});
