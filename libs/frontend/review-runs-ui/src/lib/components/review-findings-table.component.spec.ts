import { TestBed } from '@angular/core/testing';
import type { ReviewFinding } from '@ptah-extension/review-contracts';
import { ReviewFindingsTableComponent, reviewFindingRows } from './review-findings-table.component';

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
  it('shows the finding title and explanation after findings load', () => {
    TestBed.configureTestingModule({ imports: [ReviewFindingsTableComponent] });
    const fixture = TestBed.createComponent(ReviewFindingsTableComponent);
    fixture.componentRef.setInput('rows', reviewFindingRows([finding])); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Settings parsed without a schema');
    const details = fixture.nativeElement.querySelector('details') as HTMLDetailsElement;
    details.open = true;
    fixture.detectChanges();
    expect(details.textContent).toContain('A crafted settings file can change runtime behavior.');
    expect(details.textContent).toContain('The settings loader accepts arbitrary keys.');
    expect(details.textContent).toContain('A workspace contains a crafted settings file.');
    expect(details.textContent).toContain('const parsed = JSON.parse(raw);');
    expect(details.textContent).toContain('Validate the parsed settings against a schema.');
    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('has no status options for the accepted-only findings RPC', () => {
    TestBed.configureTestingModule({ imports: [ReviewFindingsTableComponent] });
    const fixture = TestBed.createComponent(ReviewFindingsTableComponent);
    fixture.componentRef.setInput('rows', reviewFindingRows([finding])); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#finding-status')).toBeNull();
    expect(Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('option')).map(option => option.textContent?.trim()))
      .toEqual(['All lenses', 'correctness-lifecycle', 'contracts-callers', 'security-privacy', 'host-di-config']);
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
      title: finding.title, failureMode: finding.failureMode,
      affectedBehavior: finding.affectedBehavior, scenario: finding.scenario,
      evidence: finding.evidence, fixPrompt: finding.fixPrompt,
      status: 'accepted', confidence: 0.9,
    });
    expect(mapped.map((row) => row.id)).toEqual([
      'security-privacy:src/settings.ts:42:0',
      'security-privacy:src/settings.ts:0:1',
    ]);
    expect(mapped.map((row) => row.status)).toEqual(['accepted', 'accepted']);
  });
});
