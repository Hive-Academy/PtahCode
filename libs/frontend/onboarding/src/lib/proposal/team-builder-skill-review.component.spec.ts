import { TestBed } from '@angular/core/testing';
import { StackSkillReviewComponent } from './stack-skill-review.component';

describe('StackSkillReviewComponent', () => {
  it('disables Skip during loading', () => {
    const fixture = TestBed.createComponent(StackSkillReviewComponent);
    fixture.componentRef.setInput('recommendations', []);
    fixture.componentRef.setInput('searchResults', []);
    fixture.componentRef.setInput('guidanceFacts', []);
    fixture.componentRef.setInput('selectedIds', new Set(['one/skill']));
    fixture.componentRef.setInput('query', '');
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    const buttons = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ];
    expect(
      buttons.find((button) => button.textContent?.includes('Skip skills'))
        ?.disabled,
    ).toBe(true);
  });
  it('shows the owner decision and disables navigation while busy', () => {
    const fixture = TestBed.createComponent(StackSkillReviewComponent);
    fixture.componentRef.setInput('recommendations', []);
    fixture.componentRef.setInput('searchResults', []);
    fixture.componentRef.setInput('guidanceFacts', [
      { category: 'style', label: 'do_not_copy', fact: 'Old pattern' },
    ]);
    fixture.componentRef.setInput('selectedIds', new Set(['one/skill']));
    fixture.componentRef.setInput('query', '');
    fixture.componentRef.setInput('ownerDecisionPrompt', 'Choose the standard');
    fixture.componentRef.setInput('ownerDecisionError', true);
    fixture.componentRef.setInput('busy', true);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Choose the standard');
    expect(root.textContent).toContain('Do not copy');
    expect(root.textContent).toContain(
      'Choose how to handle existing practices',
    );
    expect(root.querySelectorAll('input[type=radio]').length).toBe(2);
    expect(
      [...root.querySelectorAll('button')]
        .filter((button) =>
          /Back|Skip skills|Install .* and continue/.test(
            button.textContent ?? '',
          ),
        )
        .every((button) => button.disabled),
    ).toBe(true);
  });
  it('renders untrusted skill text as text and emits the canonical selection key', () => {
    const fixture = TestBed.createComponent(StackSkillReviewComponent);
    const skill = {
      source: 'owner/repo',
      skillId: 'example',
      name: '<script>alert(1)</script>',
      description: '<img src=x onerror=alert(1)>',
      installs: 0,
      isInstalled: false,
    };
    fixture.componentRef.setInput('recommendations', [
      { skill, evidence: 'Angular', score: 2 },
    ]);
    fixture.componentRef.setInput('searchResults', []);
    fixture.componentRef.setInput('guidanceFacts', []);
    fixture.componentRef.setInput('selectedIds', new Set());
    fixture.componentRef.setInput('query', '');
    const toggled = jest.fn();
    fixture.componentInstance.selectionToggled.subscribe(toggled);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('script,img')).toBeNull();
    expect(root.textContent).toContain('<script>alert(1)</script>');
    (root.querySelector('input[type=checkbox]') as HTMLInputElement).click();
    expect(toggled).toHaveBeenCalledWith('owner/repo/example');
  });
});

describe('StackSkillReviewComponent coverage board', () => {
  const skill = {
    source: 'owner/repo',
    skillId: 'angular',
    name: 'Angular patterns',
    description: 'Use signals',
    installs: 12400,
    isInstalled: false,
  };
  function setup() {
    const fixture = TestBed.createComponent(StackSkillReviewComponent);
    fixture.componentRef.setInput('recommendations', [
      { skill, evidence: 'Angular', score: 100 },
      {
        skill: { ...skill, skillId: 'jest', name: 'Jest tests' },
        evidence: 'Jest',
        score: 50,
      },
    ]);
    fixture.componentRef.setInput('searchResults', []);
    fixture.componentRef.setInput('guidanceFacts', []);
    fixture.componentRef.setInput(
      'selectedIds',
      new Set(['owner/repo/angular']),
    );
    fixture.componentRef.setInput('query', '');
    fixture.componentRef.setInput('showOwnerDecision', false);
    fixture.componentRef.setInput('detectedItems', [
      {
        kind: 'framework',
        name: 'Angular',
        evidence: 'package.json',
        sourcePhase: 'profile',
      },
      {
        kind: 'test-tool',
        name: 'Jest',
        evidence: 'jest.config.ts',
        sourcePhase: 'profile',
      },
    ]);
    fixture.detectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }
  it.each([
    [0, 'Continue without skills'],
    [1, 'Install 1 skill and continue'],
    [2, 'Install 2 skills and continue'],
  ])('renders one primary with %s selections', (count, label) => {
    const { fixture, root } = setup();
    fixture.componentRef.setInput(
      'selectedIds',
      new Set(
        ['owner/repo/angular', 'owner/repo/jest'].slice(0, Number(count)),
      ),
    );
    fixture.detectChanges();
    expect(
      root.querySelectorAll('[data-testid="skill-install-primary"]'),
    ).toHaveLength(1);
    expect(
      root
        .querySelector('[data-testid="skill-install-primary"]')
        ?.textContent?.trim(),
    ).toBe(label);
    expect(root.textContent?.includes('Skip skills')).toBe(Number(count) > 0);
  });
  it('keeps coverage counts, recommendation totals and status messages together through selection changes', () => {
    const { fixture, root } = setup();
    fixture.componentRef.setInput('searchFailures', [
      { item: 'Jest', reason: 'offline' },
    ]);
    fixture.componentRef.setInput('warning', 'Some results are unavailable.');
    fixture.componentRef.setInput('selectionReset', true);
    fixture.detectChanges();
    const panel = root.querySelector('ptah-stack-coverage-strip section');
    expect(
      panel?.querySelector('[data-coverage-count]')?.textContent,
    ).toContain('1 of 2 stack items covered');
    expect(
      root.querySelector('[data-recommendation-count]')?.textContent?.trim(),
    ).toBe('2');
    expect(
      panel?.querySelector('[aria-label="Skill search failures"]')?.textContent,
    ).toContain('Jest: offline');
    expect(panel?.textContent).toContain('Some results are unavailable.');
    expect(panel?.textContent).toContain('Skill selection was reset');
    const dismissed = jest.fn();
    fixture.componentInstance.selectionResetDismissed.subscribe(dismissed);
    panel
      ?.querySelector<HTMLButtonElement>(
        '[aria-label="Dismiss selection reset message"]',
      )
      ?.click();
    expect(dismissed).toHaveBeenCalledTimes(1);
    fixture.componentRef.setInput(
      'selectedIds',
      new Set(['owner/repo/angular', 'owner/repo/jest']),
    );
    fixture.detectChanges();
    expect(
      panel?.querySelector('[data-coverage-count]')?.textContent,
    ).toContain('2 of 2 stack items covered');
    fixture.componentRef.setInput('detectedItems', []);
    fixture.detectChanges();
    expect(root.querySelector('ptah-stack-coverage-strip')).toBeNull();
    expect(
      root.querySelector('[aria-label="Skill search failures"]')?.textContent,
    ).toContain('Jest: offline');
    expect(root.textContent).toContain('Skill selection was reset');
  });
  it('shows a source-only metadata line with the full canonical key in title, and omits score', () => {
    const { root } = setup();
    const source = root.querySelector('[title="owner/repo/angular"]');
    expect(source?.textContent?.trim()).toBe('owner/repo');
    expect(root.textContent).not.toContain('Relevance score');
  });
  it('filters recommendations by the coverage strip, toggles the filter off, and removes from the rail', () => {
    const { fixture, root } = setup();
    const toggled = jest.fn();
    fixture.componentInstance.selectionToggled.subscribe(toggled);
    const chip = root.querySelector<HTMLButtonElement>(
      'button[aria-label="Angular, covered by 1 selected skill"]',
    );
    chip?.click();
    fixture.detectChanges();
    expect(root.querySelectorAll('ptah-skill-pick-card')).toHaveLength(1);
    expect(chip?.getAttribute('aria-pressed')).toBe('true');
    root
      .querySelector<HTMLButtonElement>(
        '[aria-label="Remove Angular patterns"]',
      )
      ?.click();
    expect(toggled).toHaveBeenCalledWith('owner/repo/angular');
    chip?.click();
    fixture.detectChanges();
    expect(root.querySelectorAll('ptah-skill-pick-card')).toHaveLength(2);
  });
  it('places deduplicated search results above recommendations', () => {
    const { fixture, root } = setup();
    fixture.componentRef.setInput('searchResults', [
      skill,
      { ...skill, skillId: 'extra', name: 'Extra result' },
    ]);
    fixture.detectChanges();
    const cards = [...root.querySelectorAll('ptah-skill-pick-card')];
    expect(cards).toHaveLength(3);
    expect(cards[0]?.textContent).toContain('Extra result');
    const headings = [...root.querySelectorAll('h2')].map(
      (heading) => heading.id,
    );
    expect(headings.indexOf('search-results-title')).toBeGreaterThanOrEqual(0);
    expect(headings.indexOf('search-results-title')).toBeLessThan(
      headings.indexOf('recommended-title'),
    );
  });
  it('keeps the grid during preview, showing the busy label and disabling changes', () => {
    const { fixture, root } = setup();
    fixture.componentRef.setInput('previewing', true);
    fixture.detectChanges();
    expect(root.querySelectorAll('ptah-skill-pick-card')).toHaveLength(2);
    expect(
      root.querySelector('[data-testid="skill-install-primary"]')?.textContent,
    ).toContain('Preparing install\u2026');
    expect(
      [
        ...root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
      ].every((input) => input.disabled),
    ).toBe(true);
  });
  it('keeps the previous grid on rerun and uses six skeletons only on initial loading', () => {
    const { fixture, root } = setup();
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    expect(root.querySelectorAll('ptah-skill-pick-card')).toHaveLength(2);
    expect(
      root
        .querySelector('[aria-labelledby="recommended-title"]')
        ?.getAttribute('aria-busy'),
    ).toBe('true');
    fixture.componentRef.setInput('recommendations', []);
    fixture.detectChanges();
    expect(root.querySelectorAll('ptah-skill-pick-card')).toHaveLength(0);
    expect(
      root.querySelectorAll(
        '[aria-labelledby="recommended-title"] ptah-skeleton',
      ),
    ).toHaveLength(6);
  });
  it('hides coverage for team builder and shows raw evidence', () => {
    const { fixture, root } = setup();
    fixture.componentRef.setInput('detectedItems', []);
    fixture.detectChanges();
    expect(root.querySelector('ptah-stack-coverage-strip')).toBeNull();
    expect(root.querySelector('ptah-skill-pick-card')?.textContent).toContain(
      'Angular',
    );
  });
  it('focuses search from the empty-state action', () => {
    const { fixture, root } = setup();
    fixture.componentRef.setInput('recommendations', []);
    fixture.detectChanges();
    const input = root.querySelector<HTMLInputElement>(
      'input[name="skill-search"]',
    );
    if (!input) throw new Error('Search input missing');
    const focus = jest.spyOn(input, 'focus');
    [...root.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Search the registry'))
      ?.click();
    expect(focus).toHaveBeenCalled();
  });
  it('shows the submitted query in results and emits Clear without changing recommendations', () => {
    const { fixture, root } = setup();
    const clear = jest.fn();
    const query = jest.fn();
    fixture.componentInstance.searchCleared.subscribe(clear);
    fixture.componentInstance.queryChange.subscribe(query);
    fixture.componentRef.setInput('query', 'signals');
    root
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
    expect(root.querySelector('#search-results-title')?.textContent).toContain(
      '"signals"',
    );
    [...root.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === 'Clear')
      ?.click();
    fixture.detectChanges();
    expect(clear).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenLastCalledWith('');
    expect(root.querySelector('#search-results-title')).toBeNull();
    expect(root.querySelectorAll('ptah-skill-pick-card')).toHaveLength(2);
  });
  it('shows stack skeletons before the analysis summary arrives without adding a strip to team builder', () => {
    const { fixture, root } = setup();
    fixture.componentRef.setInput('detectedItems', []);
    fixture.componentRef.setInput('recommendations', []);
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    expect(root.querySelector('ptah-stack-coverage-strip')).toBeNull();
    fixture.componentRef.setInput('stackLoading', true);
    fixture.detectChanges();
    expect(
      root.querySelectorAll('ptah-stack-coverage-strip ptah-skeleton'),
    ).toHaveLength(6);
  });
  it('renders action failures once without a destructive retry and types load errors separately', () => {
    const { fixture, root } = setup();
    fixture.componentRef.setInput('recommendations', []);
    fixture.componentRef.setInput(
      'error',
      'Could not preview skills. Try again.',
    );
    fixture.detectChanges();
    expect(
      root.textContent?.match(/Could not preview skills\. Try again\./g),
    ).toHaveLength(1);
    expect(root.textContent).not.toContain('Re-run skill search');
    fixture.componentRef.setInput('loadError', true);
    fixture.detectChanges();
    expect(root.querySelector('ptah-alert[tone="error"]')).toBeNull();
    expect(
      root.querySelector('ptah-state-panel[state="error"]'),
    ).not.toBeNull();
    expect(root.textContent).toContain('Re-run skill search');
  });
  it('uses the registry search placeholder', () => {
    const { root } = setup();
    expect(
      root
        .querySelector('input[name="skill-search"]')
        ?.getAttribute('placeholder'),
    ).toBe('Search the skill registry');
  });
});
