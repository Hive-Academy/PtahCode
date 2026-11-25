import { PrefillRateStore } from './prefill-rate.store';

describe('PrefillRateStore', () => {
  it('updates the per-target EWMA with alpha 0.3', () => {
    const rates = new PrefillRateStore();
    expect(rates.rate('a')).toBeUndefined();
    rates.recordCompleted('a', 100, 1000);
    rates.recordCompleted('a', 400, 2000);
    rates.recordCompleted('b', 20, 1000);
    expect(rates.rate('a')).toBe(130);
    expect(rates.rate('b')).toBe(20);
  });

  it('reduces an estimate on abort and never raises it', () => {
    const rates = new PrefillRateStore();
    rates.recordCompleted('a', 100, 1000);
    rates.recordAbort('a', 100, 2000);
    rates.recordAbort('a', 100, 500);
    rates.recordAbort('b', 50, 2000);
    expect(rates.rate('a')).toBe(50);
    expect(rates.rate('b')).toBe(25);
  });

  it('ignores invalid or zero-duration measurements', () => {
    const rates = new PrefillRateStore();
    rates.recordCompleted('a', 40, 0);
    rates.recordAbort('a', 40, 0);
    expect(rates.rate('a')).toBeUndefined();
  });
});
