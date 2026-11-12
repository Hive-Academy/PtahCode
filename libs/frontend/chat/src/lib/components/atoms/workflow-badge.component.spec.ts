import { TestBed } from '@angular/core/testing';
import { WorkflowBadgeComponent } from './workflow-badge.component';

describe('WorkflowBadgeComponent', () => {
  it('shows a full badge with a screen-reader prefix only for a known kind', () => {
    const fixture = TestBed.createComponent(WorkflowBadgeComponent);
    fixture.componentRef.setInput('workflow', 'harness-configure');
    fixture.detectChanges();
    const badge = fixture.nativeElement.querySelector('[data-ptah-badge]') as HTMLElement;
    expect(badge.getAttribute('data-size')).toBe('sm');
    expect(badge.querySelector('.sr-only')?.textContent?.trim()).toBe(
      'Workflow:',
    );
    expect(badge.textContent?.trim()).toBe('Workflow: Configure Harness');
    expect(badge.hasAttribute('aria-label')).toBe(false);
    fixture.componentRef.setInput('workflow', 'unknown');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-ptah-badge]')).toBeNull();
    fixture.componentRef.setInput('workflow', null);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('span')).toBeNull();
  });

  it('shows a compact icon with hidden workflow text and a title', () => {
    const fixture = TestBed.createComponent(WorkflowBadgeComponent);
    fixture.componentRef.setInput('workflow', 'harness-configure');
    fixture.componentRef.setInput('variant', 'compact');
    fixture.detectChanges();
    const span = fixture.nativeElement.querySelector('span') as HTMLElement;
    expect(span.classList).toContain('w-4');
    expect(span.title).toBe('Configure Harness');
    expect(span.querySelector('.sr-only')?.textContent?.trim()).toBe(
      'Workflow: Configure Harness',
    );
    expect(
      span.querySelector('lucide-angular')?.getAttribute('aria-hidden'),
    ).toBe('true');
    expect(span.hasAttribute('aria-label')).toBe(false);
  });
});
