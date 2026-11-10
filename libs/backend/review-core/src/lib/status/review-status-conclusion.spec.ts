import { reviewStatusConclusion } from './review-status-conclusion';

describe('reviewStatusConclusion', () => {
  it('fails for accepted Critical or Major findings', () => {
    expect(reviewStatusConclusion('complete', ['Major']).state).toBe('failure');
    expect(reviewStatusConclusion('complete', ['Critical', 'Minor']).state).toBe('failure');
  });
  it('succeeds with a note for only low-severity findings', () => {
    expect(reviewStatusConclusion('complete', ['Minor', 'Nitpick'])).toEqual({ state: 'success',
      description: 'Review complete; Minor or Nitpick findings noted' });
  });
  it('succeeds for a complete clean review', () => {
    expect(reviewStatusConclusion('complete', []).state).toBe('success');
  });
  it.each(['partial', 'cancelled', 'skipped', 'dry-run', 'publication-blocked'] as const)('%s is never success', (outcome) => {
    expect(reviewStatusConclusion(outcome, []).state).toBe('error');
  });
  it('reports fatal failure', () => {
    expect(reviewStatusConclusion('failed', []).state).toBe('failure');
  });
});
