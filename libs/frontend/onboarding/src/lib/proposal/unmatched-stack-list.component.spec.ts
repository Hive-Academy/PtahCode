import { TestBed } from '@angular/core/testing';
import { ClaudeRpcService } from '@ptah-extension/core';
import type { SkillJudgeItem, StackSummaryItem } from '@ptah-extension/shared';
import { UnmatchedStackListComponent } from './unmatched-stack-list.component';
describe('UnmatchedStackListComponent', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [{ provide: ClaudeRpcService, useValue: {} }],
    }),
  );
  it('renders search actions for all kinds and never renders a draft form', () => {
    const fixture = TestBed.createComponent(UnmatchedStackListComponent);
    const items: StackSummaryItem[] = (
      ['framework', 'pattern', 'library'] as const
    ).map((kind) => ({
      kind,
      name: kind,
      evidence: '',
      sourcePhase: 'analysis',
    }));
    fixture.componentRef.setInput('items', items);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('ptah-project-skill-draft')).toHaveLength(0);
    const search = [...root.querySelectorAll('button')].filter((button) =>
      button.textContent?.includes('Search for'),
    );
    expect(search).toHaveLength(3);
    const emitted = jest.fn();
    fixture.componentInstance.searchRequested.subscribe(emitted);
    search[0]?.click();
    expect(emitted).toHaveBeenCalledWith('framework');
    fixture.componentRef.setInput('searching', true);
    fixture.detectChanges();
    expect(
      search.every(
        (button) =>
          !button.disabled && button.getAttribute('aria-disabled') === 'true',
      ),
    ).toBe(true);
    emitted.mockClear();
    search[0]?.focus();
    search[0]?.click();
    expect(emitted).not.toHaveBeenCalled();
    fixture.componentRef.setInput('searching', false);
    fixture.detectChanges();
    expect(document.activeElement).toBe(search[0]);
  });
  it('hides the section when no unmatched items exist', () => {
    const fixture = TestBed.createComponent(UnmatchedStackListComponent);
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('section'),
    ).toBeNull();
  });

  describe('judged mode', () => {
    const stack = (name: string): StackSummaryItem => ({
      kind: 'framework',
      name,
      evidence: '',
      sourcePhase: 'analysis',
    });
    const judgeItem = (
      itemId: string,
      outcomes: SkillJudgeItem['outcomes'],
      registry: SkillJudgeItem['registry'] = 'no-match',
    ): SkillJudgeItem => ({
      itemId,
      item: stack(itemId),
      registry,
      candidateIds: [],
      candidateAssessments: [],
      outcomes,
      judgedBy: outcomes.length ? 'decision' : 'none',
    });

    it('lists Build, No-skill and unjudged items but not Install items', () => {
      const fixture = TestBed.createComponent(UnmatchedStackListComponent);
      fixture.componentRef.setInput('judgedItems', [
        judgeItem('installed', [
          {
            verdict: 'install',
            candidateId: 'c1',
            reason: 'fits',
            stage: 'decision',
          },
        ]),
        judgeItem('built', [
          {
            verdict: 'build',
            proposalId: 'p1',
            reason: 'No fit for built',
            stage: 'decision',
          },
        ]),
        judgeItem('none-needed', [
          { verdict: 'no-skill', reason: 'Not needed', stage: 'normal' },
        ]),
        judgeItem('unjudged', [], 'search-failed'),
      ]);
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      const text = root.textContent ?? '';
      expect(text).not.toContain('installed');
      expect(text).toContain('No fit for built');
      expect(text).toContain('Not needed');
      expect(text).toContain('Not judged');
      expect(text).toContain('Search failed');
      expect(root.querySelectorAll('li')).toHaveLength(3);
    });

    it('emits the manual draft request with the item id and opener, unless blocked', () => {
      const fixture = TestBed.createComponent(UnmatchedStackListComponent);
      fixture.componentRef.setInput('judgedItems', [judgeItem('unjudged', [])]);
      fixture.detectChanges();
      const emitted = jest.fn();
      fixture.componentInstance.manualDraftRequested.subscribe(emitted);
      const root = fixture.nativeElement as HTMLElement;
      const button = root.querySelector(
        'button[aria-label="Write a skill by hand for unjudged"]',
      ) as HTMLButtonElement;
      button.click();
      expect(emitted).toHaveBeenCalledWith(
        expect.objectContaining({ itemId: 'unjudged', opener: button }),
      );
      emitted.mockClear();
      fixture.componentRef.setInput(
        'draftBlockedReason',
        'Close the install consent dialog before opening a skill draft',
      );
      fixture.detectChanges();
      button.click();
      expect(emitted).not.toHaveBeenCalled();
      expect(root.textContent).toContain('Close the install consent dialog');
      expect(button.getAttribute('aria-disabled')).toBe('true');
    });
  });
});
