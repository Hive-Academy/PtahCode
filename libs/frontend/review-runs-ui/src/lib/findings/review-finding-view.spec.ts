import type { ReviewFinding } from '@ptah-extension/review-contracts';
import { filterAndSortFindings, summarizeFindings, toFindingViews } from './review-finding-view';

const finding = (title: string, severity: ReviewFinding['severity'], confidence: number): ReviewFinding => ({
  schemaVersion: 1, lens: 'correctness-lifecycle', title, failureMode: 'Failure', affectedBehavior: 'Behavior',
  scenario: 'Scenario', path: 'src/a.ts', line: 3, evidence: [{ path: 'src/a.ts', line: 3, excerpt: 'evidence' }],
  affectedCaller: null, severity, category: 'functional', confidence, verification: 'cross-family',
  suggestedDiff: null, fixPrompt: 'Fix it',
});

describe('finding views', () => {
  const views = toFindingViews([finding('Minor', 'Minor', 0.3), finding('Critical', 'Critical', 0.9)]);
  it('derives the existing table key and impact', () => {
    expect(views[0].key).toBe('correctness-lifecycle:src/a.ts:3:0');
    expect(views[0].impact).toContain('Behavior');
  });
  it('summarizes severity and session triage', () => {
    const summary = summarizeFindings(views, { [views[1].key]: { state: 'accepted', pending: false, error: null, replied: false } });
    expect(summary.severity.Critical).toBe(1);
    expect(summary.states).toEqual({ open: 1, accepted: 1, dismissed: 0 });
  });
  it('filters by triage and sorts by all supported fields', () => {
    const triage = { [views[1].key]: { state: 'accepted' as const, pending: false, error: null, replied: false } };
    for (const sortField of ['severity', 'lens', 'location', 'confidence'] as const) {
      expect(filterAndSortFindings(views, { severity: 'all', lens: 'all', triage: 'accepted', sortField, ascending: true }, triage).map(view => view.title)).toEqual(['Critical']);
    }
    expect(filterAndSortFindings(views, { severity: 'all', lens: 'all', triage: 'all', sortField: 'severity', ascending: true }, triage)[0].title).toBe('Critical');
  });
});
