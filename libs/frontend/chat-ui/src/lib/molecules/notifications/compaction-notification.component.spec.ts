import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { CompactionNotificationComponent } from './compaction-notification.component';

describe('CompactionNotificationComponent', () => {
  let fixture: ComponentFixture<CompactionNotificationComponent>;

  function render(isCompacting: boolean): HTMLElement {
    TestBed.configureTestingModule({
      imports: [CompactionNotificationComponent],
    });
    fixture = TestBed.createComponent(CompactionNotificationComponent);
    fixture.componentRef.setInput('isCompacting', isCompacting);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function text(root: HTMLElement, testId: string): string {
    return (root.querySelector(`[data-testid="${testId}"]`)?.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  afterEach(() => TestBed.resetTestingModule());

  it('renders nothing when no compaction is in flight', () => {
    const root = render(false);
    expect(
      root.querySelector('[data-testid="compaction-notification"]'),
    ).toBeNull();
  });

  it('shows an indeterminate card while compacting', () => {
    const root = render(true);

    expect(text(root, 'compaction-title')).toBe('Compacting context');
    const host = root.querySelector('[data-testid="compaction-progress"]');
    expect(host?.tagName.toLowerCase()).toBe('ptah-meter');
    expect(host?.getAttribute('aria-hidden')).toBe('true');
    const bar = host?.querySelector('[role="progressbar"]');
    expect(bar?.getAttribute('aria-label')).toBe('Compaction');
    expect(bar?.getAttribute('aria-valuetext')).toBe('Compaction in progress');
    expect(bar?.hasAttribute('aria-valuenow')).toBe(false);
    expect(text(root, 'compaction-body')).toContain('Summarizing conversation');
  });
});
