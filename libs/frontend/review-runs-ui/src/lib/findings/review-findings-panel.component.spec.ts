import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import type { ReviewFinding } from '@ptah-extension/review-contracts';
import { ReviewFindingsStore } from './review-findings.store';
import { ReviewFindingsPanelComponent } from './review-findings-panel.component';

const finding: ReviewFinding = {
  schemaVersion: 1, lens: 'correctness-lifecycle', title: 'Broken call', failureMode: 'Failure', affectedBehavior: 'Behavior',
  scenario: 'Scenario', path: 'src/a.ts', line: 3, evidence: [{ path: 'src/a.ts', line: 3, excerpt: 'evidence' }],
  affectedCaller: null, severity: 'Critical', category: 'functional', confidence: 0.9, verification: 'cross-family',
  suggestedDiff: null, fixPrompt: 'Fix it',
};

describe('ReviewFindingsPanelComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [ReviewFindingsPanelComponent], providers: [{ provide: ReviewFindingsStore, useValue: {
    triage: signal({}), openError: signal(null), copyError: signal(null), copied: signal(false), openEvidence: jest.fn(), respond: jest.fn(), sendToLane: jest.fn(),
  } }] }));
  it('shows empty copy for a run with no accepted findings', () => {
    const fixture = TestBed.createComponent(ReviewFindingsPanelComponent);
    fixture.componentRef.setInput('findings', []); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No accepted findings for this run.');
  });
  it('shows summary and a filtered empty state with clear action', () => {
    const fixture = TestBed.createComponent(ReviewFindingsPanelComponent);
    fixture.componentRef.setInput('findings', [finding]); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('1 findings');
    fixture.componentInstance.triageState.set('dismissed'); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No matching findings.');
    (Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find(button => button.textContent?.includes('Clear filters')))?.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Broken call');
  });
});
