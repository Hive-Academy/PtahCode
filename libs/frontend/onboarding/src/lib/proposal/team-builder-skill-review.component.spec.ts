import { TestBed } from '@angular/core/testing';
import { TeamBuilderSkillReviewComponent } from './team-builder-skill-review.component';

describe('TeamBuilderSkillReviewComponent', () => {
  it('disables Skip during loading', () => {
    const fixture = TestBed.createComponent(TeamBuilderSkillReviewComponent);
    fixture.componentRef.setInput('recommendations', []);
    fixture.componentRef.setInput('searchResults', []);
    fixture.componentRef.setInput('guidanceFacts', []);
    fixture.componentRef.setInput('selectedIds', new Set());
    fixture.componentRef.setInput('query', '');
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    const buttons = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')];
    expect(buttons.find((button) => button.textContent?.includes('Skip skills'))?.disabled).toBe(true);
  });
  it('shows the owner decision and disables navigation while busy', () => {
    const fixture = TestBed.createComponent(TeamBuilderSkillReviewComponent);
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
          /Back to intent|Skip skills|Review selected skills/.test(
            button.textContent ?? '',
          ),
        )
        .every((button) => button.disabled),
    ).toBe(true);
  });
  it('renders untrusted skill text as text and emits the canonical selection key', () => {
    const fixture = TestBed.createComponent(TeamBuilderSkillReviewComponent);
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
