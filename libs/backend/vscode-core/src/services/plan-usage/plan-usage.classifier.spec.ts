import type { ApiLaneSpend } from '@ptah-extension/shared';
import { classifyLaneUsage } from './plan-usage.classifier';
describe('lane usage variants', () => {
  it('preserves absent plan windows', async () => {
    expect(await classifyLaneUsage({ kind: 'plan', windows: [] })).toEqual({ kind: 'plan', windows: [] });
  });
  it('returns unavailable API spend without manufacturing plan room', async () => {
    const spend: ApiLaneSpend = { kind: 'api-spend', availability: 'unavailable', revision: 0, asOf: 1,
      periods: null, cumulative: null, coverage: 'none', budget: null, creditEvidence: [] };
    const readSpend = jest.fn(async () => spend);
    expect(await classifyLaneUsage({ kind: 'api-spend', ownerKey: 'owner', reader: { readSpend }, nowMs: 1 })).toBe(spend);
    expect(readSpend).toHaveBeenCalledWith('owner', 1);
  });
});
