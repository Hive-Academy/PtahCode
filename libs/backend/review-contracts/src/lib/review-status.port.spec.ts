import {
  ReviewStatusReceiptSchema,
  ReviewStatusUpdateSchema,
} from './review-status.port';

const target = {
  repo: { owner: 'PtahCode', name: 'ptah-extension' },
  prNumber: 42,
  headSha: 'a'.repeat(40),
  attemptId: 'attempt-42',
  machineId: 'machine-1',
};

describe('review status port payloads', () => {
  it('accepts each lifecycle state and a persisted provider receipt', () => {
    expect(ReviewStatusUpdateSchema.safeParse({
      target, state: 'queued', description: 'Queued for review', summary: '',
    }).success).toBe(true);
    expect(ReviewStatusUpdateSchema.safeParse({
      target, state: 'in_progress', description: 'Reviewing 1/4 lenses', summary: '',
      progress: { completedLenses: 1, totalLenses: 4, stage: 'lenses' },
    }).success).toBe(true);
    expect(ReviewStatusUpdateSchema.safeParse({
      target, state: 'completed', conclusion: 'success',
      description: 'Review completed with notes', summary: 'One minor finding',
    }).success).toBe(true);
    expect(ReviewStatusReceiptSchema.safeParse({
      target, provider: 'commit_status', externalId: '1234',
    }).success).toBe(true);
  });

  it('rejects invalid identity, impossible progress, and unbounded output', () => {
    const base = { target, state: 'queued', description: 'Queued', summary: '' };
    expect(ReviewStatusUpdateSchema.safeParse({
      ...base, target: { ...target, headSha: 'wrong' },
    }).success).toBe(false);
    expect(ReviewStatusUpdateSchema.safeParse({
      ...base, state: 'in_progress',
      progress: { completedLenses: 5, totalLenses: 4, stage: 'lenses' },
    }).success).toBe(false);
    expect(ReviewStatusUpdateSchema.safeParse({
      ...base, description: 'x'.repeat(141),
    }).success).toBe(false);
    expect(ReviewStatusUpdateSchema.safeParse({
      ...base, summary: 'x'.repeat(65_537),
    }).success).toBe(false);
    expect(ReviewStatusReceiptSchema.safeParse({
      target, provider: 'check_run', externalId: '',
    }).success).toBe(false);
  });
});
