import { createMockLogger } from '@ptah-extension/shared/testing';
import type { SessionUsageSink, SessionUsageTotals } from '../session-stats/session-usage-sink';
import {
  createPricingGate,
  createProviderSessionUsagePersistence,
} from './provider-session-usage-capture';

const totals: SessionUsageTotals = { events: 1, maxRevision: 1, durationMs: 0, models: [] };

function sink(read: NonNullable<SessionUsageSink['readSessionUsage']>): SessionUsageSink {
  return {
    recordUsage: jest.fn(async () => undefined),
    resumeSession: jest.fn(async () => undefined),
    readSessionUsage: read,
  };
}

describe('provider-session usage restore', () => {
  it('resumes without a seed after its timeout and still reports a late failure once', async () => {
    const logger = createMockLogger();
    let fail!: (error: Error) => void;
    const persistence = createProviderSessionUsagePersistence(
      sink(() => new Promise((_resolve, reject) => (fail = reject))),
      logger,
      10,
    );
    await expect(persistence.restore('s1')).resolves.toBeNull();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    fail(new Error('locked'));
    await new Promise((resolve) => setImmediate(resolve));
    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('reads the seed again on the next resume after a timeout', async () => {
    const logger = createMockLogger();
    let calls = 0;
    const persistence = createProviderSessionUsagePersistence(
      sink(() => (++calls === 1 ? new Promise(() => undefined) : Promise.resolve(totals))),
      logger,
      10,
    );
    await expect(persistence.restore('s1')).resolves.toBeNull();
    await expect(persistence.restore('s1')).resolves.toEqual(totals);
  });

  it('logs a failure before the timeout once, as an error', async () => {
    const logger = createMockLogger();
    const persistence = createProviderSessionUsagePersistence(
      sink(async () => {
        throw new Error('locked');
      }),
      logger,
      1_000,
    );
    await expect(persistence.restore('s1')).resolves.toBeNull();
    await new Promise((resolve) => setImmediate(resolve));
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

describe('createPricingGate', () => {
  afterEach(() => jest.useRealTimers());

  it('waits at most its bound, once, for a catalog that never hydrates', async () => {
    jest.useFakeTimers();
    const ensureHydrated = jest.fn(() => new Promise<boolean>(() => undefined));
    const gate = createPricingGate({ ensureHydrated }, createMockLogger());
    let settled = false;
    void gate().then(() => (settled = true));
    await jest.advanceTimersByTimeAsync(2_999);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
    await gate();
    expect(ensureHydrated).toHaveBeenCalledTimes(1);
  });

  it('does not wait without a pricing provider', async () => {
    await expect(createPricingGate(null, createMockLogger())()).resolves.toBeUndefined();
  });
});
