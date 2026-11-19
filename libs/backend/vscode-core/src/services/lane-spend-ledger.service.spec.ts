import type { IStateStorage, SessionUsageContribution } from '@ptah-extension/platform-core';
import { LaneSpendLedgerService, LANE_SPEND_STORAGE_KEY, LANE_SPEND_CORRUPT_BACKUP_KEY } from './lane-spend-ledger.service';
import { SpendEventSchema, SpendLedgerSchema } from './lane-spend-ledger.schema';

const NOW = Date.UTC(2026, 10, 18, 12);
function event(overrides: Partial<SessionUsageContribution> = {}): SessionUsageContribution {
  return { sessionId: 'session', producer: 'cli-lane', runId: 'run', turnId: null, eventKey: 'event',
    parentSessionId: null, subagentId: null, providerId: 'claude-cli', occurredAtMs: NOW, revision: 0,
    ownerKey: 'owner', billingMode: 'api-key', models: [{ modelId: 'claude-sonnet-5-5', inputTokens: 10,
      outputTokens: 2, cacheReadTokens: 3, cacheCreationTokens: 4, knownCostMicroUsd: 100, costAuthority: 'provider-reported' }],
    totalCostMicroUsd: 100, totalCostAuthority: 'provider-reported', pricingVersion: null, ...overrides };
}
function setup(initial?: unknown) {
  const values = new Map<string, unknown>();
  if (initial !== undefined) values.set(LANE_SPEND_STORAGE_KEY, initial);
  const storage: IStateStorage = { get: <T>(key: string) => values.get(key) as T | undefined,
    update: jest.fn(async (key, value: unknown) => { values.set(key, value); }), keys: () => [...values.keys()] };
  const logger = { warn: jest.fn() };
  return { storage, logger, ledger: new LaneSpendLedgerService(storage, logger) };
}
describe('durable owned spend', () => {
  it.each(['model-priced', 'provider-reported'] as const)('retains unknown TTL evidence for %s snapshots', async (authority) => {
    const { ledger } = setup();
    const usage = event({ runCostSnapshot: true, totalCostAuthority: authority });
    await ledger.recordUsage({ ...usage, models: usage.models.map((model) => ({ ...model, costAuthority: 'model-priced' })) });
    expect(await ledger.readSpend('owner', NOW)).toMatchObject({
      coverage: authority === 'model-priced' ? 'partial' : 'complete',
      cumulative: { knownCostMicroUsd: 100, pricedEvents: 1, unpricedEvents: 0 },
    });
  });
  it('survives restart and idempotent replay, retaining token classes', async () => {
    const { storage, logger, ledger } = setup();
    await ledger.recordUsage(event()); await ledger.recordUsage(event());
    const restored = new LaneSpendLedgerService(storage, logger);
    expect((await restored.readSpend('owner', NOW)).periods?.today).toMatchObject({ knownCostMicroUsd: 100,
      inputTokens: 10, outputTokens: 2, cacheReadTokens: 3, cacheCreationTokens: 4, pricedEvents: 1 });
  });
  it('replaces only newer revisions and attributes owners independently', async () => {
    const { ledger } = setup();
    await ledger.recordUsage(event({ revision: 2, totalCostMicroUsd: 200 }));
    await ledger.recordUsage(event({ revision: 1 }));
    await ledger.recordUsage(event({ ownerKey: 'other' }));
    expect((await ledger.readSpend('owner', NOW)).cumulative?.knownCostMicroUsd).toBe(200);
    await ledger.clear('owner', NOW + 1);
    expect(await ledger.readSpend('owner', NOW + 1)).toMatchObject({ revision: 1, cumulative: { knownCostMicroUsd: 0 } });
    expect((await ledger.readSpend('other', NOW + 1)).cumulative?.knownCostMicroUsd).toBe(100);
    await ledger.recordUsage(event()); // replay before reset stays outside coverage
    expect((await ledger.readSpend('owner', NOW + 1)).cumulative?.knownCostMicroUsd).toBe(0);
  });
  it('ignores unattributed and subscription events', async () => {
    const { ledger } = setup();
    await ledger.recordUsage(event({ ownerKey: null }));
    await ledger.recordUsage(event({ billingMode: 'subscription' }));
    expect((await ledger.readSpend('owner', NOW)).coverage).toBe('none');
  });
  it('warns without event metadata when an API-key event lacks owner attribution', async () => {
    const { ledger, logger, storage } = setup();
    await ledger.recordUsage(event({ ownerKey: null, sessionId: 'sensitive-session', runId: 'sensitive-run' }));
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith('Lane spend API-key event ignored: missing owner attribution');
    expect(storage.update).not.toHaveBeenCalled();
    expect((await ledger.readSpend('owner', NOW)).cumulative?.knownCostMicroUsd).toBe(0);
    await ledger.recordUsage(event({ billingMode: 'subscription', ownerKey: null }));
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
  it('rejects malformed usage asynchronously so catch-only callers observe it', async () => {
    const { ledger, storage } = setup();
    const rejected = ledger.recordUsage(event({ occurredAtMs: -1 })).catch((error: unknown) => error);
    await expect(rejected).resolves.toBeInstanceOf(Error);
    expect(storage.update).not.toHaveBeenCalled();
    await ledger.recordUsage(event());
    expect((await ledger.readSpend('owner', NOW)).cumulative?.knownCostMicroUsd).toBe(100);
  });
  it('counts unpriced usage without fabricating full coverage', async () => {
    const { ledger } = setup();
    await ledger.recordUsage(event({ totalCostMicroUsd: null, totalCostAuthority: 'unpriced' }));
    expect(await ledger.readSpend('owner', NOW)).toMatchObject({ coverage: 'none', cumulative: { unpricedEvents: 1, knownCostMicroUsd: 0 } });
  });
  it('uses UTC midnight and rolling 7/30 day intervals', async () => {
    const { ledger } = setup();
    await ledger.recordUsage(event({ occurredAtMs: NOW - 2 * 86400000, eventKey: 'old' }));
    await ledger.recordUsage(event());
    const result = await ledger.readSpend('owner', NOW);
    expect(result.periods?.today.knownCostMicroUsd).toBe(100);
    expect(result.periods?.['7d'].knownCostMicroUsd).toBe(200);
    expect(result.periods?.today.startAt).toBe(Date.UTC(2026, 10, 18));
  });
  it('persists owner credit evidence and clears only that owner', async () => {
    const { ledger, storage, logger } = setup();
    await ledger.recordCreditEvidence('owner', NOW, 'credit-exhausted');
    const restored = new LaneSpendLedgerService(storage, logger);
    expect((await restored.readSpend('owner', NOW)).creditEvidence).toHaveLength(1);
    expect((await restored.readSpend('other', NOW)).creditEvidence).toHaveLength(0);
  });
  it('exposes invalid persistence as unavailable and does not overwrite it', async () => {
    const { ledger, storage } = setup({ version: 99 });
    expect(await ledger.readSpend('owner', NOW)).toMatchObject({ availability: 'unavailable', periods: null });
    await expect(ledger.recordUsage(event())).rejects.toThrow('unavailable');
    expect(storage.update).not.toHaveBeenCalled();
  });
  it('retries after transient write failures without publishing unpersisted totals', async () => {
    const { ledger, storage, logger } = setup();
    await ledger.recordUsage(event({ eventKey: 'persisted', totalCostMicroUsd: 50 }));
    jest.spyOn(storage, 'update').mockRejectedValueOnce(new Error('disk'));
    await expect(ledger.recordUsage(event())).rejects.toThrow('disk');
    expect(await ledger.readSpend('owner', NOW)).toMatchObject({ availability: 'available', cumulative: { knownCostMicroUsd: 50 } });
    expect(logger.warn).toHaveBeenCalledWith('Lane spend persistence failed', { kind: 'Error' });
    await ledger.recordUsage(event());
    expect((await ledger.readSpend('owner', NOW)).cumulative?.knownCostMicroUsd).toBe(150);
    const restored = new LaneSpendLedgerService(storage, logger);
    expect((await restored.readSpend('owner', NOW)).cumulative?.knownCostMicroUsd).toBe(150);
  });
  it('uses an absolute run snapshot once', async () => {
    const { ledger } = setup();
    await ledger.recordUsage(event());
    await ledger.recordUsage(event({ eventKey: 'snapshot', revision: 1, runCostSnapshot: true, totalCostMicroUsd: 250 }));
    expect((await ledger.readSpend('owner', NOW)).cumulative?.knownCostMicroUsd).toBe(250);
  });
  it('validates schema counters and versions', () => {
    expect(SpendLedgerSchema.safeParse({ version: 1, events: [], owners: [], credits: [] }).success).toBe(true);
    expect(SpendLedgerSchema.safeParse({ version: 2, events: [], owners: [], credits: [] }).success).toBe(false);
    expect(SpendEventSchema.safeParse({ ...event(), occurredAtMs: -1 }).success).toBe(false);
    expect(SpendEventSchema.safeParse({ ...event(), totalCostMicroUsd: Infinity }).success).toBe(false);
    expect(SpendEventSchema.safeParse({ ...event(), models: [{ ...event().models[0], inputTokens: 1.5 }] }).success).toBe(false);
  });
});


describe('explicit storage repair and async validation', () => {
  it('backs up corruption before clear repairs, then accepts writes and survives restart', async () => {
    const corrupt = { version: 99, payload: 'retained' };
    const { ledger, storage, logger } = setup(corrupt);
    expect(await ledger.readSpend('owner', NOW)).toMatchObject({ availability: 'unavailable', cumulative: null });
    await expect(ledger.recordUsage(event())).rejects.toThrow('unavailable');
    await ledger.clear('owner', NOW);
    expect(storage.get(LANE_SPEND_CORRUPT_BACKUP_KEY)).toEqual(corrupt);
    expect(SpendLedgerSchema.safeParse(storage.get(LANE_SPEND_STORAGE_KEY)).success).toBe(true);
    expect(await ledger.readSpend('owner', NOW)).toMatchObject({ availability: 'available', cumulative: { knownCostMicroUsd: 0 } });
    await ledger.recordUsage(event({ occurredAtMs: NOW + 1 }));
    expect((await new LaneSpendLedgerService(storage, logger).readSpend('owner', NOW + 1)).cumulative?.knownCostMicroUsd).toBe(100);
  });
  it('does not overwrite corruption if the backup fails and allows a later repair', async () => {
    const corrupt = { version: 99 };
    const { ledger, storage } = setup(corrupt);
    jest.spyOn(storage, 'update').mockRejectedValueOnce(new Error('backup failed'));
    await expect(ledger.clear('owner', NOW)).rejects.toThrow('backup failed');
    expect(storage.get(LANE_SPEND_STORAGE_KEY)).toEqual(corrupt);
    expect((await ledger.readSpend('owner', NOW)).availability).toBe('unavailable');
    await ledger.clear('owner', NOW);
    expect((await ledger.readSpend('owner', NOW)).availability).toBe('available');
  });
  it('recovers a transient read failure without losing another owner', async () => {
    const { storage, logger, ledger } = setup();
    await ledger.recordUsage(event({ ownerKey: 'other' }));
    await ledger.recordCreditEvidence('other', NOW, 'rate-limited');
    jest.spyOn(storage, 'get').mockImplementationOnce(() => { throw new Error('transient'); });
    const recovered = new LaneSpendLedgerService(storage, logger);
    await recovered.clear('owner', NOW);
    expect(await recovered.readSpend('other', NOW)).toMatchObject({ cumulative: { knownCostMicroUsd: 100 }, creditEvidence: [{ kind: 'rate-limited' }] });
  });
  it.each([
    { totalCostAuthority: 'unpriced' as const, totalCostMicroUsd: null },
    { totalCostAuthority: 'provider-reported' as const, totalCostMicroUsd: null },
    { totalCostAuthority: 'unpriced' as const, totalCostMicroUsd: 100 },
  ])('prices covered unpriced usage with an absolute snapshot: %o', async (cost) => {
    const { ledger } = setup();
    await ledger.recordUsage(event({ occurredAtMs: NOW - 1, ...cost }));
    await ledger.recordUsage(event({ eventKey: 'snapshot', runCostSnapshot: true, totalCostMicroUsd: 5_000_000 }));
    expect(await ledger.readSpend('owner', NOW)).toMatchObject({ coverage: 'complete',
      cumulative: { knownCostMicroUsd: 5_000_000, pricedEvents: 2, unpricedEvents: 0 } });
  });
  it('completes model-priced coverage with missing cache TTL when an absolute snapshot covers it', async () => {
    const { ledger } = setup();
    await ledger.recordUsage(event({ occurredAtMs: NOW - 1, totalCostAuthority: 'model-priced' }));
    await ledger.recordUsage(event({ eventKey: 'snapshot', runCostSnapshot: true, totalCostMicroUsd: 5_000_000 }));
    expect(await ledger.readSpend('owner', NOW)).toMatchObject({ coverage: 'complete',
      cumulative: { knownCostMicroUsd: 5_000_000, pricedEvents: 2, unpricedEvents: 0 } });
  });
  it('retains partial coverage for a later uncovered unpriced delta', async () => {
    const { ledger } = setup();
    await ledger.recordUsage(event({ occurredAtMs: NOW - 2, totalCostAuthority: 'unpriced', totalCostMicroUsd: null }));
    await ledger.recordUsage(event({ eventKey: 'snapshot', occurredAtMs: NOW - 1, runCostSnapshot: true, totalCostMicroUsd: 5_000_000 }));
    await ledger.recordUsage(event({ eventKey: 'later', totalCostAuthority: 'unpriced', totalCostMicroUsd: null }));
    expect(await ledger.readSpend('owner', NOW)).toMatchObject({ coverage: 'partial',
      cumulative: { knownCostMicroUsd: 5_000_000, pricedEvents: 2, unpricedEvents: 1 } });
  });
  it('retains the latest usable snapshot when a later run snapshot is unpriced', async () => {
    const { ledger, storage, logger } = setup();
    await ledger.recordUsage(event({ eventKey: 'older-snapshot', occurredAtMs: NOW - 3,
      runCostSnapshot: true, totalCostMicroUsd: 2_000_000 }));
    await ledger.recordUsage(event({ eventKey: 'priced-snapshot', occurredAtMs: NOW - 2,
      runCostSnapshot: true, totalCostMicroUsd: 5_000_000 }));
    await ledger.recordUsage(event({ eventKey: 'unpriced-snapshot', occurredAtMs: NOW - 1,
      runCostSnapshot: true, totalCostAuthority: 'unpriced', totalCostMicroUsd: null }));
    const restored = new LaneSpendLedgerService(storage, logger);
    const result = await restored.readSpend('owner', NOW);
    const expected = { knownCostMicroUsd: 5_000_000, pricedEvents: 2, unpricedEvents: 1 };
    expect(result).toMatchObject({ coverage: 'partial', cumulative: expected });
    expect(result.periods?.today).toMatchObject(expected);
    expect(result.periods?.['7d']).toMatchObject(expected);
    expect(result.periods?.['30d']).toMatchObject(expected);
  });
  it('retains later deltas after an absolute snapshot', async () => {
    const { ledger } = setup();
    await ledger.recordUsage(event({ occurredAtMs: NOW - 2, totalCostMicroUsd: 2_000_000 }));
    await ledger.recordUsage(event({ eventKey: 'snapshot', occurredAtMs: NOW - 1, runCostSnapshot: true, totalCostMicroUsd: 5_000_000 }));
    await ledger.recordUsage(event({ eventKey: 'later', totalCostMicroUsd: 1_000_000 }));
    expect((await ledger.readSpend('owner', NOW)).cumulative?.knownCostMicroUsd).toBe(6_000_000);
  });
  it('retains later deltas sharing the snapshot timestamp', async () => {
    const { ledger } = setup();
    await ledger.recordUsage(event({ totalCostMicroUsd: 2_000_000 }));
    await ledger.recordUsage(event({ eventKey: 'snapshot', runCostSnapshot: true, totalCostMicroUsd: 5_000_000 }));
    await ledger.recordUsage(event({ eventKey: 'later', totalCostMicroUsd: 1_000_000 }));
    expect((await ledger.readSpend('owner', NOW)).cumulative?.knownCostMicroUsd).toBe(6_000_000);
  });
  it.each([1, 8, 31])('does not allocate earlier run costs across a %s day boundary', async (days) => {
    const { ledger } = setup();
    await ledger.recordUsage(event({ occurredAtMs: NOW - days * 86400000, totalCostMicroUsd: 2_000_000 }));
    await ledger.recordUsage(event({ eventKey: 'snapshot', runCostSnapshot: true, totalCostMicroUsd: 5_000_000 }));
    const result = await ledger.readSpend('owner', NOW);
    const period = days === 1 ? result.periods?.today : days === 8 ? result.periods?.['7d'] : result.periods?.['30d'];
    expect(period).toMatchObject({ knownCostMicroUsd: 0, unpricedEvents: 1 });
    expect(result.cumulative?.knownCostMicroUsd).toBe(5_000_000);
  });
  it('does not reintroduce pre-reset costs via a continuing run snapshot', async () => {
    const { ledger, storage, logger } = setup();
    await ledger.recordUsage(event({ occurredAtMs: NOW - 2 }));
    await ledger.clear('owner', NOW - 1);
    const restored = new LaneSpendLedgerService(storage, logger);
    await restored.recordUsage(event({ eventKey: 'snapshot', runCostSnapshot: true, totalCostMicroUsd: 5_000_000 }));
    expect(await restored.readSpend('owner', NOW)).toMatchObject({ coverage: 'none', cumulative: { knownCostMicroUsd: 0, unpricedEvents: 1 } });
  });
  it('drops late events at or before reset and remembers their runs across restart', async () => {
    const { ledger, storage, logger } = setup();
    await ledger.clear('owner', NOW);
    await ledger.recordUsage(event({ occurredAtMs: NOW - 1 }));
    await ledger.recordUsage(event({ eventKey: 'equal', occurredAtMs: NOW }));
    expect(SpendLedgerSchema.parse(storage.get(LANE_SPEND_STORAGE_KEY)).events).toEqual([]);
    expect((await ledger.readSpend('owner', NOW)).cumulative?.knownCostMicroUsd).toBe(0);
    const restored = new LaneSpendLedgerService(storage, logger);
    await restored.recordUsage(event({ eventKey: 'snapshot', occurredAtMs: NOW + 1, runCostSnapshot: true, totalCostMicroUsd: 5_000_000 }));
    expect(await restored.readSpend('owner', NOW + 1)).toMatchObject({ coverage: 'none', cumulative: { knownCostMicroUsd: 0, unpricedEvents: 1 } });
  });
  it('reports partial model-priced coverage when the cache TTL subset is missing', async () => {
    const { ledger } = setup();
    await ledger.recordUsage(event({ totalCostAuthority: 'model-priced' }));
    expect((await ledger.readSpend('owner', NOW)).coverage).toBe('partial');
    await ledger.recordUsage(event({ revision: 1, totalCostAuthority: 'provider-reported' }));
    expect((await ledger.readSpend('owner', NOW)).coverage).toBe('complete');
  });
  it('rejects invalid credit and clear inputs through promises without writing', async () => {
    const { ledger, storage } = setup();
    await expect(ledger.recordCreditEvidence('', NOW, 'rate-limited').catch((error: unknown) => error)).resolves.toBeInstanceOf(Error);
    await expect(ledger.recordCreditEvidence('owner', -1, 'rate-limited').catch((error: unknown) => error)).resolves.toBeInstanceOf(Error);
    await expect(ledger.clear('', NOW).catch((error: unknown) => error)).resolves.toBeInstanceOf(Error);
    await expect(ledger.clear('owner', -1).catch((error: unknown) => error)).resolves.toBeInstanceOf(Error);
    expect(storage.update).not.toHaveBeenCalled();
  });
  it('retains the optional one-hour cache creation subset', async () => {
    const { ledger, storage } = setup();
    const usage = event();
    usage.models[0].cacheCreation1hTokens = 2;
    await ledger.recordUsage(usage);
    expect(SpendLedgerSchema.parse(storage.get(LANE_SPEND_STORAGE_KEY)).events[0].models[0].cacheCreation1hTokens).toBe(2);
  });
});
