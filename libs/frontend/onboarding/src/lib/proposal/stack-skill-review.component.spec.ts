import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type {
  SkillJudgeCandidate,
  SkillJudgeItem,
  SkillJudgeResult,
} from '@ptah-extension/shared';
import { SkillDraftPreviewComponent } from './skill-draft-preview.component';
import { StackSkillReviewComponent } from './stack-skill-review.component';
import { StackSkillStore } from './stack-skill.store';

const pair = { provider: 'test-provider', model: 'test-model' };

function candidate(id: string): SkillJudgeCandidate {
  return {
    candidateId: `owner/repo/${id}`,
    selectionKey: `owner/repo/${id}`,
    skill: {
      source: 'owner/repo',
      skillId: id,
      name: id,
      description: `${id} description`,
      installs: 100,
      isInstalled: false,
    },
    deprecated: false,
  };
}

function item(
  name: string,
  overrides: Partial<Omit<SkillJudgeItem, 'item' | 'itemId'>> = {},
): SkillJudgeItem {
  return {
    itemId: name.toLowerCase(),
    item: { name, kind: 'framework', evidence: `${name} evidence`, sourcePhase: 'test' },
    registry: 'no-match',
    candidateIds: [],
    candidateAssessments: [],
    outcomes: [],
    judgedBy: 'none',
    ...overrides,
  };
}

const recommended = candidate('angular-patterns');
const rejected = candidate('angular-v1');
const judge: SkillJudgeResult = {
  method: 'decision',
  counts: { decision: 3, normal: 0, notJudged: 2 },
  items: [
    item('Angular', {
      registry: 'matched',
      candidateIds: [recommended.candidateId, rejected.candidateId],
      candidateAssessments: [{
        candidateId: rejected.candidateId,
        eligible: false,
        rejection: { reason: 'Uses obsolete Angular APIs', stage: 'decision' },
      }],
      outcomes: [{
        verdict: 'install',
        candidateId: recommended.candidateId,
        reason: 'Matches the signal-based application',
        stage: 'decision',
      }],
      judgedBy: 'decision',
    }),
    item('Routing', {
      registry: 'search-failed',
      outcomes: [{ verdict: 'build', proposalId: 'routing', reason: 'Project routing conventions', stage: 'decision' }],
      judgedBy: 'decision',
    }),
    item('Forms', {
      registry: 'search-failed',
      outcomes: [{ verdict: 'no-skill', reason: 'No extra guidance needed', stage: 'decision' }],
      judgedBy: 'decision',
    }),
    item('Jest'),
    item('CDK', { registry: 'search-failed' }),
  ],
  candidates: [recommended, rejected],
  proposals: [{
    proposalId: 'routing',
    name: 'Routing',
    description: 'Document project routing',
    itemIds: ['routing'],
  }],
  stages: [],
};

function setup(result: SkillJudgeResult | null = judge) {
  const fixture = TestBed.createComponent(StackSkillReviewComponent);
  const store = TestBed.inject(StackSkillStore);
  if (result) {
    const applied = store.applyRecommendationResult({
      judge: result,
      skills: [],
      analysisPair: pair,
      detectedItems: result.items.map((entry) => entry.item),
      unmatchedItems: [],
      searchFailures: [],
      summarySource: 'structured',
    });
    if (applied.status !== 'ok') throw new Error('Expected the initial recommendation to apply');
    fixture.componentRef.setInput('store', store);
  }
  fixture.componentRef.setInput('runId', 'analysis-run');
  fixture.componentRef.setInput('recommendations', []);
  fixture.componentRef.setInput('searchResults', []);
  fixture.componentRef.setInput('guidanceFacts', []);
  fixture.componentRef.setInput('selectedIds', new Set<string>());
  fixture.componentRef.setInput('query', '');
  fixture.detectChanges();
  return { fixture, store, root: fixture.nativeElement as HTMLElement };
}

function button(root: ParentNode, text: string): HTMLButtonElement {
  const match = [...root.querySelectorAll('button')].find(
    (entry) => entry.textContent?.trim().startsWith(text),
  );
  if (!match) throw new Error(`Missing button: ${text}`);
  return match;
}

function renderDraft(fixture: ComponentFixture<StackSkillReviewComponent>) {
  return fixture.debugElement.query(By.directive(SkillDraftPreviewComponent))
    .injector.get(SkillDraftPreviewComponent);
}

function applyPreview(store: StackSkillStore) {
  const draft = store.openDraft();
  if (!draft) throw new Error('Expected an open proposal draft');
  store.applyDraftPreviewResult(draft, {
    ok: true,
    name: 'routing',
    description: 'Project routing',
    body: '# Routing\n\nUse the shared navigation service.',
    destinationSlug: 'routing',
    pairUsed: pair,
  });
}

describe('StackSkillReviewComponent judged review', () => {
  it('uses the full-width layout and bar only when a judged result exists', () => {
    const { fixture, store, root } = setup(null);
    expect(root.querySelector('.skills-layout--judged')).toBeNull();
    expect(root.querySelector('ptah-skill-selection-rail[data-layout="rail"]')).not.toBeNull();
    store.setJudge(judge);
    fixture.componentRef.setInput('store', store);
    fixture.detectChanges();
    expect(root.querySelector('.skills-layout--judged')).not.toBeNull();
    expect(root.querySelector('ptah-skill-selection-rail[data-layout="bar"]')).not.toBeNull();
  });

  it('filters by verdict, pins the open proposal, and returns to All from the hidden count', () => {
    const { fixture, root, store } = setup();
    const requested = jest.fn();
    fixture.componentInstance.draftPreviewRequested.subscribe(requested);
    expect(root.querySelector('[aria-label="Install skills"]')?.textContent)
      .toContain('Matches the signal-based application');
    button(root, 'Preview draft').click();
    fixture.detectChanges();
    expect(requested).toHaveBeenCalledWith({
      params: expect.objectContaining({
        runId: 'analysis-run',
        proposalId: 'routing',
        items: [expect.objectContaining({ buildReasons: ['Project routing conventions'] })],
      }),
      revision: store.openDraft()?.revision,
      previewRequestSeq: store.openDraft()?.previewRequestSeq,
    });
    button(root, 'No skill needed (').click();
    fixture.detectChanges();
    expect(store.verdictFilter()).toBe('no-skill');
    expect(root.querySelector('[aria-label="Install skills"]')).toBeNull();
    expect(root.querySelector('ptah-skill-build-row ptah-skill-draft-preview')).not.toBeNull();
    expect(button(root, 'Cancel')).toBeDefined();
    expect(root.querySelector('ul[aria-label="Other candidates"]')).toBeNull();
    button(root, '2 more candidates - Show all').click();
    fixture.detectChanges();
    expect(store.verdictFilter()).toBe('all');
    expect(root.querySelector('ul[aria-label="Other candidates"]')).not.toBeNull();
  });

  it('clears both active filters when showing all counted candidates', () => {
    const second = candidate('rxjs-patterns');
    const { fixture, root, store } = setup({
      ...judge,
      items: [
        judge.items[0],
        item('RxJS', {
          registry: 'matched',
          candidateIds: [second.candidateId],
          outcomes: [{
            verdict: 'install',
            candidateId: second.candidateId,
            reason: 'Covers reactive streams',
            stage: 'decision',
          }],
          judgedBy: 'decision',
        }),
      ],
      candidates: [recommended, rejected, second],
      counts: { decision: 2, normal: 0, notJudged: 0 },
      proposals: [],
    });
    const angularChip = root.querySelector<HTMLButtonElement>(
      '[data-strip-chip][aria-label^="Angular"]',
    );
    if (!angularChip) throw new Error('Expected an Angular stack filter');
    angularChip.click();
    button(root, 'Install (').click();
    fixture.detectChanges();
    const installCards = () => root.querySelector('[aria-label="Install skills"]');
    expect(store.activeItemId()).toBe('angular');
    expect(store.verdictFilter()).toBe('install');
    expect(installCards()?.textContent).toContain('angular-patterns');
    expect(installCards()?.textContent).not.toContain('rxjs-patterns');
    expect(root.querySelector('[aria-label="Other candidates"]')).toBeNull();

    button(root, '2 more candidates - Show all').click();
    fixture.detectChanges();
    expect(store.activeItemId()).toBeNull();
    expect(store.verdictFilter()).toBe('all');
    expect(installCards()?.textContent).toContain('rxjs-patterns');
    expect(root.querySelector('[aria-label="Other candidates"]')?.textContent)
      .toContain('angular-v1');
    expect(root.textContent).not.toContain('more candidates - Show all');
  });

  it('keeps Install and rejection reasons per item when candidates are shared', () => {
    const { fixture, root } = setup({
      ...judge,
      items: [
        judge.items[0],
        item('Forms', {
          registry: 'matched',
          candidateIds: [recommended.candidateId, rejected.candidateId],
          candidateAssessments: [
            {
              candidateId: recommended.candidateId,
              eligible: false,
              rejection: { reason: 'Does not cover form validation', stage: 'decision' },
            },
            {
              candidateId: rejected.candidateId,
              eligible: false,
              rejection: { reason: 'Requires template-driven forms', stage: 'decision' },
            },
          ],
          outcomes: [{ verdict: 'no-skill', reason: 'No extra guidance needed', stage: 'decision' }],
          judgedBy: 'decision',
        }),
      ],
      counts: { decision: 2, normal: 0, notJudged: 0 },
      proposals: [],
    });
    const install = root.querySelector('[aria-label="Install skills"]');
    expect(install?.textContent).toContain('Matches the signal-based application');
    const itemRows = root.querySelector('[aria-labelledby="stack-skill-items-title"]');
    expect(itemRows?.textContent)
      .toMatch(/angular-patterns rejected for Forms\.\s+Does not cover form validation/);

    const other = root.querySelector('[aria-label="Other candidates"]');
    if (!other) throw new Error('Expected residual candidates');
    other.closest('details')?.setAttribute('open', '');
    button(other, 'More').click();
    fixture.detectChanges();
    expect(other.textContent).toContain('Rejected for Angular. Uses obsolete Angular APIs');
    expect(other.textContent).toContain('Rejected for Forms. Requires template-driven forms');
  });

  it('keeps judge-rejected candidates reachable with a reason and canonical selection', () => {
    const { fixture, root, store } = setup();
    fixture.componentInstance.selectionToggled.subscribe((key) => store.toggle(key));
    const candidates = root.querySelector<HTMLUListElement>('ul[aria-label="Other candidates"]');
    if (!candidates) throw new Error('Expected residual candidates');
    candidates.closest('details')?.setAttribute('open', '');
    button(candidates, 'More').click();
    fixture.detectChanges();
    expect(candidates.textContent).toContain('Uses obsolete Angular APIs');
    candidates.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click();
    fixture.detectChanges();
    expect(store.isCandidateSelected(rejected.candidateId)).toBe(true);
  });

  it.each([false, true])('shows the no-judge registry or outage state (search failed: %s)', (failed) => {
    const registryItem = item('Angular', failed ? {
      registry: 'search-failed',
      registryFailure: { kind: 'timed-out', reason: 'Registry timed out' },
    } : {
      registry: 'matched',
      candidateIds: [recommended.candidateId],
    });
    const { fixture, root, store } = setup({
      method: 'none',
      counts: { decision: 0, normal: 0, notJudged: 1 },
      items: [registryItem],
      candidates: failed ? [] : [recommended],
      proposals: [],
      stages: [],
    });
    if (failed) {
      fixture.componentRef.setInput('searchFailures', [{ item: 'Angular', reason: 'Registry timed out' }]);
      fixture.detectChanges();
      expect(root.querySelector('ul[aria-label="Skill search failures"]')).not.toBeNull();
      expect(root.querySelector('ptah-skill-not-judged-row')?.textContent).toContain('Search failed');
    } else {
      expect(root.querySelector('ul[aria-label="Registry candidates for Angular"]')).not.toBeNull();
    }
    expect(root.textContent).toContain('AI review is unavailable');
    expect(root.querySelector('ul[aria-label="Other candidates"]')).toBeNull();
    expect(store.selectedCandidateIds().size).toBe(0);
    expect(button(root, 'Search for Angular')).toBeDefined();
  });

  it('discloses search failures on Build and No-skill outcomes', () => {
    const { root } = setup();
    expect(root.querySelector('ptah-skill-build-row')?.textContent)
      .toContain('Judged without registry candidates (search failed)');
    expect(root.querySelector('ptah-unmatched-stack-list')?.textContent)
      .toContain('Judged without registry candidates (search failed)');
    expect(root.querySelector('[aria-label="Install skills"]')?.textContent).not.toContain('Routing');
  });

  it('opens a manual draft for each item status without automatically opening forms', async () => {
    const { fixture, root, store } = setup();
    expect(root.querySelector('ptah-skill-draft-preview')).toBeNull();
    for (const { item: stackItem, itemId } of judge.items) {
      const opener = root.querySelector<HTMLButtonElement>(
        `[aria-label="Write a skill by hand for ${stackItem.name}"]`,
      );
      expect(opener).not.toBeNull();
      opener?.click();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(store.openDraft()).toMatchObject({
        key: `manual:${itemId}`,
        mode: 'edit',
        body: expect.stringContaining(stackItem.evidence),
      });
      expect(renderDraft(fixture).mode()).toBe('edit');
      const input = root.querySelector('ptah-skill-draft-preview input');
      expect(input).not.toBeNull();
      expect({ itemId, focused: document.activeElement === input }).toEqual({ itemId, focused: true });
      button(root, 'Cancel').click();
      fixture.detectChanges();
      expect(document.activeElement).toBe(opener);
    }
  });

  it('shows both F29 blockers and keeps approvals tied to the selection', () => {
    const { fixture, root, store } = setup();
    fixture.componentInstance.selectionToggled.subscribe((key) => store.toggle(key));
    store.openConsent([]);
    store.approve(recommended.selectionKey);
    fixture.detectChanges();
    expect(root.textContent).toContain(store.draftBlockedReason());
    expect(button(root, 'Preview draft').getAttribute('aria-disabled')).toBe('true');
    button(root, 'Preview draft').click();
    expect(store.openDraft()).toBeNull();
    expect(root.querySelector<HTMLButtonElement>('[aria-label="Write a skill by hand for Angular"]')?.disabled)
      .toBe(true);
    root.querySelector<HTMLInputElement>('input[aria-label="Select angular-patterns"]')?.click();
    fixture.detectChanges();
    expect(store.consentOpen()).toBe(false);
    expect(store.preview()).toEqual([]);
    expect(store.approvedIds().size).toBe(0);
    button(root, 'Preview draft').click();
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="skill-install-blocked-reason"]')?.textContent)
      .toContain(store.installBlockedReason());
    expect(root.querySelector<HTMLButtonElement>('[data-testid="skill-install-primary"]')?.disabled)
      .toBe(true);
  });

  it('binds used slugs, snapshots Create, and returns focus to the row opener', () => {
    const { fixture, root, store } = setup();
    const create = jest.fn();
    fixture.componentInstance.draftCreateRequested.subscribe(create);
    store.recordCreatedSkillSlug('already-used');
    const opener = button(root, 'Preview draft');
    opener.click();
    applyPreview(store);
    fixture.detectChanges();
    expect(renderDraft(fixture).usedSlugs()).toEqual(['already-used']);
    button(root, 'Create skill').click();
    const revision = store.openDraft()?.revision;
    expect(create).toHaveBeenCalledWith({
      revision,
      submitted: expect.objectContaining({ name: 'routing', slug: 'routing' }),
    });
    if (revision === undefined) throw new Error('Expected the submitted draft');
    store.completeCreateDraft(revision, '/workspace/routing/SKILL.md');
    fixture.detectChanges();
    expect(root.querySelector('ptah-skill-draft-preview')).toBeNull();
    expect(root.textContent).toContain('Created: /workspace/routing/SKILL.md');
    expect(document.activeElement).toBe(opener);
    expect(opener.getAttribute('aria-disabled')).toBe('true');
  });

  it('confirms dirty per-item search before closing the draft and emits its item identity', () => {
    const { fixture, root, store } = setup();
    const searched = jest.fn();
    fixture.componentInstance.itemSearchRequested.subscribe(searched);
    button(root, 'Preview draft').click();
    applyPreview(store);
    store.updateDraftFields({ description: 'Unsaved description' });
    fixture.detectChanges();
    const dialog = root.querySelector('dialog');
    if (!dialog) throw new Error('Expected the discard dialog');
    Object.assign(dialog, {
      showModal: () => { dialog.open = true; },
      close: () => { dialog.open = false; },
    });
    button(root, 'Search for Angular').click();
    expect(dialog.open).toBe(true);
    expect(searched).not.toHaveBeenCalled();
    button(dialog, 'Keep editing').click();
    expect(store.openDraft()?.description).toBe('Unsaved description');
    button(root, 'Search for Angular').click();
    button(dialog, 'Discard edits').click();
    fixture.detectChanges();
    expect(store.openDraft()).toBeNull();
    expect(searched).toHaveBeenCalledWith({ itemId: 'angular', query: 'Angular' });
  });

  it('opens a blank manual draft in the empty state and allows another skill after Create', () => {
    const { fixture, root, store } = setup({
      ...judge,
      items: [],
      candidates: [],
      proposals: [],
      counts: { decision: 0, normal: 0, notJudged: 0 },
    });
    expect(root.textContent).toContain('No skills match your stack yet');
    const search = root.querySelector('[aria-labelledby="search-title"]');
    if (!search) throw new Error('Missing search controls');
    const opener = button(search, 'Write a skill by hand');
    store.openConsent([]);
    fixture.detectChanges();
    expect(opener.disabled).toBe(true);
    expect(store.openBlankManualDraft().status).toBe('blocked');
    store.closeConsent();
    fixture.detectChanges();
    opener.click();
    fixture.detectChanges();
    const first = store.openDraft();
    expect(first).toMatchObject({
      kind: 'manual',
      itemId: null,
      coveredItemIds: [],
      mode: 'edit',
      name: '',
      description: '',
      body: '',
    });
    store.updateDraftFields({ name: 'first-skill', body: '# First skill' });
    expect(store.openBlankManualDraft().status).toBe('confirm-dirty');
    fixture.detectChanges();
    button(search, 'Create skill').click();
    const revision = store.openDraft()?.revision;
    if (revision === undefined) throw new Error('Expected a submitted draft');
    expect(store.openBlankManualDraft().status).toBe('busy');
    store.completeCreateDraft(revision, '/workspace/first-skill/SKILL.md');
    fixture.detectChanges();
    expect(document.activeElement).toBe(opener);
    opener.click();
    fixture.detectChanges();
    expect(store.openDraft()?.key).not.toBe(first?.key);
    expect(store.openDraft()?.body).toBe('');
    expect(renderDraft(fixture).usedSlugs()).toEqual(['first-skill']);
  });
});
