import type { PlanUsageReadRequest, PlanUsageReading, UsageSource } from './plan-usage-reader.types';
import { readUsageSourceChain } from './usage-source-chain';

const request: PlanUsageReadRequest = {
  target: { providerId: 'synthetic', ownerRef: { key: 'synthetic#a', providerId: 'synthetic', identityKind: 'unknown', label: 'Synthetic account' } },
  refresh: false,
};
const available: PlanUsageReading = {
  status: 'available', windowSetEstablished: true,
  windows: [{ key: 'five_hour', kind: 'five_hour', label: '5h', observedAt: 100 }],
};

function source(id: string, reading: PlanUsageReading, label: UsageSource['label'] = 'provider-api'): UsageSource {
  return { id, label, read: jest.fn(async () => ({ ok: true as const, source: label, readAt: 100, reading })) };
}

describe('readUsageSourceChain', () => {
  it('reads in order and stops on the first verified window', async () => {
    const first = source('first', { status: 'no-usage-source', windowSetEstablished: false, windows: [] });
    const second = source('second', available, 'cli-command');
    const third = source('third', available);
    const result = await readUsageSourceChain([first, second, third], request);
    expect(first.read).toHaveBeenCalledTimes(1);
    expect(second.read).toHaveBeenCalledTimes(1);
    expect(third.read).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'available', source: 'cli-command', readAt: 100 });
  });

  it('rejects local totals, empty windows and unverified owners without creating a full window', async () => {
    const result = await readUsageSourceChain([
      source('empty', { ...available, windows: [] }),
      source('unverified', { ...available, sourceInvalid: true, statusReason: 'account-unverified' }),
    ], request);
    expect(result).toMatchObject({ status: 'service-unavailable', statusReason: 'account-unverified', windows: [] });
  });

  it('stops after owner proof fails', async () => {
    const failure: UsageSource = { id: 'auth', label: 'provider-api', read: async () => ({ ok: false, source: 'provider-api', reason: 'account-unverified' }) };
    const result = await readUsageSourceChain([failure, source('other', { status: 'service-unavailable', windowSetEstablished: false, windows: [] })], request);
    expect(result.statusReason).toBe('account-unverified');
  });

  it('reports no usage source when no source applies', async () => {
    expect(await readUsageSourceChain([], request)).toMatchObject({ status: 'no-usage-source', windows: [] });
  });

  it('reports a timeout when the first stage never settles', async () => {
    const pending: UsageSource = { id: 'pending', label: 'provider-api',
      read: () => new Promise(() => undefined) };
    const result = await readUsageSourceChain([pending], request, Date.now, 10);
    expect(result).toMatchObject({ status: 'service-unavailable', statusReason: 'cli-timeout' });
  });
});

describe('failure ranking', () => {
  const failed = (reason: import('./plan-usage-reader.types').UsageFailureReason): UsageSource => ({
    id: reason, label: 'provider-api', read: async () => ({ ok: false, source: 'provider-api', reason }),
  });
  it.each([
    [['no-oauth', 'no-local-server', 'cli-not-signed-in'], 'cli-not-signed-in'],
    [['source-not-applicable', 'no-local-server', 'cli-not-found'], 'cli-not-found'],
    [['source-not-applicable', 'cli-exit-error'], 'cli-exit-error'],
  ] as const)('prefers the last applicable stage', async (reasons, expected) => {
    const result = await readUsageSourceChain(reasons.map(failed), request);
    expect(result.statusReason).toBe(expected);
  });
});
