import { TestBed } from '@angular/core/testing';
import type { ReviewFinding } from '@ptah-extension/review-contracts';
import { ReviewFindingsTableComponent, reviewFindingRows, type ReviewFindingRow } from './review-findings-table.component';

const rows: ReviewFindingRow[] = [
  { id: 'minor', severity: 'Minor', lens: 'security-privacy', path: 'a.ts', line: 4, status: 'suppressed', reason: 'Below confidence floor', confidence: 0.5 },
  { id: 'major', severity: 'Major', lens: 'contracts-callers', path: 'b.ts', line: 8, status: 'accepted', reason: null, confidence: 0.9 },
];

const finding: ReviewFinding = {
  schemaVersion: 1, lens: 'security-privacy', title: 'Settings parsed without a schema',
  failureMode: 'A crafted settings file can change runtime behavior.',
  affectedBehavior: 'The settings loader accepts arbitrary keys.',
  scenario: 'A workspace contains a crafted settings file.', path: 'src/settings.ts', line: 42,
  evidence: [{ path: 'src/settings.ts', line: 42, excerpt: 'const parsed = JSON.parse(raw);' }],
  affectedCaller: 'loadSettings', severity: 'Major', category: 'security', confidence: 0.9,
  verification: 'cross-family', suggestedDiff: null,
  fixPrompt: 'Validate the parsed settings against a schema.',
};

describe('ReviewFindingsTableComponent', () => {
  it('sorts by severity, filters status and shows suppression reason', () => {
    TestBed.configureTestingModule({ imports: [ReviewFindingsTableComponent] });
    const fixture = TestBed.createComponent(ReviewFindingsTableComponent);
    fixture.componentRef.setInput('rows', rows); fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('tbody tr') as HTMLElement).textContent).toContain('Major');
    const filter = fixture.nativeElement.querySelector('#finding-status') as HTMLSelectElement;
    filter.value = 'suppressed'; filter.dispatchEvent(new Event('change')); fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(fixture.nativeElement.textContent).toContain('Below confidence floor');
    fixture.nativeElement.querySelector('th button').click(); fixture.detectChanges();
    expect(fixture.componentInstance.ascending()).toBe(false);
  });

  it('shows an empty ready list as no accepted findings', () => {
    TestBed.configureTestingModule({ imports: [ReviewFindingsTableComponent] });
    const fixture = TestBed.createComponent(ReviewFindingsTableComponent);
    fixture.componentRef.setInput('rows', []);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No accepted findings for this run.');
    expect(fixture.nativeElement.textContent).not.toContain('unavailable');
    expect(fixture.nativeElement.querySelector('table')).toBeNull();
  });

  it('maps a validated review:listFindings payload onto unique accepted rows', () => {
    const mapped = reviewFindingRows([finding, { ...finding, confidence: 0.4, line: null }]);
    expect(mapped).toHaveLength(2);
    expect(mapped[0]).toEqual({
      id: 'security-privacy:src/settings.ts:42:0', severity: 'Major',
      lens: 'security-privacy', path: 'src/settings.ts', line: 42,
      status: 'accepted', reason: null, confidence: 0.9,
    });
    expect(mapped.map((row) => row.id)).toEqual([
      'security-privacy:src/settings.ts:42:0',
      'security-privacy:src/settings.ts:0:1',
    ]);
    expect(mapped.map((row) => row.status)).toEqual(['accepted', 'accepted']);
  });
});
