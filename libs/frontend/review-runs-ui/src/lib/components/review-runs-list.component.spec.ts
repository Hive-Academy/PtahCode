import { TestBed } from '@angular/core/testing';
import type { ReviewRun } from '@ptah-extension/review-contracts';
import { ReviewRunsListComponent } from './review-runs-list.component';

function makeRun(attemptId: string, status: ReviewRun['status']): ReviewRun {
  return {
    repo: { owner: 'Hive-Academy', name: 'PtahCode' }, prNumber: 428,
    headSha: 'a'.repeat(40), attemptId, trigger: 'poll', configHash: 'b'.repeat(40),
    status, createdAt: '2026-11-03T10:00:00.000Z', startedAt: null,
    completedAt: null, deadlineAt: '2026-11-03T11:00:00.000Z', coverage: [], stages: [],
  };
}

describe('ReviewRunsListComponent', () => {
  it('labels and inks contract statuses, marks the open run and moves keyboard focus between rows', () => {
    TestBed.configureTestingModule({ imports: [ReviewRunsListComponent] });
    const fixture = TestBed.createComponent(ReviewRunsListComponent);
    fixture.componentRef.setInput('runs', [
      makeRun('a', 'queued'),
      makeRun('b', 'partial'),
      makeRun('c', 'succeeded'),
      makeRun('d', 'failed'),
    ]);
    fixture.componentRef.setInput('selectedAttemptId', 'a');
    fixture.detectChanges();
    const rows = fixture.nativeElement.querySelectorAll('button[role="option"]') as NodeListOf<HTMLButtonElement>;
    expect(rows).toHaveLength(4);
    expect(rows[0].textContent).toContain('PR #428');
    expect(rows[1].textContent).toContain('Partial coverage');
    expect(rows[2].textContent).toContain('Completed');
    expect(rows[3].textContent).toContain('Failed · Poll');
    expect(rows[0].querySelector('.text-state-idle')).not.toBeNull();
    expect(rows[1].querySelector('.text-state-need')).not.toBeNull();
    expect(rows[2].querySelector('.text-state-done')).not.toBeNull();
    expect(rows[3].querySelector('.text-state-err')).not.toBeNull();
    expect(rows[0].getAttribute('aria-selected')).toBe('true');
    expect(rows[1].getAttribute('aria-selected')).toBe('false');
    rows[0].focus();
    rows[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(rows[1]);
    rows[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(document.activeElement).toBe(rows[0]);
  });

  it('keeps the failure and head-retry lines of a run', () => {
    TestBed.configureTestingModule({ imports: [ReviewRunsListComponent] });
    const fixture = TestBed.createComponent(ReviewRunsListComponent);
    const failed = { ...makeRun('e', 'failed'), failure: { stage: 'checks' as const, code: 'unknown' as const, message: 'lane crashed' } };
    const stopped = { ...makeRun('f', 'succeeded'), headRetry: { failureCount: 3, nextEligibleAt: null, automaticRetriesStopped: true } };
    const scheduled = { ...makeRun('g', 'succeeded'), headRetry: { failureCount: 1, nextEligibleAt: '2026-11-03T12:34:00.000Z', automaticRetriesStopped: false } };
    fixture.componentRef.setInput('runs', [failed, stopped, scheduled]);
    fixture.detectChanges();
    const rows = fixture.nativeElement.querySelectorAll('button[role="option"]') as NodeListOf<HTMLButtonElement>;
    expect(rows[0].textContent).toContain('checks: lane crashed');
    expect(rows[1].textContent).toContain('Automatic retries stopped');
    expect(rows[2].textContent).toContain('Retry after ');
  });
});
