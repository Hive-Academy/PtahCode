export type ReviewSeverity = 'Critical' | 'Major' | 'Minor' | 'Nitpick';
export type ReviewOutcome = 'complete' | 'partial' | 'cancelled' | 'skipped' | 'dry-run' | 'publication-blocked' | 'failed';

/** Commit statuses have no neutral state. This is the single public conclusion policy. */
export function reviewStatusConclusion(outcome: ReviewOutcome, severities: readonly ReviewSeverity[]):
  { state: 'success' | 'failure' | 'error'; description: string } {
  if (outcome === 'failed') return { state: 'failure', description: 'Review failed before completion' };
  if (outcome !== 'complete') return { state: 'error', description: `Review ${outcome}; public result unavailable` };
  if (severities.includes('Critical') || severities.includes('Major'))
    return { state: 'failure', description: 'Review found Critical or Major issues' };
  if (severities.length) return { state: 'success', description: 'Review complete; Minor or Nitpick findings noted' };
  return { state: 'success', description: 'Review complete; no actionable findings' };
}
