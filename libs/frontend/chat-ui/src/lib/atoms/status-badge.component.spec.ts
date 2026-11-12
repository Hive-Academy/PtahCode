import { TestBed } from '@angular/core/testing';
import { StatusBadgeComponent } from './status-badge.component';
import type { ExecutionStatus } from '@ptah-extension/shared';

describe('StatusBadgeComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatusBadgeComponent],
    }).compileComponents();
  });

  function render(status: ExecutionStatus) {
    const fixture = TestBed.createComponent(StatusBadgeComponent);
    fixture.componentRef.setInput('status', status);
    fixture.detectChanges();
    return fixture;
  }

  it.each<[ExecutionStatus, string, string]>([
    ['pending', 'Pending', 'neutral'],
    ['streaming', 'Streaming', 'info'],
    ['complete', 'Done', 'ok'],
    ['interrupted', 'Stopped', 'warn'],
    ['resumed', 'Resumed', 'ok'],
    ['error', 'Error', 'err'],
  ])('renders %s with label "%s" and tone %s', (status, label, tone) => {
    const fixture = render(status);
    const span = fixture.nativeElement.querySelector('span[data-ptah-badge]');
    expect(span.textContent).toContain(label);
    expect(span.getAttribute('data-tone')).toBe(tone);
  });

  it('renders the streaming spinner when status is streaming', () => {
    const fixture = render('streaming');
    expect(
      fixture.nativeElement.querySelector('.loading.loading-spinner'),
    ).not.toBeNull();
  });
});
