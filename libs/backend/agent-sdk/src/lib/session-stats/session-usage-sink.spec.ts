import { parseSessionUsageContribution } from './session-usage-sink';

const contribution = {
  sessionId: 'session-1', producer: 'sdk-owner', runId: 'run-1', turnId: '1',
  eventKey: 'run-1#1', parentSessionId: null, subagentId: null, providerId: null,
  occurredAtMs: 1, revision: 1, models: [], totalCostMicroUsd: null,
  totalCostAuthority: 'unpriced', pricingVersion: null,
} as const;

describe('session usage contribution dimensions', () => {
  it('preserves valid optional dimensions and accepts a dimensionless event', () => {
    expect(parseSessionUsageContribution({ ...contribution, phaseKind: 'implement',
      executorType: 'sdk-subagent' })).toMatchObject({
      phaseKind: 'implement', executorType: 'sdk-subagent',
    });
    const legacy = parseSessionUsageContribution(contribution);
    expect(legacy).not.toBeNull();
    expect(legacy?.phaseKind).toBeUndefined();
    expect(legacy?.executorType).toBeUndefined();
  });

  it('refuses unknown phase and executor values', () => {
    expect(parseSessionUsageContribution({ ...contribution, phaseKind: 'invalid' })).toBeNull();
    expect(parseSessionUsageContribution({ ...contribution, executorType: 'invalid' })).toBeNull();
  });
});
