import {
  LANE_PLAN_MODE_INSTRUCTION,
  renderLaneCompletionContract,
  withLanePlanModeInstruction,
} from './lane-reporting-contract';

describe('lane completion contract plan instruction', () => {
  it('shows the Plan refusal instruction only in effective Plan mode', () => {
    const plan = renderLaneCompletionContract({ effectivePermission: 'plan' });
    const edit = renderLaneCompletionContract({ effectivePermission: 'auto-edit' });
    expect(plan).toContain('BLOCKED: plan mode');
    expect(plan).toContain('Do not wait for approval');
    expect(edit).not.toContain('BLOCKED: plan mode');
  });
});

describe('withLanePlanModeInstruction', () => {
  it('appends the instruction when the resolved permission is plan', () => {
    expect(withLanePlanModeInstruction('do work', 'plan')).toBe(
      `do work\n\n${LANE_PLAN_MODE_INSTRUCTION}`,
    );
  });

  it.each([undefined, 'ask', 'auto-edit', 'yolo'])(
    'leaves the task unchanged for %s',
    (permission) => {
      expect(withLanePlanModeInstruction('do work', permission)).toBe('do work');
    },
  );

  it('does not add the instruction twice', () => {
    const task = `do work\n\n${renderLaneCompletionContract({ effectivePermission: 'plan' })}`;
    const result = withLanePlanModeInstruction(task, 'plan');
    expect(result).toBe(task);
    expect(result.split('BLOCKED: plan mode')).toHaveLength(2);
  });
});
