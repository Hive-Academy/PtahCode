import type { Lens, ReviewFinding, Severity } from '@ptah-extension/review-contracts';

export interface ReviewFindingView extends ReviewFinding {
  key: string;
  impact: string;
}
export type TriageState = 'open' | 'accepted' | 'dismissed';
export interface FindingTriage {
  state: TriageState;
  pending: boolean;
  error: string | null;
  replied: boolean;
}
export type TriageMap = Record<string, FindingTriage>;
export type SortField = 'severity' | 'lens' | 'location' | 'confidence';
export interface FindingFilters {
  severity: Severity | 'all';
  lens: Lens | 'all';
  triage: TriageState | 'all';
  sortField: SortField;
  ascending: boolean;
}
export const severityOrder: Record<Severity, number> = { Critical: 0, Major: 1, Minor: 2, Nitpick: 3 };
export const openTriage: FindingTriage = { state: 'open', pending: false, error: null, replied: false };

/**
 * True when the path is relative and stays inside the repository root.
 * A finding path comes from model output, so an absolute path or a parent segment is refused before file:open.
 */
export function isRepositoryRelativePath(path: string): boolean {
  if (path.trim() === '' || /^[\\/]/.test(path) || /^[A-Za-z]:/.test(path)) return false;
  if ([...path].some(char => char.charCodeAt(0) < 32)) return false;
  return !path.split(/[\\/]/).some(segment => segment === '..');
}

export function toFindingViews(findings: readonly ReviewFinding[]): ReviewFindingView[] {
  return findings.map((finding, index) => ({
    ...finding,
    key: `${finding.lens}:${finding.path}:${finding.line ?? 0}:${index}`,
    impact: `${finding.category} · ${finding.affectedBehavior}`,
  }));
}

export function summarizeFindings(views: readonly ReviewFindingView[], triage: TriageMap) {
  const severity: Record<Severity, number> = { Critical: 0, Major: 0, Minor: 0, Nitpick: 0 };
  const states: Record<TriageState, number> = { open: 0, accepted: 0, dismissed: 0 };
  for (const view of views) {
    severity[view.severity]++;
    states[(triage[view.key] ?? openTriage).state]++;
  }
  return { total: views.length, severity, states };
}

export function filterAndSortFindings(views: readonly ReviewFindingView[], filters: FindingFilters, triage: TriageMap): ReviewFindingView[] {
  return views.filter(view =>
    (filters.severity === 'all' || view.severity === filters.severity) &&
    (filters.lens === 'all' || view.lens === filters.lens) &&
    (filters.triage === 'all' || (triage[view.key] ?? openTriage).state === filters.triage)
  ).sort((a, b) => {
    const value = (view: ReviewFindingView): string | number => {
      switch (filters.sortField) {
        case 'severity': return severityOrder[view.severity];
        case 'lens': return view.lens;
        case 'location': return `${view.path}:${String(view.line ?? 0).padStart(8, '0')}`;
        case 'confidence': return view.confidence;
      }
    };
    const left = value(a); const right = value(b);
    const order = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right));
    return (filters.ascending ? order : -order) || a.key.localeCompare(b.key);
  });
}
