import { renderLaneCompletionContract } from './lane-reporting-contract';

describe('lane completion contract plan instruction', () => {
  it('shows the Plan refusal instruction only in effective Plan mode', () => {
    const plan = renderLaneCompletionContract({ effectivePermission: 'plan' });
    const edit = renderLaneCompletionContract({ effectivePermission: 'auto-edit' });
    expect(plan).toContain('BLOCKED: plan mode');
    expect(plan).toContain('Do not wait for approval');
    expect(edit).not.toContain('BLOCKED: plan mode');
  });
});
