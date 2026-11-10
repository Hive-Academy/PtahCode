import { TestBed } from '@angular/core/testing';
import { WorktreeScopeBarComponent } from './worktree-scope-bar.component';

describe('WorktreeScopeBarComponent', () => {
  it('keeps Back while hiding workspace registration in the child', () => {
    const fixture = TestBed.createComponent(WorktreeScopeBarComponent);
    fixture.componentRef.setInput('root', '/wt/a');
    fixture.componentRef.setInput('activeLabel', 'main');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="worktree-scope-back"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="worktree-scope-open"]')).not.toBeNull();
    fixture.componentRef.setInput('hideOpenAsWorkspace', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="worktree-scope-back"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="worktree-scope-open"]')).toBeNull();
  });
});
