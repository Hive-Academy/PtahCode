import { TestBed } from '@angular/core/testing';
import { ClaudeRpcService } from '@ptah-extension/core';
import type { StackSummaryItem } from '@ptah-extension/shared';
import { UnmatchedStackListComponent } from './unmatched-stack-list.component';
describe('UnmatchedStackListComponent', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [{ provide: ClaudeRpcService, useValue: {} }],
    }),
  );
  it('renders search actions for all kinds and drafts only for framework and pattern', () => {
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
    expect(root.querySelectorAll('ptah-project-skill-draft')).toHaveLength(2);
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
});
